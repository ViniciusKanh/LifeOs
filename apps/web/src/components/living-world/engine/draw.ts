/**
 * Arte do Meu Mundo em pixel art procedural (sem imagens de terceiros).
 * Tudo em coordenadas de mundo; `box` desenha volumes isométricos e os
 * detalhes (texturas de madeira/pedra, livros, chamas…) são pixels por cima.
 * Ruído determinístico por tile garante que a arte não "pisque" entre quadros.
 */
import { isoToScreen, roomAt, tileKind, tileZ, TILE_H, TILE_W, WALL_H, type Furniture, type RoomDef, type TileKind, type WallDecor } from "./worldMap";
import { shade } from "./sprites";

export type Ctx = CanvasRenderingContext2D;

const P = (x: number, y: number) => {
  const s = isoToScreen(x, y);
  return [s.sx, s.sy] as const;
};

/** Ruído determinístico 0..1 por coordenada inteira. */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function poly(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, fill: string | CanvasGradient, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Caixa isométrica centrada no tile (x,y); a/b = meia-largura em tiles; h/z em pixels. */
export function box(ctx: Ctx, x: number, y: number, a: number, b: number, h: number, top: string, z = 0, left?: string, right?: string) {
  const lift = (p: readonly [number, number], dz: number) => [p[0], p[1] - dz] as const;
  const p1 = P(x - a, y - b);
  const p2 = P(x + a, y - b);
  const p3 = P(x + a, y + b);
  const p4 = P(x - a, y + b);
  poly(ctx, [lift(p4, z), lift(p3, z), lift(p3, z + h), lift(p4, z + h)], left ?? shade(top, -35));
  poly(ctx, [lift(p2, z), lift(p3, z), lift(p3, z + h), lift(p2, z + h)], right ?? shade(top, -60));
  poly(ctx, [lift(p1, z + h), lift(p2, z + h), lift(p3, z + h), lift(p4, z + h)], top);
}

export function diamond(ctx: Ctx, x: number, y: number, fill: string, stroke?: string, scale = 1) {
  const a = 0.5 * scale;
  poly(ctx, [P(x - a, y - a), P(x + a, y - a), P(x + a, y + a), P(x - a, y + a)], fill, stroke);
}

/** Linha entre dois pontos em coordenadas de tile (u,v relativos ao centro do tile). */
export function isoLine(ctx: Ctx, x: number, y: number, u1: number, v1: number, u2: number, v2: number, color: string, w = 1) {
  const [ax, ay] = P(x + u1, y + v1);
  const [bx, by] = P(x + u2, y + v2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/* ───────────────────────── Pisos ───────────────────────── */

function woodFloor(ctx: Ctx, x: number, y: number, base: string) {
  diamond(ctx, x, y, shade(base, Math.round((hash(x, y) - 0.5) * 10)));
  // tábuas paralelas ao eixo x, com emendas alternadas
  for (let i = 1; i < 4; i++) isoLine(ctx, x, y, -0.5, -0.5 + i * 0.25, 0.5, -0.5 + i * 0.25, shade(base, -28));
  const j = hash(x, y, 3) * 0.6 - 0.3;
  isoLine(ctx, x, y, j, -0.5, j, -0.25, shade(base, -28));
  isoLine(ctx, x, y, -j, 0, -j, 0.25, shade(base, -28));
  isoLine(ctx, x, y, -0.5, -0.49, 0.5, -0.49, shade(base, 18));
}

function stoneFloor(ctx: Ctx, x: number, y: number, base: string) {
  diamond(ctx, x, y, base);
  // 4 lajes com variação de tom
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const u = -0.5 + i * 0.5;
      const v = -0.5 + j * 0.5;
      const t = shade(base, Math.round((hash(x * 2 + i, y * 2 + j, 7) - 0.5) * 22));
      poly(ctx, [P(x + u + 0.03, y + v + 0.03), P(x + u + 0.47, y + v + 0.03), P(x + u + 0.47, y + v + 0.47), P(x + u + 0.03, y + v + 0.47)], t);
    }
}

function cobble(ctx: Ctx, x: number, y: number) {
  diamond(ctx, x, y, "#3a3f52");
  for (let k = 0; k < 6; k++) {
    const u = hash(x, y, k) - 0.5;
    const v = hash(y, x, k + 9) - 0.5;
    const [sx, sy] = P(x + u * 0.8, y + v * 0.8);
    ctx.fillStyle = shade("#646a80", Math.round((hash(x, y, k + 20) - 0.5) * 30));
    ctx.beginPath();
    ctx.ellipse(sx, sy, 6 + hash(x, y, k + 30) * 3, 3 + hash(x, y, k + 40) * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function grass(ctx: Ctx, x: number, y: number, lush: boolean) {
  const base = lush ? "#3b7d3a" : "#2f6834";
  // variação suave em manchas (ruído de baixa frequência) + leve xadrez
  const patch = Math.round((hash(Math.floor(x / 3), Math.floor(y / 3), 11) - 0.5) * 16 + (hash(x, y) - 0.5) * 8 + ((x + y) % 2 ? 2 : -2));
  diamond(ctx, x, y, shade(base, patch));
  const [sx, sy] = P(x, y);
  // sombra suave no canto de trás (dá volume ao gramado)
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(sx - 8, sy - 12, 16, 3);
  // tufos em V com luz e sombra
  for (let k = 0; k < 7; k++) {
    const ox = Math.round((hash(x, y, k) - 0.5) * 44);
    const oy = Math.round((hash(x, y, k + 5) - 0.5) * 18);
    ctx.fillStyle = shade(base, 30);
    ctx.fillRect(sx + ox, sy + oy - 3, 1, 3);
    ctx.fillRect(sx + ox + 2, sy + oy - 2, 1, 2);
    ctx.fillStyle = shade(base, -22);
    ctx.fillRect(sx + ox + 1, sy + oy - 1, 1, 2);
  }
  const r = hash(x, y, 99);
  if (r > (lush ? 0.5 : 0.78)) {
    // florzinha com miolo
    const cols = ["#F16D75", "#F1C66A", "#f3f4fa", "#E78FC0", "#A875F5", "#7FC8F8"];
    const fx = sx + Math.round((hash(x, y, 55) - 0.5) * 30);
    const fy = sy + Math.round((hash(x, y, 56) - 0.5) * 12);
    ctx.fillStyle = "#2a5a2a";
    ctx.fillRect(fx + 1, fy, 1, 3);
    ctx.fillStyle = cols[Math.floor(hash(x, y, 77) * cols.length)]!;
    ctx.fillRect(fx, fy - 2, 3, 2);
    ctx.fillRect(fx + 1, fy - 3, 1, 4);
    ctx.fillStyle = "#FFF1B8";
    ctx.fillRect(fx + 1, fy - 2, 1, 1);
  } else if (r < 0.06) {
    // pedrinha
    const px = sx + Math.round((hash(x, y, 57) - 0.5) * 28);
    const py = sy + Math.round((hash(x, y, 58) - 0.5) * 10);
    ctx.fillStyle = "#6e7180";
    ctx.fillRect(px, py - 2, 4, 2);
    ctx.fillStyle = "#9a9dab";
    ctx.fillRect(px, py - 2, 2, 1);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(px, py, 4, 1);
  } else if (r < 0.09 && !lush) {
    // cogumelo
    const px = sx + Math.round((hash(x, y, 59) - 0.5) * 26);
    const py = sy + Math.round((hash(x, y, 60) - 0.5) * 10);
    ctx.fillStyle = "#EFE9DA";
    ctx.fillRect(px + 1, py - 2, 1, 2);
    ctx.fillStyle = "#C8423B";
    ctx.fillRect(px, py - 4, 3, 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(px + 1, py - 4, 1, 1);
  } else if (r < 0.16) {
    // trevos
    const px = sx + Math.round((hash(x, y, 61) - 0.5) * 30);
    const py = sy + Math.round((hash(x, y, 62) - 0.5) * 10);
    ctx.fillStyle = shade(base, 40);
    ctx.fillRect(px, py - 1, 2, 1);
    ctx.fillRect(px + 3, py, 2, 1);
    ctx.fillRect(px + 1, py + 1, 2, 1);
  }
}

/** Rua de terra batida da vila: tom quente, pedrinhas e marcas de roda. */
function dirt(ctx: Ctx, x: number, y: number) {
  const base = "#8a6a45";
  diamond(ctx, x, y, shade(base, Math.round((hash(x, y, 4) - 0.5) * 12)));
  const [sx, sy] = P(x, y);
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k % 2 ? "#a3845c" : "#6e5236";
    ctx.fillRect(sx + (hash(x, y, k + 60) - 0.5) * 36, sy + (hash(x, y, k + 70) - 0.5) * 14, 2 + (k % 2), 1 + (k % 2));
  }
  ctx.fillStyle = "rgba(60,40,20,0.22)";
  ctx.fillRect(sx - 10, sy - 1, 8, 1);
  ctx.fillRect(sx + 4, sy + 3, 9, 1);
}

/** Terra arada com fileiras de trigo (só cenário). */
function field(ctx: Ctx, x: number, y: number) {
  diamond(ctx, x, y, "#5a3d24");
  for (let i = 0; i < 4; i++) {
    const v = -0.375 + i * 0.25;
    isoLine(ctx, x, y, -0.48, v, 0.48, v, "#3e2a18", 2);
    for (let j = 0; j < 5; j++) {
      const u = -0.4 + j * 0.2;
      const [px, py] = P(x + u, y + v - 0.06);
      const h = 7 + Math.round(hash(x * 5 + j, y * 5 + i) * 4);
      ctx.fillStyle = "#b8962e";
      ctx.fillRect(px, py - h, 1, h);
      ctx.fillStyle = "#e3c36a";
      ctx.fillRect(px - 1, py - h - 2, 3, 3);
    }
  }
}

/** Piso do tile (já com a altura aplicada pelo chamador). */
export function drawTile(ctx: Ctx, x: number, y: number, kind: TileKind, room: RoomDef | null) {
  if ((kind === "floor" || kind === "wall") && room) {
    if (room.key === "academia" || room.key === "escritorio") stoneFloor(ctx, x, y, room.floor[(x + y) % 2]!);
    else woodFloor(ctx, x, y, room.floor[0]!);
    return;
  }
  if (kind === "plaza") return stoneFloor(ctx, x, y, (x + y) % 2 ? "#8b8579" : "#7f796d");
  if (kind === "path") return cobble(ctx, x, y);
  if (kind === "dirt") return dirt(ctx, x, y);
  if (kind === "field") return field(ctx, x, y);
  if (kind === "building") return diamond(ctx, x, y, "#3e3428");
  if (kind === "water" || kind === "dock") return diamond(ctx, x, y, "#2a5f99");
  grass(ctx, x, y, room?.key === "jardim");
}

/** Lado de pedra de uma plataforma (face SW ou SE) descendo `h` pixels. */
export function platformSide(ctx: Ctx, x: number, y: number, side: "sw" | "se", h: number, color: string) {
  const a = side === "sw" ? P(x - 0.5, y + 0.5) : P(x + 0.5, y - 0.5);
  const b = P(x + 0.5, y + 0.5);
  poly(ctx, [a, b, [b[0], b[1] + h], [a[0], a[1] + h]], side === "sw" ? shade(color, -20) : shade(color, -45));
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let k = 1; k < 3; k++) {
    const t = k / 3;
    ctx.fillRect(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1, h);
  }
  ctx.fillStyle = shade(color, 25);
  ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), 1);
}

/** Degrau de pedra na frente de uma plataforma. */
export function step(ctx: Ctx, x: number, y: number, dir: "x" | "y", h: number) {
  if (dir === "y") box(ctx, x, y - 0.32, 0.5, 0.18, h, "#8a8478", 0, "#6d685e", "#58544b");
  else box(ctx, x - 0.32, y, 0.18, 0.5, h, "#8a8478", 0, "#6d685e", "#58544b");
}

/** Profundidade do penhasco num vértice da borda (igual para os dois tiles vizinhos). */
function cliffDepth(vx: number, vy: number, along: number): number {
  // Mais fundo perto da quina da frente: a base da ilha vira um "cone" de rocha.
  return 56 + Math.pow(along, 1.6) * 210 + hash(Math.round(vx), Math.round(vy), 5) * 22;
}

/**
 * Borda da ilha flutuante: camada de terra com raízes, estratos de rocha e a
 * base em ponta irregular, com trepadeiras e raízes penduradas.
 */
export function cliff(ctx: Ctx, x: number, y: number, side: "sw" | "se") {
  const a = side === "sw" ? P(x - 0.5, y + 0.5) : P(x + 0.5, y - 0.5);
  const b = P(x + 0.5, y + 0.5);
  // posição ao longo da borda (0 = ponta de trás, 1 = quina da frente)
  const n = 42;
  const ta = side === "sw" ? x / n : y / n;
  const tb = side === "sw" ? (x + 1) / n : (y + 1) / n;
  const ha = cliffDepth(a[0], a[1], ta);
  const hb = cliffDepth(b[0], b[1], tb);
  const mx = (a[0] + b[0]) / 2 + (hash(x, y, 8) - 0.5) * 10;
  const my = (a[1] + b[1]) / 2;
  // estalactite só em alguns trechos (o resto acompanha a curva da base)
  const spike = hash(x, y, 9) > 0.62 ? 18 + hash(x, y, 10) * 40 : 2;
  const tip = (ha + hb) / 2 + spike;
  const dark = side === "se";
  const g = ctx.createLinearGradient(0, Math.min(a[1], b[1]), 0, my + tip);
  g.addColorStop(0, dark ? "#4a3626" : "#5e4530");
  g.addColorStop(0.14, dark ? "#3e3a44" : "#4f4b58");
  g.addColorStop(0.55, dark ? "#2f3142" : "#3d4052");
  g.addColorStop(1, dark ? "#1a1d2c" : "#23263a");
  poly(ctx, [a, b, [b[0], b[1] + hb], [mx, my + tip], [a[0], a[1] + ha]], g);
  // estratos: faixas paralelas à borda
  for (let k = 1; k <= 4; k++) {
    const off = 10 + k * 13 + hash(x, y, k + 30) * 4;
    ctx.strokeStyle = k % 2 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = k % 2 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1] + off);
    ctx.lineTo(b[0], b[1] + off);
    ctx.stroke();
  }
  // pedras salientes com brilho no topo
  for (let k = 0; k < 3; k++) {
    const t = 0.15 + hash(x, y, k + 40) * 0.7;
    const sx = a[0] + (b[0] - a[0]) * t;
    const sy = a[1] + (b[1] - a[1]) * t + 18 + hash(y, x, k + 41) * 34;
    const w = 5 + hash(x, y, k + 42) * 6;
    ctx.fillStyle = dark ? "#43465a" : "#55596e";
    ctx.fillRect(sx, sy, w, 4);
    ctx.fillStyle = dark ? "#5a5e74" : "#6e7390";
    ctx.fillRect(sx, sy, w, 1);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(sx, sy + 4, w, 1);
  }
  // terra do topo + grama que transborda da borda
  ctx.fillStyle = "#3b7d3a";
  ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 1, Math.abs(b[0] - a[0]), 3);
  for (let k = 0; k < 6; k++) {
    const t = hash(x, y, k + 50);
    const sx = a[0] + (b[0] - a[0]) * t;
    const sy = a[1] + (b[1] - a[1]) * t;
    ctx.fillStyle = k % 2 ? "#2d6232" : "#4a9147";
    ctx.fillRect(sx, sy + 1, 2, 2 + hash(x, y, k + 51) * 4);
  }
  // raízes e trepadeiras penduradas
  if (hash(x, y, 60) > 0.45) {
    const t = 0.2 + hash(x, y, 61) * 0.6;
    const sx = Math.round(a[0] + (b[0] - a[0]) * t);
    const sy = a[1] + (b[1] - a[1]) * t;
    const len = 18 + hash(x, y, 62) * 46;
    const vine = hash(x, y, 63) > 0.4;
    for (let i = 0; i < len; i += 2) {
      const wob = Math.round(Math.sin(i / 7 + x) * 1.5);
      ctx.fillStyle = vine ? (i % 6 < 2 ? "#4a9147" : "#2f6a32") : "#5a3d24";
      ctx.fillRect(sx + wob, sy + 2 + i, vine ? 2 : 1, 2);
      if (vine && i % 8 === 4) {
        ctx.fillStyle = "#5fae58";
        ctx.fillRect(sx + wob + (i % 16 === 4 ? 2 : -3), sy + 2 + i, 3, 2);
      }
    }
    if (vine && hash(x, y, 64) > 0.6) {
      ctx.fillStyle = hash(x, y, 65) > 0.5 ? "#E78FC0" : "#F1C66A";
      ctx.fillRect(sx - 1, sy + 2 + len * 0.6, 3, 3);
    }
  }
}

