import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { describeDays, insideQuietWindow, normalizeLockdown, normalizeQuietRule, normalizeTime, parseDays, buildLockdownDefaults } from "../../src/modules/moderation/lockdownSettings.js";
import { parseHours } from "../../src/modules/moderation/lockdownConfigView.js";
import { lisbonClock, restorePatch } from "../../src/modules/moderation/lockdown.js";
import { caseSummary, riskLevel } from "../../src/modules/moderation/memberFile.js";
import type { ModCase } from "../../src/repositories/modCaseRepository.js";

const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe("horário de silêncio — janelas", () => {
    const night = { start: "23:00", end: "07:00", days: [5, 6] }; // sexta e sábado à noite
    const day = { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] };

    it("janela normal: só nos dias e horas certos", () => {
        expect(insideQuietWindow(day, 1, at("09:00"))).toBe(true);
        expect(insideQuietWindow(day, 1, at("16:59"))).toBe(true);
        expect(insideQuietWindow(day, 1, at("17:00"))).toBe(false);
        expect(insideQuietWindow(day, 0, at("12:00"))).toBe(false);
    });

    it("janela que passa a meia-noite conta a partir do dia em que começa", () => {
        expect(insideQuietWindow(night, 5, at("23:30"))).toBe(true);  // sexta 23:30
        expect(insideQuietWindow(night, 6, at("03:00"))).toBe(true);  // madrugada de sábado (começou sexta)
        expect(insideQuietWindow(night, 0, at("03:00"))).toBe(true);  // madrugada de domingo (começou sábado)
        expect(insideQuietWindow(night, 1, at("03:00"))).toBe(false); // madrugada de segunda (domingo não está)
        expect(insideQuietWindow(night, 6, at("12:00"))).toBe(false);
        expect(insideQuietWindow(night, 4, at("23:30"))).toBe(false); // quinta
    });

    it("início igual ao fim nunca está ativo", () => {
        expect(insideQuietWindow({ start: "08:00", end: "08:00", days: [0, 1, 2, 3, 4, 5, 6] }, 1, at("08:00"))).toBe(false);
    });
});

describe("horário de silêncio — leitura", () => {
    it("dias por extenso, atalhos e intervalos", () => {
        expect(parseDays("todos")).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(parseDays("úteis")).toEqual([1, 2, 3, 4, 5]);
        expect(parseDays("fds")).toEqual([0, 6]);
        expect(parseDays("seg, qua, sex")).toEqual([1, 3, 5]);
        expect(parseDays("sex-seg")).toEqual([0, 1, 5, 6]);
        expect(parseDays("sábado domingo")).toEqual([0, 6]);
        expect(parseDays("blá")).toBeNull();
        expect(describeDays([1, 2, 3, 4, 5])).toBe("dias úteis");
        expect(describeDays([0, 6])).toBe("fins de semana");
        expect(describeDays([1, 3])).toBe("seg, qua");
    });

    it("horas em vários formatos", () => {
        expect(parseHours("03:00-08:00")).toEqual(["03:00", "08:00"]);
        expect(parseHours("23h30 às 7h")).toEqual(["23:30", "07:00"]);
        expect(parseHours("2-8")).toEqual(["02:00", "08:00"]);
        expect(parseHours("25:00-08:00")).toBeNull();
        expect(parseHours("08:00-08:00")).toBeNull();
        expect(normalizeTime("7h", "00:00")).toBe("07:00");
        expect(normalizeTime("lixo", "00:00")).toBe("00:00");
    });

    it("regras e definições inválidas ficam com valores seguros", () => {
        const rule = normalizeQuietRule({ start: "99:99", days: [9, 1, 1], slowmode: 1, channels: ["x", "123456789012345678"] });
        expect(rule.start).toBe("00:00");
        expect(rule.days).toEqual([1]);
        expect(rule.slowmode).toBe(5);
        expect(rule.channels).toEqual(["123456789012345678"]);
        const settings = normalizeLockdown({ ...buildLockdownDefaults(), raid_lockdown_minutes: 99_999, quiet_rules: Array.from({ length: 20 }, () => ({})) as never });
        expect(settings.raid_lockdown_minutes).toBe(1440);
        expect(settings.quiet_rules).toHaveLength(8);
    });

    it("relógio de Lisboa (dia da semana e minuto)", () => {
        // 2026-07-15 é quarta; 12:34 UTC = 13:34 em Lisboa (hora de verão).
        expect(lisbonClock(Date.UTC(2026, 6, 15, 12, 34))).toEqual({ weekday: 3, minute: 13 * 60 + 34 });
        // 2026-01-15 é quinta; inverno, Lisboa = UTC.
        expect(lisbonClock(Date.UTC(2026, 0, 15, 23, 59))).toEqual({ weekday: 4, minute: 23 * 60 + 59 });
    });
});

describe("trancar — repor permissões", () => {
    it("repõe exatamente o que estava (permitido, negado ou herdado)", () => {
        const allow = PermissionFlagsBits.SendMessages;
        const deny = PermissionFlagsBits.AddReactions;
        const patch = restorePatch(allow, deny);
        expect(patch.SendMessages).toBe(true);
        expect(patch.AddReactions).toBe(false);
        expect(patch.CreatePublicThreads).toBeNull();
        expect(Object.keys(patch)).not.toContain("ViewChannel");
    });
});

describe("ficha do membro — resumo e risco", () => {
    const entry = (action: ModCase["action"], active = true): ModCase => ({ case_number: 1, user_id: "u", user_tag: "u", moderator_id: "m", action, reason: null, duration_seconds: null, active, created_at: 0 });

    it("conta os casos por tipo (avisos ativos à parte)", () => {
        const summary = caseSummary([entry("warn"), entry("warn", false), entry("timeout"), entry("kick")]);
        expect(summary).toMatchObject({ warns: 2, activeWarns: 1, timeouts: 1, kicks: 1, bans: 0 });
    });

    it("risco sobe com casos, denúncias e conta nova", () => {
        const clean = caseSummary([]);
        expect(riskLevel(clean, 0, false)).toBe("baixo");
        expect(riskLevel(clean, 1, true)).toBe("médio");
        expect(riskLevel(caseSummary([entry("warn"), entry("timeout"), entry("kick")]), 2, false)).toBe("alto");
    });
});
