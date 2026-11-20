/**
 * Primitivas de desenho isométrico e desenho dos móveis/tiles.
 * Tudo em coordenadas de mundo (antes da câmera). Cores seguem a paleta RPG do LifeOS.
 */
import { isoToScreen, TILE_H, TILE_W, WALL_H, type Furniture, type RoomDef, type TileKind } from "./worldMap";
import { shade } from "./sprites";

export type Ctx = CanvasRenderingContext2D;

const P = (x: number, y: number) => {
  const s = isoToScreen(x, y);
  return [s.sx, s.sy] as const;
};

function poly(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, fill: string, stroke?: string) {
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
  // face SW (frente-esquerda) e SE (frente-direita)
  poly(ctx, [lift(p4, z), lift(p3, z), lift(p3, z + h), lift(p4, z + h)], left ?? shade(top, -35));
  poly(ctx, [lift(p2, z), lift(p3, z), lift(p3, z + h), lift(p2, z + h)], right ?? shade(top, -60));
  poly(ctx, [lift(p1, z + h), lift(p2, z + h), lift(p3, z + h), lift(p4, z + h)], top);
}

export function diamond(ctx: Ctx, x: number, y: number, fill: string, stroke?: string, scale = 1) {
  const a = 0.5 * scale;
  poly(ctx, [P(x - a, y - a), P(x + a, y - a), P(x + a, y + a), P(x - a, y + a)], fill, stroke);
}

const TILE_COLORS: Record<Exclude<TileKind, "floor" | "wall">, [string, string]> = {
  path: ["#5f6170", "#575968"],
  grass: ["#2f5e35", "#2a5530"],
  water: ["#2f6fa8", "#2a64a0"],
  plaza: ["#8a8478", "#7d776b"],
};

export function drawTile(ctx: Ctx, x: number, y: number, kind: TileKind, room: RoomDef | null, t: number, effects: number) {
  const alt = (x + y) % 2;
  if (kind === "floor" && room) {
    diamond(ctx, x, y, room.floor[alt]!, "rgba(0,0,0,0.18)");
    return;
  }
  if (kind === "wall") {
    diamond(ctx, x, y, room?.floor[0] ?? "#333");
    return;
  }
  const c = TILE_COLORS[kind as keyof typeof TILE_COLORS];
  if (kind === "water") {
    const w = effects > 0 ? Math.sin(t / 700 + x + y) * 10 : 0;
    diamond(ctx, x, y, shade(c[alt]!, Math.round(w)), "rgba(150,200,255,0.25)");
    return;
  }
  diamond(ctx, x, y, c[alt]!, kind === "path" ? "rgba(0,0,0,0.25)" : undefined);
  if (kind === "grass" && (x * 7 + y * 13) % 5 === 0) {
    const [sx, sy] = P(x, y);
    ctx.fillStyle = "#3d7a42";
    ctx.fillRect(sx - 6, sy - 2, 2, 3);
    ctx.fillRect(sx + 5, sy + 1, 2, 3);
  }
}

export function drawWall(ctx: Ctx, x: number, y: number, room: RoomDef) {
  const isCorner = x === room.x0 && y === room.y0;
  const col = room.wall;
  // Parede como bloco baixo no fundo do tile (estilo recorte), com friso dourado.
  box(ctx, x, y, isCorner ? 0.5 : x === room.x0 ? 0.18 : 0.5, isCorner ? 0.5 : y === room.y0 ? 0.18 : 0.5, WALL_H, shade(col, 25), 0, col, shade(col, -25));
  box(ctx, x, y, isCorner ? 0.5 : x === room.x0 ? 0.18 : 0.5, isCorner ? 0.5 : y === room.y0 ? 0.18 : 0.5, 3, "#A77C34", WALL_H);
}

