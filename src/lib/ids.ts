// CustomIds use "/" as the segment separator so they match the constatic responder
// router (rou3) patterns like "ticket/staffpanel/open/:id".
export function buildCustomId(...parts: Array<string | number>): string {
    return parts.map((part) => String(part)).join("/");
}

// ─── Namespaced panel ids ─────────────────────────────────────────────────────
// Format: `<namespace>/<action>/panel/<encodedExtra>` — mirrors the PixelFx scheme
// so the panel can carry the opener's userId + page/category state in the customId.

export interface CustomIdParts {
    namespace: string;
    action: string;
    systemId: string;
    extra?: string;
}

/** Build `<namespace>/<action>/panel/<extra>`; `extra` should come from encodeExtraParts. */
export function buildPanelId(namespace: string, action: string, extra: string): string {
    const customId = `${namespace}/${action}/panel/${extra}`;
    if (customId.length > 100) {
        throw new Error(`Custom ID demasiado longo para o Discord (${customId.length}/100).`);
    }
    return customId;
}

export function parseCustomId(customId: string): CustomIdParts {
    const raw = customId.startsWith("/") ? customId.slice(1) : customId;
    const [namespace, action, systemId, ...rest] = raw.split("/");
    return {
        namespace: namespace ?? "",
        action: action ?? "",
        systemId: systemId ?? "",
        extra: rest.filter(Boolean).join("|") || undefined,
    };
}

export function encodeExtraParts(...parts: Array<string | number | null | undefined>): string {
    return parts
        .filter((part) => part !== undefined && part !== null && `${part}`.length > 0)
        .map((part) => `${part}`.replace(/\//g, "%2F"))
        .join("|");
}

export function decodeExtraParts(extra?: string): string[] {
    if (!extra) return [];
    return extra.split("|").map((part) => part.replace(/%2F/g, "/"));
}
