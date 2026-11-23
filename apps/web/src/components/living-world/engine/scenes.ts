/**
 * Cenas em pixel art desenhadas por código (sem imagens de terceiros) para as
 * telas temáticas: a oficina do ferreiro (Forja do Código) e a biblioteca do
 * mestrado. Resolução lógica 320×180 ampliada sem suavização; animações
 * derivadas de `t` (nenhum estado entre quadros).
 */
import { getSprite, shade, SPRITE_H, SPRITE_W, type Look, type Pose } from "./sprites";
import { normalizeLook, DEFAULT_AVATAR_LOOK } from "./looks";

export const SCENE_W = 320;
export const SCENE_H = 180;

type R = (x: number, y: number, w: number, h: number, c: string) => void;
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function painter(ctx: CanvasRenderingContext2D): R {
  return (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
}

/** Brilho radial (luz de fogo/vela/cristal). */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function stoneWall(r: R, x0: number, y0: number, w: number, h: number, base: string) {
  r(x0, y0, w, h, base);
  for (let row = 0; row * 9 < h; row++) {
    const y = y0 + row * 9;
    r(x0, y + 8, w, 1, shade(base, -18));
    const off = row % 2 ? 9 : 0;
    for (let x = x0 - off; x < x0 + w; x += 18) {
      r(x + 17, y, 1, 8, shade(base, -18));
      const v = hash(x, y);
      if (v > 0.72) r(Math.max(x0, x + 1), y + 1, 15, 6, shade(base, v > 0.9 ? 10 : -7));
      if (v < 0.1) r(Math.max(x0, x + 3), y + 2, 4, 1, shade(base, 14));
    }
  }
}

function planks(r: R, y0: number, h: number, base: string) {
  r(0, y0, SCENE_W, h, base);
  for (let y = y0; y < y0 + h; y += 7) {
    r(0, y, SCENE_W, 1, shade(base, -22));
    for (let x = ((y / 7) % 2) * 23; x < SCENE_W; x += 46) r(x, y, 1, 7, shade(base, -18));
  }
  r(0, y0, SCENE_W, 2, shade(base, 18));
}

/** Janela em arco com céu noturno, estrelas e o castelo distante. */
function nightWindow(r: R, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, rain: boolean) {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#1b2457");
  sky.addColorStop(1, "#3a3f7a");
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const sx = x + 4 + hash(i, 1) * (w - 8);
    const sy = y + 6 + hash(i, 2) * h * 0.5;
    r(sx, sy, 1, 1, `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(t / 700 + i))})`);
  }
  r(x + w * 0.7, y + h * 0.18, 5, 5, "#f6e7b8");
  // castelo e colinas
  r(x, y + h - 14, w, 14, "#1d2a3a");
  for (const [dx, tw, th] of [[0.2, 6, 14], [0.3, 4, 20], [0.4, 7, 12]] as const) r(x + w * dx, y + h - 14 - th, tw, th, "#141c33");
  r(x + w * 0.31, y + h - 30, 1, 2, "#f6d27a");
  if (rain)
    for (let i = 0; i < 26; i++) {
      const rx = x + hash(i, 3) * w;
      const ry = y + ((hash(i, 4) * h + t * 0.12) % h);
      r(rx, ry, 1, 4, "rgba(200,215,255,0.45)");
    }
  // moldura e cruz da janela
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.stroke();
  r(x + w / 2 - 1, y + 2, 2, h - 2, "#5a3a22");
  r(x, y + h * 0.55, w, 2, "#5a3a22");
  r(x - 3, y + h, w + 6, 3, "#7a5230");
}

/** Chamas em camadas (vermelho → laranja → amarelo), dançando com o tempo. */
function flames(r: R, x: number, y: number, w: number, h: number, t: number, power: number) {
  const cols = ["#b8321f", "#e8641f", "#f4a331", "#ffe08a"];
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < w; i += 2) {
      const n = Math.sin(t / (110 + layer * 30) + i * 0.7 + layer) * 0.5 + 0.5;
      const fh = (h * (1 - layer * 0.22)) * (0.45 + n * 0.55) * power;
      const edge = 1 - Math.abs(i - w / 2) / (w / 2);
      r(x + i, y - fh * (0.4 + edge * 0.6), 2, fh * (0.4 + edge * 0.6), cols[layer]!);
    }
  }
}

