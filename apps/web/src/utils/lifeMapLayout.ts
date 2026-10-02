import type { LifeMapAreaId, LifeMapNode } from "@/types";

/**
 * Layout do Life Map em coordenadas de "mundo" (centro = 0,0). Sem
 * biblioteca de grafo: "Você" no centro, áreas numa elipse ao redor e os
 * itens de cada área em leque para fora. Depois, uma relaxação curta
 * empurra os rótulos que se sobrepõem — o mapa fica legível mesmo com
 * muitas áreas cheias, e o resultado é determinístico (não "dança").
 */

export interface MapNodeBox extends LifeMapNode {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Direção "para fora" (radianos) — usada para o leque dos itens. */
  angle: number;
  fixed: boolean;
}

export const AREA_RADIUS = 34;
export const CENTER_RADIUS = 46;
export const ITEM_HEIGHT = 30;
const ITEM_LABEL_MAX = 24;

export function itemLabel(label: string): string {
  return label.length > ITEM_LABEL_MAX ? `${label.slice(0, ITEM_LABEL_MAX - 1)}…` : label;
}

/** Largura estimada do chip do item (ícone + texto, fonte ~11.5px). */
function itemWidth(label: string): number {
  return Math.round(itemLabel(label).length * 6.6 + 44);
}

export function layoutLifeMap(nodes: LifeMapNode[], visibleAreas: LifeMapAreaId[] | "all"): MapNodeBox[] {
  const isVisible = (a: LifeMapAreaId | null) => a != null && (visibleAreas === "all" || visibleAreas.includes(a));
  const areas = nodes.filter((n) => n.kind === "area" && isVisible(n.area));
  const out: MapNodeBox[] = [];

  const center = nodes.find((n) => n.kind === "center");
  if (center) out.push({ ...center, x: 0, y: 0, w: CENTER_RADIUS * 2, h: CENTER_RADIUS * 2 + 22, angle: 0, fixed: true });

  // Elipse mais larga que alta: as telas são horizontais e os chips de texto também.
  const count = Math.max(areas.length, 1);
  const rx = count <= 2 ? 260 : 360;
  const ry = count <= 2 ? 160 : 250;

  areas.forEach((area, i) => {
    const angle = count === 1 ? -Math.PI / 2 : (i / count) * Math.PI * 2 - Math.PI / 2;
    const ax = rx * Math.cos(angle);
    const ay = ry * Math.sin(angle);
    out.push({ ...area, x: ax, y: ay, w: AREA_RADIUS * 2 + 8, h: AREA_RADIUS * 2 + 26, angle, fixed: true });

    const children = nodes.filter((n) => n.kind !== "area" && n.kind !== "center" && n.area === area.area);
    // Leque: até 3 por "fileira", fileiras cada vez mais longe da área.
    const perRow = 3;
    children.forEach((child, ci) => {
      const row = Math.floor(ci / perRow);
      const inRow = Math.min(perRow, children.length - row * perRow);
      const pos = ci % perRow;
      const spread = inRow === 1 ? 0 : (pos / (inRow - 1) - 0.5) * 1.15;
      const dist = 120 + row * 52;
      const a = angle + spread;
      const w = itemWidth(child.label);
      out.push({ ...child, x: ax + dist * Math.cos(a), y: ay + dist * Math.sin(a) * 0.85, w, h: ITEM_HEIGHT, angle: a, fixed: false });
    });
  });

  relax(out);
  return out;
}

/** Afasta caixas que se sobrepõem (itens se movem; centro e áreas ficam fixos). */
function relax(boxes: MapNodeBox[], iterations = 140, margin = 10) {
  const anchors = boxes.map((b) => ({ x: b.x, y: b.y }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.fixed && b.fixed) continue;
        const ox = (a.w + b.w) / 2 + margin - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + margin - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Empurra pelo eixo de menor sobreposição (move menos, preserva o desenho).
        const alongX = ox < oy;
        const sign = alongX ? Math.sign(b.x - a.x || 1) : Math.sign(b.y - a.y || 1);
        const amount = (alongX ? ox : oy) + 0.5;
        const share = a.fixed || b.fixed ? 1 : 0.5;
        if (!a.fixed) {
          if (alongX) a.x -= sign * amount * share;
          else a.y -= sign * amount * share;
        }
        if (!b.fixed) {
          if (alongX) b.x += sign * amount * share;
          else b.y += sign * amount * share;
        }
      }
    }
    // Mola fraca de volta à posição de origem para o leque não se desfazer.
    boxes.forEach((b, k) => {
      if (b.fixed) return;
      b.x += (anchors[k].x - b.x) * 0.02;
      b.y += (anchors[k].y - b.y) * 0.02;
    });
    if (!moved) break;
  }
}

export function boundsOf(boxes: MapNodeBox[]) {
  if (boxes.length === 0) return { x0: -100, y0: -100, x1: 100, y1: 100 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  }
  return { x0, y0, x1, y1 };
}
