/**
 * Sprites em pixel art gerados por código (sem imagens de terceiros, sem emojis).
 * Cada pose é desenhada pixel a pixel num canvas 32×46 (+1 px de contorno) e
 * guardada em cache; o renderizador amplia sem suavização.
 *
 * Proporção "chibi" de RPG clássico (cabeça grande, corpo compacto) e luz
 * vindo de cima/esquerda: cada peça tem tom claro, base e sombra. Todas as
 * peças (cabelo, barba, roupa, chapéu, item na mão) são combináveis — ver
 * looks.ts para a lista de opções.
 */
import type { CharacterLook } from "./looks";

/** Área de desenho 32×46 + 1 px de contorno em volta. */
export const SPRITE_W = 34;
export const SPRITE_H = 48;

export type Pose = "stand" | "walk" | "sit" | "typing" | "reading" | "exercise" | "celebrate" | "interact" | "think" | "talk";

export type Look = CharacterLook;

const cache = new Map<string, HTMLCanvasElement>();
/** Chave de cache por objeto de visual (evita serializar a cada quadro). */
const lookKeys = new WeakMap<Look, string>();

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Mistura duas cores (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((c(r1!, r2!) << 16) | (c(g1!, g2!) << 8) | c(b1!, b2!)).toString(16).padStart(6, "0")}`;
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** Três tons de uma cor: luz, base, sombra (+ linha de contorno interna). */
const tones = (c: string) => ({ hi: shade(c, 34), base: c, lo: shade(c, -38), ink: shade(c, -80) });

const STEEL = "#AEB8C8";
const GOLD = "#F1C66A";
const WOOD = "#8A5D3B";
const INK = "#160f22";

/** Retângulo com coluna clara à esquerda e escura à direita (volume). */
function vol(px: Px, x: number, y: number, w: number, h: number, c: string) {
  const t = tones(c);
  px(x, y, w, h, t.base);
  if (w >= 3) {
    px(x, y, 1, h, t.hi);
    px(x + w - 1, y, 1, h, t.lo);
  }
}

interface Frame {
  pose: Pose;
  frame: number;
  back: boolean;
  /** Deslocamento vertical do corpo (sentado/pulo). */
  dy: number;
  sitting: boolean;
}

/* ───────────────────────── Corpo ───────────────────────── */

function drawCapeBack(px: Px, L: Look, f: Frame) {
  if (!L.cape) return;
  const t = tones(L.cape);
  const sway = f.pose === "walk" ? [0, 1, 0, -1][f.frame % 4]! : 0;
  const bottom = f.sitting ? 37 : 41;
  if (f.back) {
    // capa inteira cobrindo as costas, com dobras
    px(9, 23 + f.dy, 14, bottom - 23 - f.dy, t.base);
    px(9, 23 + f.dy, 2, bottom - 23 - f.dy, t.hi);
    px(21, 23 + f.dy, 2, bottom - 23 - f.dy, t.lo);
    for (const x of [13, 17]) px(x, 27 + f.dy, 1, bottom - 28 - f.dy, t.lo);
    px(9 + Math.max(0, sway), bottom, 14, 1, t.lo);
    px(8, bottom - 1 + (sway > 0 ? 0 : 1), 1, 2, t.lo);
  } else {
    // bordas da capa aparecem dos dois lados, atrás dos braços
    px(6, 24 + f.dy, 2, bottom - 26 - f.dy + Math.abs(sway), t.lo);
    px(24, 24 + f.dy, 2, bottom - 26 - f.dy + Math.abs(sway), t.ink);
  }
}

function drawLegs(px: Px, L: Look, f: Frame) {
  const p = tones(L.pants);
  const b = tones(L.boots);
  if (f.sitting) {
    // pernas dobradas vistas de frente: joelhos + canelas curtas
    px(10, 36 + 0, 12, 3, p.base);
    px(10, 36, 12, 1, p.hi);
    px(15, 36, 2, 3, p.lo);
    px(11, 39, 4, 2, p.lo);
    px(17, 39, 4, 2, p.lo);
    px(10, 41, 5, 3, b.base);
    px(17, 41, 5, 3, b.base);
    px(10, 43, 5, 1, b.ink);
    px(17, 43, 5, 1, b.ink);
    return;
  }
  const step = f.pose === "walk" ? [0, 1, 0, -1][f.frame % 4]! : 0;
  const upL = Math.max(0, step);
  const upR = Math.max(0, -step);
  // quadril
  px(11, 35 + f.dy, 10, 2, p.base);
  // perna esquerda (mais iluminada)
  px(11, 35 + f.dy, 4, 7 - upL, p.base);
  px(11, 35 + f.dy, 1, 7 - upL, p.hi);
  px(14, 37 + f.dy, 1, 5 - upL, p.lo);
  // perna direita (na sombra)
  px(17, 35 + f.dy, 4, 7 - upR, p.lo);
  px(20, 35 + f.dy, 1, 7 - upR, p.ink);
  px(15, 37 + f.dy, 2, 1, p.ink);
  // botas com sola e brilho
  const boot = (x: number, up: number, dark: boolean) => {
    const y = 42 + f.dy - up;
    px(x, y, 5, 3, dark ? b.lo : b.base);
    px(x, y, 5, 1, dark ? b.base : b.hi);
    px(x, y + 3, 5, 1, b.ink);
  };
  boot(10, upL, false);
  boot(17, upR, true);
}

function drawTorso(px: Px, L: Look, f: Frame) {
  const s = tones(L.shirt);
  const tr = tones(L.trim);
  const y = 23 + f.dy;
  const sk = tones(L.skin);
  // ombros arredondados + tronco
  px(11, y, 10, 1, s.base);
  px(10, y + 1, 12, 11, s.base);
  px(10, y + 1, 1, 11, s.hi);
  px(21, y + 1, 1, 11, s.lo);
  px(20, y + 2, 1, 10, s.lo);
  px(11, y, 3, 1, s.hi);

  switch (L.outfit) {
    case "tunica": {
      if (!f.back) {
        px(15, y, 2, 3, sk.base);
        px(15, y + 3, 2, 1, sk.lo);
        px(14, y, 1, 3, tr.base);
        px(17, y, 1, 3, tr.base);
      }
      // saia da túnica sobre o quadril
      if (!f.sitting) {
        px(10, y + 12, 12, 2, s.base);
        px(10, y + 12, 1, 2, s.hi);
        px(21, y + 12, 1, 2, s.lo);
        px(10, y + 13, 12, 1, s.lo);
        px(13, y + 13, 1, 1, s.ink);
        px(18, y + 13, 1, 1, s.ink);
      }
      belt(px, L, y + 9, f.back);
      break;
    }
    case "gibao": {
      if (!f.back) {
        // gola branca franzida + botões dourados + bordado
        px(12, y - 1, 8, 2, "#EFE9DA");
        px(12, y, 8, 1, "#C9C1AE");
        for (const by of [3, 5, 7, 9]) px(15, y + by, 2, 1, GOLD);
        px(11, y + 3, 1, 7, tr.base);
        px(20, y + 3, 1, 7, tr.lo);
      }
      // mangas bufantes
      px(8, y + 1, 3, 3, s.hi);
      px(21, y + 1, 3, 3, s.lo);
      px(10, y + 11, 12, 1, tr.base);
      belt(px, L, y + 10, f.back);
      break;
    }
    case "armadura": {
      const m = tones(STEEL);
      px(10, y + 1, 12, 10, m.base);
      px(10, y + 1, 1, 10, m.hi);
      px(21, y + 1, 1, 10, m.lo);
      if (!f.back) {
        px(12, y + 2, 3, 3, m.hi);
        px(15, y + 2, 2, 8, m.lo);
        // tabardo com a cor da roupa
        px(13, y + 5, 6, 8, s.base);
        px(13, y + 5, 1, 8, s.hi);
        px(18, y + 5, 1, 8, s.lo);
        px(15, y + 7, 2, 3, tr.base);
      }
      // ombreiras
      px(7, y, 4, 3, m.base);
      px(7, y, 4, 1, m.hi);
      px(21, y, 4, 3, m.lo);
      px(21, y, 4, 1, m.base);
      belt(px, L, y + 11, f.back);
      break;
    }
    case "manto": {
      // túnica longa até os tornozelos, alargando embaixo
      const bottom = f.sitting ? 39 : 42 + f.dy;
      for (let yy = y + 11; yy < bottom; yy++) {
        const spread = Math.floor((yy - (y + 11)) / 4);
        px(10 - spread, yy, 12 + spread * 2, 1, s.base);
        px(10 - spread, yy, 1, 1, s.hi);
        px(21 + spread, yy, 1, 1, s.lo);
      }
      px(15, y + 2, 2, bottom - y - 2, tr.base);
      px(16, y + 2, 1, bottom - y - 2, tr.lo);
      const spreadB = Math.floor((bottom - 1 - (y + 11)) / 4);
      px(10 - spreadB, bottom - 1, 12 + spreadB * 2, 1, tr.base);
      if (!f.back) {
        px(13, y, 6, 2, tr.base);
        px(14, y + 1, 4, 1, sk.lo);
      }
      for (const x of [12, 19]) px(x, y + 13, 1, Math.max(0, bottom - y - 15), s.lo);
      break;
    }
    case "vestido": {
      if (!f.back) {
        px(13, y, 6, 2, sk.base);
        px(13, y + 2, 6, 1, tr.base);
      }
      px(10, y + 8, 12, 2, tr.base);
      px(10, y + 9, 12, 1, tr.lo);
      const bottom = f.sitting ? 39 : 41 + f.dy;
      for (let yy = y + 10; yy < bottom; yy++) {
        const spread = Math.min(3, Math.floor((yy - (y + 10)) / 3));
        px(10 - spread, yy, 12 + spread * 2, 1, s.base);
        px(10 - spread, yy, 1, 1, s.hi);
        px(21 + spread, yy, 1, 1, s.lo);
      }
      for (const x of [13, 16, 19]) px(x, y + 12, 1, Math.max(0, bottom - y - 13), s.lo);
      px(7, bottom - 1, 18, 1, s.lo);
      break;
    }
    case "avental": {
      if (!f.back) {
        px(15, y, 2, 2, sk.base);
        // avental de couro/pano com bolso e alças
        px(11, y + 3, 10, 13, tr.base);
        px(11, y + 3, 1, 13, tr.hi);
        px(20, y + 3, 1, 13, tr.lo);
        px(12, y, 1, 3, tr.lo);
        px(19, y, 1, 3, tr.lo);
        px(13, y + 9, 6, 3, tr.lo);
        px(13, y + 9, 6, 1, tr.ink);
        px(11, y + 15, 10, 1, tr.ink);
      } else {
        px(10, y + 9, 12, 1, tr.lo);
        px(15, y + 9, 2, 3, tr.base);
      }
      break;
    }
  }
}

function belt(px: Px, L: Look, y: number, back: boolean) {
  px(10, y, 12, 2, "#3A2614");
  px(10, y, 12, 1, "#5A3A22");
  if (!back) {
    px(15, y, 2, 2, GOLD);
    px(15, y, 1, 1, "#FFF1B8");
  }
  // bolsinha na cintura
  if (L.outfit !== "armadura") px(19, y + 1, 2, 2, "#6B4A2A");
}

/* ───────────────────────── Braços e itens ───────────────────────── */

type Hand = { x: number; y: number } | null;

function drawArms(px: Px, L: Look, f: Frame): { left: Hand; right: Hand } {
  const s = tones(L.outfit === "armadura" ? STEEL : L.shirt);
  const sk = tones(L.skin);
  const y = 24 + f.dy;
  const sleeve = L.outfit === "manto" ? 4 : 3;
  const armL = (yy: number, len = 7) => {
    px(10 - sleeve, yy, sleeve, len, s.base);
    px(10 - sleeve, yy, 1, len, s.hi);
    if (L.outfit === "manto") px(6, yy + len - 2, 4, 2, tones(L.trim).base);
    px(7, yy + len, 3, 3, sk.base);
    px(7, yy + len, 1, 3, sk.hi);
    return { x: 8, y: yy + len + 1 };
  };
  const armR = (yy: number, len = 7) => {
    px(22, yy, sleeve, len, s.lo);
    px(21 + sleeve, yy, 1, len, s.ink);
    if (L.outfit === "manto") px(22, yy + len - 2, 4, 2, tones(L.trim).lo);
    px(22, yy + len, 3, 3, sk.lo);
    return { x: 23, y: yy + len + 1 };
  };
  const raisedL = (top: number) => {
    px(6, top, 3, 10, s.base);
    px(6, top, 1, 10, s.hi);
    px(6, top - 3, 3, 3, sk.base);
    return { x: 7, y: top - 2 };
  };
  const raisedR = (top: number) => {
    px(23, top, 3, 10, s.lo);
    px(23, top - 3, 3, 3, sk.lo);
    return { x: 24, y: top - 2 };
  };
  switch (f.pose) {
    case "walk": {
      const sw = [1, 0, -1, 0][f.frame % 4]!;
      return { left: armL(y + sw), right: armR(y - sw) };
    }
    case "typing": {
      const a = f.frame % 2;
      px(7, y, 3, 4, s.base);
      px(22, y, 3, 4, s.lo);
      px(9, y + 5 + a, 4, 2, sk.base);
      px(19, y + 5 + (1 - a), 4, 2, sk.lo);
      return { left: null, right: null };
    }
    case "reading": {
      px(7, y, 3, 4, s.base);
      px(22, y, 3, 4, s.lo);
      if (!f.back) {
        // livro aberto à frente do peito
        px(10, y + 3, 12, 7, "#7A3B2E");
        px(11, y + 3, 10, 6, "#F3E7C9");
        px(16, y + 3, 1, 6, "#C9B48A");
        px(12 + (f.frame % 2) * 5, y + 5, 3, 1, "#8A7A5A");
        px(12, y + 7, 3, 1, "#8A7A5A");
        px(9, y + 8, 2, 2, sk.base);
        px(21, y + 8, 2, 2, sk.lo);
      }
      return { left: null, right: null };
    }
    case "exercise": {
      if (f.frame % 2 === 0) {
        const l = raisedL(y - 6);
        const r = raisedR(y - 6);
        px(3, l.y - 2, 10, 2, "#555B66");
        px(2, l.y - 3, 2, 4, "#3A3F48");
        px(19, r.y - 2, 10, 2, "#555B66");
        px(28, r.y - 3, 2, 4, "#3A3F48");
      } else {
        armL(y);
        armR(y);
        px(3, y + 9, 10, 2, "#555B66");
        px(19, y + 9, 10, 2, "#555B66");
      }
      return { left: null, right: null };
    }
    case "celebrate":
      return { left: raisedL(y - 7), right: raisedR(y - 7) };
    case "interact": {
      const left = armL(y);
      px(22, y + 1, 6, 3, s.lo);
      px(28, y + 1, 3, 3, sk.lo);
      return { left, right: { x: 29, y: y + 2 } };
    }
    case "talk": {
      if (f.frame % 2) {
        const left = armL(y);
        px(22, y - 3, 3, 6, s.lo);
        px(22, y - 6, 3, 3, sk.lo);
        return { left, right: null };
      }
      px(7, y - 2, 3, 5, s.base);
      px(5, y - 4, 3, 3, sk.base);
      return { left: null, right: armR(y) };
    }
    case "think": {
      const left = armL(y);
      px(22, y, 3, 4, s.lo);
      px(18, y - 3, 4, 3, sk.lo);
      return { left, right: null };
    }
    default:
      return { left: armL(y), right: armR(y) };
  }
}

function drawProp(px: Px, L: Look, f: Frame, hands: { left: Hand; right: Hand }) {
  const r = hands.right;
  const l = hands.left;
  const tr = tones(L.trim);
  switch (L.prop) {
    case "espada":
      if (r) {
        // empunhada apontando para baixo, rente ao corpo
        px(r.x - 2, r.y + 1, 5, 1, GOLD);
        px(r.x, r.y - 1, 1, 2, "#5A3A22");
        px(r.x, r.y + 2, 2, 8, "#DCE3EE");
        px(r.x + 1, r.y + 2, 1, 8, "#8E97AB");
        px(r.x, r.y + 10, 1, 1, "#8E97AB");
      } else if (!f.sitting) {
        // na bainha, na cintura
        px(20, 33 + f.dy, 2, 8, "#3A2614");
        px(19, 32 + f.dy, 4, 1, GOLD);
      }
      break;
    case "cajado": {
      const x = r ? r.x : 25;
      const top = 12 + f.dy;
      px(x, top + 4, 2, 44 - top - 4, WOOD);
      px(x, top + 4, 1, 44 - top - 4, shade(WOOD, 25));
      px(x - 1, top + 2, 4, 2, WOOD);
      // orbe com brilho
      px(x - 1, top - 1, 4, 3, tr.base);
      px(x - 1, top - 1, 2, 1, "#FFFFFF");
      px(x + 2, top + 1, 1, 1, tr.lo);
      break;
    }
    case "livro":
      if (l && !f.back) {
        px(l.x - 2, l.y - 4, 5, 6, "#7A3B2E");
        px(l.x - 2, l.y - 4, 5, 1, "#9A5B3E");
        px(l.x + 2, l.y - 3, 1, 4, "#F3E7C9");
        px(l.x - 1, l.y - 2, 2, 1, GOLD);
      }
      break;
    case "pena":
      if (r) {
        px(r.x, r.y - 6, 1, 6, "#EFE9DA");
        px(r.x + 1, r.y - 7, 1, 5, "#D8D0BE");
        px(r.x - 1, r.y - 5, 1, 3, "#D8D0BE");
        px(r.x, r.y, 1, 1, INK);
      }
      break;
    case "regador":
      if (r) {
        px(r.x - 1, r.y + 1, 5, 4, "#5E8A6A");
        px(r.x - 1, r.y + 1, 5, 1, "#7FB08C");
        px(r.x + 4, r.y + 1, 3, 1, "#5E8A6A");
        px(r.x + 6, r.y, 1, 1, "#9FD0E8");
        px(r.x, r.y - 1, 3, 1, "#3F5A48");
      }
      break;
    case "lanterna":
      if (r) {
        px(r.x, r.y, 1, 2, "#3A3F48");
        px(r.x - 1, r.y + 2, 3, 4, "#3A3F48");
        px(r.x, r.y + 3, 1, 2, f.frame % 2 ? "#FFE08A" : "#FFC24A");
        px(r.x - 1, r.y + 6, 3, 1, "#2A2F38");
      }
      break;
    case "pergaminho":
      if (r && !f.back) {
        px(r.x - 3, r.y - 2, 6, 3, "#F3E7C9");
        px(r.x - 3, r.y - 2, 1, 3, "#C9B48A");
        px(r.x + 2, r.y - 2, 1, 3, "#C9B48A");
        px(r.x - 1, r.y - 1, 2, 1, "#C8423B");
      }
      break;
    case "escudo":
      if (l && !f.sitting) {
        const x = 3;
        const y = 26 + f.dy;
        px(x, y, 7, 9, tr.base);
        px(x, y, 7, 1, tr.hi);
        px(x + 1, y + 9, 5, 1, tr.base);
        px(x + 2, y + 10, 3, 1, tr.lo);
        px(x + 6, y + 1, 1, 8, tr.lo);
        px(x + 2, y + 3, 3, 3, GOLD);
        px(x + 3, y + 4, 1, 1, "#FFF1B8");
      }
      break;
  }
}

/* ───────────────────────── Cabeça ───────────────────────── */

function headRows(px: Px, y: number, c: string) {
  px(11, y, 10, 1, c);
  px(10, y + 1, 12, 1, c);
  px(9, y + 2, 14, 9, c);
  px(10, y + 11, 12, 1, c);
  px(11, y + 12, 10, 1, c);
}

function drawHead(px: Px, L: Look, f: Frame) {
  const bob = f.pose === "stand" && f.frame % 6 >= 3 ? 1 : 0;
  const hy = 9 + f.dy + bob;
  const sk = tones(L.skin);
  // pescoço
  px(14, hy + 13, 4, 1, sk.lo);
  // cabeça com volume
  headRows(px, hy, sk.base);
  px(10, hy + 2, 1, 8, sk.hi);
  px(22, hy + 2, 1, 9, sk.lo);
  px(21, hy + 9, 1, 2, sk.lo);
  px(11, hy + 12, 10, 1, sk.lo);
  // orelhas
  px(8, hy + 6, 1, 3, sk.base);
  px(23, hy + 6, 1, 3, sk.lo);

  if (!f.back) {
    const blink = f.pose === "stand" && f.frame % 6 === 5;
    const look = f.pose === "think" ? 1 : 0;
    // sobrancelhas
    px(11, hy + 5, 3, 1, shade(L.hair, -25));
    px(18, hy + 5, 3, 1, shade(L.hair, -25));
    if (blink) {
      px(11, hy + 7, 3, 1, INK);
      px(18, hy + 7, 3, 1, INK);
    } else {
      // olhos: branco + íris + brilho
      px(11, hy + 6, 3, 3, "#FFFFFF");
      px(18, hy + 6, 3, 3, "#FFFFFF");
      px(12 + look, hy + 6, 2, 3, L.eyes);
      px(18 + look, hy + 6, 2, 3, L.eyes);
      px(12 + look, hy + 8, 2, 1, shade(L.eyes, -50));
      px(18 + look, hy + 8, 2, 1, shade(L.eyes, -50));
      px(13 + look, hy + 6, 1, 1, "#FFFFFF");
      px(19 + look, hy + 6, 1, 1, "#FFFFFF");
      px(11, hy + 6, 3, 1, INK);
      px(18, hy + 6, 3, 1, INK);
    }
    // nariz, bochechas, boca
    px(16, hy + 9, 1, 1, sk.lo);
    px(15, hy + 8, 1, 1, sk.hi);
    px(10, hy + 9, 2, 1, mix(L.skin, "#E06070", 0.35));
    px(21, hy + 9, 2, 1, mix(L.skin, "#E06070", 0.35));
    const talking = f.pose === "talk" && f.frame % 2 === 0;
    const happy = f.pose === "celebrate";
    if (talking || happy) {
      px(14, hy + 10, 4, 2, "#5A2028");
      px(15, hy + 11, 2, 1, "#E06070");
    } else {
      px(15, hy + 11, 3, 1, shade(L.skin, -70));
      px(18, hy + 10, 1, 1, shade(L.skin, -45));
    }
    if (L.glasses) {
      const g = "#2A2430";
      for (const gx of [10, 17]) {
        px(gx, hy + 5, 5, 1, g);
        px(gx, hy + 9, 5, 1, g);
        px(gx, hy + 6, 1, 3, g);
        px(gx + 4, hy + 6, 1, 3, g);
        px(gx + 1, hy + 6, 1, 1, "#E8F4FF");
      }
      px(15, hy + 6, 2, 1, g);
    }
  }

  drawBeard(px, L, f, hy);
  drawHair(px, L, f, hy);
  drawHat(px, L, f, hy);
}

function drawBeard(px: Px, L: Look, f: Frame, hy: number) {
  if (L.beard === "nenhuma" || f.back) return;
  const h = tones(L.hair);
  switch (L.beard) {
    case "bigode":
      px(13, hy + 9, 6, 1, h.base);
      px(12, hy + 10, 2, 1, h.lo);
      px(18, hy + 10, 2, 1, h.lo);
      break;
    case "cavanhaque":
      px(14, hy + 9, 4, 1, h.base);
      px(14, hy + 12, 4, 2, h.base);
      px(15, hy + 14, 2, 1, h.lo);
      break;
    case "cheia":
      px(9, hy + 7, 2, 5, h.base);
      px(21, hy + 7, 2, 5, h.lo);
      px(10, hy + 11, 12, 3, h.base);
      px(11, hy + 14, 10, 2, h.base);
      px(13, hy + 16, 6, 1, h.lo);
      px(12, hy + 9, 8, 1, h.base);
      px(14, hy + 10, 4, 1, shade(L.skin, -70));
      px(12, hy + 13, 1, 2, h.hi);
      px(19, hy + 12, 1, 3, h.lo);
      break;
  }
}

function drawHair(px: Px, L: Look, f: Frame, hy: number) {
  const h = tones(L.hair);
  const st = L.hairStyle;
  // Chapéus que cobrem a cabeça escondem a maior parte do cabelo.
  const covered = L.hat === "capuz" || L.hat === "elmo";
  if (st === "careca") {
    if (!covered) px(12, hy + 1, 3, 1, shade(L.skin, 40));
    return;
  }
  if (f.back) {
    if (!covered) {
      headRows(px, hy - 1, h.base);
      px(9, hy + 1, 14, 10, h.base);
      px(9, hy + 1, 1, 10, h.hi);
      px(22, hy + 1, 1, 10, h.lo);
      // mechas: alternância curta de luz e sombra (sem listras retas)
      for (const [x, y, len] of [[11, hy + 2, 5], [14, hy + 4, 6], [17, hy + 3, 5], [20, hy + 2, 6]] as const) px(x, y, 1, len, h.lo);
      for (const [x, y] of [[12, hy], [16, hy], [13, hy + 1]] as const) px(x, y, 2, 1, h.hi);
      px(10, hy + 10, 12, 1, h.lo);
    }
    if (st === "longo" || st === "trancas") px(9, hy + 10, 14, 7, h.base);
    if (st === "longo") px(10, hy + 17, 12, 1, h.lo);
    if (st === "rabo") {
      px(14, hy + 10, 4, 9, h.base);
      px(15, hy + 19, 2, 2, h.lo);
      px(14, hy + 10, 4, 1, tones(L.trim).base);
    }
    if (st === "coque") {
      px(13, hy - 4, 6, 5, h.base);
      px(13, hy - 4, 6, 1, h.hi);
    }
    if (st === "cacheado") for (const [x, y] of [[8, hy + 2], [23, hy + 3], [8, hy + 7], [23, hy + 8]] as const) px(x, y, 2, 3, h.base);
    return;
  }
  if (covered) {
    // só a franja aparece
    px(11, hy + 3, 10, 2, h.base);
    px(11, hy + 4, 10, 1, h.lo);
    return;
  }
  // Base: topo da cabeça + franja + costeletas
  const base = () => {
    px(11, hy - 1, 10, 1, h.base);
    px(10, hy, 12, 1, h.base);
    px(9, hy + 1, 14, 3, h.base);
    px(11, hy - 1, 4, 1, h.hi);
    px(10, hy, 3, 1, h.hi);
    px(22, hy + 1, 1, 3, h.lo);
    // franja em mechas
    px(10, hy + 4, 4, 1, h.base);
    px(15, hy + 4, 3, 1, h.base);
    px(19, hy + 4, 3, 1, h.lo);
    px(9, hy + 4, 1, 4, h.base);
    px(22, hy + 4, 1, 4, h.lo);
    px(13, hy + 2, 1, 2, h.lo);
    px(18, hy + 2, 1, 2, h.lo);
  };
  switch (st) {
    case "curto":
      base();
      break;
    case "longo":
      base();
      px(7, hy + 2, 3, 16, h.base);
      px(7, hy + 2, 1, 16, h.hi);
      px(22, hy + 2, 3, 16, h.lo);
      px(24, hy + 3, 1, 15, h.ink);
      px(8, hy + 18, 2, 1, h.lo);
      px(22, hy + 18, 2, 1, h.ink);
      break;
    case "rabo":
      base();
      px(23, hy + 4, 2, 6, h.lo);
      px(23, hy + 4, 2, 1, tones(L.trim).base);
      break;
    case "cacheado":
      px(9, hy - 3, 14, 3, h.base);
      px(7, hy - 1, 18, 5, h.base);
      px(7, hy + 4, 3, 8, h.base);
      px(22, hy + 4, 3, 8, h.lo);
      for (const [x, y] of [[9, hy - 3], [13, hy - 4], [17, hy - 4], [21, hy - 3], [7, hy + 1], [24, hy + 1], [7, hy + 6], [24, hy + 7]] as const) px(x, y, 2, 2, h.base);
      for (const [x, y] of [[10, hy - 1], [14, hy - 2], [18, hy - 1], [12, hy + 2], [16, hy + 1], [20, hy + 2], [8, hy + 5], [23, hy + 9]] as const) px(x, y, 1, 1, h.lo);
      for (const [x, y] of [[11, hy - 2], [15, hy - 3], [9, hy + 1]] as const) px(x, y, 1, 1, h.hi);
      px(10, hy + 4, 12, 1, h.base);
      break;
    case "moicano":
      px(13, hy - 4, 6, 7, h.base);
      px(13, hy - 4, 2, 7, h.hi);
      px(17, hy - 3, 2, 6, h.lo);
      px(9, hy + 1, 4, 2, shade(L.skin, -25));
      px(19, hy + 1, 4, 2, shade(L.skin, -35));
      px(14, hy + 3, 4, 1, h.lo);
      break;
    case "coque":
      base();
      px(13, hy - 5, 6, 5, h.base);
      px(13, hy - 5, 6, 1, h.hi);
      px(18, hy - 4, 1, 4, h.lo);
      px(13, hy - 1, 6, 1, tones(L.trim).base);
      px(20, hy - 6, 1, 4, "#C9B48A");
      break;
    case "trancas":
      base();
      for (const [x, dark] of [[7, false], [23, true]] as const) {
        for (let i = 0; i < 6; i++) {
          px(x, hy + 4 + i * 3, 2, 2, dark ? h.lo : h.base);
          px(x + (i % 2), hy + 6 + i * 3, 1, 1, h.ink);
        }
        px(x, hy + 22, 2, 1, tones(L.trim).base);
      }
      break;
  }
}

function drawHat(px: Px, L: Look, f: Frame, hy: number) {
  if (L.hat === "nenhum") return;
  const c = tones(L.hatColor);
  switch (L.hat) {
    case "capuz":
      px(9, hy - 2, 14, 3, c.base);
      px(7, hy, 18, 3, c.base);
      px(7, hy + 3, 3, 12, c.base);
      px(22, hy + 3, 3, 12, c.lo);
      px(7, hy, 2, 15, c.hi);
      px(24, hy + 1, 1, 14, c.ink);
      px(10, hy - 2, 4, 1, c.hi);
      if (f.back) px(9, hy + 2, 14, 13, c.base);
      else px(10, hy + 3, 12, 1, c.ink);
      // pala sobre os ombros
      px(8, hy + 14, 16, 2, c.lo);
      break;
    case "chapeu_mago": {
      px(4, hy + 1, 24, 2, c.base);
      px(4, hy + 1, 24, 1, c.hi);
      px(4, hy + 3, 24, 1, c.ink);
      for (let i = 0; i < 9; i++) {
        const w = 12 - i;
        const x = 10 + Math.floor(i / 2) + (i > 5 ? i - 5 : 0);
        px(x, hy - i, w, 1, c.base);
        px(x, hy - i, 1, 1, c.hi);
        px(x + w - 1, hy - i, 1, 1, c.lo);
      }
      px(20, hy - 9, 2, 1, c.base);
      px(22, hy - 8, 1, 1, c.lo);
      px(10, hy, 12, 1, GOLD);
      px(14, hy - 4, 1, 1, GOLD);
      px(13, hy - 3, 3, 1, GOLD);
      px(14, hy - 2, 1, 1, GOLD);
      break;
    }
    case "elmo": {
      const m = tones(STEEL);
      px(9, hy - 2, 14, 2, m.base);
      px(8, hy, 16, 5, m.base);
      px(8, hy, 2, 5, m.hi);
      px(22, hy, 2, 5, m.lo);
      px(10, hy - 2, 5, 1, m.hi);
      px(8, hy + 5, 2, 6, m.base);
      px(22, hy + 5, 2, 6, m.lo);
      px(8, hy + 4, 16, 1, m.ink);
      if (!f.back) px(15, hy + 4, 2, 5, m.base);
      // penacho
      px(14, hy - 6, 4, 4, c.base);
      px(13, hy - 5, 2, 2, c.hi);
      px(17, hy - 7, 2, 3, c.lo);
      break;
    }
    case "coroa": {
      const g = tones(GOLD);
      px(10, hy - 1, 12, 3, g.base);
      px(10, hy + 1, 12, 1, g.lo);
      for (const x of [10, 13, 16, 19]) px(x, hy - 3, 2, 2, g.base);
      px(21, hy - 3, 1, 2, g.lo);
      px(10, hy - 3, 1, 1, g.hi);
      px(12, hy, 1, 1, "#C8423B");
      px(15, hy, 2, 1, c.base === GOLD ? "#59A9F8" : c.base);
      px(19, hy, 1, 1, "#4FD49A");
      break;
    }
    case "bandana":
      px(9, hy + 1, 14, 3, c.base);
      px(9, hy + 1, 14, 1, c.hi);
      px(9, hy + 3, 14, 1, c.lo);
      if (!f.back) {
        px(12, hy + 2, 1, 1, "#FFFFFF");
        px(18, hy + 2, 1, 1, "#FFFFFF");
      }
      px(23, hy + 2, 2, 2, c.lo);
      px(24, hy + 4, 2, 4, c.base);
      px(23, hy + 5, 1, 3, c.lo);
      break;
    case "palha": {
      const st = tones("#E3C36A");
      px(3, hy + 1, 26, 2, st.base);
      px(3, hy + 1, 26, 1, st.hi);
      px(3, hy + 3, 26, 1, st.lo);
      px(9, hy - 4, 14, 5, st.base);
      px(9, hy - 4, 3, 5, st.hi);
      px(20, hy - 4, 3, 5, st.lo);
      px(9, hy - 1, 14, 2, c.base);
      for (const x of [6, 12, 18, 24]) px(x, hy + 2, 1, 1, st.lo);
      break;
    }
    case "boina":
      px(9, hy - 2, 13, 2, c.base);
      px(7, hy, 16, 3, c.base);
      px(7, hy, 3, 3, c.hi);
      px(20, hy, 3, 3, c.lo);
      px(9, hy + 2, 14, 1, c.ink);
      px(15, hy - 3, 2, 1, c.lo);
      break;
    case "flores": {
      const leaf = tones("#3F7A3C");
      px(9, hy + 1, 14, 2, leaf.base);
      px(9, hy + 2, 14, 1, leaf.lo);
      const flowers = [["#F16D75", 9], ["#F1C66A", 12], ["#FFFFFF", 15], [c.base, 18], ["#F16D75", 21]] as const;
      for (const [col, x] of flowers) {
        px(x, hy, 2, 2, col);
        px(x, hy, 1, 1, shade(col, 30));
        px(x + 1, hy + 1, 1, 1, shade(col, -40));
      }
      break;
    }
  }
}

/* ───────────────────────── Montagem ───────────────────────── */

function drawCharacter(px: Px, L: Look, pose: Pose, frame: number, back: boolean) {
  const sitting = pose === "sit" || pose === "typing" || pose === "reading";
  const lift = pose === "celebrate" && frame % 2 === 1 ? -2 : 0;
  const f: Frame = { pose, frame, back, dy: (sitting ? 5 : 0) + lift, sitting };
  // De frente a capa fica atrás do corpo; de costas ela cobre tronco e pernas.
  if (!back) drawCapeBack(px, L, f);
  if (L.prop === "cajado" && back) drawProp(px, L, f, { left: null, right: null });
  drawLegs(px, L, f);
  drawTorso(px, L, f);
  const hands = drawArms(px, L, f);
  if (back) drawCapeBack(px, L, f);
  // capa vista de frente: fecho dourado nos ombros
  if (L.cape && !back) {
    px(9, 23 + f.dy, 2, 2, GOLD);
    px(21, 23 + f.dy, 2, 2, shade(GOLD, -40));
    px(10, 22 + f.dy, 12, 1, L.cape);
  }
  drawHead(px, L, f);
  if (!(L.prop === "cajado" && back)) drawProp(px, L, f, hands);
}

/** Canvas com a pose pronta (em cache). `back` = de costas (NE/NW). */
export function getSprite(look: Look, pose: Pose, frame: number, back: boolean): HTMLCanvasElement {
  let lk = lookKeys.get(look);
  if (!lk) {
    lk = JSON.stringify(look);
    lookKeys.set(look, lk);
  }
  const k = `${lk}|${pose}|${frame}|${back ? 1 : 0}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext("2d")!;
  const px: Px = (x, y, w, h, col) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y + 1, w, h);
  };
  drawCharacter(px, look, pose, frame, back);
  // Contorno escuro de 1 px em volta da silhueta (leitura em qualquer fundo).
  const img = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? 0 : d[(y * SPRITE_W + x) * 4 + 3]!);
  for (let y = 0; y < SPRITE_H; y++)
    for (let x = 0; x < SPRITE_W; x++) {
      const i = (y * SPRITE_W + x) * 4;
      if (d[i + 3]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        out[i] = 22;
        out[i + 1] = 15;
        out[i + 2] = 34;
        out[i + 3] = 240;
      }
    }
  ctx.putImageData(new ImageData(out, SPRITE_W, SPRITE_H), 0, 0);
  if (cache.size > 800) cache.clear();
  cache.set(k, c);
  return c;
}

export const framesFor = (pose: Pose) => (pose === "walk" ? 4 : pose === "stand" ? 6 : 2);
export { shade };
