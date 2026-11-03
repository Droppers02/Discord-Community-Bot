import type { GuildConfig } from "../types.js";
import { textOrDefault, tk } from "./i18n.js";

// Paleta do EPA BOTCHI (violeta da marca + cores de estado).
export const COLORS = {
    primary: 0x7c5cff,
    success: 0x57f287,
    warning: 0xfee75c,
    danger: 0xed4245,
    info: 0x5dade2,
    neutral: 0x2b2d31,
    gold: 0xf1c40f,
} as const;

export const FOOTER_TEXT = tk("EPA BOTCHI");
export const DEFAULT_TRANSCRIPT_PREFIX = "EPA";
export const TICKET_BUTTON_STYLES = ["primary", "secondary", "success", "danger"] as const;

function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function hueToRgb(channel1: number, channel2: number, hue: number): number {
    let normalizedHue = hue;
    if (normalizedHue < 0) normalizedHue += 1;
    if (normalizedHue > 1) normalizedHue -= 1;

    if (normalizedHue < 1 / 6) return channel1 + (channel2 - channel1) * 6 * normalizedHue;
    if (normalizedHue < 1 / 2) return channel2;
    if (normalizedHue < 2 / 3) return channel1 + (channel2 - channel1) * (2 / 3 - normalizedHue) * 6;
    return channel1;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
    const normalizedHue = (((hue % 360) + 360) % 360) / 360;
    const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
    const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;

    if (normalizedSaturation === 0) {
        const channel = clampByte(normalizedLightness * 255);
        return [channel, channel, channel];
    }

    const channel2 = normalizedLightness < 0.5
        ? normalizedLightness * (1 + normalizedSaturation)
        : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
    const channel1 = 2 * normalizedLightness - channel2;

    return [
        clampByte(hueToRgb(channel1, channel2, normalizedHue + 1 / 3) * 255),
        clampByte(hueToRgb(channel1, channel2, normalizedHue) * 255),
        clampByte(hueToRgb(channel1, channel2, normalizedHue - 1 / 3) * 255),
    ];
}

function rgbToNumber(red: number, green: number, blue: number): number {
    return (clampByte(red) << 16) + (clampByte(green) << 8) + clampByte(blue);
}

export function parseColorString(value?: string | null): number | null {
    if (!value?.trim()) return null;

    const input = value.trim();
    const hexMatch = input.match(/^(?:#|0x)?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hexMatch) {
        const expanded = hexMatch[1].length === 3
            ? hexMatch[1].split("").map((character) => `${character}${character}`).join("")
            : hexMatch[1];
        return Number.parseInt(expanded, 16);
    }

    const rgbMatch = input.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
    if (rgbMatch) {
        const channels = rgbMatch.slice(1, 4).map((channel) => Number.parseInt(channel, 10));
        if (channels.every((channel) => channel >= 0 && channel <= 255)) {
            return rgbToNumber(channels[0], channels[1], channels[2]);
        }
    }

    const hslMatch = input.match(/^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
    if (hslMatch) {
        const hue = Number.parseFloat(hslMatch[1]);
        const saturation = Number.parseFloat(hslMatch[2]);
        const lightness = Number.parseFloat(hslMatch[3]);

        if ([hue, saturation, lightness].every((component) => Number.isFinite(component))) {
            const [red, green, blue] = hslToRgb(hue, saturation, lightness);
            return rgbToNumber(red, green, blue);
        }
    }

    return null;
}

export function hexToNumber(hex?: string | null, fallback: number = COLORS.primary): number {
    return parseColorString(hex) ?? fallback;
}

export function getEmbedColor(config: Pick<GuildConfig, "branding_color">): number {
    return hexToNumber(config.branding_color);
}

export function getFooterText(config?: { server_name?: string | null } | null): string {
    return textOrDefault(config?.server_name, FOOTER_TEXT);
}

export function normalizeTranscriptPrefix(value?: string | null): string {
    const normalized = (value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    if (normalized.length < 3 || normalized.length > 6) {
        return DEFAULT_TRANSCRIPT_PREFIX;
    }

    return normalized;
}