function lantern(r: R, ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  r(x + 2, 0, 1, y, "#3a2a1a");
  r(x - 1, y, 7, 2, "#2a2a32");
  r(x, y + 2, 5, 7, "#3a3f48");
  r(x + 1, y + 3, 3, 5, Math.sin(t / 150 + x) > 0 ? "#ffd27a" : "#ffc24a");
  r(x - 1, y + 9, 7, 1, "#2a2a32");
  glow(ctx, x + 2.5, y + 6, 26, "255,190,90", 0.28);
}

function spriteAt(ctx: CanvasRenderingContext2D, look: Look, pose: Pose, frame: number, x: number, feetY: number, scale: number, flip = false) {
  const spr = getSprite(look, pose, frame, false);
  ctx.save();
  ctx.translate(x, feetY);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(spr, (-SPRITE_W * scale) / 2, -SPRITE_H * scale + 2 * scale, SPRITE_W * scale, SPRITE_H * scale);
  ctx.restore();
}

/* ═════════════════════════════ Forja do Código ═════════════════════════════ */

export const SMITH: Look = normalizeLook({ skin: "#C98E66", hair: "#6B4A32", hairStyle: "careca", beard: "cheia", eyes: "#3F2A1A", outfit: "avental", shirt: "#4A4F5C", pants: "#2A2420", trim: "#6B4528", boots: "#2A1A10", cape: null, hat: "nenhum", prop: "nenhum", glasses: false }, DEFAULT_AVATAR_LOOK);

/**
 * Oficina do ferreiro. `level` vem do XP real da Forja: cada evolução
 * desbloqueada (5, 10, 15, 20, 25) aparece de verdade no cenário.
 */