/** Rochas flutuantes ao redor da ilha (cenário estático). */
export function floatingRock(ctx: Ctx, sx: number, sy: number, r: number, seed: number) {
  const top = "#3f7d3c";
  poly(ctx, [[sx - r, sy], [sx, sy - r * 0.45], [sx + r, sy], [sx, sy + r * 0.45]], top);
  const g = ctx.createLinearGradient(0, sy, 0, sy + r * 1.8);
  g.addColorStop(0, "#4f4b58");
  g.addColorStop(1, "#1f2234");
  poly(ctx, [[sx - r, sy], [sx, sy + r * 0.45], [sx + r, sy], [sx + r * 0.35, sy + r * 1.1], [sx + (hash(seed, 1) - 0.5) * r * 0.4, sy + r * 1.9], [sx - r * 0.4, sy + r * 1.0]], g);
  ctx.fillStyle = "#4a9147";
  ctx.fillRect(sx - r * 0.5, sy - 2, 3, 2);
  ctx.fillRect(sx + r * 0.3, sy - 1, 2, 2);
  if (hash(seed, 2) > 0.5) {
    ctx.fillStyle = "#2f6a32";
    for (let i = 0; i < r * 0.8; i += 2) ctx.fillRect(sx + r * 0.2, sy + r * 0.4 + i, 1, 2);
  }
}

