import { randomUUID } from "node:crypto";
import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Economia do servidor: EPA Coins. Ganham-se com o diário (com sequência), a trabalhar e nos
// mini-jogos; gastam-se nas apostas e na loja de cargos. Tudo por servidor.

export interface ShopItem {
    id: string;
    name: string;
    description: string | null;
    price: number;
    /** Cargo entregue na compra. */
    role_id: string;
    /** Dias que o cargo dura (0 = para sempre). */
    duration_days: number;
}

export interface EconomySettings {
    enabled: boolean;
    currency_name: string;
    /** Saldo com que cada membro começa. */
    start_balance: number;
    daily_min: number;
    daily_max: number;
    /** % extra por cada dia seguido (até `daily_streak_cap` dias). */
    daily_streak_bonus_pct: number;
    daily_streak_cap: number;
    work_min: number;
    work_max: number;
    work_cooldown_minutes: number;
    /** Transferências entre membros: % que "se perde" (0 = sem taxa). */
    transfer_fee_pct: number;
    /** Canal onde ficam registadas compras e ajustes da administração (opcional). */
    log_channel: string | null;
    shop: ShopItem[];
}

export const MAX_SHOP_ITEMS = 20;

export function buildEconomyDefaults(): EconomySettings {
    return {
        enabled: true,
        currency_name: "EPA Coins",
        start_balance: 500,
        daily_min: 800,
        daily_max: 1200,
        daily_streak_bonus_pct: 10,
        daily_streak_cap: 20,
        work_min: 150,
        work_max: 450,
        work_cooldown_minutes: 60,
        transfer_fee_pct: 0,
        log_channel: null,
        shop: [],
    };
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function idOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null;
}

function normalizeItem(raw: Partial<ShopItem>): ShopItem | null {
    const role = idOrNull(raw.role_id);
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
    if (!role || !name) return null;
    return {
        id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : randomUUID().slice(0, 8),
        name,
        description: typeof raw.description === "string" && raw.description.trim() ? raw.description.trim().slice(0, 200) : null,
        price: clamp(raw.price, 1000, 1, 100_000_000),
        role_id: role,
        duration_days: clamp(raw.duration_days, 0, 0, 365),
    };
}

export function normalizeEconomy(value: EconomySettings): EconomySettings {
    const dailyMin = clamp(value.daily_min, 800, 0, 1_000_000);
    const workMin = clamp(value.work_min, 150, 0, 1_000_000);
    return {
        ...value,
        enabled: value.enabled !== false,
        currency_name: typeof value.currency_name === "string" && value.currency_name.trim() ? value.currency_name.trim().slice(0, 30) : "EPA Coins",
        start_balance: clamp(value.start_balance, 500, 0, 10_000_000),
        daily_min: dailyMin,
        daily_max: Math.max(dailyMin, clamp(value.daily_max, 1200, 0, 1_000_000)),
        daily_streak_bonus_pct: clamp(value.daily_streak_bonus_pct, 10, 0, 100),
        daily_streak_cap: clamp(value.daily_streak_cap, 20, 1, 365),
        work_min: workMin,
        work_max: Math.max(workMin, clamp(value.work_max, 450, 0, 1_000_000)),
        work_cooldown_minutes: clamp(value.work_cooldown_minutes, 60, 1, 1440),
        transfer_fee_pct: clamp(value.transfer_fee_pct, 0, 0, 50),
        log_channel: idOrNull(value.log_channel),
        shop: (Array.isArray(value.shop) ? value.shop : [])
            .map((item) => normalizeItem(item))
            .filter((item): item is ShopItem => item !== null)
            .slice(0, MAX_SHOP_ITEMS),
    };
}

export function getEconomySettings(guildId: string): Promise<EconomySettings> {
    return getSettings("economy_settings", guildId, buildEconomyDefaults(), normalizeEconomy);
}

export function saveEconomySettings(guildId: string, patch: Partial<EconomySettings>): Promise<EconomySettings> {
    return saveSettings("economy_settings", guildId, patch, buildEconomyDefaults(), normalizeEconomy);
}
