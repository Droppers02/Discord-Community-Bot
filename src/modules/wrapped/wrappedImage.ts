import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { logger } from "../../lib/logger.js";
import { plainName } from "../games/shipImage.js";

// Imagem do EPA Wrapped (1080×1350, formato de story): avatar, persona, seis números grandes e
// os favoritos. Sem emojis no desenho (a fonte não os tem) — vão no texto da mensagem.

const WIDTH = 1080;
const HEIGHT = 1350;
let fontsReady = false;

function registerFonts(): void {
    if (fontsReady) return;
    fontsReady = true;
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = [join(process.cwd(), "assets", "fonts"), join(here, "..", "..", "..", "assets", "fonts")].find((path) => existsSync(path));
    if (!dir) return void logger.warn("Wrapped: pasta assets/fonts não encontrada — a imagem usa a fonte do sistema.");
    if (!GlobalFonts.has("Poppins Bold")) GlobalFonts.registerFromPath(join(dir, "Poppins-Bold.ttf"), "Poppins Bold");
    if (!GlobalFonts.has("Poppins SemiBold")) GlobalFonts.registerFromPath(join(dir, "Poppins-SemiBold.ttf"), "Poppins SemiBold");
}

export interface WrappedImageInput {
    name: string;
    avatarUrl: string;
    periodLabel: string;
    personaTitle: string;
    personaLine: string;
    stats: Array<{ label: string; value: string }>;
    favorites: Array<{ label: string; value: string }>;
    footer: string;
}

async function fetchImage(url: string): Promise<Image | null> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6_000) });
        return response.ok ? await loadImage(Buffer.from(await response.arrayBuffer())) : null;
    } catch {
        return null;
    }
}

function fit(ctx: SKRSContext2D, text: string, maxWidth: number, size: number, family: string): void {
    let current = size;
    ctx.font = `${current}px "${family}"`;
    while (current > 16 && ctx.measureText(text).width > maxWidth) {
        current -= 2;
        ctx.font = `${current}px "${family}"`;
    }
}

function ellipsis(ctx: SKRSContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
}

export async function renderWrappedImage(input: WrappedImageInput): Promise<Buffer | null> {
    try {
        registerFonts();
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");

        // Fundo: degradê roxo → rosa → laranja com círculos suaves.
        const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
        background.addColorStop(0, "#2b1055");
        background.addColorStop(0.5, "#7c2d8f");
        background.addColorStop(1, "#ff7a45");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const blobs: Array<[number, number, number, string]> = [[120, 180, 260, "#ff4f9a"], [960, 420, 300, "#5865f2"], [200, 1150, 320, "#ffb347"], [900, 1250, 220, "#ff4f9a"]];
        for (const [x, y, r, color] of blobs) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
            glow.addColorStop(0, `${color}55`);
            glow.addColorStop(1, `${color}00`);
            ctx.fillStyle = glow;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }

        // Cabeçalho
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = `30px "Poppins SemiBold"`;
        ctx.fillText("EPA WRAPPED", WIDTH / 2, 78);
        ctx.fillStyle = "#ffffff";
        fit(ctx, input.periodLabel.toUpperCase(), WIDTH - 160, 40, "Poppins Bold");
        ctx.fillText(input.periodLabel.toUpperCase(), WIDTH / 2, 128);

        // Avatar
        const avatar = await fetchImage(input.avatarUrl);
        const cx = WIDTH / 2;
        const cy = 290;
        const radius = 110;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        if (avatar) ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
        else {
            ctx.fillStyle = "#5865f2";
            ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        ctx.restore();

        // Nome e persona
        const name = plainName(input.name);
        ctx.fillStyle = "#ffffff";
        fit(ctx, name, WIDTH - 160, 58, "Poppins Bold");
        ctx.fillText(name, WIDTH / 2, 470);
        ctx.font = `34px "Poppins Bold"`;
        const badge = input.personaTitle.toUpperCase();
        const badgeWidth = Math.min(WIDTH - 160, ctx.measureText(badge).width + 70);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.roundRect(WIDTH / 2 - badgeWidth / 2, 500, badgeWidth, 62, 31);
        ctx.fill();
        ctx.fillStyle = "#ffe08a";
        fit(ctx, badge, badgeWidth - 40, 34, "Poppins Bold");
        ctx.fillText(badge, WIDTH / 2, 543);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        fit(ctx, input.personaLine, WIDTH - 160, 26, "Poppins SemiBold");
        ctx.fillText(input.personaLine, WIDTH / 2, 605);

        // Números (2 colunas × 3 linhas)
        const tileW = 440;
        const tileH = 120;
        const left = (WIDTH - tileW * 2 - 40) / 2;
        input.stats.slice(0, 6).forEach((stat, index) => {
            const x = left + (index % 2) * (tileW + 40);
            const y = 640 + Math.floor(index / 2) * (tileH + 18);
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath();
            ctx.roundRect(x, y, tileW, tileH, 24);
            ctx.fill();
            ctx.textAlign = "left";
            ctx.fillStyle = "#ffffff";
            fit(ctx, stat.value, tileW - 56, 56, "Poppins Bold");
            ctx.fillText(stat.value, x + 28, y + 64);
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.font = `24px "Poppins SemiBold"`;
            ctx.fillText(ellipsis(ctx, stat.label, tileW - 56), x + 28, y + 100);
        });

        // Favoritos
        const favTop = 1106;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.roundRect(left, favTop - 46, tileW * 2 + 40, 188, 24);
        ctx.fill();
        input.favorites.slice(0, 6).forEach((favorite, index) => {
            const x = left + 28 + (index % 2) * (tileW + 40);
            const y = favTop + Math.floor(index / 2) * 56;
            ctx.textAlign = "left";
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.font = `22px "Poppins SemiBold"`;
            const label = `${favorite.label}: `;
            ctx.fillText(label, x, y);
            const labelWidth = ctx.measureText(label).width;
            ctx.fillStyle = "#ffffff";
            ctx.font = `24px "Poppins Bold"`;
            ctx.fillText(ellipsis(ctx, plainName(favorite.value), tileW - 60 - labelWidth), x + labelWidth, y);
        });

        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        fit(ctx, input.footer, WIDTH - 120, 24, "Poppins SemiBold");
        ctx.fillText(input.footer, WIDTH / 2, HEIGHT - 34);

        return canvas.toBuffer("image/png");
    } catch (error) {
        logger.warn("Wrapped: falha a desenhar:", error);
        return null;
    }
}
