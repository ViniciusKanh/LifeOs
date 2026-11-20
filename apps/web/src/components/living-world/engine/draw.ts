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

function poly(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, fill: string | CanvasGradient, stroke?: string) {
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
function isoLine(ctx: Ctx, x: number, y: number, u1: number, v1: number, u2: number, v2: number, color: string, w = 1) {
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
  const base = lush ? "#3b7d3a" : "#2d6232";
  diamond(ctx, x, y, shade(base, Math.round((hash(x, y) - 0.5) * 14)));
  const [sx, sy] = P(x, y);
  for (let k = 0; k < 5; k++) {
    const ox = (hash(x, y, k) - 0.5) * 40;
    const oy = (hash(x, y, k + 5) - 0.5) * 18;
    ctx.fillStyle = shade(base, 22);
    ctx.fillRect(sx + ox, sy + oy - 3, 1, 3);
    ctx.fillRect(sx + ox + 2, sy + oy - 2, 1, 2);
  }
  if (hash(x, y, 99) > (lush ? 0.55 : 0.8)) {
    const cols = ["#F16D75", "#F1C66A", "#f3f4fa", "#E78FC0", "#A875F5"];
    ctx.fillStyle = cols[Math.floor(hash(x, y, 77) * cols.length)]!;
    ctx.fillRect(sx + (hash(x, y, 55) - 0.5) * 30, sy + (hash(x, y, 56) - 0.5) * 12, 2, 2);
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
  if (kind === "water") return diamond(ctx, x, y, "#2a5f99");
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

/** Borda da ilha: penhasco de pedra e terra nas bordas frontais do mundo. */
export function cliff(ctx: Ctx, x: number, y: number, side: "sw" | "se") {
  const a = side === "sw" ? P(x - 0.5, y + 0.5) : P(x + 0.5, y - 0.5);
  const b = P(x + 0.5, y + 0.5);
  const h = 70;
  const g = ctx.createLinearGradient(0, a[1], 0, a[1] + h);
  g.addColorStop(0, side === "sw" ? "#5a4a3a" : "#4a3c30");
  g.addColorStop(0.3, side === "sw" ? "#4b4f5e" : "#3d4150");
  g.addColorStop(1, "#151a2c");
  poly(ctx, [a, b, [b[0], b[1] + h], [a[0], a[1] + h]], g);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let k = 0; k < 3; k++) {
    const t = hash(x, y, k);
    ctx.fillRect(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 14, 2, 20 + hash(y, x, k) * 30);
  }
  ctx.fillStyle = "#3b7d3a";
  ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 1, Math.abs(b[0] - a[0]), 3);
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

function flame(ctx: Ctx, sx: number, sy: number, t: number, seed: number, s = 1) {
  const fl = Math.sin(t / 100 + seed) * 1.2;
  ctx.fillStyle = "#ff8a2a";
  ctx.fillRect(sx - 2 * s, sy - 6 * s + fl, 4 * s, 6 * s - fl);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(sx - 1 * s, sy - 4 * s + fl, 2 * s, 3 * s);
}

function treeCrown(ctx: Ctx, sx: number, sy: number, r: number, c1: string, c2: string, seed: number) {
  ctx.fillStyle = shade(c1, -30);
  ctx.beginPath();
  ctx.arc(sx, sy + 4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? c2 : shade(c1, 15);
    ctx.beginPath();
    ctx.arc(sx + (hash(seed, i) - 0.5) * r * 1.2, sy + (hash(i, seed) - 0.6) * r, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
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
      box(ctx, x, y, 0.08, 0.08, 40, "#5a3a22");
      const pink = hash(x, y, 5) > 0.55 && (it.room === "jardim" || it.room === null);
      treeCrown(ctx, sx, sy - 60, 28, pink ? "#d877aa" : "#3a8a3e", pink ? "#f5b3d2" : "#5aae55", x * 13 + y);
      break;
    }
    case "pine":
      box(ctx, x, y, 0.07, 0.07, 22, "#5a3a22");
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? "#2a6a3a" : "#24583a";
        ctx.beginPath();
        ctx.moveTo(sx, sy - 90 + i * 16);
        ctx.lineTo(sx + 22 - i * 2, sy - 40 + i * 6);
        ctx.lineTo(sx - 22 + i * 2, sy - 40 + i * 6);
        ctx.fill();
      }
      break;
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
export function drawSky(ctx: Ctx, w: number, h: number, t: number, effects: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#151c45");
  g.addColorStop(0.55, "#0c1330");
  g.addColorStop(1, "#070b1c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const sx = hash(i, 1) * w;
    const sy = hash(i, 2) * h * 0.6;
    const tw = effects > 0 ? 0.5 + Math.sin(t / 700 + i) * 0.5 : 0.7;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.55})`;
    ctx.fillRect(sx, sy, hash(i, 3) > 0.85 ? 2 : 1, hash(i, 3) > 0.85 ? 2 : 1);
  }
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
  // castelo distante (silhueta)
  ctx.fillStyle = "#1a1f44";
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
  ctx.fillStyle = "#f6d27a";
  ctx.fillRect(bx + 45, by - 10, 2, 3);
  ctx.fillRect(bx + 75, by + 4, 2, 3);
}

export { P as isoPoint, TILE_W, TILE_H, roomAt, tileKind, tileZ };
