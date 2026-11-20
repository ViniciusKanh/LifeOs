/**
 * Arte da Vila do Meu Mundo (pixel art procedural, sem imagens de terceiros):
 * construções com telhado, cenário da vila e o cais. As construções são
 * desenhadas uma vez num canvas próprio (cache) e só as partes animadas —
 * fumaça, pás do moinho, brilho da torre — são redesenhadas por quadro.
 */
import { box, diamond, flame, hash, poly, type Ctx } from "./draw";
import { shade } from "./sprites";
import { isoToScreen, type BuildingDef, type Furniture, type FurnitureKind } from "./worldMap";

type Pt = readonly [number, number];
const Q = (x: number, y: number, z = 0): Pt => {
  const s = isoToScreen(x, y);
  return [s.sx, s.sy - z];
};

/** Tipos de cenário desenhados por este módulo. */
export const VILLAGE_KINDS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "statue", "campfire", "log", "tent", "fence", "fencey", "well", "stall", "crate", "hay", "signpost", "anvil", "forge", "cart", "reeds",
]);

/* ───────────────────────── Geometria das construções ───────────────────────── */

const FOUND = 8;

interface Frame {
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
  /** Altura do topo das paredes (fundação + paredes). */
  top: number;
  /** Eixo da cumeeira: paralelo à face da porta. */
  ridge: "x" | "y";
  rise: number;
}

function frameOf(b: BuildingDef): Frame {
  const inset = 0.06;
  const X0 = b.x0 - 0.5 + inset;
  const X1 = b.x1 + 0.5 - inset;
  const Y0 = b.y0 - 0.5 + inset;
  const Y1 = b.y1 + 0.5 - inset;
  const ridge = b.door.face === "y" ? "x" : "y";
  const span = ridge === "x" ? Y1 - Y0 : X1 - X0;
  return { X0, X1, Y0, Y1, top: FOUND + b.height, ridge, rise: Math.round(span * 12) };
}

/** Caixa com cantos arbitrários (em tiles) — base de paredes e fundações. */
function prism(ctx: Ctx, X0: number, Y0: number, X1: number, Y1: number, z: number, h: number, top: string, left: string, right: string) {
  poly(ctx, [Q(X0, Y1, z), Q(X1, Y1, z), Q(X1, Y1, z + h), Q(X0, Y1, z + h)], left);
  poly(ctx, [Q(X1, Y0, z), Q(X1, Y1, z), Q(X1, Y1, z + h), Q(X1, Y0, z + h)], right);
  poly(ctx, [Q(X0, Y0, z + h), Q(X1, Y0, z + h), Q(X1, Y1, z + h), Q(X0, Y1, z + h)], top);
}

/** Ponto numa face visível: "y" = face sul (x varia), "x" = face leste (y varia). u ∈ 0..1. */
function facePt(f: Frame, face: "x" | "y", u: number, z: number): Pt {
  return face === "y" ? Q(f.X0 + (f.X1 - f.X0) * u, f.Y1, z) : Q(f.X1, f.Y0 + (f.Y1 - f.Y0) * u, z);
}

function faceQuad(ctx: Ctx, f: Frame, face: "x" | "y", u0: number, u1: number, z0: number, z1: number, fill: string) {
  poly(ctx, [facePt(f, face, u0, z0), facePt(f, face, u1, z0), facePt(f, face, u1, z1), facePt(f, face, u0, z1)], fill);
}

function faceLine(ctx: Ctx, a: Pt, b: Pt, color: string, w = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function doorU(b: BuildingDef, f: Frame): number {
  return b.door.face === "y" ? (b.door.at - f.X0) / (f.X1 - f.X0) : (b.door.at - f.Y0) / (f.Y1 - f.Y0);
}

function windowAt(ctx: Ctx, f: Frame, face: "x" | "y", u: number, z: number, wu: number, h: number, frame: string) {
  faceQuad(ctx, f, face, u - wu - 0.012, u + wu + 0.012, z - 3, z + h + 3, frame);
  faceQuad(ctx, f, face, u - wu, u + wu, z, z + h, "#f3c35e");
  faceQuad(ctx, f, face, u - wu, u + wu, z, z + h * 0.45, "#d98f3a");
  faceLine(ctx, facePt(f, face, u, z), facePt(f, face, u, z + h), frame, 2);
  faceLine(ctx, facePt(f, face, u - wu, z + h / 2), facePt(f, face, u + wu, z + h / 2), frame, 1);
  // floreira sob a janela
  faceQuad(ctx, f, face, u - wu - 0.02, u + wu + 0.02, z - 7, z - 3, "#6e4a2e");
  const [fx, fy] = facePt(f, face, u, z - 6);
  const cols = ["#F16D75", "#F1C66A", "#E78FC0"];
  for (let i = -2; i <= 2; i++) {
    ctx.fillStyle = cols[(i + 5) % 3]!;
    ctx.fillRect(fx + i * 4 - 1, fy - 3 + (face === "x" ? i * 2 : -i * 2) * 0.5, 2, 2);
  }
}

function doorAt(ctx: Ctx, f: Frame, face: "x" | "y", u: number, wu: number, h: number) {
  const z = FOUND;
  // degrau de pedra
  const [sx, sy] = facePt(f, face, u, 0);
  ctx.fillStyle = "#7f796d";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  faceQuad(ctx, f, face, u - wu - 0.03, u + wu + 0.03, z - 1, z + h + 3, "#3a2a1c");
  // folha da porta com arco
  const pts: Pt[] = [facePt(f, face, u - wu, z), facePt(f, face, u + wu, z)];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    pts.push(facePt(f, face, u + Math.cos(a) * wu, z + h - 8 + Math.sin(a) * 8));
  }
  poly(ctx, pts, "#6b4426");
  for (const k of [-0.5, 0, 0.5]) faceLine(ctx, facePt(f, face, u + k * wu, z + 1), facePt(f, face, u + k * wu, z + h - 4), "#4a2c16");
  faceLine(ctx, facePt(f, face, u - wu, z + 8), facePt(f, face, u + wu, z + 8), "#2a2a33", 2);
  faceLine(ctx, facePt(f, face, u - wu, z + h - 10), facePt(f, face, u + wu, z + h - 10), "#2a2a33", 2);
  const [kx, ky] = facePt(f, face, u + wu * 0.55, z + h / 2 - 2);
  ctx.fillStyle = "#F1C66A";
  ctx.fillRect(kx - 1, ky - 1, 2, 2);
}

