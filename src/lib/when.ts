// Datas e horas escritas à mão, sempre no fuso de Lisboa: "21:30", "amanhã 9:00",
// "25/12 18:00", "25/12/2026 18:00", "2026-12-25 18:00" — ou uma espera: "30m", "2h", "1d12h",
// ou só um número (minutos).

const TZ = "Europe/Lisbon";
const partsFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

interface WallTime { year: number; month: number; day: number; hour: number; minute: number }

function lisbonParts(ms: number): WallTime & { second: number } {
    const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

/** Diferença (ms) entre a hora de Lisboa e UTC nesse instante. */
function offsetAt(ms: number): number {
    const p = lisbonParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Hora de parede em Lisboa → epoch ms (lida com a mudança de hora). */
export function lisbonToEpoch(wall: WallTime): number {
    const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    let result = guess - offsetAt(guess);
    result = guess - offsetAt(result);
    return result;
}

/** "30m", "2h", "1d12h", "90s" ou só minutos ("45"). */
export function parseDelay(input: string): number | null {
    const text = input.trim().toLowerCase().replace(",", ".");
    if (/^\d+$/.test(text)) return Number(text) * 60_000;
    const units: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, min: 60_000, s: 1_000 };
    let total = 0;
    let found = false;
    for (const match of text.matchAll(/(\d+)\s*(min|d|h|m|s)/g)) {
        total += Number(match[1]) * units[match[2]!]!;
        found = true;
    }
    return found && total > 0 ? total : null;
}

/** Hora fixa em Lisboa. Sem data: hoje, ou amanhã se essa hora já passou. */
export function parseWhen(input: string, now = Date.now()): number | null {
    const text = input.trim().toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/(\d{1,2})h(\d{2})?/, (_m, h: string, mi?: string) => `${h}:${mi ?? "00"}`);
    const today = lisbonParts(now);
    const time = text.match(/(\d{1,2}):(\d{2})/);
    if (!time) return null;
    const hour = Number(time[1]);
    const minute = Number(time[2]);
    if (hour > 23 || minute > 59) return null;

    let year = today.year;
    let month = today.month;
    let day = today.day;
    let explicitDate = false;

    const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const dmy = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (iso) {
        year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); explicitDate = true;
    } else if (dmy) {
        day = Number(dmy[1]); month = Number(dmy[2]);
        if (dmy[3]) year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
        explicitDate = true;
    } else if (/amanh[ãa]/.test(text)) {
        const tomorrow = lisbonParts(now + 86_400_000);
        year = tomorrow.year; month = tomorrow.month; day = tomorrow.day; explicitDate = true;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    let at = lisbonToEpoch({ year, month, day, hour, minute });
    if (!explicitDate && at <= now) {
        const tomorrow = lisbonParts(now + 86_400_000);
        at = lisbonToEpoch({ year: tomorrow.year, month: tomorrow.month, day: tomorrow.day, hour, minute });
    } else if (explicitDate && dmy && !dmy[3] && at <= now) {
        // "25/12 18:00" que já passou este ano → o do ano que vem.
        at = lisbonToEpoch({ year: year + 1, month, day, hour, minute });
    }
    return at;
}
