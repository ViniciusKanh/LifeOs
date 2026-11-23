/**
 * Cenas pixel art dos sistemas de aventura (Raid, Companheiro, Campo de
 * Treinamento, Taverna musical e Sala do Aventureiro). Mesma linguagem visual
 * de scenes.ts: 320×180 lógicos, sem imagens externas nem logotipos de
 * terceiros, animação derivada só de `t`.
 */
import { glow, hash, lantern, painter, planks, spriteAt, stoneWall, flames, bookshelf, candle, nightWindow, SCENE_H, SCENE_W, type R } from "./scenes";
import { shade, type Look } from "./sprites";
import { DEFAULT_AVATAR_LOOK, normalizeLook } from "./looks";

/* ═════════════════════════════ Companheiro (husky) ═════════════════════════════ */

export type PetColor = "cinza" | "marrom" | "branco" | "preto" | "dourado";
export type PetMood = "feliz" | "focado" | "cansado" | "faminto" | "entediado" | "descansando";
export interface PetLook {
  color: PetColor;
  mood: PetMood;
  stage: number;
  appearance: { pescoco: string | null; cabeca: string | null; costas: string | null };
}
export const DEFAULT_PET: PetLook = { color: "cinza", mood: "feliz", stage: 0, appearance: { pescoco: "coleira", cabeca: null, costas: null } };

const FUR: Record<PetColor, [string, string]> = {
  cinza: ["#7f8a9b", "#5a6374"],
  marrom: ["#9a6440", "#6e4429"],
  branco: ["#d7dbe4", "#a9aebb"],
  preto: ["#3d3f4c", "#272832"],
  dourado: ["#c99543", "#94672a"],
};

/*
 * Husky sentado, virado para a direita (24×21). Legenda:
 * K contorno · G pelo · D pelo escuro · W branco · w sombra do branco ·
 * B olho · N nariz · P rosa da orelha · e olho fechado.
 */
const HUSKY_SIT = [
  "..........KK....KK......",
  ".........KGPK..KGPK.....",
  ".........KGPGKKGPGK.....",
  "........KGGGGGGGGGGK....",
  "........KGWGGGGGWGGK....",
  ".......KGWWBWGGWWBWGK...",
  ".......KGWWWWWWWWWWWGK..",
  "......KGGWWWWWWWWWWWWNK.",
  ".....KGGGwWWWWWWWWWWWKK.",
  "....KDGGGGwWWWWWKKKKK...",
  "...KDGGGGGGwWWWWK.......",
  "KK.KDGGGGGGGwWWWWK......",
  "KGKKDGGGGGGGGWWWWK......",
  "KGGKDGGGGGGGGWWWWWK.....",
  ".KGGDGGGGGGGGwWWWWK.....",
  "..KKDDGGGGGGGwWKWWK.....",
  "....KDGGGGGGDwWKWWK.....",
  "....KDDGGGGDDwWKWWK.....",
  "....KDDDGGDDwWWKWWWK....",
  "....KKKKKKKKKKKKKKKK....",
  "........................",
];
/* Deitado dormindo (26×12). */
const HUSKY_SLEEP = [
  "...............KK..KK.....",
  "..............KGPKKGPK....",
  ".............KGGGGGGGGK...",
  "............KGWGGGGWGGGK..",
  "..KK........KGeeWWeeWWWNK.",
  ".KGGK.......KGWWWWWWWWWK..",
  "KGGGKKKKKKKKDGGwWWWWWKK...",
  "KGDGGGGGGGGGGGGGwWWWK.....",
  ".KDDGGGGGGGGGGGGGwWWK.....",
  "..KDDDGGGGGGGGDDwWWWWK....",
  "...KKKKKKKKKKKKKKKKKKK....",
  "..........................",
];

function petPalette(color: PetColor): Record<string, string> {
  const [g, d] = FUR[color];
  return { K: "#1d1a24", G: g, D: d, W: color === "branco" ? "#f4f6fa" : "#eef1f6", w: "#c5cad6", B: "#59A9F8", N: "#1d1a24", P: "#e79aa8", e: "#1d1a24" };
}

/** Pinta um pixel lógico arredondando as bordas (sem frestas com escala fracionária). */
function cell(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.fillStyle = c;
  ctx.fillRect(x0, y0, Math.round(x + s) - x0, Math.round(y + s) - y0);
}