/** Ícone da placa pendurada ao lado da porta. */
function signIcon(ctx: Ctx, key: BuildingDef["key"], cx: number, cy: number) {
  switch (key) {
    case "banco":
      ctx.fillStyle = "#F1C66A";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b5862f";
      ctx.fillRect(cx - 1, cy - 3, 2, 6);
      break;
    case "loja":
      ctx.fillStyle = "#cfd6e6";
      ctx.fillRect(cx - 1, cy - 6, 3, 3);
      ctx.fillStyle = "#A875F5";
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f3f4fa";
      ctx.fillRect(cx - 2, cy - 1, 1, 1);
      break;
    case "taverna":
      ctx.fillStyle = "#c98a3a";
      ctx.fillRect(cx - 4, cy - 4, 7, 9);
      ctx.fillStyle = "#f3f4fa";
      ctx.fillRect(cx - 4, cy - 5, 7, 2);
      ctx.strokeStyle = "#c98a3a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + 3, cy - 2, 3, 4);
      break;
    case "contratos":
      ctx.fillStyle = "#f3e7c9";
      ctx.fillRect(cx - 5, cy - 4, 10, 8);
      ctx.fillStyle = "#b5862f";
      ctx.fillRect(cx - 6, cy - 5, 2, 10);
      ctx.fillRect(cx + 4, cy - 5, 2, 10);
      ctx.fillStyle = "#C8423B";
      ctx.fillRect(cx - 1, cy + 1, 3, 3);
      break;
    case "torre":
      ctx.fillStyle = "#7a3b2e";
      ctx.fillRect(cx - 5, cy - 4, 10, 8);
      ctx.fillStyle = "#f3e7c9";
      ctx.fillRect(cx - 1, cy - 4, 2, 8);
      break;
    case "moinho":
      ctx.fillStyle = "#e3c36a";
      for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * 2, cy - 4 + Math.abs(i), 1, 8 - Math.abs(i));
      break;
  }
}

function hangingSign(ctx: Ctx, b: BuildingDef, f: Frame) {
  const face = b.door.face;
  const u = doorU(b, f) + (face === "y" ? -0.22 : 0.22);
  const [ax, ay] = facePt(f, face, Math.min(0.95, Math.max(0.05, u)), FOUND + 44);
  const dir = face === "y" ? -1 : 1;
  ctx.fillStyle = "#2a2a33";
  ctx.fillRect(Math.min(ax, ax + dir * 16), ay - 1, 16, 2);
  const cx = ax + dir * 12;
  ctx.fillRect(cx - 5, ay, 1, 4);
  ctx.fillRect(cx + 4, ay, 1, 4);
  ctx.fillStyle = "#1c2448";
  ctx.fillRect(cx - 9, ay + 4, 18, 16);
  ctx.strokeStyle = "#A77C34";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 9, ay + 4, 18, 16);
  signIcon(ctx, b.key, cx, ay + 12);
}

