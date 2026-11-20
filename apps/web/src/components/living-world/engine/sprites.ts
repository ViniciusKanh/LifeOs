/**
 * Sprites em pixel art gerados por código (sem imagens de terceiros, sem emojis).
 * Cada pose é desenhada pixel a pixel num canvas 24×32 e guardada em cache;
 * o renderizador amplia sem suavização. Para um novo personagem, crie outro
 * `kind` em drawBody; para uma nova animação, um novo valor de Pose.
 */

export const SPRITE_W = 24;
export const SPRITE_H = 32;

export type Pose = "stand" | "walk" | "sit" | "typing" | "reading" | "exercise" | "celebrate" | "interact" | "think";

export interface Look {
  kind: "human" | "robot";
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent: string;
}

const cache = new Map<string, HTMLCanvasElement>();

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function drawHuman(px: Px, look: Look, pose: Pose, frame: number, back: boolean) {
  const sitting = pose === "sit" || pose === "typing" || pose === "reading";
  const lift = pose === "celebrate" && frame % 2 === 1 ? -2 : 0;
  const dy = (sitting ? 4 : 0) + lift;
  const outline = "#14101e";
  const shirtD = shade(look.shirt, -40);
  const pantsD = shade(look.pants, -30);
  const skinD = shade(look.skin, -35);

  // Pernas
  if (sitting) {
    px(8, 24 + dy - 4, 8, 3, look.pants);
    px(8, 27 + dy - 4, 3, 3, pantsD);
    px(13, 27 + dy - 4, 3, 3, pantsD);
    px(7, 30 + dy - 4, 4, 2, outline);
    px(13, 30 + dy - 4, 4, 2, outline);
  } else {
    const step = pose === "walk" ? [0, 1, 0, -1][frame % 4]! : 0;
    px(9, 23 + dy, 3, 7 - Math.max(0, step), look.pants);
    px(12, 23 + dy, 3, 7 - Math.max(0, -step), pantsD);
    px(8 - (step > 0 ? 1 : 0), 30 + dy - Math.max(0, step), 4, 2, outline);
    px(12 + (step < 0 ? 1 : 0), 30 + dy - Math.max(0, -step), 4, 2, outline);
  }
  // Tronco
  px(8, 14 + dy, 8, 8, look.shirt);
  px(8, 14 + dy, 1, 8, shirtD);
  px(15, 14 + dy, 1, 8, shirtD);
  px(8, 22 + dy, 8, 1, "#3a2a1a");
  if (!back) px(11, 14 + dy, 2, 2, shade(look.shirt, 30));

  // Braços
  const armL = (yy: number, hand: number) => {
    px(6, yy, 2, 4, look.shirt);
    px(6, yy + 4, 2, 2 + hand, look.skin);
  };
  const armR = (yy: number, hand: number) => {
    px(16, yy, 2, 4, shirtD);
    px(16, yy + 4, 2, 2 + hand, skinD);
  };
  switch (pose) {
    case "walk": {
      const s = [1, 0, -1, 0][frame % 4]!;
      armL(14 + dy + s, 0);
      armR(14 + dy - s, 0);
      break;
    }
    case "typing": {
      const a = frame % 2;
      px(6, 15 + dy, 2, 3, look.shirt);
      px(16, 15 + dy, 2, 3, shirtD);
      px(8, 19 + dy + a, 3, 2, look.skin);
      px(13, 19 + dy + (1 - a), 3, 2, skinD);
      break;
    }
    case "reading": {
      px(6, 15 + dy, 2, 3, look.shirt);
      px(16, 15 + dy, 2, 3, shirtD);
      if (!back) {
        px(8, 17 + dy, 8, 5, "#7a3b2e");
        px(11, 17 + dy, 2, 5, "#f3e7c9");
        px(9 + (frame % 2), 18 + dy, 1, 1, "#f3e7c9");
      }
      break;
    }
    case "exercise": {
      if (frame % 2 === 0) {
        px(6, 6 + dy, 2, 8, look.shirt);
        px(16, 6 + dy, 2, 8, shirtD);
        px(4, 4 + dy, 6, 2, "#555b66");
        px(14, 4 + dy, 6, 2, "#555b66");
      } else {
        armL(14 + dy, 0);
        armR(14 + dy, 0);
        px(4, 19 + dy, 6, 2, "#555b66");
        px(14, 19 + dy, 6, 2, "#555b66");
      }
      break;
    }
    case "celebrate":
      px(5, 7 + dy, 2, 7, look.shirt);
      px(17, 7 + dy, 2, 7, shirtD);
      px(5, 5 + dy, 2, 2, look.skin);
      px(17, 5 + dy, 2, 2, skinD);
      break;
    case "interact":
      armL(14 + dy, 0);
      px(16, 15 + dy, 4, 2, shirtD);
      px(20, 15 + dy, 2, 2, skinD);
      break;
    case "think":
      armL(14 + dy, 0);
      px(16, 15 + dy, 2, 3, shirtD);
      px(13, 12 + dy, 3, 2, skinD);
      break;
    default:
      armL(14 + dy, 0);
      armR(14 + dy, 0);
  }

  // Cabeça
  const bob = pose === "stand" && frame % 2 === 1 ? 1 : 0;
  const hy = 5 + dy + bob;
  px(11, hy + 8, 2, 1, skinD);
  px(8, hy + 1, 8, 7, look.skin);
  px(7, hy + 2, 1, 5, outline);
  px(16, hy + 2, 1, 5, outline);
  if (back) {
    px(8, hy - 1, 8, 8, look.hair);
    px(8, hy + 6, 8, 1, shade(look.hair, -20));
  } else {
    px(8, hy - 1, 8, 3, look.hair);
    px(7, hy, 1, 3, look.hair);
    px(16, hy, 1, 3, look.hair);
    const blink = pose === "stand" && frame % 6 === 5;
    px(10, hy + 4, 1, blink ? 1 : 2, outline);
    px(13, hy + 4, 1, blink ? 1 : 2, outline);
    px(11, hy + 6, 2, 1, skinD);
  }
}