function blit(ctx: CanvasRenderingContext2D, map: string[], pal: Record<string, string>, x: number, y: number, s: number, flip: boolean) {
  const w = map[0]!.length;
  for (let row = 0; row < map.length; row++) {
    const line = map[row]!;
    for (let col = 0; col < w; col++) {
      const c = pal[line[col]!];
      if (!c) continue;
      const cx = flip ? w - 1 - col : col;
      cell(ctx, x + cx * s, y + row * s, s, c);
    }
  }
}

/**
 * Desenha o companheiro com pés em (x, feetY). `s` = tamanho do pixel lógico.
 * Usado nas telas (s≈2–4) e na Vila (s≈1.4).
 */
export function drawHusky(ctx: CanvasRenderingContext2D, x: number, feetY: number, s: number, pet: PetLook, t: number, flip = false) {
  const pal = petPalette(pet.color);
  const sleeping = pet.mood === "descansando" || pet.mood === "cansado";
  const map = sleeping ? HUSKY_SLEEP : HUSKY_SIT;
  const w = map[0]!.length;
  const h = map.length;
  const ox = x - (w * s) / 2;
  const breathe = sleeping ? Math.round(Math.sin(t / 600) * 0.6) * s * 0.5 : 0;
  const oy = feetY - h * s + breathe;
  const X = (col: number) => (flip ? ox + (w - 1 - col) * s : ox + col * s);
  const P = (col: number, row: number, cw: number, ch: number, c: string) => {
    for (let i = 0; i < cw; i++) for (let j = 0; j < ch; j++) cell(ctx, X(col + i), oy + (row + j) * s, s, c);
  };
  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, feetY, (w * s) / 2.3, s * 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // capa atrás do corpo
  if (pet.appearance.costas === "capa") P(sleeping ? 4 : 3, sleeping ? 5 : 9, sleeping ? 12 : 9, sleeping ? 4 : 9, "#5b3f8c");
  blit(ctx, map, pal, ox, oy, s, flip);
  // rabo abanando quando feliz (pixels extras na ponta)
  if (!sleeping && pet.mood === "feliz" && Math.sin(t / 120) > 0) P(0, 10, 2, 1, pal.G!);
  if (!sleeping) {
    // piscar
    if (Math.sin(t / 900) > 0.97) {
      P(11, 5, 1, 1, pal.W!);
      P(17, 5, 1, 1, pal.W!);
    }
    if (pet.mood === "entediado") {
      P(11, 5, 1, 1, pal.D!);
      P(17, 5, 1, 1, pal.D!);
    }
    // língua de feliz
    if (pet.mood === "feliz" || pet.mood === "focado") P(19, 9, 2, 2, "#e8607a");
  }
  const a = pet.appearance;
  const headY = sleeping ? 2 : 3;
  const eyeY = sleeping ? 4 : 5;
  if (a.pescoco === "coleira") {
    P(sleeping ? 12 : 9, sleeping ? 6 : 9, sleeping ? 2 : 7, 1, "#c8423b");
    P(sleeping ? 13 : 12, sleeping ? 7 : 10, 1, 1, "#f1c66a");
  }
  if (a.pescoco === "lenco") {
    P(sleeping ? 12 : 9, sleeping ? 6 : 9, sleeping ? 3 : 8, 1, "#2b6cb0");
    P(sleeping ? 13 : 11, sleeping ? 7 : 10, 3, 1, "#2b6cb0");
    P(sleeping ? 14 : 12, sleeping ? 8 : 11, 1, 1, "#2b6cb0");
  }
  if (a.cabeca === "oculos") {
    const c = "#1d1a24";
    P(sleeping ? 14 : 10, eyeY - 1, 3, 1, c);
    P(sleeping ? 18 : 16, eyeY - 1, 3, 1, c);
    P(sleeping ? 17 : 13, eyeY - 1, 3, 1, c);
    P(sleeping ? 14 : 10, eyeY, 1, 1, c);
    P(sleeping ? 16 : 12, eyeY, 1, 1, c);
    P(sleeping ? 18 : 16, eyeY, 1, 1, c);
    P(sleeping ? 20 : 18, eyeY, 1, 1, c);
  }
  if (a.cabeca === "headset") {
    P(sleeping ? 13 : 9, headY - 2, sleeping ? 9 : 10, 1, "#2a2a32");
    P(sleeping ? 13 : 9, headY - 1, 2, 4, "#59A9F8");
    P(sleeping ? 21 : 18, headY - 1, 2, 4, "#59A9F8");
  }
  if (a.cabeca === "faixa") P(sleeping ? 13 : 9, headY, sleeping ? 10 : 11, 1, "#c8423b");
  if (a.cabeca === "coroa") {
    P(sleeping ? 15 : 12, headY - 3, 5, 2, "#f1c66a");
    P(sleeping ? 15 : 12, headY - 4, 1, 1, "#f1c66a");
    P(sleeping ? 17 : 14, headY - 4, 1, 1, "#f1c66a");
    P(sleeping ? 19 : 16, headY - 4, 1, 1, "#f1c66a");
  }
  if (a.costas === "mochila") {
    P(sleeping ? 6 : 4, sleeping ? 5 : 10, 4, 4, "#8a5d3b");
    P(sleeping ? 6 : 4, sleeping ? 5 : 10, 4, 1, "#5a3a22");
  }
  // aura lendária
  if (pet.stage >= 4) glow(ctx, x, feetY - (h * s) / 2, w * s, "241,198,106", 0.12 + 0.05 * Math.sin(t / 400));
  // Zzz dormindo
  if (sleeping) {
    ctx.fillStyle = "rgba(220,230,255,0.85)";
    ctx.font = `${Math.max(6, Math.round(s * 4))}px monospace`;
    const k = (t / 800) % 1;
    ctx.fillText("z", X(22), oy - k * s * 6);
    ctx.fillText("Z", X(24), oy - s * 3 - k * s * 6);
  }
}