/** Telhado de duas águas com telhas, cumeeira e beiral. */
function gableRoof(ctx: Ctx, f: Frame, roof: string, wall: string, trim: string, chimney: (() => void) | null) {
  const o = 0.24;
  const zb = f.top;
  const zr = f.top + f.rise;
  const rows = 6;
  if (f.ridge === "x") {
    const mid = (f.Y0 + f.Y1) / 2;
    const back = [Q(f.X0 - o, f.Y0 - o, zb), Q(f.X1 + o, f.Y0 - o, zb), Q(f.X1 + o, mid, zr), Q(f.X0 - o, mid, zr)] as const;
    poly(ctx, back, shade(roof, -38));
    chimney?.();
    // empena (face leste) com enxaimel
    poly(ctx, [Q(f.X1, f.Y0, zb), Q(f.X1, f.Y1, zb), Q(f.X1, mid, zr - 4)], shade(wall, -26));
    faceLine(ctx, Q(f.X1, mid, zb), Q(f.X1, mid, zr - 6), trim, 2);
    faceLine(ctx, Q(f.X1, f.Y0, zb), Q(f.X1, f.Y1, zb), trim, 2);
    const front = [Q(f.X0 - o, f.Y1 + o, zb), Q(f.X1 + o, f.Y1 + o, zb), Q(f.X1 + o, mid, zr), Q(f.X0 - o, mid, zr)] as const;
    poly(ctx, front, roof);
    for (let i = 1; i < rows; i++) {
      const k = i / rows;
      const y = f.Y1 + o + (mid - (f.Y1 + o)) * k;
      const z = zb + (zr - zb) * k;
      faceLine(ctx, Q(f.X0 - o, y, z), Q(f.X1 + o, y, z), shade(roof, -30));
      const n = Math.round((f.X1 - f.X0) * 3);
      for (let j = 0; j < n; j++) {
        const x = f.X0 - o + ((j + (i % 2) * 0.5) / n) * (f.X1 - f.X0 + 2 * o);
        const y2 = f.Y1 + o + (mid - (f.Y1 + o)) * (k - 1 / rows);
        faceLine(ctx, Q(x, y, z), Q(x, y2, z - (zr - zb) / rows), shade(roof, -22));
      }
    }
    for (let i = 1; i < rows; i++) {
      const k = i / rows;
      faceLine(ctx, Q(f.X0 - o, f.Y0 - o + (mid - f.Y0 + o) * k, zb + (zr - zb) * k), Q(f.X1 + o, f.Y0 - o + (mid - f.Y0 + o) * k, zb + (zr - zb) * k), shade(roof, -55));
    }
    faceLine(ctx, Q(f.X0 - o, f.Y1 + o, zb), Q(f.X1 + o, f.Y1 + o, zb), shade(roof, -60), 3);
    faceLine(ctx, Q(f.X1 + o, f.Y1 + o, zb), Q(f.X1 + o, mid, zr), shade(roof, 30), 2);
    faceLine(ctx, Q(f.X0 - o, mid, zr), Q(f.X1 + o, mid, zr), shade(roof, 45), 3);
  } else {
    const mid = (f.X0 + f.X1) / 2;
    poly(ctx, [Q(f.X0 - o, f.Y0 - o, zb), Q(f.X0 - o, f.Y1 + o, zb), Q(mid, f.Y1 + o, zr), Q(mid, f.Y0 - o, zr)], shade(roof, -38));
    chimney?.();
    poly(ctx, [Q(f.X0, f.Y1, zb), Q(f.X1, f.Y1, zb), Q(mid, f.Y1, zr - 4)], shade(wall, -10));
    faceLine(ctx, Q(mid, f.Y1, zb), Q(mid, f.Y1, zr - 6), trim, 2);
    faceLine(ctx, Q(f.X0, f.Y1, zb), Q(f.X1, f.Y1, zb), trim, 2);
    poly(ctx, [Q(f.X1 + o, f.Y0 - o, zb), Q(f.X1 + o, f.Y1 + o, zb), Q(mid, f.Y1 + o, zr), Q(mid, f.Y0 - o, zr)], shade(roof, -18));
    for (let i = 1; i < rows; i++) {
      const k = i / rows;
      const x = f.X1 + o + (mid - (f.X1 + o)) * k;
      const z = zb + (zr - zb) * k;
      faceLine(ctx, Q(x, f.Y0 - o, z), Q(x, f.Y1 + o, z), shade(roof, -45));
      const n = Math.round((f.Y1 - f.Y0) * 3);
      for (let j = 0; j < n; j++) {
        const y = f.Y0 - o + ((j + (i % 2) * 0.5) / n) * (f.Y1 - f.Y0 + 2 * o);
        const x2 = f.X1 + o + (mid - (f.X1 + o)) * (k - 1 / rows);
        faceLine(ctx, Q(x, y, z), Q(x2, y, z - (zr - zb) / rows), shade(roof, -36));
      }
    }
    faceLine(ctx, Q(f.X1 + o, f.Y0 - o, zb), Q(f.X1 + o, f.Y1 + o, zb), shade(roof, -65), 3);
    faceLine(ctx, Q(f.X1 + o, f.Y1 + o, zb), Q(mid, f.Y1 + o, zr), shade(roof, 25), 2);
    faceLine(ctx, Q(mid, f.Y0 - o, zr), Q(mid, f.Y1 + o, zr), shade(roof, 40), 3);
  }
}

/** Topo da chaminé (coordenadas de mundo em px) — origem da fumaça animada. */
function chimneySpot(f: Frame): { x: number; y: number; z: number } {
  if (f.ridge === "x") return { x: f.X0 + (f.X1 - f.X0) * 0.25, y: f.Y0 + (f.Y1 - f.Y0) * 0.3, z: f.top + f.rise + 14 };
  return { x: f.X0 + (f.X1 - f.X0) * 0.3, y: f.Y0 + (f.Y1 - f.Y0) * 0.25, z: f.top + f.rise + 14 };
}

function drawChimney(ctx: Ctx, f: Frame) {
  const c = chimneySpot(f);
  const base = f.top + f.rise * 0.45;
  prism(ctx, c.x - 0.22, c.y - 0.22, c.x + 0.22, c.y + 0.22, base, c.z - base, "#6d685e", "#58544b", "#45423b");
  prism(ctx, c.x - 0.27, c.y - 0.27, c.x + 0.27, c.y + 0.27, c.z - 4, 4, "#8a8478", "#6d685e", "#58544b");
  poly(ctx, [Q(c.x - 0.15, c.y - 0.15, c.z), Q(c.x + 0.15, c.y - 0.15, c.z), Q(c.x + 0.15, c.y + 0.15, c.z), Q(c.x - 0.15, c.y + 0.15, c.z)], "#1a1410");
}

/** Paredes com enxaimel (vigas escuras sobre reboco claro). */
function timberWalls(ctx: Ctx, b: BuildingDef, f: Frame) {
  prism(ctx, f.X0, f.Y0, f.X1, f.Y1, 0, FOUND, "#8a8478", "#6d685e", "#58544b");
  prism(ctx, f.X0 + 0.03, f.Y0 + 0.03, f.X1 - 0.03, f.Y1 - 0.03, FOUND, b.height, b.wall, shade(b.wall, -12), shade(b.wall, -36));
  for (const face of ["y", "x"] as const) {
    const col = face === "y" ? b.trim : shade(b.trim, -10);
    const n = 4;
    for (let i = 0; i <= n; i++) faceLine(ctx, facePt(f, face, i / n, FOUND), facePt(f, face, i / n, f.top), col, 3);
    faceLine(ctx, facePt(f, face, 0, FOUND + 2), facePt(f, face, 1, FOUND + 2), col, 3);
    faceLine(ctx, facePt(f, face, 0, f.top - 1), facePt(f, face, 1, f.top - 1), col, 3);
    faceLine(ctx, facePt(f, face, 0, FOUND + b.height * 0.5), facePt(f, face, 1, FOUND + b.height * 0.5), col, 2);
    for (let i = 0; i < n; i++) faceLine(ctx, facePt(f, face, i / n, FOUND + 2), facePt(f, face, (i + 1) / n, FOUND + b.height * 0.5), col, 2);
  }
}