export function drawForgeScene(ctx: CanvasRenderingContext2D, t: number, level: number, still = false) {
  const r = painter(ctx);
  ctx.imageSmoothingEnabled = false;
  stoneWall(r, 0, 0, SCENE_W, 124, "#2e2c3e");
  // vigas do teto
  r(0, 0, SCENE_W, 6, "#3a2716");
  for (const x of [40, 150, 250]) r(x, 0, 6, 124, "#3a2716"), r(x, 0, 2, 124, "#4e3520");
  planks(r, 124, 56, "#4a3322");
  nightWindow(r, ctx, 12, 14, 44, 56, t, false);
  // oficina expandida (25): arco para o segundo ambiente iluminado de cristais
  if (level >= 25) {
    r(64, 30, 34, 94, "#1a1830");
    ctx.fillStyle = "#1a1830";
    ctx.beginPath();
    ctx.arc(81, 30, 17, Math.PI, 0);
    ctx.fill();
    glow(ctx, 81, 90, 40, "168,117,245", 0.45);
    for (const [cx, ch] of [[72, 16], [80, 24], [89, 14]] as const) {
      r(cx, 124 - ch, 5, ch, "#a875f5");
      r(cx + 1, 124 - ch, 2, ch, "#d6b8ff");
    }
    r(62, 28, 38, 2, "#6d685e");
    r(62, 28, 2, 96, "#6d685e");
    r(98, 28, 2, 96, "#6d685e");
  }
  // estandarte do desenvolvedor (20)
  if (level >= 20) {
    const bx = level >= 25 ? 112 : 70;
    r(bx - 2, 8, 30, 2, "#7a5230");
    r(bx, 10, 26, 46, "#4a2f7a");
    r(bx, 10, 2, 46, "#f1c66a");
    r(bx + 24, 10, 2, 46, "#f1c66a");
    for (let i = 0; i < 26; i += 4) r(bx + i, 56, 2, 4 + ((i / 4) % 2) * 2, "#4a2f7a");
    // símbolo </>
    const g = "#f1c66a";
    r(bx + 6, 30, 2, 2, g), r(bx + 4, 32, 2, 2, g), r(bx + 6, 34, 2, 2, g);
    r(bx + 12, 28, 2, 2, g), r(bx + 11, 31, 2, 2, g), r(bx + 10, 34, 2, 2, g);
    r(bx + 17, 30, 2, 2, g), r(bx + 19, 32, 2, 2, g), r(bx + 17, 34, 2, 2, g);
  }
  // quadro de ferramentas (5)
  if (level >= 5) {
    const tx = level >= 20 ? 156 : 110;
    r(tx, 34, 38, 4, "#6b4528");
    r(tx + 4, 38, 2, 16, "#8a5d3b"), r(tx + 1, 52, 8, 5, "#555b66");
    r(tx + 14, 38, 2, 18, "#8a5d3b"), r(tx + 11, 38, 8, 4, "#6e7380");
    r(tx + 24, 38, 1, 16, "#6e7380"), r(tx + 26, 38, 1, 16, "#6e7380"), r(tx + 23, 53, 5, 2, "#6e7380");
    r(tx + 32, 38, 3, 12, "#aeb8c8"), r(tx + 31, 50, 5, 3, "#555b66");
  }
  // fornalha de pedra com chaminé
  r(214, 0, 58, 40, "#3a3846");
  r(214, 0, 4, 40, "#4b495a");
  r(198, 36, 92, 88, "#45424f");
  stoneWall(r, 200, 38, 88, 86, "#4f4b5c");
  ctx.fillStyle = "#120c10";
  ctx.beginPath();
  ctx.moveTo(214, 118);
  ctx.lineTo(214, 84);
  ctx.arc(244, 84, 30, Math.PI, 0);
  ctx.lineTo(274, 118);
  ctx.closePath();
  ctx.fill();
  const power = level >= 10 ? 1.25 : 1;
  glow(ctx, 244, 104, level >= 10 ? 110 : 85, "255,120,40", still ? 0.35 : 0.32 + Math.sin(t / 130) * 0.05);
  flames(r, 218, 118, 52, 34, still ? 0 : t, power);
  r(214, 116, 60, 4, "#2a1a10");
  for (let i = 0; i < 8; i++) r(218 + i * 7, 112 + (i % 2), 4, 3, i % 2 ? "#e8641f" : "#b8321f");
  // fole de couro (10)
  if (level >= 10) {
    const squeeze = still ? 0 : Math.max(0, Math.sin(t / 400)) * 4;
    r(288, 92 + squeeze, 22, 14 - squeeze, "#7a4a2a");
    r(288, 92 + squeeze, 22, 2, "#9a6a3a");
    r(284, 97, 6, 3, "#555b66");
    r(306, 84, 3, 10, "#8a5d3b");
  }
  // bancada especial (15): pergaminhos, livro e cristais
  if (level >= 15) {
    r(18, 100, 60, 6, "#7a5230");
    r(18, 100, 60, 2, "#9a6a3a");
    r(22, 106, 4, 18, "#5a3a22"), r(70, 106, 4, 18, "#5a3a22");
    r(24, 93, 16, 7, "#f3e7c9"), r(24, 93, 2, 7, "#c9b48a"), r(38, 93, 2, 7, "#c9b48a");
    r(44, 94, 12, 6, "#7a3b2e"), r(49, 94, 2, 6, "#f3e7c9");
    glow(ctx, 66, 92, 22, "120,200,255", 0.4);
    r(62, 86, 4, 14, "#59a9f8"), r(63, 86, 2, 14, "#bfe3ff"), r(67, 91, 3, 9, "#a875f5");
  } else {
    // bancada simples
    r(18, 104, 54, 5, "#6b4528");
    r(22, 109, 4, 15, "#4a2f1b"), r(64, 109, 4, 15, "#4a2f1b");
    r(28, 98, 10, 6, "#8a5d3b");
  }
  // lanternas penduradas
  lantern(r, ctx, 102, 16, t);
  if (level >= 5) lantern(r, ctx, 146, 12, t + 300);
  // bigorna sobre o toco
  const ax = 140;
  r(ax - 4, 128, 30, 18, "#5a3a22");
  r(ax - 4, 128, 30, 2, "#7a5230");
  r(ax - 10, 112, 42, 6, "#3a3f48");
  r(ax - 10, 112, 42, 2, "#6e7380");
  r(ax - 16, 112, 8, 3, "#3a3f48");
  r(ax, 118, 22, 10, "#2a2f38");
  // barra de código incandescente sobre a bigorna
  const heat = still ? 0.8 : 0.65 + Math.sin(t / 200) * 0.25;
  glow(ctx, ax + 11, 108, 22, "255,150,60", 0.45 * heat);
  r(ax - 2, 106, 26, 5, `rgba(255,${120 + heat * 60},60,1)`);
  const cg = "#fff1b8";
  r(ax + 2, 107, 2, 1, cg), r(ax + 1, 108, 1, 1, cg), r(ax + 2, 109, 2, 1, cg);
  r(ax + 10, 106, 1, 2, cg), r(ax + 9, 108, 1, 2, cg);
  r(ax + 17, 107, 2, 1, cg), r(ax + 19, 108, 1, 1, cg), r(ax + 17, 109, 2, 1, cg);
  // ferreiro martelando: o martelo gira em torno da mão e bate na barra a cada ~0,8 s
  const cycle = still ? 0.45 : (t % 800) / 800;
  spriteAt(ctx, SMITH, "interact", 0, 198, 152, 1.7, true);
  const px = 177;
  const py = 118;
  // ângulo: levantado (−100°) → golpe (−150°) rápido no começo do ciclo
  const ang = cycle < 0.12 ? -100 - (cycle / 0.12) * 52 : -152 + Math.min(1, (cycle - 0.12) / 0.5) * 52;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate((ang * Math.PI) / 180);
  r(0, -1.5, 22, 3, "#8a5d3b");
  r(0, -1.5, 22, 1, "#a8774a");
  r(18, -6, 7, 12, "#555b66");
  r(18, -6, 7, 2, "#8e97ab");
  ctx.restore();
  r(px - 2, py - 2, 4, 4, shade(SMITH.skin, -20));
  const hit = cycle < 0.3;
  if (!still && hit)
    for (let i = 0; i < 14; i++) {
      const a = hash(i, Math.floor(t / 800)) * Math.PI;
      const d = (cycle / 0.3) * 40 * (0.4 + hash(i, 9));
      r(ax + 14 + Math.cos(a) * d * (i % 2 ? 1 : -1), 104 - Math.sin(a) * d, 2, 2, i % 3 ? "#ffd27a" : "#fff1b8");
    }
  // caixotes e barril
  r(286, 128, 30, 24, "#6b4528"), r(286, 128, 30, 2, "#8a5d3b"), r(300, 128, 2, 24, "#4a2f1b");
  r(4, 132, 18, 24, "#5a3a22"), r(4, 136, 18, 2, "#3a3f48"), r(4, 148, 18, 2, "#3a3f48");
  // brasas subindo da fornalha
  if (!still)
    for (let i = 0; i < 10; i++) {
      const life = ((t / 2200 + hash(i, 2)) % 1 + 1) % 1;
      r(230 + hash(i, 3) * 30 + Math.sin(t / 300 + i) * 3, 100 - life * 90, 1, 1, `rgba(255,${180 - life * 80},80,${1 - life})`);
    }
  // vinheta
  const v = ctx.createRadialGradient(SCENE_W / 2, SCENE_H / 2, 60, SCENE_W / 2, SCENE_H / 2, 200);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}