/** Casa do Companheiro: varanda da vila à noite, com o pet em destaque. */
export function drawPetScene(ctx: CanvasRenderingContext2D, t: number, pet: PetLook, opts: { still?: boolean } = {}) {
  if (opts.still) t = 0;
  const r = painter(ctx);
  const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  sky.addColorStop(0, "#1b1f4a");
  sky.addColorStop(1, "#3b2d5e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  for (let i = 0; i < 30; i++) r(hash(i, 7) * SCENE_W, hash(i, 8) * 60, 1, 1, `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t / 900 + i))})`);
  // casas ao fundo
  for (const [hx, hw, hh, roof] of [[0, 70, 64, "#6b3fa0"], [190, 80, 70, "#9e2b2b"], [262, 70, 58, "#3f5a3a"]] as const) {
    stoneWall(r, hx, 118 - hh, hw, hh, "#6a5d58");
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(hx - 6, 118 - hh);
    ctx.lineTo(hx + hw / 2, 118 - hh - 26);
    ctx.lineTo(hx + hw + 6, 118 - hh);
    ctx.fill();
    r(hx + hw / 2 - 6, 118 - hh + 16, 12, 10, Math.sin(t / 300 + hx) > -0.6 ? "#ffd27a" : "#f4b04a");
    glow(ctx, hx + hw / 2, 118 - hh + 21, 24, "255,200,110", 0.25);
  }
  // fonte de cristal
  r(150, 104, 34, 12, "#4a4f5c");
  r(152, 102, 30, 3, "#6a7180");
  r(163, 82, 8, 20, "#3a3f48");
  ctx.fillStyle = "#59d4f8";
  ctx.beginPath();
  ctx.moveTo(167, 62);
  ctx.lineTo(174, 74);
  ctx.lineTo(167, 86);
  ctx.lineTo(160, 74);
  ctx.fill();
  glow(ctx, 167, 74, 34, "89,212,248", 0.3 + 0.1 * Math.sin(t / 500));
  // chão de pedra
  r(0, 118, SCENE_W, 62, "#3d3a48");
  for (let y = 118; y < SCENE_H; y += 8) for (let x = ((y / 8) % 2) * 10; x < SCENE_W; x += 20) r(x, y, 19, 7, shade("#4a4656", hash(x, y) > 0.5 ? 6 : -4));
  lantern(r, ctx, 40, 70, t);
  lantern(r, ctx, 282, 74, t);
  // livros e notebook do pet
  for (let i = 0; i < 4; i++) r(54, 150 - i * 5, 26, 4, ["#7a2a3a", "#2b6cb0", "#3f7a3c", "#b7791f"][i]!);
  r(208, 146, 36, 3, "#2a2a32");
  r(212, 128, 28, 18, "#3a3f48");
  r(214, 130, 24, 14, "#5b3f8c");
  glow(ctx, 226, 137, 20, "168,117,245", 0.25);
  drawHusky(ctx, 150, 168, 3, pet, t);
  // coração quando feliz
  if (pet.mood === "feliz") {
    const y = 72 - ((t / 40) % 14);
    r(186, y, 3, 2, "#f16d75");
    r(190, y, 3, 2, "#f16d75");
    r(186, y + 2, 7, 2, "#f16d75");
    r(188, y + 4, 3, 2, "#f16d75");
  }
}

/* ═════════════════════════════ Raid: Golem da Inércia ═════════════════════════════ */

/** Bloco de rocha com luz de cima-esquerda e rachaduras. */
function rock(r: R, x: number, y: number, w: number, h: number, base: string, seed: number) {
  r(x + 2, y, w - 4, h, base);
  r(x, y + 2, w, h - 4, base);
  r(x + 2, y + 1, w - 6, 3, shade(base, 22));
  r(x + 1, y + 3, 3, h - 8, shade(base, 14));
  r(x + 3, y + h - 3, w - 5, 2, shade(base, -26));
  r(x + w - 3, y + 4, 2, h - 7, shade(base, -20));
  if (hash(seed, 1) > 0.4) r(x + w * 0.4, y + h * 0.3, 1, h * 0.35, shade(base, -34));
  if (hash(seed, 2) > 0.5) r(x + w * 0.55, y + h * 0.55, w * 0.25, 1, shade(base, -34));
}

export interface RaidSceneOpts {
  hpPct: number;
  state: "nao_iniciada" | "em_batalha" | "derrotado" | "encerrada";
  hero?: Look;
  pet?: PetLook | null;
  still?: boolean;
}

export function drawRaidScene(ctx: CanvasRenderingContext2D, t: number, o: RaidSceneOpts) {
  if (o.still) t = 0;
  const r = painter(ctx);
  // céu e muralhas da arena
  const sky = ctx.createLinearGradient(0, 0, 0, 100);
  sky.addColorStop(0, "#151a3d");
  sky.addColorStop(1, "#33285a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  for (let i = 0; i < 24; i++) r(hash(i, 3) * SCENE_W, hash(i, 4) * 40, 1, 1, "rgba(255,255,255,0.6)");
  stoneWall(r, 0, 46, SCENE_W, 60, "#4f4a5c");
  for (let x = 0; x < SCENE_W; x += 16) r(x, 40, 10, 8, "#4f4a5c");
  // estandartes
  for (const bx of [70, 240]) {
    r(bx, 52, 22, 36, "#5b2a7a");
    r(bx, 52, 22, 3, "#f1c66a");
    ctx.fillStyle = "#5b2a7a";
    ctx.beginPath();
    ctx.moveTo(bx, 88);
    ctx.lineTo(bx + 11, 96);
    ctx.lineTo(bx + 22, 88);
    ctx.fill();
    ctx.fillStyle = "#f1c66a";
    ctx.beginPath();
    ctx.moveTo(bx + 11, 60);
    ctx.lineTo(bx + 18, 70);
    ctx.lineTo(bx + 11, 80);
    ctx.lineTo(bx + 4, 70);
    ctx.fill();
    r(bx + 9, 68, 4, 4, "#5b2a7a");
  }
  // tochas
  for (const tx of [30, 140, 180, 290]) {
    r(tx, 70, 4, 12, "#3a2a1a");
    flames(r, tx - 2, 70, 8, 12, t + tx * 10, 1);
    glow(ctx, tx + 2, 64, 30, "255,150,70", 0.3);
  }
  // plateia (silhuetas)
  for (let i = 0; i < 26; i++) {
    const px = 4 + i * 12.4;
    const py = 100 + Math.sin(t / 220 + i) * (o.state === "em_batalha" ? 1.5 : 0.4);
    r(px, py, 8, 8, shade("#2a2340", hash(i, 9) * 20 - 10));
    r(px + 1, py - 5, 6, 6, shade("#3a3050", hash(i, 9) * 20 - 10));
  }
  // chão da arena com círculo rúnico
  r(0, 110, SCENE_W, 70, "#5a4a3c");
  for (let y = 110; y < SCENE_H; y += 6) for (let x = ((y / 6) % 2) * 8; x < SCENE_W; x += 16) r(x, y, 15, 5, shade("#5a4a3c", hash(x, y) * 14 - 7));
  ctx.strokeStyle = `rgba(241,198,106,${0.45 + 0.2 * Math.sin(t / 400)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(200, 150, 82, 18, 0, 0, Math.PI * 2);
  ctx.stroke();

  const defeated = o.state === "derrotado";
  const gx = 222;
  const gy = 154;
  if (defeated) {
    // escombros do golem + troféu
    for (let i = 0; i < 9; i++) rock(r, gx - 46 + i * 10 + hash(i, 5) * 4, gy - 14 - hash(i, 6) * 10, 14, 12, "#6b6478", i);
    r(gx - 6, gy - 46, 12, 4, "#f1c66a");
    r(gx - 3, gy - 42, 6, 10, "#f1c66a");
    r(gx - 8, gy - 32, 16, 4, "#c8923e");
    glow(ctx, gx, gy - 40, 40, "241,198,106", 0.35 + 0.1 * Math.sin(t / 300));
  } else {
    const bob = Math.sin(t / 500) * 1.5;
    const stone = o.state === "encerrada" ? "#5d5868" : "#6b6478";
    const hit = o.state === "em_batalha" && Math.sin(t / 700) > 0.93;
    // pernas
    rock(r, gx - 30, gy - 30, 20, 30, stone, 1);
    rock(r, gx + 8, gy - 30, 20, 30, stone, 2);
    // tronco
    rock(r, gx - 38, gy - 82 + bob, 74, 56, hit ? "#9a90a8" : stone, 3);
    // ombros e braços
    rock(r, gx - 62, gy - 86 + bob, 30, 26, stone, 4);
    rock(r, gx + 30, gy - 86 + bob, 30, 26, stone, 5);
    rock(r, gx - 64, gy - 62 + bob, 22, 30, stone, 6);
    rock(r, gx + 40, gy - 62 + bob, 22, 30, stone, 7);
    rock(r, gx - 68, gy - 34 + bob, 28, 22, stone, 8);
    rock(r, gx + 38, gy - 34 + bob, 28, 22, stone, 9);
    // cabeça com musgo
    rock(r, gx - 16, gy - 104 + bob, 32, 24, stone, 10);
    r(gx - 14, gy - 105 + bob, 28, 3, "#3f7a3c");
    r(gx - 30, gy - 84 + bob, 14, 2, "#3f7a3c");
    // olhos e runa espiral
    const eye = `rgba(200,120,255,${0.8 + 0.2 * Math.sin(t / 200)})`;
    r(gx - 9, gy - 94 + bob, 6, 3, eye);
    r(gx + 3, gy - 94 + bob, 6, 3, eye);
    glow(ctx, gx, gy - 93 + bob, 18, "190,110,255", 0.4);
    ctx.strokeStyle = "#c58bff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) {
      const rr = 2 + a * 1.6;
      const px = gx - 1 + Math.cos(a + t / 900) * rr;
      const py = gy - 56 + bob + Math.sin(a + t / 900) * rr * 0.9;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    glow(ctx, gx, gy - 56 + bob, 30, "190,110,255", 0.35 + 0.15 * Math.sin(t / 350));
    // fissuras proporcionais ao dano sofrido
    const cracks = Math.round((100 - o.hpPct) / 12);
    for (let i = 0; i < cracks; i++) {
      const cx = gx - 30 + hash(i, 11) * 60;
      const cy = gy - 78 + hash(i, 12) * 46 + bob;
      r(cx, cy, 1, 6, "#c58bff");
      r(cx + 1, cy + 5, 4, 1, "#c58bff");
    }
    if (hit) {
      ctx.fillStyle = "#ffe08a";
      ctx.font = "bold 10px monospace";
      ctx.fillText("-" + (100 + Math.round(hash(Math.floor(t / 700), 3) * 300)), gx + 18, gy - 100 - ((t % 700) / 700) * 10);
    }
  }
  // herói, companheiro e aliados
  const hero = o.hero ?? normalizeLook({ ...DEFAULT_AVATAR_LOOK, prop: "espada", cape: "#7A1F3A" }, DEFAULT_AVATAR_LOOK);
  const attacking = o.state === "em_batalha" && Math.sin(t / 700) > 0.8;
  spriteAt(ctx, hero, defeated ? "celebrate" : attacking ? "interact" : "stand", Math.floor(t / 180) % 4, 118 + (attacking ? 8 : 0), 160, 1.6);
  const mage = normalizeLook({ ...DEFAULT_AVATAR_LOOK, outfit: "manto", shirt: "#2B3A67", hat: "chapeu_mago", hatColor: "#2B3A67", prop: "cajado", hairStyle: "longo", beard: "cheia", hair: "#D8D8D8" }, DEFAULT_AVATAR_LOOK);
  spriteAt(ctx, mage, defeated ? "celebrate" : "think", Math.floor(t / 220) % 4, 70, 150, 1.25);
  if (o.pet) drawHusky(ctx, 92, 166, 1.5, { ...o.pet, mood: defeated ? "feliz" : o.pet.mood === "descansando" ? "feliz" : o.pet.mood }, t);
}

/* ═════════════════════════════ Campo de Treinamento ═════════════════════════════ */

export function drawTrainingScene(ctx: CanvasRenderingContext2D, t: number, o: { hero?: Look; still?: boolean; active?: boolean } = {}) {
  if (o.still) t = 0;
  const r = painter(ctx);
  const sky = ctx.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, "#6aa8e8");
  sky.addColorStop(1, "#f6c98a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // sol e nuvens
  glow(ctx, 260, 50, 40, "255,220,150", 0.6);
  r(254, 44, 12, 12, "#ffe6a8");
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 90 + t / 60) % 380) - 30;
    r(cx, 18 + i * 8, 30, 6, "rgba(255,255,255,0.8)");
    r(cx + 6, 14 + i * 8, 18, 5, "rgba(255,255,255,0.8)");
  }
  // montanhas, castelo e cachoeira
  ctx.fillStyle = "#7b8fb8";
  ctx.beginPath();
  ctx.moveTo(0, 96);
  for (let x = 0; x <= SCENE_W; x += 20) ctx.lineTo(x, 70 + Math.sin(x / 37) * 14 + hash(x, 1) * 6);
  ctx.lineTo(SCENE_W, 110);
  ctx.lineTo(0, 110);
  ctx.fill();
  for (const [cx, w, h] of [[210, 8, 28], [222, 12, 20], [238, 8, 30]] as const) r(cx, 70 - h + 20, w, h, "#5d6a8f");
  r(258, 60, 18, 56, "#6aa0d8");
  for (let y = 60; y < 116; y += 4) r(258 + ((y + t / 30) % 18), y, 2, 3, "rgba(255,255,255,0.8)");
  // grama e trilha
  r(0, 104, SCENE_W, 76, "#4f9a4a");
  for (let i = 0; i < 160; i++) r(hash(i, 2) * SCENE_W, 104 + hash(i, 3) * 76, 2, 2, hash(i, 4) > 0.5 ? "#5fb85a" : "#3f7a3c");
  ctx.fillStyle = "#c9a26a";
  ctx.beginPath();
  ctx.moveTo(0, 160);
  ctx.quadraticCurveTo(160, 132, SCENE_W, 150);
  ctx.lineTo(SCENE_W, 166);
  ctx.quadraticCurveTo(160, 150, 0, 178);
  ctx.fill();
  // árvores floridas, cerca e poste do santuário
  for (const [tx, col] of [[24, "#e78fc0"], [300, "#a875f5"]] as const) {
    r(tx, 80, 6, 34, "#6b4528");
    for (let i = 0; i < 14; i++) r(tx - 18 + hash(i, tx) * 40, 52 + hash(i, tx + 1) * 34, 10, 8, i % 3 ? col : shade(col, -20));
  }
  for (let x = 40; x < 140; x += 14) {
    r(x, 118, 3, 14, "#8a5d3b");
    r(x - 4, 122, 14, 2, "#a0703f");
  }
  r(62, 92, 22, 26, "#7a7484");
  r(64, 94, 18, 22, "#5a5466");
  r(69, 99, 8, 8, "#f16d75");
  r(68, 101, 10, 4, "#f16d75");
  glow(ctx, 73, 103, 22, "241,109,117", 0.25 + 0.1 * Math.sin(t / 400));
  // placa da trilha (seta laranja genérica)
  r(232, 116, 3, 30, "#6b4528");
  r(222, 108, 24, 12, "#8a5d3b");
  ctx.fillStyle = "#f2732b";
  ctx.beginPath();
  ctx.moveTo(227, 117);
  ctx.lineTo(234, 110);
  ctx.lineTo(241, 117);
  ctx.fill();
  // herói correndo
  const hero = o.hero ?? normalizeLook({ ...DEFAULT_AVATAR_LOOK, hat: "bandana", hatColor: "#C8423B" }, DEFAULT_AVATAR_LOOK);
  const runX = o.active === false ? 150 : 110 + ((t / 25) % 120);
  spriteAt(ctx, hero, "walk", Math.floor(t / 90) % 4, runX, 156, 1.7);
  for (let i = 0; i < 3; i++) r(runX - 18 - i * 7, 154 - i, 4, 2, "rgba(230,210,170,0.7)");
}

/* ═════════════════════════════ Taverna musical ═════════════════════════════ */

export function drawTavernMusicScene(ctx: CanvasRenderingContext2D, t: number, o: { playing: boolean; hero?: Look; pet?: PetLook | null; still?: boolean }) {
  if (o.still) t = 0;
  const r = painter(ctx);
  stoneWall(r, 0, 0, SCENE_W, 122, "#5a4c46");
  planks(r, 122, 58, "#6b4a32");
  nightWindow(r, ctx, 196, 18, 56, 70, t, false);
  // lareira
  stoneWall(r, 252, 48, 62, 74, "#6e5f58");
  r(262, 84, 42, 38, "#1a1210");
  flames(r, 266, 120, 34, 28, t, 1);
  glow(ctx, 283, 104, 70, "255,140,60", 0.32 + 0.06 * Math.sin(t / 130));
  // estante e estandarte com nota musical
  bookshelf(r, 6, 34, 56, 88, 3);
  r(118, 10, 40, 54, "#5b2a7a");
  r(118, 10, 40, 3, "#f1c66a");
  ctx.fillStyle = "#e9e2cf";
  ctx.beginPath();
  ctx.arc(132, 46, 5, 0, Math.PI * 2);
  ctx.arc(146, 42, 5, 0, Math.PI * 2);
  ctx.fill();
  r(136, 22, 2, 24, "#e9e2cf");
  r(150, 18, 2, 24, "#e9e2cf");
  r(136, 18, 16, 4, "#e9e2cf");
  lantern(r, ctx, 84, 40, t);
  // cristal
  ctx.fillStyle = "#a875f5";
  ctx.beginPath();
  ctx.moveTo(78, 100);
  ctx.lineTo(86, 84);
  ctx.lineTo(94, 100);
  ctx.fill();
  glow(ctx, 86, 94, 22, "168,117,245", 0.35);
  // mesa, notebook e caneca
  r(100, 130, 120, 8, "#8a5d3b");
  r(106, 138, 6, 30, "#5a3a22");
  r(206, 138, 6, 30, "#5a3a22");
  r(150, 112, 34, 18, "#2a2a32");
  r(152, 114, 30, 14, o.playing ? "#2f9e6a" : "#3a3f48");
  glow(ctx, 167, 121, 24, o.playing ? "79,212,154" : "89,169,248", 0.3);
  r(194, 120, 9, 10, "#c8742e");
  r(203, 122, 3, 5, "#c8742e");
  for (let i = 0; i < 3; i++) r(196 + i * 2, 114 - ((t / 90 + i * 5) % 10), 1, 3, "rgba(230,230,230,0.6)");
  candle(r, ctx, 116, 124, t);
  // herói com fones
  const hero = o.hero ?? DEFAULT_AVATAR_LOOK;
  spriteAt(ctx, hero, "typing", Math.floor(t / 160) % 4, 140, 152, 1.7);
  r(124, 97, 3, 7, "#4fd49a");
  r(154, 97, 3, 7, "#4fd49a");
  r(126, 93, 29, 2, "#2a2a32");
  // notas musicais subindo quando está tocando
  if (o.playing)
    for (let i = 0; i < 4; i++) {
      const k = ((t / 1400 + i * 0.25) % 1);
      const nx = 150 + Math.sin(k * 6 + i) * 18 + i * 8;
      const ny = 80 - k * 60;
      const a = 1 - k;
      r(nx, ny, 3, 3, `rgba(168,117,245,${a})`);
      r(nx + 2, ny - 7, 1, 8, `rgba(168,117,245,${a})`);
      r(nx + 2, ny - 7, 4, 1, `rgba(168,117,245,${a})`);
    }
  if (o.pet) drawHusky(ctx, 238, 170, 1.6, { ...o.pet, mood: "descansando" }, t);
  else {
    // gato da taverna dormindo
    r(228, 160, 20, 8, "#e9e2cf");
    r(244, 156, 7, 7, "#e9e2cf");
  }
}

/* ═════════════════════════════ Sala do Aventureiro ═════════════════════════════ */

export function drawGamerRoomScene(ctx: CanvasRenderingContext2D, t: number, o: { playing?: boolean; trophies?: number; hero?: Look; still?: boolean } = {}) {
  if (o.still) t = 0;
  const r = painter(ctx);
  stoneWall(r, 0, 0, SCENE_W, 124, "#4b4256");
  planks(r, 124, 56, "#5b3f2a");
  // tapete
  r(60, 150, 200, 22, "#5b2a7a");
  r(64, 154, 192, 14, "#7a3a9a");
  nightWindow(r, ctx, 168, 12, 70, 78, t, false);
  // estandarte com controle genérico
  r(96, 8, 40, 56, "#2b3a67");
  r(96, 8, 40, 3, "#f1c66a");
  r(104, 30, 24, 12, "#e9e2cf");
  r(108, 34, 4, 1, "#2b3a67");
  r(109, 33, 2, 3, "#2b3a67");
  r(120, 33, 2, 2, "#2b3a67");
  r(123, 36, 2, 2, "#2b3a67");
  // estante de jogos e troféus
  const shelfX = 12;
  r(shelfX, 30, 60, 4, "#6b4528");
  r(shelfX, 62, 60, 4, "#6b4528");
  r(shelfX, 94, 60, 4, "#6b4528");
  for (let i = 0; i < 9; i++) r(shelfX + 3 + i * 6, 40, 5, 22, ["#c8423b", "#2b6cb0", "#3f7a3c", "#b7791f", "#5b3f8c", "#a0522d", "#2b3a67", "#8a3a5a", "#4a6a5a"][i]!);
  const trophies = Math.min(6, o.trophies ?? 0);
  for (let i = 0; i < trophies; i++) {
    const tx = shelfX + 4 + i * 9;
    r(tx, 80, 6, 3, "#f1c66a");
    r(tx + 2, 83, 2, 6, "#f1c66a");
    r(tx, 89, 6, 3, "#c8923e");
  }
  if (trophies) glow(ctx, shelfX + 30, 86, 30, "241,198,106", 0.2);
  // armadura decorativa
  r(268, 70, 20, 30, "#8d8fa3");
  r(272, 56, 12, 14, "#a0a3b8");
  r(274, 60, 8, 2, "#2a2a32");
  r(270, 100, 6, 24, "#6b6d80");
  r(280, 100, 6, 24, "#6b6d80");
  // mesa, monitores e PC
  r(110, 122, 130, 6, "#3a2a1a");
  r(118, 128, 4, 30, "#2a1d12");
  r(228, 128, 4, 30, "#2a1d12");
  r(140, 84, 56, 34, "#1d1a24");
  const scr = o.playing ? "#2b6cb0" : "#26304a";
  r(143, 87, 50, 28, scr);
  if (o.playing) {
    // cena de jogo simples no monitor
    r(143, 107, 50, 8, "#3f7a3c");
    r(150 + ((t / 40) % 36), 101, 4, 6, "#f1c66a");
    r(170, 95, 6, 12, "#c8423b");
  }
  glow(ctx, 168, 100, 40, "89,169,248", 0.3);
  r(164, 118, 8, 4, "#1d1a24");
  r(202, 92, 14, 30, "#2a2a32");
  r(206, 96, 6, 2, Math.sin(t / 200) > 0 ? "#a875f5" : "#4fd49a");
  r(206, 100, 6, 2, "#4fd49a");
  // cristal roxo
  ctx.fillStyle = "#a875f5";
  ctx.beginPath();
  ctx.moveTo(244, 120);
  ctx.lineTo(252, 100);
  ctx.lineTo(260, 120);
  ctx.fill();
  glow(ctx, 252, 110, 26, "168,117,245", 0.35 + 0.1 * Math.sin(t / 400));
  // herói jogando de costas para a câmera (lado)
  const hero = o.hero ?? DEFAULT_AVATAR_LOOK;
  spriteAt(ctx, hero, "typing", Math.floor(t / 140) % 4, 150, 158, 1.6);
  r(135, 109, 3, 7, "#a875f5");
  r(163, 109, 3, 7, "#a875f5");
  r(137, 105, 27, 2, "#2a2a32");
  // gato
  r(214, 116, 14, 6, "#e9e2cf");
  r(226, 113, 5, 5, "#e9e2cf");
}