/** Paredes de pedra lavrada com pilastras (Banco). */
function stoneWalls(ctx: Ctx, b: BuildingDef, f: Frame) {
  prism(ctx, f.X0 - 0.05, f.Y0 - 0.05, f.X1 + 0.05, f.Y1 + 0.05, 0, FOUND + 2, "#8a8478", "#6d685e", "#58544b");
  prism(ctx, f.X0 + 0.03, f.Y0 + 0.03, f.X1 - 0.03, f.Y1 - 0.03, FOUND, b.height, b.wall, shade(b.wall, -10), shade(b.wall, -34));
  for (const face of ["y", "x"] as const) {
    for (let r = 1; r < b.height / 9; r++) faceLine(ctx, facePt(f, face, 0, FOUND + r * 9), facePt(f, face, 1, FOUND + r * 9), "rgba(0,0,0,0.16)");
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      faceQuad(ctx, f, face, Math.max(0, u - 0.025), Math.min(1, u + 0.025), FOUND, f.top, shade(b.wall, face === "y" ? 18 : -6));
    }
    faceQuad(ctx, f, face, 0, 1, f.top - 6, f.top, shade(b.wall, 10));
    faceLine(ctx, facePt(f, face, 0, f.top - 6), facePt(f, face, 1, f.top - 6), b.trim, 2);
  }
}

/** Desenho estático completo de uma construção (vai para o cache). */
export function drawBuilding(ctx: Ctx, b: BuildingDef) {
  const f = frameOf(b);
  // sombra no chão
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  poly(ctx, [Q(f.X0 - 0.1, f.Y0 + 0.2), Q(f.X1 + 0.35, f.Y0 + 0.2), Q(f.X1 + 0.35, f.Y1 + 0.35), Q(f.X0 - 0.1, f.Y1 + 0.35)], "rgba(0,0,0,0.25)");
  if (b.style === "tower") return drawTower(ctx, b, f);
  if (b.style === "mill") return drawMill(ctx, b, f);
  if (b.style === "bank") stoneWalls(ctx, b, f);
  else timberWalls(ctx, b, f);
  const du = doorU(b, f);
  // janelas nas duas faces visíveis (sem cobrir a porta)
  for (const face of ["y", "x"] as const) {
    for (const u of [0.18, 0.5, 0.82]) {
      if (face === b.door.face && Math.abs(u - du) < 0.2) continue;
      windowAt(ctx, f, face, u, FOUND + b.height * 0.5 + 6, 0.06, 14, b.style === "bank" ? "#e8e2d4" : b.trim);
      if (b.style !== "bank") windowAt(ctx, f, face, u, FOUND + 10, 0.05, 11, b.trim);
    }
  }
  doorAt(ctx, f, b.door.face, du, 0.08, b.style === "bank" ? 34 : 28);
  if (b.style === "bank") {
    // colunas e frontão sobre a porta + moeda dourada
    for (const k of [-0.13, 0.13]) faceQuad(ctx, f, b.door.face, du + k - 0.02, du + k + 0.02, FOUND, FOUND + 40, "#e8e2d4");
    const [px, py] = facePt(f, b.door.face, du, FOUND + 48);
    poly(ctx, [facePt(f, b.door.face, du - 0.18, FOUND + 40), facePt(f, b.door.face, du + 0.18, FOUND + 40), [px, py - 6]], "#e8e2d4", "#A77C34");
    ctx.fillStyle = "#F1C66A";
    ctx.beginPath();
    ctx.arc(px, py + 1, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.style === "hall") {
    // estandartes dos dois lados da porta
    for (const k of [-0.2, 0.2]) {
      const [bx, by] = facePt(f, b.door.face, du + k, FOUND + b.height - 6);
      ctx.fillStyle = "#3f5a3a";
      ctx.fillRect(bx - 4, by, 8, 20);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(bx - 4, by, 8, 2);
      ctx.fillRect(bx - 1, by + 8, 2, 5);
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + 20);
      ctx.lineTo(bx, by + 25);
      ctx.lineTo(bx + 4, by + 20);
      ctx.fillStyle = "#3f5a3a";
      ctx.fill();
    }
  }
  hangingSign(ctx, b, f);
  gableRoof(ctx, f, b.roof, b.wall, b.trim, b.chimney ? () => drawChimney(ctx, f) : null);
}

function cylinder(ctx: Ctx, cx: number, cy: number, rx: number, h: number, z: number, light: string, dark: string, rTop = rx) {
  const ry = rx / 2;
  const ryT = rTop / 2;
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  g.addColorStop(0, shade(light, 10));
  g.addColorStop(0.45, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy - z);
  ctx.ellipse(cx, cy - z, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rTop, cy - z - h);
  ctx.ellipse(cx, cy - z - h, rTop, ryT, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
}

function cone(ctx: Ctx, cx: number, cy: number, r: number, z: number, h: number, color: string) {
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(color, 30));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -40));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - z);
  ctx.ellipse(cx, cy - z, r, r / 2, 0, Math.PI, 0, true);
  ctx.lineTo(cx, cy - z - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -55);
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - z - h * k, r * (1 - k), (r * (1 - k)) / 2, 0, 0, Math.PI);
    ctx.stroke();
  }
}