/* ═════════════════════════════ Biblioteca do Mestrado ═════════════════════════════ */

export const LIBRARIAN: Look = normalizeLook({ skin: "#F6D3B3", hair: "#3A2418", hairStyle: "longo", beard: "nenhuma", eyes: "#5A6FBA", outfit: "manto", shirt: "#2B3A67", pants: "#1B2B55", trim: "#F1C66A", hat: "chapeu_mago", hatColor: "#2B3A67", prop: "nenhum", cape: null, glasses: false }, DEFAULT_AVATAR_LOOK);
const SPINES = ["#7a2a3a", "#2b6cb0", "#3f7a3c", "#b7791f", "#5b3f8c", "#a0522d", "#2b3a67", "#8a3a5a", "#c8742e", "#4a6a5a"];

function bookshelf(r: R, x: number, y: number, w: number, h: number, seed: number) {
  r(x, y, w, h, "#3e2716");
  r(x, y, 3, h, "#5a3a22");
  r(x + w - 3, y, 3, h, "#2a1a10");
  r(x, y, w, 3, "#5a3a22");
  for (let shelf = 0; shelf < 5; shelf++) {
    const sy = y + 6 + shelf * ((h - 8) / 5);
    const sh = (h - 8) / 5 - 3;
    r(x + 3, sy + sh, w - 6, 3, "#6b4528");
    let bx = x + 4;
    let i = 0;
    while (bx < x + w - 6) {
      const bw = 3 + Math.floor(hash(seed + shelf, i) * 3);
      const bh = sh - Math.floor(hash(i, seed + shelf) * 5);
      const c = SPINES[Math.floor(hash(seed * 3 + shelf, i * 7) * SPINES.length)]!;
      if (hash(i, shelf + seed) > 0.93) {
        // livro deitado
        r(bx, sy + sh - 3, 9, 3, c);
        bx += 10;
      } else {
        r(bx, sy + sh - bh, bw, bh, c);
        r(bx, sy + sh - bh, 1, bh, shade(c, 25));
        r(bx, sy + sh - bh + 3, bw, 1, "#f1c66a");
        bx += bw + (hash(bx, shelf) > 0.85 ? 2 : 0);
      }
      i++;
    }
  }
}