/* ───────────────────────── Paredes ───────────────────────── */

export function drawWall(ctx: Ctx, x: number, y: number, room: RoomDef) {
  const corner = x === room.x0 && y === room.y0;
  const a = corner ? 0.5 : x === room.x0 ? 0.16 : 0.5;
  const b = corner ? 0.5 : y === room.y0 ? 0.16 : 0.5;
  const ox = !corner && x === room.x0 ? -0.34 : 0;
  const oy = !corner && y === room.y0 ? -0.34 : 0;
  const stone = room.wall;
  box(ctx, x + ox, y + oy, a, b, WALL_H, shade(stone, 30), 0, shade(stone, 6), shade(stone, -22));
  // tijolos nas faces visíveis
  const faceSW = [P(x + ox - a, y + oy + b), P(x + ox + a, y + oy + b)] as const;
  const faceSE = [P(x + ox + a, y + oy - b), P(x + ox + a, y + oy + b)] as const;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  for (const [p, q] of [faceSW, faceSE]) {
    for (let row = 1; row < 7; row++) {
      const yy = row * 8;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - yy);
      ctx.lineTo(q[0], q[1] - yy);
      ctx.stroke();
      for (const off of row % 2 ? [0.25, 0.75] : [0.5]) {
        const bx = p[0] + (q[0] - p[0]) * off;
        const by = p[1] + (q[1] - p[1]) * off - yy;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, by + 8);
        ctx.stroke();
      }
    }
  }
  // viga de madeira e friso dourado no topo
  box(ctx, x + ox, y + oy, a + 0.02, b + 0.02, 5, "#5a3a22", WALL_H, "#4a2f1b", "#3a2414");
  box(ctx, x + ox, y + oy, a + 0.02, b + 0.02, 2, "#A77C34", WALL_H + 5, "#8a6428", "#6e4f1f");
  // ameias no canto
  if (corner) box(ctx, x, y, 0.22, 0.22, 10, shade(stone, 30), WALL_H + 7);
}

/** Decoração na face visível da parede. `t` anima chamas e telas. */
export function drawWallDecor(ctx: Ctx, d: WallDecor, room: RoomDef, t: number, night: boolean) {
  const onRow = d.y === room.y0; // parede do fundo-direita → face SW
  const [cx, cy] = onRow ? P(d.x, d.y - 0.34 + 0.16) : P(d.x - 0.34 + 0.16, d.y);
  // inclinação da face: SW sobe para a esquerda; SE sobe para a direita
  const slope = onRow ? 0.5 : -0.5;
  const quad = (w: number, h: number, yb: number, fill: string | CanvasGradient, stroke?: string) => {
    const hw = w / 2;
    poly(ctx, [[cx - hw, cy - yb + hw * slope], [cx + hw, cy - yb - hw * slope], [cx + hw, cy - yb - h - hw * slope], [cx - hw, cy - yb - h + hw * slope]], fill, stroke);
  };
  switch (d.kind) {
    case "stained": {
      const g = ctx.createLinearGradient(cx, cy - 50, cx, cy - 12);
      g.addColorStop(0, "#c39bff");
      g.addColorStop(0.5, "#5aa9ff");
      g.addColorStop(1, "#ff8ab3");
      quad(22, 34, 14, "#3a2a14");
      quad(18, 30, 16, g);
      ctx.fillStyle = "rgba(20,10,30,0.6)";
      ctx.fillRect(cx - 0.5, cy - 46, 1, 30);
      ctx.fillRect(cx - 9, cy - 32, 18, 1);
      break;
    }
    case "window": {
      quad(18, 22, 18, "#3a2a14");
      quad(14, 18, 20, night ? "#f6d27a" : "#7fb6e6");
      ctx.fillStyle = "#3a2a14";
      ctx.fillRect(cx - 0.5, cy - 38, 1, 18);
      break;
    }
    case "screen": {
      quad(26, 18, 22, "#0d1424", "#59A9F8");
      for (let i = 0; i < 4; i++) {
        const h = 3 + ((Math.floor(t / 600) + i * 3) % 7) * 1.5;
        ctx.fillStyle = i % 2 ? "#59A9F8" : "#4FD49A";
        ctx.fillRect(cx - 9 + i * 5, cy - 26 - h, 3, h);
      }
      break;
    }
    case "banner": {
      const col = d.color ?? "#6b3fa0";
      quad(14, 30, 12, col);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(cx - 7, cy - 43 - (onRow ? -3 : 3), 14, 2);
      ctx.fillRect(cx - 2, cy - 30, 4, 5);
      break;
    }
    case "crest": {
      quad(16, 18, 20, "#2a3350", "#F1C66A");
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(cx - 2, cy - 34, 4, 8);
      ctx.fillRect(cx - 5, cy - 31, 10, 2);
      break;
    }
    case "shields": {
      for (const [dx, col] of [[-6, "#9e2b2b"], [6, "#2a5aa0"]] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx + dx, cy - 30 - dx * slope, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#F1C66A";
        ctx.fillRect(cx + dx - 1, cy - 31 - dx * slope, 2, 2);
      }
      ctx.strokeStyle = "#c9ced8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 42);
      ctx.lineTo(cx + 10, cy - 20);
      ctx.moveTo(cx + 10, cy - 42);
      ctx.lineTo(cx - 10, cy - 20);
      ctx.stroke();
      break;
    }
    case "painting": {
      quad(20, 14, 26, "#A77C34");
      quad(16, 10, 28, "#3f7fc0");
      ctx.fillStyle = "#3b7d3a";
      ctx.fillRect(cx - 7, cy - 32, 14, 3);
      break;
    }
    case "fireplace": {
      quad(26, 30, 0, "#5b5560");
      quad(16, 14, 2, "#1a1014");
      const fl = Math.sin(t / 120) * 2;
      ctx.fillStyle = "#ff8a2a";
      ctx.fillRect(cx - 5, cy - 12 + fl, 10, 9 - fl);
      ctx.fillStyle = "#ffd36a";
      ctx.fillRect(cx - 2, cy - 9 + fl, 4, 6 - fl);
      quad(30, 3, 30, "#7a5230");
      break;
    }
    case "torch": {
      ctx.fillStyle = "#4a2f1b";
      ctx.fillRect(cx - 1, cy - 34, 3, 12);
      const fl = Math.sin(t / 90 + d.x * 3) * 1.5;
      ctx.fillStyle = "#ff8a2a";
      ctx.fillRect(cx - 3, cy - 42 + fl, 7, 8 - fl);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(cx - 1, cy - 39 + fl, 3, 4);
      break;
    }
  }
}