function drawRobot(px: Px, look: Look, pose: Pose, frame: number, back: boolean) {
  const metal = "#cfd6e6";
  const metalD = "#8e97ab";
  const dark = "#1b2236";
  const sitting = pose === "sit" || pose === "typing" || pose === "reading";
  const lift = pose === "celebrate" && frame % 2 === 1 ? -2 : 0;
  const dy = (sitting ? 3 : 0) + lift;
  // Pernas
  if (sitting) {
    px(8, 23 + dy, 8, 3, metalD);
    px(8, 26 + dy, 3, 3, metalD);
    px(13, 26 + dy, 3, 3, metalD);
  } else {
    const step = pose === "walk" ? [0, 1, 0, -1][frame % 4]! : 0;
    px(9, 24 + dy, 2, 6 - Math.max(0, step), metalD);
    px(13, 24 + dy, 2, 6 - Math.max(0, -step), metalD);
    px(8, 30 + dy - Math.max(0, step), 4, 2, dark);
    px(12, 30 + dy - Math.max(0, -step), 4, 2, dark);
  }
  // Corpo
  px(8, 15 + dy, 8, 9, look.accent);
  px(8, 15 + dy, 1, 9, shade(look.accent, -45));
  px(15, 15 + dy, 1, 9, shade(look.accent, -45));
  if (!back) {
    px(10, 17 + dy, 4, 3, dark);
    px(11, 18 + dy, 2, 1, frame % 2 ? "#ffffff" : look.accent);
  }
  // Braços
  const arms = (raised: boolean, typing: boolean) => {
    if (raised) {
      px(5, 8 + dy, 2, 7, metal);
      px(17, 8 + dy, 2, 7, metalD);
    } else if (typing) {
      px(6, 16 + dy, 2, 3, metal);
      px(16, 16 + dy, 2, 3, metalD);
      px(8, 20 + dy + (frame % 2), 2, 2, metal);
      px(14, 20 + dy + ((frame + 1) % 2), 2, 2, metalD);
    } else {
      const s = pose === "walk" ? [1, 0, -1, 0][frame % 4]! : 0;
      px(6, 16 + dy + s, 2, 6, metal);
      px(16, 16 + dy - s, 2, 6, metalD);
    }
  };
  arms(pose === "celebrate", pose === "typing" || pose === "reading");
  // Cabeça
  const hy = 5 + dy + (pose === "stand" && frame % 2 ? 1 : 0);
  px(7, hy, 10, 9, metal);
  px(7, hy + 8, 10, 1, metalD);
  px(12, hy - 3, 1, 3, metalD);
  px(11, hy - 4, 3, 1, look.accent);
  if (!back) {
    px(8, hy + 2, 8, 4, dark);
    const blink = frame % 8 === 7;
    px(9, hy + 3, 2, blink ? 1 : 2, look.accent);
    px(13, hy + 3, 2, blink ? 1 : 2, look.accent);
  } else {
    px(9, hy + 2, 6, 3, metalD);
  }
}

/** Canvas 24×32 com a pose pronta (em cache). `back` = de costas (NE/NW). */
export function getSprite(look: Look, pose: Pose, frame: number, back: boolean): HTMLCanvasElement {
  const k = `${look.kind}|${look.skin}|${look.hair}|${look.shirt}|${look.pants}|${look.accent}|${pose}|${frame}|${back ? 1 : 0}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext("2d")!;
  const px: Px = (x, y, w, h, col) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  if (look.kind === "robot") drawRobot(px, look, pose, frame, back);
  else drawHuman(px, look, pose, frame, back);
  if (cache.size > 600) cache.clear();
  cache.set(k, c);
  return c;
}

export const framesFor = (pose: Pose) => (pose === "walk" ? 4 : pose === "stand" ? 6 : 2);
export { shade };
