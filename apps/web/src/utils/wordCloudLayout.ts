/**
 * Layout da nuvem de palavras em formato de nuvem de verdade (sem
 * biblioteca): a silhueta é uma união de círculos ("bolhas") + uma base
 * arredondada; cada palavra é posicionada numa espiral a partir do centro
 * e só é aceita se couber inteira dentro da silhueta sem colidir com as
 * já colocadas. Tudo em coordenadas do viewBox — o SVG escala sozinho.
 */

export interface CloudShape {
  width: number;
  height: number;
  puffs: Array<{ cx: number; cy: number; r: number }>;
  base: { x: number; y: number; w: number; h: number; r: number };
  center: { x: number; y: number };
}

/** Nuvem larga (desktop/tablet). */
export const WIDE_CLOUD: CloudShape = {
  width: 1000,
  height: 560,
  puffs: [
    { cx: 250, cy: 330, r: 150 },
    { cx: 420, cy: 230, r: 185 },
    { cx: 620, cy: 215, r: 170 },
    { cx: 790, cy: 320, r: 140 },
    { cx: 130, cy: 410, r: 95 },
    { cx: 880, cy: 410, r: 90 },
  ],
  base: { x: 120, y: 340, w: 770, h: 170, r: 85 },
  center: { x: 510, y: 330 },
};

/** Nuvem mais alta e estreita (celular): menos palavras, letras maiores na tela. */
export const NARROW_CLOUD: CloudShape = {
  width: 600,
  height: 560,
  puffs: [
    { cx: 170, cy: 300, r: 130 },
    { cx: 300, cy: 200, r: 160 },
    { cx: 440, cy: 290, r: 135 },
    { cx: 95, cy: 400, r: 85 },
    { cx: 510, cy: 400, r: 80 },
  ],
  base: { x: 80, y: 330, w: 440, h: 170, r: 85 },
  center: { x: 300, y: 320 },
};

export interface PlacedWord<T> {
  item: T;
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Ponto dentro da silhueta, com uma margem interna para as letras não encostarem na borda. */
function insideShape(shape: CloudShape, x: number, y: number, inset: number): boolean {
  for (const p of shape.puffs) {
    const dx = x - p.cx;
    const dy = y - p.cy;
    if (dx * dx + dy * dy <= (p.r - inset) * (p.r - inset)) return true;
  }
  // Base = retângulo arredondado: distância até o "miolo" (retângulo encolhido pelo raio) <= raio.
  const b = shape.base;
  const nx = Math.max(b.x + b.r, Math.min(x, b.x + b.w - b.r));
  const ny = Math.max(b.y + b.r, Math.min(y, b.y + b.h - b.r));
  const dx = x - nx;
  const dy = y - ny;
  if (dx * dx + dy * dy <= (b.r - inset) * (b.r - inset)) return true;
  return false;
}

function boxInside(shape: CloudShape, box: Box, inset: number): boolean {
  const xs = [box.x0, (box.x0 + box.x1) / 2, box.x1];
  const ys = [box.y0, (box.y0 + box.y1) / 2, box.y1];
  for (const x of xs) for (const y of ys) if (!insideShape(shape, x, y, inset)) return false;
  return true;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Largura real do texto na fonte de exibição (canvas); cai numa estimativa se o canvas não existir. */
export function measureText(text: string, size: number, fontFamily: string): number {
  if (typeof document !== "undefined") {
    measureCtx ??= document.createElement("canvas").getContext("2d");
    if (measureCtx) {
      measureCtx.font = `700 ${size}px ${fontFamily}`;
      return measureCtx.measureText(text).width;
    }
  }
  return text.length * size * 0.58;
}

/**
 * Posiciona as palavras (já ordenadas da mais para a menos frequente).
 * Palavra que não cabe tenta de novo um pouco menor; se ainda assim não
 * couber, fica de fora — melhor do que sair da nuvem.
 */
export function layoutCloud<T>(
  shape: CloudShape,
  items: Array<{ item: T; text: string; size: number }>,
  fontFamily: string,
  gap = 6
): Array<PlacedWord<T>> {
  const placed: Array<PlacedWord<T>> = [];
  const boxes: Box[] = [];
  const inset = 10;
  const maxRadius = Math.max(shape.width, shape.height);

  for (const { item, text, size: initial } of items) {
    let size = initial;
    for (let attempt = 0; attempt < 3; attempt++, size *= 0.82) {
      const w = measureText(text, size, fontFamily) + gap;
      const h = size * 0.92 + gap;
      let done = false;
      // Espiral de Arquimedes, achatada (nuvem é mais larga do que alta).
      for (let t = 0; t < 1400 && !done; t++) {
        const angle = t * 0.32;
        const radius = t * 0.9;
        if (radius > maxRadius) break;
        const cx = shape.center.x + radius * 1.6 * Math.cos(angle);
        const cy = shape.center.y + radius * 0.85 * Math.sin(angle);
        const box = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
        if (!boxInside(shape, box, inset)) continue;
        if (boxes.some((b) => overlaps(b, box))) continue;
        boxes.push(box);
        placed.push({ item, x: cx, y: cy, size, width: w - gap, height: h - gap });
        done = true;
      }
      if (done) break;
    }
  }
  return placed;
}