/** Ponto (em mundo) da chama de uma tocha/lareira, para a luz. */
export function wallDecorLight(d: WallDecor, room: RoomDef): { x: number; y: number } {
  const onRow = d.y === room.y0;
  const [cx, cy] = onRow ? P(d.x, d.y - 0.18) : P(d.x - 0.18, d.y);
  return { x: cx, y: cy - (d.kind === "fireplace" ? 10 : 38) };
}

/* ───────────────────────── Itens rasteiros ───────────────────────── */

export function drawFlat(ctx: Ctx, it: Furniture) {
  if (it.kind === "rug") {
    const c = it.color ?? "#6a2f5a";
    diamond(ctx, it.x, it.y, shade(c, -20), undefined, 0.94);
    diamond(ctx, it.x, it.y, c, "#F1C66A", 0.82);
    diamond(ctx, it.x, it.y, shade(c, 25), undefined, 0.4);
  } else if (it.kind === "flowerbed") {
    diamond(ctx, it.x, it.y, "#7a6a58", undefined, 0.92);
    diamond(ctx, it.x, it.y, "#4a3220", undefined, 0.78);
    const cols = ["#F16D75", "#F1C66A", "#E78FC0", "#A875F5", "#f3f4fa", "#59A9F8"];
    const [sx, sy] = P(it.x, it.y);
    for (let i = 0; i < 14; i++) {
      const ox = (hash(it.x, it.y, i + 3) - 0.5) * 34;
      const oy = (hash(it.y, it.x, i + 3) - 0.5) * 12;
      ctx.fillStyle = "#2f7a33";
      ctx.fillRect(sx + ox, sy + oy - 3, 1, 4);
      ctx.fillStyle = cols[i % cols.length]!;
      ctx.fillRect(sx + ox - 1, sy + oy - 6, 3, 3);
    }
  } else if (it.kind === "mat") {
    diamond(ctx, it.x, it.y, "#2d4f8a", "#59A9F8", 0.8);
  } else if (it.kind === "flowers") {
    const [sx, sy] = P(it.x, it.y);
    const cols = ["#F16D75", "#F1C66A", "#E78FC0", "#A875F5", "#f3f4fa"];
    for (let i = 0; i < 10; i++) {
      const ox = (hash(it.x, it.y, i) - 0.5) * 40;
      const oy = (hash(it.y, it.x, i) - 0.5) * 16;
      ctx.fillStyle = "#2f7a33";
      ctx.fillRect(sx + ox, sy + oy - 3, 1, 4);
      ctx.fillStyle = cols[i % cols.length]!;
      ctx.fillRect(sx + ox - 1, sy + oy - 6, 3, 3);
    }
  }
}

/* ───────────────────────── Móveis e cenário ───────────────────────── */

export function flame(ctx: Ctx, sx: number, sy: number, t: number, seed: number, s = 1) {
  const fl = Math.sin(t / 100 + seed) * 1.2;
  ctx.fillStyle = "#ff8a2a";
  ctx.fillRect(sx - 2 * s, sy - 6 * s + fl, 4 * s, 6 * s - fl);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(sx - 1 * s, sy - 4 * s + fl, 2 * s, 3 * s);
}

/**
 * Copa em três tons (sombra embaixo/direita, base, luz em cima/esquerda),
 * formada por vários "cachos" e salpicada de folhas soltas — leitura de
 * pixel art mesmo sendo desenhada com círculos.
 */
