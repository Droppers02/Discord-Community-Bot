import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { logger } from "../../lib/logger.js";

// Imagem do /ship: os dois avatares em círculo, um coração ao meio com a percentagem, o nome do
// casal em cima e uma barra em baixo. As cores mudam com a percentagem.

const WIDTH = 960;
const HEIGHT = 400;
let fontsReady = false;

function registerFonts(): void {
    if (fontsReady) return;
    fontsReady = true;
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = [join(process.cwd(), "assets", "fonts"), join(here, "..", "..", "..", "assets", "fonts")].find((path) => existsSync(path));
    if (!dir) return void logger.warn("Ship: pasta assets/fonts não encontrada — a imagem usa a fonte do sistema.");
    GlobalFonts.registerFromPath(join(dir, "Poppins-Bold.ttf"), "Poppins Bold");
    GlobalFonts.registerFromPath(join(dir, "Poppins-SemiBold.ttf"), "Poppins SemiBold");
}

/** Nomes "𝓛𝓸𝓻𝓭" → "Lord"; sem emojis (a fonte não os tem). */
export function plainName(name: string): string {
    return name.normalize("NFKC").replace(/[^\p{L}\p{N} .'_-]/gu, "").replace(/\s+/g, " ").trim() || "?";
}

interface Palette { from: string; to: string; heartFrom: string; heartTo: string; bar: string }

function paletteFor(score: number): Palette {
    if (score >= 80) return { from: "#ff4f9a", to: "#8b3dff", heartFrom: "#ff6b8b", heartTo: "#e0144c", bar: "#ff4f9a" };
    if (score >= 50) return { from: "#ff8a5c", to: "#d63a8b", heartFrom: "#ff9a76", heartTo: "#ff3d6e", bar: "#ffb347" };
    if (score >= 30) return { from: "#5a7bd8", to: "#7a4fc9", heartFrom: "#8fa8ff", heartTo: "#5865f2", bar: "#8fa8ff" };
    return { from: "#3a3f4b", to: "#1e2028", heartFrom: "#7d7f87", heartTo: "#4a4c55", bar: "#9aa0a6" };
}

function heartPath(ctx: SKRSContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size * 0.3);
    ctx.bezierCurveTo(x - size / 2, y + size * 0.6, x, y + size * 0.78, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.78, x + size / 2, y + size * 0.6, x + size / 2, y + size * 0.3);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size * 0.3);
    ctx.closePath();
}

/** Gerador pseudo-aleatório com semente (a imagem é igual para o mesmo ship). */
function seeded(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 10_000) / 10_000;
    };
}

async function fetchAvatar(url: string): Promise<Image | null> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6_000) });
        if (!response.ok) return null;
        return await loadImage(Buffer.from(await response.arrayBuffer()));
    } catch {
        return null;
    }
}

function drawAvatar(ctx: SKRSContext2D, image: Image | null, cx: number, cy: number, radius: number, fallback: string): void {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
        ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = "#5865f2";
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = `${radius}px "Poppins Bold"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fallback.slice(0, 1).toUpperCase(), cx, cy + 4);
    }
    ctx.restore();
}

function fitText(ctx: SKRSContext2D, text: string, maxWidth: number, startSize: number, family: string): void {
    let size = startSize;
    ctx.font = `${size}px "${family}"`;
    while (size > 14 && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = `${size}px "${family}"`;
    }
}

export interface ShipImageInput {
    shipName: string;
    nameA: string;
    nameB: string;
    avatarA: string;
    avatarB: string;
    score: number;
    seed: number;
}

export async function renderShipImage(input: ShipImageInput): Promise<Buffer | null> {
    try {
        registerFonts();
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");
        const palette = paletteFor(input.score);
        const random = seeded(input.seed);

        // Fundo
        const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
        background.addColorStop(0, palette.from);
        background.addColorStop(1, palette.to);
        ctx.fillStyle = background;
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, 28);
        ctx.fill();

        // Corações a flutuar
        for (let i = 0; i < 26; i++) {
            const size = 14 + random() * 38;
            ctx.globalAlpha = 0.06 + random() * 0.14;
            ctx.fillStyle = "#ffffff";
            heartPath(ctx, random() * WIDTH, random() * HEIGHT - size / 2, size);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const [imageA, imageB] = await Promise.all([fetchAvatar(input.avatarA), fetchAvatar(input.avatarB)]);
        const radius = 112;
        const leftX = 190;
        const rightX = WIDTH - 190;
        const avatarY = 200;
        drawAvatar(ctx, imageA, leftX, avatarY, radius, input.nameA);
        drawAvatar(ctx, imageB, rightX, avatarY, radius, input.nameB);

        // Nome do casal
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 10;
        fitText(ctx, input.shipName, 420, 40, "Poppins Bold");
        ctx.fillText(input.shipName, WIDTH / 2, 62);

        // Nomes por baixo dos avatares
        for (const [name, x] of [[input.nameA, leftX], [input.nameB, rightX]] as const) {
            fitText(ctx, name, 220, 24, "Poppins SemiBold");
            ctx.fillText(name, x, avatarY + radius + 44);
        }
        ctx.shadowBlur = 0;

        // Coração central com a percentagem
        const heartSize = 190;
        const heartTop = avatarY - heartSize / 2 - 6;
        const heartFill = ctx.createLinearGradient(WIDTH / 2, heartTop, WIDTH / 2, heartTop + heartSize);
        heartFill.addColorStop(0, palette.heartFrom);
        heartFill.addColorStop(1, palette.heartTo);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 28;
        heartPath(ctx, WIDTH / 2, heartTop, heartSize);
        ctx.fillStyle = heartFill;
        ctx.fill();
        ctx.restore();
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        heartPath(ctx, WIDTH / 2, heartTop, heartSize);
        ctx.stroke();

        // Coração partido abaixo dos 30%
        if (input.score < 30) {
            ctx.beginPath();
            ctx.moveTo(WIDTH / 2, heartTop + heartSize * 0.3);
            ctx.lineTo(WIDTH / 2 - 16, heartTop + heartSize * 0.48);
            ctx.lineTo(WIDTH / 2 + 12, heartTop + heartSize * 0.62);
            ctx.lineTo(WIDTH / 2 - 8, heartTop + heartSize * 0.8);
            ctx.lineTo(WIDTH / 2, heartTop + heartSize * 0.97);
            ctx.lineWidth = 6;
            ctx.strokeStyle = "rgba(20,20,25,0.85)";
            ctx.stroke();
        }

        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 8;
        ctx.font = `46px "Poppins Bold"`;
        ctx.textBaseline = "middle";
        ctx.fillText(`${input.score}%`, WIDTH / 2, heartTop + heartSize * 0.48);
        ctx.shadowBlur = 0;

        // Barra
        const barWidth = 340;
        const barX = (WIDTH - barWidth) / 2;
        const barY = HEIGHT - 34;
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, 16, 8);
        ctx.fill();
        if (input.score > 0) {
            ctx.fillStyle = palette.bar;
            ctx.beginPath();
            ctx.roundRect(barX, barY, Math.max(16, (barWidth * input.score) / 100), 16, 8);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        return canvas.toBuffer("image/png");
    } catch (error) {
        logger.warn("Ship: falha a desenhar a imagem:", error);
        return null;
    }
}
