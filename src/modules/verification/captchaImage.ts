import { deflateSync } from "node:zlib";

// Imagem do captcha, desenhada à mão e codificada em PNG sem dependências nativas (só o zlib
// do Node). Mostra as formas a tocar, da esquerda para a direita, com setas entre elas, sobre
// um fundo com ruído e curvas — o texto da mensagem nunca revela a ordem, só a imagem.

export type ShapeKind = "circle" | "square" | "star" | "diamond" | "triangle";

export interface CaptchaShape {
    kind: ShapeKind;
    /** Cor em hex (#rrggbb). */
    color: string;
}

type Rgb = [number, number, number];

const WIDTH = 520;
const HEIGHT = 180;
const SAMPLES = 4; // 4×4 subamostras por píxel nas bordas das formas

function hexToRgb(hex: string): Rgb {
    const v = Number.parseInt(hex.replace("#", ""), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

class Canvas {
    readonly data: Uint8Array;
    constructor(readonly width: number, readonly height: number) {
        this.data = new Uint8Array(width * height * 3);
    }

    blend(x: number, y: number, color: Rgb, alpha: number): void {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
        const i = (y * this.width + x) * 3;
        const a = Math.min(1, alpha);
        this.data[i] = Math.round(this.data[i] * (1 - a) + color[0] * a);
        this.data[i + 1] = Math.round(this.data[i + 1] * (1 - a) + color[1] * a);
        this.data[i + 2] = Math.round(this.data[i + 2] * (1 - a) + color[2] * a);
    }

    /** Preenche uma região com anti-aliasing: `inside(x, y)` diz se um ponto está dentro. */
    fill(bounds: { x0: number; y0: number; x1: number; y1: number }, inside: (x: number, y: number) => boolean, color: Rgb, alpha = 1): void {
        const x0 = Math.max(0, Math.floor(bounds.x0));
        const y0 = Math.max(0, Math.floor(bounds.y0));
        const x1 = Math.min(this.width - 1, Math.ceil(bounds.x1));
        const y1 = Math.min(this.height - 1, Math.ceil(bounds.y1));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let hits = 0;
                for (let sy = 0; sy < SAMPLES; sy++) {
                    for (let sx = 0; sx < SAMPLES; sx++) {
                        if (inside(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)) hits++;
                    }
                }
                if (hits) this.blend(x, y, color, alpha * (hits / (SAMPLES * SAMPLES)));
            }
        }
    }

    disc(cx: number, cy: number, r: number, color: Rgb, alpha = 1): void {
        this.fill({ x0: cx - r - 1, y0: cy - r - 1, x1: cx + r + 1, y1: cy + r + 1 }, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, color, alpha);
    }
}

// ─── Geometria ───────────────────────────────────────────────────────────────

function pointInPolygon(x: number, y: number, pts: Array<[number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function rotate(x: number, y: number, cx: number, cy: number, angle: number): [number, number] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

function shapeTest(kind: ShapeKind, cx: number, cy: number, r: number, angle: number): (x: number, y: number) => boolean {
    switch (kind) {
        case "circle":
            return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
        case "square": {
            const half = r * 0.86;
            const corner = r * 0.22;
            return (x, y) => {
                // Quadrado de cantos redondos (distância a um retângulo encolhido).
                const [px, py] = rotate(x, y, cx, cy, -angle);
                const qx = Math.max(Math.abs(px - cx) - (half - corner), 0);
                const qy = Math.max(Math.abs(py - cy) - (half - corner), 0);
                return qx * qx + qy * qy <= corner * corner;
            };
        }
        case "diamond":
            return (x, y) => {
                const [px, py] = rotate(x, y, cx, cy, -angle);
                return Math.abs(px - cx) / (r * 0.82) + Math.abs(py - cy) / r <= 1;
            };
        case "triangle": {
            const pts: Array<[number, number]> = [0, 1, 2].map((i) => {
                const a = angle - Math.PI / 2 + (i * 2 * Math.PI) / 3;
                return [cx + Math.cos(a) * r * 1.05, cy + 0.15 * r + Math.sin(a) * r * 1.05];
            });
            return (x, y) => pointInPolygon(x, y, pts);
        }
        case "star": {
            const pts: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => {
                const a = angle - Math.PI / 2 + (i * Math.PI) / 5;
                const radius = i % 2 === 0 ? r * 1.08 : r * 0.47;
                return [cx + Math.cos(a) * radius, cy + 0.06 * r + Math.sin(a) * radius];
            });
            return (x, y) => pointInPolygon(x, y, pts);
        }
    }
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(body)]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // profundidade
    header[9] = 2; // RGB
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0; // filtro "nenhum"
        Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", new Uint8Array()),
    ]);
}