function drawTower(ctx: Ctx, b: BuildingDef, f: Frame) {
  const [cx, cy] = Q((f.X0 + f.X1) / 2, (f.Y0 + f.Y1) / 2);
  const rx = 40;
  cylinder(ctx, cx, cy, rx + 5, FOUND, 0, "#8a8478", "#4a463f");
  cylinder(ctx, cx, cy, rx, b.height, FOUND, b.wall, shade(b.wall, -50), rx - 4);
  // fiadas de pedra
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  for (let z = FOUND + 10; z < f.top; z += 10) {
    const r = rx - ((z - FOUND) / b.height) * 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy - z, r, r / 2, 0, 0, Math.PI);
    ctx.stroke();
  }
  // janelas em arco com luz mágica
  for (const [dx, z] of [[-14, 58], [16, 82], [-2, 104]] as const) {
    ctx.fillStyle = "#2a1f44";
    ctx.fillRect(cx + dx - 5, cy - z - 14, 10, 16);
    ctx.fillStyle = "#c7a6ff";
    ctx.fillRect(cx + dx - 3, cy - z - 11, 6, 12);
    ctx.fillStyle = "#8a5cf0";
    ctx.fillRect(cx + dx - 3, cy - z - 4, 6, 5);
  }
  // porta
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(cx - 9, cy + rx / 2 - FOUND - 34, 18, 34);
  ctx.fillStyle = "#6b4426";
  ctx.fillRect(cx - 7, cy + rx / 2 - FOUND - 30, 14, 30);
  ctx.fillStyle = "#F1C66A";
  ctx.fillRect(cx + 3, cy + rx / 2 - FOUND - 16, 2, 2);
  // ameias
  const zt = f.top;
  cylinder(ctx, cx, cy, rx + 2, 6, zt, shade(b.wall, 12), shade(b.wall, -40));
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (i / 6);
    const mx = cx + Math.cos(a) * (rx - 2);
    const my = cy - zt - 6 + Math.sin(a) * ((rx - 2) / 2);
    ctx.fillStyle = shade(b.wall, i < 3 ? 15 : -25);
    ctx.fillRect(mx - 4, my - 7, 8, 7);
  }
  cone(ctx, cx, cy, rx + 4, zt + 6, 86, b.roof);
  // pináculo e bandeira
  ctx.fillStyle = b.trim;
  ctx.fillRect(cx - 1, cy - zt - 104, 2, 14);
  ctx.fillStyle = "#A875F5";
  ctx.fillRect(cx + 1, cy - zt - 104, 12, 7);
  ctx.fillStyle = b.trim;
  ctx.fillRect(cx - 2, cy - zt - 92, 4, 3);
  // placa
  ctx.fillStyle = "#1c2448";
  ctx.fillRect(cx + 14, cy - 30, 18, 16);
  ctx.strokeStyle = "#A77C34";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx + 14, cy - 30, 18, 16);
  signIcon(ctx, b.key, cx + 23, cy - 22);
}