export function drawFlat(ctx: Ctx, it: Furniture, t: number) {
  if (it.kind === "rug") {
    diamond(ctx, it.x, it.y, it.color ?? "#6a2f5a", "#F1C66A", 0.9);
    diamond(ctx, it.x, it.y, shade(it.color ?? "#6a2f5a", 20), undefined, 0.55);
  } else if (it.kind === "mat") {
    diamond(ctx, it.x, it.y, "#2d6b8a", "#59A9F8", 0.8);
  } else if (it.kind === "flowers") {
    const [sx, sy] = P(it.x, it.y);
    const cols = ["#F16D75", "#F1C66A", "#E78FC0", "#A875F5"];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = "#3d7a42";
      ctx.fillRect(sx - 14 + i * 4, sy - 2 + (i % 2) * 4, 2, 4);
      ctx.fillStyle = cols[i % 4]!;
      ctx.fillRect(sx - 15 + i * 4, sy - 5 + (i % 2) * 4 + Math.round(Math.sin(t / 600 + i)), 4, 3);
    }
  }
}

export function drawFurniture(ctx: Ctx, it: Furniture, t: number) {
  const { x, y } = it;
  const [sx, sy] = P(x, y);
  switch (it.kind) {
    case "shelf": {
      box(ctx, x, y, 0.42, 0.22, 58, "#6e4a2e");
      const cols = ["#A875F5", "#59A9F8", "#F16D75", "#4FD49A", "#F1C66A"];
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = cols[(i + row + x) % 5]!;
          const bx = sx - 20 + i * 5;
          ctx.fillRect(bx, sy + 2 - 14 - row * 16 + i * 2.6 - 10, 4, 10);
        }
      break;
    }
    case "desk":
      box(ctx, x, y, 0.42, 0.28, 20, "#8a5d3b");
      box(ctx, x - 0.15, y, 0.12, 0.1, 6, "#f3e7c9", 20);
      break;
    case "pcdesk": {
      box(ctx, x, y, 0.42, 0.28, 20, "#5a3f2c");
      box(ctx, x, y - 0.12, 0.26, 0.04, 18, "#141a2c", 22);
      const glow = 40 + Math.round(Math.sin(t / 900 + x) * 15);
      ctx.fillStyle = `rgba(89,169,248,${glow / 100})`;
      ctx.fillRect(sx - 12, sy - 50, 22, 10);
      box(ctx, x + 0.05, y + 0.1, 0.16, 0.06, 2, "#2a3046", 20);
      break;
    }
    case "lamp":
      box(ctx, x, y, 0.06, 0.06, 40, "#3b3b46");
      box(ctx, x, y, 0.2, 0.2, 10, "#F1C66A", 40, "#d9a648", "#b5862f");
      break;
    case "armchair":
      box(ctx, x, y, 0.36, 0.36, 16, "#6b3fa0");
      box(ctx, x, y - 0.3, 0.36, 0.08, 30, "#5a3389");
      break;
    case "board":
      box(ctx, x, y - 0.3, 0.45, 0.06, 44, "#7a5230", 6);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ["#f3e7c9", "#F1C66A", "#e8d3a8", "#f3e7c9"][i]!;
        ctx.fillRect(sx - 22 + i * 11, sy - 46 + (i % 2) * 10 + i * 2, 8, 9);
      }
      break;
    case "banner":
      box(ctx, x, y - 0.3, 0.04, 0.04, 64, "#3b3b46");
      ctx.fillStyle = "#9e2b2b";
      ctx.fillRect(sx - 2, sy - 76, 20, 32);
      ctx.fillStyle = "#F1C66A";
      ctx.fillRect(sx + 5, sy - 66, 6, 6);
      break;
    case "table":
      box(ctx, x, y, 0.44, 0.44, 22, "#7a5230");
      if (it.room === "guilda") {
        ctx.fillStyle = "#f3e7c9";
        ctx.fillRect(sx - 8, sy - 26, 14, 5);
      }
      break;
    case "chest":
      box(ctx, x, y, 0.32, 0.24, 20, "#7a4a28");
      box(ctx, x, y, 0.34, 0.26, 3, "#F1C66A", 12);
      break;
    case "treadmill":
      box(ctx, x, y, 0.22, 0.42, 8, "#26272e");
      box(ctx, x, y - 0.38, 0.22, 0.04, 34, "#555b66");
      break;
    case "bench":
      box(ctx, x, y, 0.16, 0.42, 14, "#26272e");
      box(ctx, x, y, 0.45, 0.04, 2, "#9aa3b5", 30);
      break;
    case "dumbbells":
      box(ctx, x, y, 0.38, 0.18, 26, "#3b3e48");
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#111";
        ctx.fillRect(sx - 18 + i * 12, sy - 22 - i * 3, 9, 5);
      }
      break;
    case "bag":
      box(ctx, x, y, 0.04, 0.04, 70, "#666");
      box(ctx, x, y, 0.16, 0.16, 34, "#a52b2b", 18);
      break;
    case "bed":
      box(ctx, x, y, 0.45, 0.45, 14, "#6e4a2e");
      box(ctx, x, y + 0.08, 0.43, 0.36, 4, "#3a4f9a", 14);
      if (x % 2 === 0) box(ctx, x, y - 0.3, 0.3, 0.12, 4, "#f3f4fa", 16);
      break;
    case "sofa":
      box(ctx, x, y, 0.45, 0.32, 14, "#2f7a7a");
      box(ctx, x, y + 0.26, 0.45, 0.08, 28, "#276565");
      break;
    case "pot":
      box(ctx, x, y, 0.14, 0.14, 12, "#8a4a2a");
      ctx.fillStyle = "#3f9a4a";
      ctx.beginPath();
      ctx.arc(sx, sy - 24, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "tree": {
      box(ctx, x, y, 0.08, 0.08, 34, "#5a3a22");
      const pink = (x + y) % 2 === 1;
      const c1 = pink ? "#e98ab8" : "#3f8a3f";
      const c2 = pink ? "#f5b3d2" : "#5aae55";
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.arc(sx, sy - 52, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.arc(sx - 8, sy - 60, 14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "parkbench":
      box(ctx, x, y, 0.42, 0.16, 10, "#8a5d3b");
      box(ctx, x, y - 0.14, 0.42, 0.04, 22, "#7a5230");
      break;
    case "crystal": {
      if (it.id !== "pra-crystal") break;
      // Fonte + cristal ocupam o bloco 2×2 (14..15)
      const cx = x + 0.5;
      const cy = y + 0.5;
      box(ctx, cx, cy, 0.95, 0.95, 10, "#9b958a");
      box(ctx, cx, cy, 0.75, 0.75, 4, "#3f7fc0", 10);
      const [ox, oy] = P(cx, cy);
      const bob = Math.sin(t / 600) * 4;
      const grad = ctx.createLinearGradient(ox, oy - 90, ox, oy - 20);
      grad.addColorStop(0, "#e6d4ff");
      grad.addColorStop(1, "#7a4fd6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ox, oy - 96 + bob);
      ctx.lineTo(ox + 16, oy - 60 + bob);
      ctx.lineTo(ox, oy - 26 + bob);
      ctx.lineTo(ox - 16, oy - 60 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#f3eaff";
      ctx.stroke();
      break;
    }
    case "server": {
      box(ctx, x, y, 0.26, 0.26, 52, "#1a2032");
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = Math.floor(t / 400 + i) % 3 === 0 ? "#4FD49A" : "#59A9F8";
        ctx.fillRect(sx - 12, sy - 46 + i * 9, 3, 2);
      }
      break;
    }
    case "lantern":
      box(ctx, x, y, 0.05, 0.05, 44, "#2a2a33");
      box(ctx, x, y, 0.12, 0.12, 12, "#F1C66A", 44, "#e0a84a", "#b5862f");
      break;
    default:
      break;
  }
}

/** Planta de hábito: estágio pela sequência; flores quando concluído hoje. */
export function drawPlant(ctx: Ctx, x: number, y: number, stage: number, done: boolean, t: number) {
  const [sx, sy] = P(x, y);
  box(ctx, x, y, 0.18, 0.18, 8, "#6b4426");
  const h = [8, 16, 24, 32, 46][stage] ?? 8;
  ctx.fillStyle = "#2f7a33";
  ctx.fillRect(sx - 1, sy - 8 - h, 3, h);
  const r = [4, 7, 10, 13, 18][stage] ?? 4;
  ctx.fillStyle = stage >= 3 ? "#3f9a4a" : "#4caf50";
  ctx.beginPath();
  ctx.arc(sx, sy - 10 - h, r, 0, Math.PI * 2);
  ctx.fill();
  if (done) {
    const cols = ["#F16D75", "#F1C66A", "#E78FC0"];
    for (let i = 0; i < 3 + stage; i++) {
      const ang = i * 2.1 + t / 2000;
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

export { P as isoPoint, TILE_W, TILE_H };