function candle(r: R, ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  r(x, y, 3, 8, "#efe9da");
  r(x - 1, y + 8, 5, 2, "#c9b48a");
  const f = Math.sin(t / 120 + x) > 0 ? 1 : 0;
  r(x + 1, y - 3 - f, 1, 3 + f, "#ffd27a");
  r(x, y - 2, 3, 2, "rgba(255,160,60,0.8)");
  glow(ctx, x + 1, y - 2, 28, "255,190,100", 0.3);
}

/** Biblioteca com o bibliotecário lendo à mesa, o gato e o cristal. */
export function drawLibraryScene(ctx: CanvasRenderingContext2D, t: number, opts: { rain?: boolean; reviewed?: number; still?: boolean } = {}) {
  const r = painter(ctx);
  ctx.imageSmoothingEnabled = false;
  // parede de madeira com painéis
  r(0, 0, SCENE_W, 130, "#2a1d2e");
  for (let x = 0; x < SCENE_W; x += 20) r(x, 0, 1, 130, "#221726");
  r(0, 96, SCENE_W, 2, "#3e2a3a");
  planks(r, 130, 50, "#3e2a1e");
  // tapete
  r(70, 150, 180, 22, "#5a1f3a");
  r(74, 153, 172, 16, "#7a2a4a");
  r(74, 153, 172, 1, "#f1c66a"), r(74, 168, 172, 1, "#f1c66a");
  // estantes
  bookshelf(r, 0, 4, 84, 126, 1);
  bookshelf(r, 236, 4, 84, 126, 7);
  // escada encostada
  r(78, 30, 2, 100, "#8a5d3b"), r(90, 30, 2, 100, "#8a5d3b");
  for (let y = 36; y < 128; y += 10) r(78, y, 14, 2, "#8a5d3b");
  // janela em arco
  nightWindow(r, ctx, 116, 10, 88, 86, t, !!opts.rain);
  // estandarte com livro
  for (const bx of [100, 210]) {
    r(bx, 14, 10, 34, "#4a2f7a");
    r(bx, 14, 10, 2, "#f1c66a");
    r(bx + 2, 26, 6, 5, "#f3e7c9");
    r(bx + 4, 26, 1, 5, "#c9b48a");
    r(bx, 48, 3, 4, "#4a2f7a"), r(bx + 7, 48, 3, 4, "#4a2f7a");
  }
  // trepadeira na janela
  for (let i = 0; i < 18; i++) r(112 + (i % 3), 14 + i * 4, 3, 3, i % 2 ? "#3f7a3c" : "#5fae58");
  lantern(r, ctx, 106, 58, t);
  lantern(r, ctx, 212, 58, t + 400);
  // bibliotecário sentado lendo atrás da mesa
  spriteAt(ctx, LIBRARIAN, "reading", opts.still ? 0 : Math.floor(t / 900) % 2, 150, 140, 2);
  // mesa
  r(92, 118, 136, 8, "#6b4528");
  r(92, 118, 136, 2, "#8a5d3b");
  r(98, 126, 124, 24, "#4a2f1b");
  r(98, 126, 124, 2, "#3a2414");
  for (const x of [112, 150, 188]) r(x, 132, 20, 12, "#3e2716"), r(x + 9, 137, 3, 2, "#f1c66a");
  // pilha de livros, tinteiro e pena
  r(100, 108, 18, 4, "#7a2a3a"), r(102, 104, 16, 4, "#2b6cb0"), r(101, 100, 15, 4, "#3f7a3c");
  r(200, 112, 6, 6, "#1b1430"), r(201, 111, 4, 1, "#3a3f48");
  r(205, 100, 1, 12, "#efe9da"), r(206, 99, 2, 8, "#d8d0be");
  // cristal brilhando
  const pulse = opts.still ? 0.4 : 0.35 + Math.sin(t / 500) * 0.1;
  glow(ctx, 124, 104, 34, "120,220,255", pulse);
  r(121, 98, 7, 14, "#59c9f8");
  r(122, 98, 2, 14, "#cfefff");
  r(119, 110, 11, 3, "#3a3f48");
  // velas
  candle(r, ctx, 194, 106, t);
  candle(r, ctx, 212, 106, t + 200);
  // globo
  r(222, 104, 10, 10, "#2b6cb0"), r(224, 106, 4, 3, "#3f7a3c"), r(226, 114, 2, 4, "#8a5d3b"), r(222, 117, 10, 1, "#8a5d3b");
  // gato branco dormindo na ponta da mesa
  const cx = 170;
  r(cx, 112, 16, 6, "#f3f4fa");
  r(cx + 12, 109, 6, 6, "#f3f4fa");
  r(cx + 12, 108, 2, 2, "#f3f4fa"), r(cx + 16, 108, 2, 2, "#f3f4fa");
  r(cx + 13, 112, 1, 1, "#2a2430"), r(cx + 16, 112, 1, 1, "#2a2430");
  r(cx - 4, 115, 6, 2, "#f3f4fa");
  r(cx + 2, 113, 10, 1, "#d8dce8");
  if (!opts.still) {
    const z = Math.floor(t / 700) % 3;
    for (let i = 0; i <= z; i++) r(cx + 20 + i * 4, 104 - i * 5, 3, 3, "rgba(220,230,255,0.8)");
  }
  // poeira dourada na luz das velas
  if (!opts.still)
    for (let i = 0; i < 14; i++) {
      const life = ((t / 6000 + hash(i, 5)) % 1 + 1) % 1;
      r(150 + hash(i, 6) * 80 + Math.sin(t / 900 + i) * 6, 110 - life * 70, 1, 1, `rgba(255,220,140,${0.6 * (1 - life)})`);
    }
  // pergaminhos de fichamentos arquivados (um por fichamento real, até 12)
  const rev = Math.min(12, opts.reviewed ?? 0);
  for (let i = 0; i < rev; i++) {
    const x = 256 + (i % 6) * 9;
    const y = 160 - Math.floor(i / 6) * 6;
    r(x, y, 8, 5, "#f3e7c9");
    r(x, y, 1, 5, "#c9b48a");
    r(x + 3, y + 2, 2, 1, "#c8423b");
  }
  const v = ctx.createRadialGradient(SCENE_W / 2, SCENE_H / 2, 70, SCENE_W / 2, SCENE_H / 2, 200);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}
