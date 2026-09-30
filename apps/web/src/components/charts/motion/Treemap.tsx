import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useElementSize } from "./useElementSize";

/**
 * Treemap (algoritmo "squarified") animado. Cada retângulo tem área
 * proporcional ao valor e SEMPRE traz rótulo direto (nome + valor) quando
 * cabe — assim a identidade nunca depende só da cor. Gap de 2px entre
 * blocos, como pede o guia de marcas.
 */
export interface TreemapItem {
  id: string;
  label: string;
  value: number;
  color: string;
  href?: string;
  detail?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

/** Squarify clássico (Bruls et al.) — devolve um retângulo por item, na mesma ordem. */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || box.w <= 0 || box.h <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const scale = (box.w * box.h) / total;
  const areas = values.map((v) => v * scale);
  const out: Rect[] = [];
  let { x, y, w, h } = box;
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j += 1;
    }
    const rowSum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const rw = rowSum / h;
      let cy = y;
      for (const a of row) {
        out.push({ x, y: cy, w: rw, h: a / rw });
        cy += a / rw;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = rowSum / w;
      let cx = x;
      for (const a of row) {
        out.push({ x: cx, y, w: a / rh, h: rh });
        cx += a / rh;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

export function Treemap({ items, height = 240, unit = "" }: { items: TreemapItem[]; height?: number; unit?: string }) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value), [items]);
  const rects = useMemo(() => squarify(sorted.map((i) => i.value), { x: 0, y: 0, w: width, h: height }), [sorted, width, height]);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const GAP = 2;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} role="list" aria-label="Distribuição em blocos proporcionais">
      {width > 0 &&
        sorted.map((item, i) => {
          const r = rects[i];
          const w = Math.max(0, r.w - GAP);
          const h = Math.max(0, r.h - GAP);
          const showLabel = w > 64 && h > 38;
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          const body = (
            <>
              <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-black/10" aria-hidden />
              {showLabel && (
                <span className="relative block p-2.5 text-white leading-tight">
                  <span className="block text-xs font-semibold truncate drop-shadow-sm">{item.label}</span>
                  <span className="block text-[11px] opacity-90">
                    {item.value}
                    {unit} · {pct}%
                  </span>
                </span>
              )}
            </>
          );
          const common = {
            className: "absolute overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
            style: { backgroundColor: item.color },
            onMouseEnter: () => setHover(item.id),
            onMouseLeave: () => setHover(null),
            onFocus: () => setHover(item.id),
            onBlur: () => setHover(null),
            "aria-label": `${item.label}: ${item.value}${unit} (${pct}%)`,
          };
          return (
            <motion.div
              key={item.id}
              role="listitem"
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              animate={{ left: r.x, top: r.y, width: w, height: h }}
              transition={{ type: "spring", stiffness: 220, damping: 28, delay: i * 0.05 }}
              className="absolute"
              style={{ left: r.x, top: r.y, width: w, height: h }}
            >
              {item.href ? (
                <Link to={item.href} {...common} style={{ ...common.style, inset: 0 }}>
                  {body}
                </Link>
              ) : (
                <div tabIndex={0} {...common} style={{ ...common.style, inset: 0 }}>
                  {body}
                </div>
              )}
            </motion.div>
          );
        })}
      {hover && (() => {
        const idx = sorted.findIndex((s) => s.id === hover);
        const item = sorted[idx];
        const r = rects[idx];
        if (!item || !r) return null;
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur px-3 py-2 shadow-card text-xs"
            style={{ left: Math.min(r.x + 8, Math.max(width - 190, 0)), top: Math.min(r.y + 8, height - 56) }}
          >
            <p className="font-semibold">{item.label}</p>
            <p className="text-slate">
              {item.value}
              {unit} · {pct}% do total
            </p>
            {item.detail && <p className="text-slate">{item.detail}</p>}
          </div>
        );
      })()}
    </div>
  );
}