function drawMill(ctx: Ctx, b: BuildingDef, f: Frame) {
  const [cx, cy] = Q((f.X0 + f.X1) / 2, (f.Y0 + f.Y1) / 2);
  cylinder(ctx, cx, cy, 30, FOUND, 0, "#8a8478", "#4a463f");
  cylinder(ctx, cx, cy, 27, b.height, FOUND, b.wall, shade(b.wall, -55), 17);
  ctx.strokeStyle = "rgba(90,60,30,0.25)";
  for (let z = FOUND + 12; z < f.top; z += 12) {
    const r = 27 - ((z - FOUND) / b.height) * 10;
    ctx.beginPath();
    ctx.ellipse(cx, cy - z, r, r / 2, 0, 0, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(cx - 6, cy + 13 - FOUND - 24, 12, 24);
  ctx.fillStyle = "#6b4426";
  ctx.fillRect(cx - 5, cy + 13 - FOUND - 22, 10, 22);
  ctx.fillStyle = "#f3c35e";
  ctx.fillRect(cx - 3, cy - 60, 6, 8);
  cone(ctx, cx, cy, 21, f.top, 34, b.roof);
}

/** Ponto de mundo (px) do eixo das pás do moinho. */
function millHub(b: BuildingDef): Pt {
  const f = frameOf(b);
  const [cx, cy] = Q((f.X0 + f.X1) / 2, (f.Y0 + f.Y1) / 2);
  return [cx + 6, cy - f.top + 4];
}

/** Partes animadas da construção (por quadro). */
export function drawBuildingAnim(ctx: Ctx, b: BuildingDef, t: number, fx: number) {
  if (b.chimney) {
    const c = chimneySpot(frameOf(b));
    const [sx, sy] = Q(c.x, c.y, c.z);
    const n = fx > 0 ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const ph = fx > 0 ? ((t / 2800 + i / n + hash(b.x0, b.y0)) % 1) : 0.3;
      ctx.fillStyle = `rgba(200,205,220,${(1 - ph) * 0.45})`;
      ctx.beginPath();
      ctx.arc(sx + Math.sin(ph * 6 + i) * 5 + ph * 14, sy - ph * 60, 3 + ph * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (b.style === "mill") {
    const [hx, hy] = millHub(b);
    const a0 = fx > 0 ? t / 1600 : 0.4;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i * Math.PI) / 2;
      const ex = hx + Math.cos(a) * 46;
      const ey = hy + Math.sin(a) * 46;
      ctx.strokeStyle = "#4a2f1b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // vela de lona
      const px = Math.cos(a + Math.PI / 2) * 10;
      const py = Math.sin(a + Math.PI / 2) * 10;
      const m1x = hx + Math.cos(a) * 12;
      const m1y = hy + Math.sin(a) * 12;
      poly(ctx, [[m1x, m1y], [ex, ey], [ex + px, ey + py], [m1x + px, m1y + py]], "rgba(243,231,201,0.92)", "#6e4a2e");
    }
    ctx.fillStyle = "#2a2a33";
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.style === "tower" && fx > 0) {
    const f = frameOf(b);
    const [cx, cy] = Q((f.X0 + f.X1) / 2, (f.Y0 + f.Y1) / 2);
    for (let i = 0; i < 8; i++) {
      const a = t / 1400 + i * 0.8;
      ctx.fillStyle = `rgba(210,180,255,${0.45 + Math.sin(t / 300 + i) * 0.35})`;
      ctx.fillRect(cx + Math.cos(a) * 52, cy - f.top - 30 + Math.sin(a) * 18 - ((t / 40 + i * 20) % 40), 2, 2);
    }
  }
}

/** Retângulo (em px de mundo) que contém a construção — usado no cache e na seleção. */
export function buildingBounds(b: BuildingDef): { x: number; y: number; w: number; h: number } {
  const f = frameOf(b);
  const left = Q(f.X0 - 0.4, f.Y1 + 0.4)[0] - 30;
  const right = Q(f.X1 + 0.4, f.Y0 - 0.4)[0] + 60;
  const roofTop = b.style === "tower" ? f.top + 115 : b.style === "mill" ? f.top + 60 : f.top + f.rise + 30;
  const top = Q(f.X0, f.Y0)[1] - roofTop - 10;
  const bottom = Q(f.X1 + 0.4, f.Y1 + 0.4)[1] + 12;
  return { x: Math.floor(left), y: Math.floor(top), w: Math.ceil(right - left), h: Math.ceil(bottom - top) };
}

/** Silhueta (envoltória convexa em px de mundo) para seleção por clique. */
export function buildingHull(b: BuildingDef): Pt[] {
  const f = frameOf(b);
  const zt = buildingTopZ(b);
  const pts: Pt[] = [];
  for (const [x, y] of [[f.X0, f.Y0], [f.X1, f.Y0], [f.X1, f.Y1], [f.X0, f.Y1]] as const) pts.push(Q(x, y, 0), Q(x, y, zt));
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o: Pt, a: Pt, c: Pt) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function insideHull(hull: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const [xi, yi] = hull[i]!;
    const [xj, yj] = hull[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Altura (px) do topo visual — onde ficam o letreiro e o marcador de pendência. */
export function buildingTopZ(b: BuildingDef): number {
  const f = frameOf(b);
  return b.style === "tower" ? f.top + 84 : b.style === "mill" ? f.top + 40 : f.top + f.rise;
}

/** Luz das janelas à noite (pontos em px de mundo). */
export function buildingLights(b: BuildingDef): Pt[] {
  const f = frameOf(b);
  if (b.style === "tower") {
    const [cx, cy] = Q((f.X0 + f.X1) / 2, (f.Y0 + f.Y1) / 2);
    return [[cx - 14, cy - 64], [cx + 16, cy - 88]];
  }
  if (b.style === "mill") return [];
  const pts: Pt[] = [];
  for (const face of ["y", "x"] as const) pts.push(facePt(f, face, 0.25, FOUND + b.height * 0.5), facePt(f, face, 0.75, FOUND + b.height * 0.5));
  return pts;
}

/* ───────────────────────── Cenário da vila ───────────────────────── */

export function drawDock(ctx: Ctx, x: number, y: number) {
  diamond(ctx, x, y, "#3a2414", undefined, 0.9);
  for (let i = 0; i < 4; i++) {
    const v = -0.42 + i * 0.22;
    poly(ctx, [Q(x - 0.44, y + v), Q(x + 0.44, y + v), Q(x + 0.44, y + v + 0.19), Q(x - 0.44, y + v + 0.19)], i % 2 ? "#9a6a43" : "#8a5d3b");
  }
  for (const [u, v] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const) box(ctx, x + u, y + v, 0.04, 0.04, 6, "#5a3a22");
}

export function drawVillageItem(ctx: Ctx, it: Furniture, t: number) {
  const { x, y } = it;
  const [sx, sy] = Q(x, y);
  switch (it.kind) {
    case "statue": {
      box(ctx, x, y, 0.38, 0.38, 8, "#8a8478", 0, "#6d685e", "#58544b");
      box(ctx, x, y, 0.28, 0.28, 16, "#a39d90", 8, "#857f73", "#6d685e");
      const st = "#b9b5c8";
      const sd = "#8a86a0";
      const by = sy - 24;
      ctx.fillStyle = sd;
      ctx.fillRect(sx - 6, by - 14, 4, 14);
      ctx.fillRect(sx + 2, by - 14, 4, 14);
      ctx.fillStyle = st;
      ctx.fillRect(sx - 8, by - 34, 16, 20);
      ctx.fillStyle = sd;
      ctx.fillRect(sx + 4, by - 34, 4, 20);
      ctx.fillStyle = st;
      ctx.fillRect(sx - 5, by - 44, 10, 10);
      ctx.fillStyle = sd;
      ctx.fillRect(sx - 6, by - 46, 12, 3);
      // espada erguida e capa
      ctx.fillStyle = st;
      ctx.fillRect(sx + 9, by - 40, 3, 10);
      ctx.fillStyle = "#dfe3f0";
      ctx.fillRect(sx + 10, by - 66, 2, 26);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(sx + 7, by - 42, 8, 2);
      ctx.fillRect(sx + 10, by - 68, 2, 2);
      ctx.fillStyle = sd;
      ctx.fillRect(sx - 11, by - 32, 4, 22);
      break;
    }
    case "campfire": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? "#6b6f7e" : "#555968";
        ctx.beginPath();
        ctx.ellipse(sx + Math.cos(a) * 14, sy + Math.sin(a) * 7, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#5a3a22";
      ctx.save();
      ctx.translate(sx, sy - 2);
      ctx.rotate(0.5);
      ctx.fillRect(-11, -2, 22, 4);
      ctx.rotate(-1);
      ctx.fillRect(-11, -2, 22, 4);
      ctx.restore();
      flame(ctx, sx - 4, sy - 2, t, x, 2);
      flame(ctx, sx + 4, sy - 1, t, x + 3, 1.6);
      flame(ctx, sx, sy - 6, t, x + 7, 2.4);
      for (let i = 0; i < 3; i++) {
        const ph = (t / 900 + i / 3) % 1;
        ctx.fillStyle = `rgba(255,200,90,${1 - ph})`;
        ctx.fillRect(sx + Math.sin(t / 200 + i * 2) * 6, sy - 16 - ph * 30, 2, 2);
      }
      break;
    }
    case "log":
      box(ctx, x, y, 0.36, 0.13, 9, "#7a5230", 0, "#5a3a22", "#4a2c16");
      ctx.fillStyle = "#c9a06a";
      ctx.beginPath();
      ctx.ellipse(...Q(x + 0.36, y), 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "tent": {
      const c = it.color ?? "#9e2b2b";
      const h = 34;
      poly(ctx, [Q(x - 0.45, y - 0.4), Q(x + 0.45, y - 0.4), Q(x + 0.45, y, h), Q(x - 0.45, y, h)], shade(c, -40));
      poly(ctx, [Q(x + 0.45, y - 0.4), Q(x + 0.45, y + 0.4), Q(x + 0.45, y, h)], shade(c, -20));
      poly(ctx, [Q(x + 0.45, y + 0.12), Q(x + 0.45, y + 0.4), Q(x + 0.45, y + 0.05, h * 0.6)], "#1a1410");
      poly(ctx, [Q(x - 0.45, y + 0.4), Q(x + 0.45, y + 0.4), Q(x + 0.45, y, h), Q(x - 0.45, y, h)], c);
      for (let i = 1; i < 4; i++) faceLine(ctx, Q(x - 0.45 + i * 0.225, y + 0.4), Q(x - 0.45 + i * 0.225, y, h), shade(c, 25));
      faceLine(ctx, Q(x - 0.5, y, h), Q(x + 0.5, y, h), "#f3e7c9", 2);
      ctx.fillStyle = "#f3e7c9";
      const [tx, ty] = Q(x + 0.5, y, h);
      ctx.fillRect(tx, ty - 10, 1, 10);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(tx + 1, ty - 10, 6, 4);
      break;
    }
    case "fence":
    case "fencey": {
      const alongX = it.kind === "fence";
      const ends: Array<[number, number]> = alongX ? [[-0.5, 0], [0, 0], [0.5, 0]] : [[0, -0.5], [0, 0], [0, 0.5]];
      for (const z of [6, 13]) {
        const a = Q(x + ends[0]![0], y + ends[0]![1], z);
        const b = Q(x + ends[2]![0], y + ends[2]![1], z);
        faceLine(ctx, a, b, "#4a2f1b", 3);
        faceLine(ctx, [a[0], a[1] - 1], [b[0], b[1] - 1], "#9a6a43", 1);
      }
      for (const [u, v] of ends) box(ctx, x + u, y + v, 0.05, 0.05, 17, "#7a5230", 0, "#5a3a22", "#4a2c16");
      break;
    }
    case "well": {
      cylinder(ctx, sx, sy, 20, 14, 0, "#9a948a", "#5a564f");
      ctx.fillStyle = "#1a2a44";
      ctx.beginPath();
      ctx.ellipse(sx, sy - 14, 15, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120,180,255,0.35)";
      ctx.fillRect(sx - 6 + Math.sin(t / 600) * 3, sy - 15, 6, 1);
      for (const dx of [-17, 17]) {
        ctx.fillStyle = "#5a3a22";
        ctx.fillRect(sx + dx - 2, sy - 50, 4, 38);
      }
      ctx.fillStyle = "#4a2f1b";
      ctx.fillRect(sx - 18, sy - 46, 36, 3);
      poly(ctx, [[sx - 26, sy - 48], [sx, sy - 66], [sx + 26, sy - 48], [sx + 22, sy - 44], [sx, sy - 60], [sx - 22, sy - 44]], "#8a3b2a");
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(sx - 4, sy - 36, 8, 7);
      ctx.fillStyle = "#2a2a33";
      ctx.fillRect(sx, sy - 44, 1, 8);
      break;
    }
    case "stall": {
      const c = it.color ?? "#C8423B";
      box(ctx, x, y, 0.42, 0.3, 16, "#8a5d3b", 0, "#6e4a2e", "#5a3a22");
      const goods = ["#F16D75", "#F1C66A", "#4FD49A", "#E78FC0", "#f39a3a"];
      for (let i = 0; i < 6; i++) {
        const [gx, gy] = Q(x - 0.3 + (i % 3) * 0.3, y - 0.12 + Math.floor(i / 3) * 0.22, 16);
        ctx.fillStyle = goods[(i + x) % goods.length]!;
        ctx.beginPath();
        ctx.arc(gx, gy - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [u, v] of [[-0.42, -0.3], [0.42, -0.3], [-0.42, 0.3], [0.42, 0.3]] as const) box(ctx, x + u, y + v, 0.03, 0.03, 42, "#5a3a22");
      for (let i = 0; i < 6; i++) {
        const u0 = -0.48 + i * 0.16;
        poly(ctx, [Q(x + u0, y - 0.36, 48), Q(x + u0 + 0.16, y - 0.36, 48), Q(x + u0 + 0.16, y + 0.42, 38), Q(x + u0, y + 0.42, 38)], i % 2 ? "#f3e7c9" : c);
      }
      for (let i = 0; i < 6; i++) {
        const [ax, ay] = Q(x - 0.4 + i * 0.16, y + 0.42, 38);
        ctx.fillStyle = i % 2 ? "#f3e7c9" : c;
        ctx.beginPath();
        ctx.moveTo(ax - 5, ay);
        ctx.lineTo(ax + 5, ay - 2);
        ctx.lineTo(ax, ay + 5);
        ctx.fill();
      }
      break;
    }
    case "crate":
      box(ctx, x, y, 0.24, 0.24, 20, "#a7774a", 0, "#8a5d3b", "#6e4a2e");
      faceLine(ctx, Q(x - 0.24, y + 0.24, 2), Q(x + 0.24, y + 0.24, 18), "#5a3a22", 2);
      faceLine(ctx, Q(x + 0.24, y - 0.24, 2), Q(x + 0.24, y + 0.24, 18), "#4a2c16", 2);
      faceLine(ctx, Q(x - 0.24, y - 0.24, 20), Q(x + 0.24, y + 0.24, 20), "#7a5230", 1);
      break;
    case "hay":
      box(ctx, x, y, 0.32, 0.26, 18, "#e3c36a", 0, "#c9a24a", "#a8862f");
      for (let i = 1; i < 4; i++) faceLine(ctx, Q(x - 0.32, y + 0.26, i * 5), Q(x + 0.32, y + 0.26, i * 5), "#b8962e");
      faceLine(ctx, Q(x - 0.1, y + 0.26, 0), Q(x - 0.1, y + 0.26, 18), "#8a5d3b", 2);
      faceLine(ctx, Q(x + 0.14, y + 0.26, 0), Q(x + 0.14, y + 0.26, 18), "#8a5d3b", 2);
      break;
    case "signpost": {
      box(ctx, x, y, 0.04, 0.04, 44, "#6e4a2e");
      poly(ctx, [[sx - 22, sy - 40], [sx + 14, sy - 46], [sx + 20, sy - 41], [sx + 14, sy - 36], [sx - 22, sy - 30]], "#a7774a", "#4a2c16");
      poly(ctx, [[sx + 22, sy - 28], [sx - 14, sy - 32], [sx - 20, sy - 27], [sx - 14, sy - 22], [sx + 22, sy - 18]], "#8a5d3b", "#4a2c16");
      ctx.fillStyle = "#3a2414";
      ctx.fillRect(sx - 14, sy - 39, 20, 1);
      ctx.fillRect(sx - 8, sy - 26, 20, 1);
      break;
    }
    case "anvil":
      box(ctx, x, y, 0.2, 0.2, 12, "#7a5230", 0, "#5a3a22", "#4a2c16");
      box(ctx, x, y, 0.1, 0.08, 6, "#3b3b46", 12);
      box(ctx, x, y, 0.26, 0.12, 6, "#555968", 18, "#3b3b46", "#2a2a33");
      ctx.fillStyle = "#8e97ab";
      ctx.fillRect(sx - 10, sy - 25, 16, 1);
      break;
    case "forge": {
      box(ctx, x, y, 0.4, 0.36, 26, "#6d685e", 0, "#58544b", "#45423b");
      const fl = 0.7 + Math.sin(t / 120) * 0.2;
      poly(ctx, [Q(x - 0.15, y + 0.36, 4), Q(x + 0.2, y + 0.36, 4), Q(x + 0.2, y + 0.36, 18), Q(x - 0.15, y + 0.36, 18)], `rgba(255,${Math.round(120 + fl * 60)},40,1)`);
      flame(ctx, ...Q(x + 0.02, y + 0.36, 6), t, x, 1.4);
      box(ctx, x - 0.15, y - 0.15, 0.12, 0.12, 30, "#58544b", 26);
      break;
    }
    case "cart": {
      box(ctx, x, y, 0.4, 0.24, 10, "#8a5d3b", 10, "#6e4a2e", "#5a3a22");
      for (let i = 0; i < 3; i++) {
        const [bx, by] = Q(x - 0.2 + i * 0.2, y - 0.05, 22);
        ctx.fillStyle = i % 2 ? "#cdb48e" : "#bfa47a";
        ctx.beginPath();
        ctx.ellipse(bx, by, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const u of [-0.25, 0.25]) {
        const [wx, wy] = Q(x + u, y + 0.26, 8);
        ctx.strokeStyle = "#3a2414";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(wx, wy, 5, 8, -0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      faceLine(ctx, Q(x + 0.4, y, 14), Q(x + 0.85, y, 6), "#5a3a22", 3);
      break;
    }
    case "reeds":
      for (let i = 0; i < 7; i++) {
        const ox = (hash(x, y, i) - 0.5) * 30;
        const oy = (hash(y, x, i) - 0.5) * 12;
        const sway = Math.sin(t / 900 + i) * 2;
        ctx.strokeStyle = i % 2 ? "#3f8a3e" : "#2f6a35";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + oy);
        ctx.lineTo(sx + ox + sway, sy + oy - 22 - (i % 3) * 4);
        ctx.stroke();
        if (i % 2 === 0) {
          ctx.fillStyle = "#6e4a2e";
          ctx.fillRect(sx + ox + sway - 1, sy + oy - 26 - (i % 3) * 4, 3, 6);
        }
      }
      break;
    default:
      break;
  }
}