// ─── Desenho do desafio ──────────────────────────────────────────────────────

/** Gerador pseudo-aleatório com semente (para testes reproduzíveis). */
export function seededRandom(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let r = Math.imul(s ^ (s >>> 15), 1 | s);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function renderCaptcha(sequence: CaptchaShape[], random: () => number = Math.random): Buffer {
    const canvas = new Canvas(WIDTH, HEIGHT);
    const top: Rgb = [24, 26, 38];
    const bottom: Rgb = [38, 41, 61];
    for (let y = 0; y < HEIGHT; y++) {
        const k = y / (HEIGHT - 1);
        for (let x = 0; x < WIDTH; x++) {
            const i = (y * WIDTH + x) * 3;
            const glow = Math.max(0, 1 - Math.hypot(x - WIDTH * 0.5, y - HEIGHT * 0.15) / 340) * 18;
            canvas.data[i] = Math.round(top[0] + (bottom[0] - top[0]) * k + glow * 0.6);
            canvas.data[i + 1] = Math.round(top[1] + (bottom[1] - top[1]) * k + glow * 0.8);
            canvas.data[i + 2] = Math.round(top[2] + (bottom[2] - top[2]) * k + glow);
        }
    }

    // Ruído: pontos e curvas suaves em tons das próprias formas, para confundir leituras automáticas.
    const palette = sequence.map((s) => hexToRgb(s.color));
    for (let i = 0; i < 260; i++) {
        const color = random() < 0.5 ? palette[Math.floor(random() * palette.length)] : ([200, 210, 255] as Rgb);
        canvas.disc(random() * WIDTH, random() * HEIGHT, 0.6 + random() * 1.6, color, 0.12 + random() * 0.2);
    }
    for (let c = 0; c < 3; c++) {
        const color = palette[c % palette.length];
        const y0 = random() * HEIGHT;
        const amp = 18 + random() * 30;
        const freq = 0.01 + random() * 0.02;
        const phase = random() * Math.PI * 2;
        for (let x = 0; x < WIDTH; x += 1.5) canvas.disc(x, y0 + Math.sin(x * freq + phase) * amp, 1.1, color, 0.16);
    }

    // As formas, centradas em "cartões" com setas entre eles.
    const n = sequence.length;
    const slot = WIDTH / n;
    const card: Rgb = [255, 255, 255];
    const arrow: Rgb = [170, 180, 215];
    sequence.forEach((shape, index) => {
        const cx = slot * index + slot / 2 + (random() - 0.5) * 10;
        const cy = HEIGHT / 2 + (random() - 0.5) * 16;
        const r = 30 + random() * 8;
        canvas.fill({ x0: cx - 52, y0: cy - 52, x1: cx + 52, y1: cy + 52 }, (x, y) => {
            const qx = Math.max(Math.abs(x - cx) - 34, 0);
            const qy = Math.max(Math.abs(y - cy) - 34, 0);
            return qx * qx + qy * qy <= 16 * 16;
        }, card, 0.06);
        const angle = (random() - 0.5) * 0.5;
        canvas.fill({ x0: cx - r * 1.2 + 3, y0: cy - r * 1.2 + 5, x1: cx + r * 1.2 + 3, y1: cy + r * 1.2 + 5 }, shapeTest(shape.kind, cx + 3, cy + 5, r, angle), [8, 9, 14], 0.45);
        canvas.fill({ x0: cx - r * 1.2, y0: cy - r * 1.2, x1: cx + r * 1.2, y1: cy + r * 1.2 }, shapeTest(shape.kind, cx, cy, r, angle), hexToRgb(shape.color));
        if (index < n - 1) {
            const ax = slot * (index + 1);
            const ay = HEIGHT / 2;
            canvas.fill({ x0: ax - 12, y0: ay - 3, x1: ax + 4, y1: ay + 3 }, (x, y) => x >= ax - 12 && x <= ax + 2 && Math.abs(y - ay) <= 2, arrow, 0.9);
            const head: Array<[number, number]> = [[ax + 9, ay], [ax + 1, ay - 7], [ax + 1, ay + 7]];
            canvas.fill({ x0: ax, y0: ay - 8, x1: ax + 10, y1: ay + 8 }, (x, y) => pointInPolygon(x, y, head), arrow, 0.9);
        }
    });

    return encodePng(WIDTH, HEIGHT, canvas.data);
}