export function treeCrown(ctx: Ctx, sx: number, sy: number, r: number, c1: string, c2: string, seed: number) {
  const dark = shade(c1, -34);
  const blobs: Array<[number, number, number]> = [[0, 0, r]];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + hash(seed, i) * 0.6;
    blobs.push([Math.cos(ang) * r * 0.62, Math.sin(ang) * r * 0.42, r * (0.5 + hash(i, seed) * 0.18)]);
  }
  const fill = (dx: number, dy: number, scale: number, col: string) => {
    ctx.fillStyle = col;
    for (const [bx, by, br] of blobs) {
      ctx.beginPath();
      ctx.arc(sx + bx + dx, sy + by + dy, br * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  fill(2, 4, 1, shade(dark, -14));
  fill(0, 0, 1, dark);
  fill(-2, -2, 0.82, c1);
  // luz nos cachos de cima
  ctx.fillStyle = c2;
  for (const [bx, by, br] of blobs) {
    if (by > r * 0.1) continue;
    ctx.beginPath();
    ctx.arc(sx + bx - br * 0.25, sy + by - br * 0.3, br * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  // folhas soltas (pixels)
  for (let i = 0; i < 14; i++) {
    const px = sx + (hash(seed, i + 20) - 0.5) * r * 1.8;
    const py = sy + (hash(i + 20, seed) - 0.5) * r * 1.2;
    ctx.fillStyle = i % 3 === 0 ? shade(c2, 25) : i % 3 === 1 ? dark : c2;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
  }
}

/** Tronco afunilado com casca e raízes aparentes. */
function trunk(ctx: Ctx, sx: number, sy: number, h: number, w: number) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx + 4, sy, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a2f1b";
  ctx.fillRect(sx - w / 2 - 3, sy - 3, w + 6, 3);
  ctx.fillRect(sx - w / 2 - 5, sy - 1, 3, 2);
  ctx.fillRect(sx + w / 2 + 2, sy - 1, 3, 2);
  ctx.fillStyle = "#6b4528";
  ctx.fillRect(sx - w / 2, sy - h, w, h);
  ctx.fillStyle = "#8a5d3b";
  ctx.fillRect(sx - w / 2, sy - h, 2, h);
  ctx.fillStyle = "#3e2716";
  ctx.fillRect(sx + w / 2 - 2, sy - h, 2, h);
  for (let i = 8; i < h - 4; i += 9) ctx.fillRect(sx - 1, sy - i, 2, 3);
}

export function drawFurniture(ctx: Ctx, it: Furniture, t: number) {
  const { x, y } = it;
  const [sx, sy] = P(x, y);
  switch (it.kind) {
    case "shelf": {
      box(ctx, x, y - 0.12, 0.46, 0.26, 70, "#6e4a2e", 0, "#5a3a22", "#45291a");
      const cols = ["#A875F5", "#59A9F8", "#F16D75", "#4FD49A", "#F1C66A", "#E78FC0"];
      // prateleiras e livros na face SW (frente)
      const [lx, ly] = P(x - 0.46, y + 0.14);
      const [rx, ry] = P(x + 0.46, y + 0.14);
      for (let row = 0; row < 4; row++) {
        const base = -6 - row * 16;
        ctx.fillStyle = "#3a2414";
        ctx.beginPath();
        ctx.moveTo(lx, ly + base);
        ctx.lineTo(rx, ry + base);
        ctx.lineTo(rx, ry + base + 2);
        ctx.lineTo(lx, ly + base + 2);
        ctx.fill();
        for (let i = 0; i < 8; i++) {
          if (hash(x, row, i) < 0.12) continue;
          const tt = (i + 0.5) / 8;
          const bx = lx + (rx - lx) * tt;
          const by = ly + (ry - ly) * tt + base;
          const h = 9 + Math.floor(hash(x, i, row) * 4);
          ctx.fillStyle = cols[Math.floor(hash(i, row, x) * cols.length)]!;
          ctx.fillRect(bx - 1.5, by - h, 3, h);
        }
      }
      break;
    }
    case "desk":
      box(ctx, x, y, 0.44, 0.3, 4, "#9a6a40", 18, "#7a5230", "#5e3e24");
      box(ctx, x - 0.36, y + 0.22, 0.04, 0.04, 18, "#5e3e24");
      box(ctx, x + 0.36, y + 0.22, 0.04, 0.04, 18, "#5e3e24");
      box(ctx, x + 0.36, y - 0.22, 0.04, 0.04, 18, "#5e3e24");
      // livro aberto e vela
      box(ctx, x - 0.08, y + 0.02, 0.16, 0.1, 2, "#f3e7c9", 22);
      ctx.fillStyle = "#7a3b2e";
      ctx.fillRect(sx - 2, sy - 26, 2, 3);
      box(ctx, x + 0.26, y - 0.1, 0.03, 0.03, 8, "#f3f4fa", 22);
      flame(ctx, ...P(x + 0.26, y - 0.1), t, x, 0.8);
      break;
    case "pcdesk": {
      box(ctx, x, y, 0.44, 0.3, 4, "#4a3a30", 18, "#3a2c24", "#2a1f19");
      box(ctx, x - 0.36, y + 0.22, 0.04, 0.04, 18, "#2a1f19");
      box(ctx, x + 0.36, y + 0.22, 0.04, 0.04, 18, "#2a1f19");
      box(ctx, x, y - 0.14, 0.3, 0.04, 22, "#141a2c", 22);
      const glow = 0.55 + Math.sin(t / 900 + x) * 0.15;
      const [mx, my] = P(x - 0.3, y - 0.1);
      const [nx, ny] = P(x + 0.3, y - 0.1);
      ctx.fillStyle = `rgba(89,169,248,${glow})`;
      ctx.beginPath();
      ctx.moveTo(mx, my - 26);
      ctx.lineTo(nx, ny - 26);
      ctx.lineTo(nx, ny - 42);
      ctx.lineTo(mx, my - 42);
      ctx.fill();
      ctx.fillStyle = "rgba(79,212,154,0.9)";
      for (let i = 0; i < 4; i++) ctx.fillRect(mx + 4 + i * 6, my - 32 - i * 3 - ((Math.floor(t / 500) + i) % 3) * 2, 3, 2);
      box(ctx, x + 0.04, y + 0.12, 0.18, 0.06, 2, "#2a3046", 22);
      break;
    }
    case "chair":
      box(ctx, x, y, 0.2, 0.2, 3, it.color ?? "#6b3fa0", 12);
      box(ctx, x + 0.15, y + 0.15, 0.03, 0.03, 12, "#3a2414");
      break;
    case "lamp":
      box(ctx, x, y, 0.07, 0.07, 44, "#3b3b46");
      box(ctx, x, y, 0.2, 0.2, 10, "#F1C66A", 44, "#d9a648", "#b5862f");
      break;
    case "candelabra":
      box(ctx, x, y, 0.06, 0.06, 30, "#A77C34");
      box(ctx, x, y, 0.26, 0.05, 3, "#A77C34", 30);
      for (const u of [-0.22, 0, 0.22]) {
        box(ctx, x + u, y, 0.03, 0.03, 8, "#f3f4fa", 33);
        flame(ctx, ...P(x + u, y), t, u * 10, 0.8);
      }
      break;
    case "armchair":
      box(ctx, x, y, 0.36, 0.36, 16, "#6b3fa0");
      box(ctx, x, y - 0.3, 0.36, 0.08, 32, "#5a3389");
      box(ctx, x - 0.3, y, 0.07, 0.36, 22, "#5a3389");
      break;
    case "globe": {
      box(ctx, x, y, 0.16, 0.16, 6, "#5a3a22");
      box(ctx, x, y, 0.03, 0.03, 18, "#A77C34", 6);
      const g = ctx.createRadialGradient(sx - 4, sy - 34, 2, sx, sy - 30, 12);
      g.addColorStop(0, "#9fdcff");
      g.addColorStop(1, "#2a5fa0");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy - 30, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4FD49A";
      const r = (t / 1500) % 1;
      ctx.fillRect(sx - 8 + r * 10, sy - 34, 5, 4);
      ctx.fillRect(sx - 2 + r * 6, sy - 27, 4, 3);
      ctx.strokeStyle = "#A77C34";
      ctx.beginPath();
      ctx.arc(sx, sy - 30, 13, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
      break;
    }
    case "bookpile":
      ["#A875F5", "#59A9F8", "#F16D75", "#F1C66A"].forEach((c, i) => box(ctx, x + (i % 2) * 0.04, y, 0.18 - i * 0.02, 0.12, 5, c, i * 5));
      break;
    case "board":
      box(ctx, x, y - 0.3, 0.46, 0.06, 46, "#7a5230", 6);
      for (let i = 0; i < 6; i++) {
        const [px, py] = P(x - 0.36 + (i % 3) * 0.3, y - 0.24);
        ctx.fillStyle = ["#f3e7c9", "#e8d3a8", "#f3e7c9"][i % 3]!;
        ctx.fillRect(px - 4, py - 46 + Math.floor(i / 3) * 16, 9, 11);
        ctx.fillStyle = "#9e2b2b";
        ctx.fillRect(px, py - 46 + Math.floor(i / 3) * 16, 2, 2);
      }
      break;
    case "banner":
    case "bannerpole": {
      box(ctx, x, y, 0.05, 0.05, 72, "#3b3b46");
      box(ctx, x, y, 0.08, 0.08, 4, "#F1C66A", 72);
      const sway = Math.sin(t / 800 + x) * 2;
      ctx.fillStyle = it.color ?? "#9e2b2b";
      ctx.beginPath();
      ctx.moveTo(sx + 2, sy - 68);
      ctx.lineTo(sx + 22 + sway, sy - 64);
      ctx.lineTo(sx + 22 + sway, sy - 36);
      ctx.lineTo(sx + 12 + sway, sy - 42);
      ctx.lineTo(sx + 2, sy - 38);
      ctx.fill();
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(sx + 9 + sway / 2, sy - 58, 6, 6);
      break;
    }
    case "table":
      box(ctx, x, y, 0.45, 0.45, 4, "#8a5d3b", 18, "#6e4a2e", "#5a3a22");
      box(ctx, x, y, 0.08, 0.08, 18, "#5a3a22");
      if (it.room === "guilda") {
        box(ctx, x, y, 0.3, 0.22, 1, "#e8d3a8", 22);
        ctx.fillStyle = "#9e2b2b";
        ctx.fillRect(sx - 6, sy - 26, 3, 3);
        ctx.fillRect(sx + 4, sy - 24, 3, 3);
      } else if (it.room === "escritorio") {
        box(ctx, x - 0.15, y, 0.1, 0.08, 6, "#59A9F8", 22);
      }
      break;
    case "chest":
      box(ctx, x, y, 0.32, 0.24, 18, "#7a4a28");
      box(ctx, x, y, 0.33, 0.25, 6, "#6a3a1c", 18);
      box(ctx, x, y, 0.34, 0.26, 2, "#F1C66A", 12);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(sx - 2, sy - 18, 4, 5);
      break;
    case "barrel": {
      box(ctx, x, y, 0.2, 0.2, 26, "#8a5530", 0, "#6a3e20", "#52301a");
      box(ctx, x, y, 0.16, 0.16, 1, "#5a3a22", 26);
      for (const hz of [6, 19]) {
        const [a1, b1] = P(x - 0.2, y + 0.2);
        const [a2, b2] = P(x + 0.2, y + 0.2);
        const [a3, b3] = P(x + 0.2, y - 0.2);
        ctx.strokeStyle = "#2a2a33";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a1, b1 - hz);
        ctx.lineTo(a2, b2 - hz);
        ctx.lineTo(a3, b3 - hz);
        ctx.stroke();
      }
      break;
    }
    case "weaponrack":
      box(ctx, x, y - 0.3, 0.44, 0.06, 6, "#5a3a22", 30);
      box(ctx, x, y - 0.3, 0.44, 0.06, 4, "#5a3a22", 8);
      for (let i = 0; i < 3; i++) {
        const [px, py] = P(x - 0.3 + i * 0.3, y - 0.26);
        ctx.fillStyle = "#c9ced8";
        ctx.fillRect(px - 1, py - 50, 2, 40);
        ctx.fillStyle = "#A77C34";
        ctx.fillRect(px - 4, py - 16, 8, 2);
      }
      break;
    case "treadmill":
      box(ctx, x, y, 0.22, 0.42, 8, "#26272e");
      box(ctx, x, y - 0.38, 0.22, 0.04, 34, "#555b66");
      break;
    case "dummy":
      box(ctx, x, y, 0.16, 0.16, 4, "#5a3a22");
      box(ctx, x, y, 0.04, 0.04, 40, "#7a5230", 4);
      box(ctx, x, y, 0.14, 0.1, 18, "#c9a46a", 18);
      ctx.fillStyle = "#c9a46a";
      ctx.beginPath();
      ctx.arc(sx, sy - 48, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9e2b2b";
      ctx.fillRect(sx - 2, sy - 34, 4, 4);
      break;
    case "target":
      box(ctx, x, y, 0.04, 0.04, 26, "#5a3a22");
      for (const [r, c] of [[12, "#f3f4fa"], [8, "#9e2b2b"], [4, "#F1C66A"]] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 34, r * 0.8, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "bench":
      box(ctx, x, y, 0.16, 0.42, 14, "#26272e");
      box(ctx, x, y, 0.45, 0.04, 2, "#9aa3b5", 30);
      box(ctx, x - 0.4, y, 0.04, 0.12, 10, "#111", 25);
      box(ctx, x + 0.4, y, 0.04, 0.12, 10, "#111", 25);
      break;
    case "dumbbells":
      box(ctx, x, y, 0.38, 0.18, 26, "#3b3e48");
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 3; i++) {
          const [px, py] = P(x - 0.25 + i * 0.25, y + 0.18);
          ctx.fillStyle = "#111";
          ctx.fillRect(px - 5, py - 12 - r * 12, 10, 4);
          ctx.fillStyle = "#555b66";
          ctx.fillRect(px - 2, py - 11 - r * 12, 4, 2);
        }
      break;
    case "bag":
      box(ctx, x, y, 0.04, 0.04, 72, "#666");
      box(ctx, x, y, 0.17, 0.17, 34, "#a52b2b", 18);
      box(ctx, x, y, 0.18, 0.18, 3, "#3b3b46", 46);
      break;
    case "bed":
      box(ctx, x, y, 0.46, 0.46, 12, "#6e4a2e");
      box(ctx, x, y + 0.06, 0.44, 0.38, 5, "#3a4f9a", 12);
      for (let i = 0; i < 3; i++) box(ctx, x, y + 0.1 + i * 0.1, 0.44, 0.01, 1, "#5a6fba", 17);
      if (x % 2 === 0) {
        box(ctx, x, y - 0.32, 0.32, 0.12, 5, "#f3f4fa", 14);
        box(ctx, x, y - 0.46, 0.46, 0.04, 30, "#5a3a22");
      }
      break;
    case "nightstand":
      box(ctx, x, y, 0.22, 0.22, 18, "#6e4a2e");
      box(ctx, x, y, 0.03, 0.03, 6, "#f3f4fa", 18);
      flame(ctx, sx, sy - 24, t, 4, 0.8);
      break;
    case "wardrobe":
      box(ctx, x, y - 0.1, 0.42, 0.3, 68, "#6e4a2e", 0, "#5a3a22", "#45291a");
      ctx.fillStyle = "#3a2414";
      ctx.fillRect(sx - 1, sy - 62, 1, 50);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(sx - 4, sy - 38, 2, 3);
      ctx.fillRect(sx + 2, sy - 38, 2, 3);
      break;
    case "sofa":
      box(ctx, x, y, 0.46, 0.32, 14, "#2f6a7a");
      box(ctx, x, y + 0.26, 0.46, 0.08, 30, "#265865");
      break;
    case "pot":
      box(ctx, x, y, 0.14, 0.14, 12, "#8a4a2a");
      treeCrown(ctx, sx, sy - 24, 11, "#3f9a4a", "#5ab865", x);
      break;
    case "bush":
      treeCrown(ctx, sx, sy - 10, 14, "#2f7a3a", "#4caf50", x * 7 + y);
      if (hash(x, y) > 0.5) {
        ctx.fillStyle = "#F16D75";
        ctx.fillRect(sx - 5, sy - 16, 3, 3);
        ctx.fillRect(sx + 4, sy - 10, 3, 3);
      }
      break;
    case "hedge":
      box(ctx, x, y, 0.42, 0.42, 12, "#2f6a35", 0, "#25562b", "#1d4522");
      for (let i = 0; i < 4; i++) treeCrown(ctx, ...((): [number, number] => { const [qx, qy] = P(x + (i % 2 ? 0.2 : -0.2), y + (i < 2 ? -0.2 : 0.2)); return [qx, qy - 16]; })(), 9, "#2f7a3a", "#4caf50", x + i);
      break;
    case "rock":
      box(ctx, x, y, 0.22, 0.18, 10, "#6b6f7e", 0, "#555968", "#454857");
      box(ctx, x + 0.1, y - 0.05, 0.12, 0.1, 6, "#7b7f8e", 10);
      break;
    case "tree": {
      trunk(ctx, sx, sy, 44, 8);
      const pink = hash(x, y, 5) > 0.55 && (it.room === "jardim" || it.room === null);
      const autumn = !pink && hash(x, y, 6) > 0.82;
      treeCrown(ctx, sx, sy - 62, 28, pink ? "#d877aa" : autumn ? "#c9792e" : "#3a8a3e", pink ? "#f8c4dc" : autumn ? "#efb45a" : "#6cc061", x * 13 + y);
      if (!pink && !autumn && hash(x, y, 7) > 0.6) {
        // frutinhas vermelhas
        ctx.fillStyle = "#d8443b";
        for (let i = 0; i < 4; i++) ctx.fillRect(sx + (hash(x, i, 8) - 0.5) * 40, sy - 62 + (hash(i, y, 8) - 0.4) * 26, 3, 3);
      }
      break;
    }
    case "pine": {
      trunk(ctx, sx, sy, 24, 6);
      // quatro camadas de galhos, cada uma com lado iluminado e lado na sombra
      for (let i = 0; i < 4; i++) {
        const top = sy - 104 + i * 17;
        const base = sy - 34 - (3 - i) * 4;
        const half = 14 + i * 4;
        ctx.fillStyle = "#1f4f34";
        ctx.beginPath();
        ctx.moveTo(sx, top);
        ctx.lineTo(sx + half + 2, base + 2);
        ctx.lineTo(sx - half, base + 2);
        ctx.fill();
        ctx.fillStyle = "#2f6e44";
        ctx.beginPath();
        ctx.moveTo(sx, top);
        ctx.lineTo(sx, base);
        ctx.lineTo(sx - half, base);
        ctx.fill();
        ctx.fillStyle = "#26593a";
        ctx.beginPath();
        ctx.moveTo(sx, top);
        ctx.lineTo(sx + half, base);
        ctx.lineTo(sx, base);
        ctx.fill();
        ctx.fillStyle = "#4a8f5a";
        ctx.fillRect(sx - half + 3, base - 2, 4, 2);
        ctx.fillRect(sx - 4, top + 6, 2, 3);
      }
      break;
    }
    case "parkbench":
      box(ctx, x, y, 0.42, 0.16, 3, "#8a5d3b", 9);
      box(ctx, x, y - 0.14, 0.42, 0.03, 12, "#7a5230", 12);
      box(ctx, x - 0.36, y, 0.03, 0.14, 9, "#3b3b46");
      box(ctx, x + 0.36, y, 0.03, 0.14, 9, "#3b3b46");
      break;
    case "crystal": {
      if (it.id !== "pra-crystal") break;
      const cx = x + 0.5;
      const cy = y + 0.5;
      // fonte em três níveis + pedestal ornamentado
      box(ctx, cx, cy, 1.0, 1.0, 8, "#9b958a", 0, "#7d776d", "#625d55");
      box(ctx, cx, cy, 0.86, 0.86, 3, "#3f7fc0", 8, "#2f6aa8", "#2a5f99");
      const [ox, oy] = P(cx, cy);
      ctx.strokeStyle = "rgba(180,220,255,0.55)";
      for (let i = 0; i < 2; i++) {
        const r = ((t / 1400 + i * 0.5) % 1) * 34;
        ctx.beginPath();
        ctx.ellipse(ox, oy - 11, r, r / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      box(ctx, cx, cy, 0.28, 0.28, 18, "#b5ad9f", 8, "#968e81", "#7a7368");
      box(ctx, cx, cy, 0.34, 0.34, 3, "#A77C34", 26, "#8a6428", "#6e4f1f");
      const bob = Math.sin(t / 600) * 5;
      const top = oy - 150 + bob;
      const g = ctx.createLinearGradient(ox, top, ox, top + 112);
      g.addColorStop(0, "#f1e6ff");
      g.addColorStop(0.5, "#b07cff");
      g.addColorStop(1, "#6a3fd0");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, top);
      ctx.lineTo(ox + 28, top + 56);
      ctx.lineTo(ox, top + 112);
      ctx.lineTo(ox - 28, top + 56);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.beginPath();
      ctx.moveTo(ox, top + 6);
      ctx.lineTo(ox - 20, top + 56);
      ctx.lineTo(ox, top + 56);
      ctx.fill();
      ctx.fillStyle = "rgba(60,20,120,0.35)";
      ctx.beginPath();
      ctx.moveTo(ox, top + 56);
      ctx.lineTo(ox + 28, top + 56);
      ctx.lineTo(ox, top + 112);
      ctx.fill();
      ctx.strokeStyle = "#f3eaff";
      ctx.stroke();
      // runas orbitando
      for (let i = 0; i < 4; i++) {
        const a = t / 1200 + (i * Math.PI) / 2;
        ctx.fillStyle = "#F1C66A";
        ctx.fillRect(ox + Math.cos(a) * 42 - 2, top + 56 + Math.sin(a) * 14 - 2, 4, 4);
      }
      break;
    }
    case "server": {
      box(ctx, x, y, 0.26, 0.26, 56, "#1a2032", 0, "#141a2a", "#0f1320");
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Math.floor(t / 400 + i + x) % 3 === 0 ? "#4FD49A" : "#59A9F8";
        ctx.fillRect(sx - 14, sy - 48 + i * 9, 3, 2);
        ctx.fillStyle = "#2a3350";
        ctx.fillRect(sx - 9, sy - 48 + i * 9, 6, 2);
      }
      break;
    }
    case "cables": {
      ctx.strokeStyle = "#141a2c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 20, sy - 2);
      ctx.bezierCurveTo(sx - 6, sy + 8, sx + 4, sy - 8, sx + 22, sy + 2);
      ctx.stroke();
      ctx.strokeStyle = "#2a5fa0";
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy + 3);
      ctx.bezierCurveTo(sx - 2, sy + 10, sx + 8, sy - 4, sx + 20, sy + 6);
      ctx.stroke();
      break;
    }
    case "lantern":
      box(ctx, x, y, 0.05, 0.05, 46, "#2a2a33");
      box(ctx, x, y, 0.13, 0.13, 13, "#F1C66A", 46, "#e0a84a", "#b5862f");
      box(ctx, x, y, 0.16, 0.16, 3, "#2a2a33", 59);
      break;
    case "lilypad":
      ctx.fillStyle = "#3f9a4a";
      ctx.beginPath();
      ctx.ellipse(sx - 6, sy + 2, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#E78FC0";
      ctx.fillRect(sx - 7, sy, 3, 2);
      break;
    default:
      break;
  }
}

/** Água animada com reflexos e peixes (só os tiles de água, por quadro). */
export function drawWater(ctx: Ctx, x: number, y: number, t: number, effects: number) {
  const w = effects > 0 ? Math.sin(t / 700 + x * 1.3 + y) * 8 : 0;
  diamond(ctx, x, y, shade("#2f6fa8", Math.round(w)), "rgba(150,200,255,0.25)");
  if (effects > 0) {
    const [sx, sy] = P(x, y);
    ctx.fillStyle = "rgba(220,240,255,0.5)";
    ctx.fillRect(sx - 12 + ((t / 50 + x * 20) % 24), sy - 2, 6, 1);
    if ((x + y) % 2 === 0) {
      const a = t / 1600 + x;
      ctx.fillStyle = "#ff9a3a";
      ctx.fillRect(sx + Math.cos(a) * 14, sy + Math.sin(a) * 6, 4, 2);
    }
  }
}

/** Planta de hábito: estágio pela sequência; flores quando concluído hoje. */
export function drawPlant(ctx: Ctx, x: number, y: number, stage: number, done: boolean, t: number) {
  const [sx, sy] = P(x, y);
  box(ctx, x, y, 0.2, 0.2, 9, "#7a4a28", 0, "#6a3e20", "#52301a");
  box(ctx, x, y, 0.16, 0.16, 1, "#3a2414", 9);
  const h = [6, 14, 22, 30, 44][stage] ?? 6;
  ctx.fillStyle = "#2f7a33";
  ctx.fillRect(sx - 1, sy - 9 - h, 3, h);
  const r = [4, 7, 10, 13, 18][stage] ?? 4;
  treeCrown(ctx, sx, sy - 10 - h, r, stage >= 3 ? "#3a9a45" : "#4caf50", "#6cc070", x * 3 + y);
  if (done) {
    const cols = ["#F16D75", "#F1C66A", "#E78FC0"];
    for (let i = 0; i < 3 + stage * 2; i++) {
      const ang = i * 2.1 + t / 2400;
      ctx.fillStyle = cols[i % 3]!;
      ctx.fillRect(sx + Math.cos(ang) * r * 0.8 - 2, sy - 10 - h + Math.sin(ang) * r * 0.7 - 2, 4, 4);
    }
  }
}

export function glow(ctx: Ctx, sx: number, sy: number, radius: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
  g.addColorStop(0, color.replace("ALPHA", String(alpha)));
  g.addColorStop(1, color.replace("ALPHA", "0"));
  ctx.fillStyle = g;
  ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
}

/** Céu noturno de fundo (espaço de tela): degradê, estrelas, lua e castelo distante. */
/** Fase do dia a partir da hora local real do usuário. */
export type DayPhase = "dawn" | "day" | "dusk" | "night";
export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "dusk";
  return "night";
}

const SKY: Record<DayPhase, [string, string, string]> = {
  dawn: ["#3b3f7a", "#c8789a", "#f3b27a"],
  day: ["#3f86d8", "#7fbcf0", "#cfe8f7"],
  dusk: ["#2a2f6a", "#b2557a", "#f19a5a"],
  night: ["#151c45", "#0c1330", "#070b1c"],
};

/** Nuvem em pixel art (blocos arredondados), clara de dia e azulada à noite. */
function cloud(ctx: Ctx, x: number, y: number, s: number, phase: DayPhase, seed: number, overcast = 0) {
  let top = phase === "night" ? "rgba(70,84,140,0.55)" : phase === "day" ? "rgba(255,255,255,0.92)" : "rgba(255,214,196,0.85)";
  let base = phase === "night" ? "rgba(40,50,96,0.55)" : phase === "day" ? "rgba(214,230,244,0.92)" : "rgba(214,150,150,0.8)";
  // Tempo fechado: nuvens cinzentas e carregadas.
  if (overcast > 0.5) {
    top = phase === "night" ? "rgba(52,58,84,0.85)" : "rgba(150,158,175,0.95)";
    base = phase === "night" ? "rgba(30,34,54,0.85)" : "rgba(105,112,130,0.95)";
  }
  const blobs = 4 + Math.floor(hash(seed, 3) * 3);
  ctx.fillStyle = base;
  ctx.fillRect(x - 8 * s, y, (blobs * 14 + 10) * s, 8 * s);
  for (let i = 0; i < blobs; i++) {
    const bw = (16 + hash(seed, i) * 14) * s;
    const bh = (8 + hash(seed, i + 9) * 10) * s;
    const bx = x + i * 14 * s;
    ctx.fillStyle = top;
    ctx.fillRect(bx, y - bh + 4 * s, bw, bh);
    ctx.fillRect(bx + 3 * s, y - bh + 1 * s, bw - 6 * s, 3 * s);
  }
}

/**
 * Céu em camadas conforme a hora real: gradiente da fase, sol ou lua,
 * estrelas só à noite, nuvens à deriva e o castelo distante.
 */
export function drawSky(ctx: Ctx, w: number, h: number, t: number, effects: number, hour = 21, overcast = 0) {
  const phase = dayPhase(hour);
  // Céu encoberto: o gradiente da fase puxa para cinza-azulado.
  const grey = phase === "night" ? "#151824" : "#6d7688";
  const [c0, c1, c2] = SKY[phase].map((c) => mixHex(c, grey, overcast * 0.85)) as [string, string, string];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c0);
  g.addColorStop(0.55, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if ((phase === "night" || phase === "dawn") && overcast < 0.9) {
    const a = (phase === "night" ? 1 : 0.35) * (1 - overcast);
    for (let i = 0; i < 110; i++) {
      const sx = hash(i, 1) * w;
      const sy = hash(i, 2) * h * 0.6;
      const tw = effects > 0 ? 0.5 + Math.sin(t / 700 + i) * 0.5 : 0.7;
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + tw * 0.55) * a})`;
      ctx.fillRect(sx, sy, hash(i, 3) > 0.85 ? 2 : 1, hash(i, 3) > 0.85 ? 2 : 1);
    }
  }
  // astro: lua à noite, sol durante o dia (baixo e quente no amanhecer/entardecer); some atrás das nuvens
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - overcast * 1.1);
  if (phase === "night") {
    const mx = w * 0.82;
    const my = h * 0.12;
    glow(ctx, mx, my, 70, "rgba(246,210,122,ALPHA)", 0.25);
    ctx.fillStyle = "#f6e7b8";
    ctx.beginPath();
    ctx.arc(mx, my, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(200,180,130,0.5)";
    ctx.fillRect(mx - 8, my - 6, 5, 4);
    ctx.fillRect(mx + 5, my + 4, 6, 4);
  } else {
    const low = phase !== "day";
    const sx = w * (phase === "dawn" ? 0.18 : phase === "dusk" ? 0.86 : 0.8);
    const sy = h * (low ? 0.3 : 0.1);
    glow(ctx, sx, sy, low ? 160 : 120, low ? "rgba(255,170,90,ALPHA)" : "rgba(255,240,180,ALPHA)", low ? 0.45 : 0.35);
    ctx.fillStyle = low ? "#ffcf7a" : "#fff4c4";
    ctx.beginPath();
    ctx.arc(sx, sy, low ? 26 : 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = low ? "#ffe3a8" : "#ffffff";
    ctx.beginPath();
    ctx.arc(sx - 5, sy - 5, low ? 12 : 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // castelo distante (silhueta) — some na névoa durante o dia
  ctx.fillStyle = phase === "day" ? "rgba(120,160,205,0.55)" : phase === "night" ? "#1a1f44" : "rgba(80,50,90,0.7)";
  const bx = w * 0.7;
  const by = h * 0.24;
  ctx.fillRect(bx, by, 120, 30);
  for (const [dx, tw, th] of [[0, 16, 44], [40, 14, 58], [70, 18, 40], [104, 16, 50]] as const) {
    ctx.fillRect(bx + dx, by - th + 30, tw, th);
    ctx.beginPath();
    ctx.moveTo(bx + dx - 2, by - th + 30);
    ctx.lineTo(bx + dx + tw / 2, by - th + 14);
    ctx.lineTo(bx + dx + tw + 2, by - th + 30);
    ctx.fill();
  }
  if (phase === "night") {
    ctx.fillStyle = "#f6d27a";
    ctx.fillRect(bx + 45, by - 10, 2, 3);
    ctx.fillRect(bx + 75, by + 4, 2, 3);
  }
  // nuvens à deriva (três camadas com velocidades diferentes = profundidade)
  const drift = effects > 0 ? t / 1000 : 0;
  const clouds = 7 + Math.round(overcast * 14);
  for (let i = 0; i < clouds; i++) {
    const layer = i % 3;
    const speed = 4 + layer * 5 + overcast * 6;
    const span = w + 400;
    const x = ((hash(i, 21) * span + drift * speed) % span) - 200;
    const y = h * (0.04 + hash(i, 22) * (0.5 - overcast * 0.25)) + layer * 10;
    cloud(ctx, x, y, 0.8 + layer * 0.35 + overcast * 0.6, phase, i, overcast);
  }
}

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * Math.min(1, Math.max(0, t)));
  return `#${((c(r1!, r2!) << 16) | (c(g1!, g2!) << 8) | c(b1!, b2!)).toString(16).padStart(6, "0")}`;
}

/** Tinta de cor sobre o mundo (amanhecer rosado, entardecer alaranjado, noite azul). */
export function phaseTint(phase: DayPhase): string | null {
  if (phase === "dawn") return "rgba(255,150,170,0.10)";
  if (phase === "dusk") return "rgba(255,120,60,0.13)";
  if (phase === "night") return "rgba(6,10,32,0.24)";
  return null;
}

export { P as isoPoint, TILE_W, TILE_H, roomAt, tileKind, tileZ };
