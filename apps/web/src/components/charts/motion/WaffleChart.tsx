import { useMemo, useState } from "react";
import { motion } from "motion/react";

/**
 * Waffle 10×10: parte-do-todo em 100 quadradinhos. A distribuição usa o
 * método do maior resto, então a soma dá sempre exatamente 100 e nenhuma
 * categoria com valor real some por arredondamento. Legenda com contagem
 * e % reais (a cor nunca é a única pista).
 */
export interface WaffleCategory {
  key: string;
  label: string;
  value: number;
  color: string;
}

function allocate(values: number[], cells: number): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * cells);
  const base = raw.map((r) => Math.floor(r));
  // Categoria com valor > 0 garante pelo menos 1 quadrado.
  base.forEach((b, i) => {
    if (b === 0 && values[i] > 0) base[i] = 1;
  });
  let rest = cells - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (rest > 0 && order.length > 0) {
    base[order[k % order.length].i] += 1;
    rest -= 1;
    k += 1;
  }
  while (rest < 0) {
    const maxIdx = base.indexOf(Math.max(...base));
    base[maxIdx] -= 1;
    rest += 1;
  }
  return base;
}

export function WaffleChart({ categories, caption }: { categories: WaffleCategory[]; caption?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = categories.reduce((a, c) => a + c.value, 0);
  const cells = useMemo(() => {
    const counts = allocate(categories.map((c) => c.value), 100);
    return categories.flatMap((c, i) => Array.from({ length: counts[i] }, () => c));
  }, [categories]);

  return (
    <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
      <div className="grid grid-cols-10 gap-[3px] w-full max-w-[220px] aspect-square shrink-0 mx-auto sm:mx-0" role="img" aria-label={caption ?? "Gráfico de waffle"}>
        {cells.map((c, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.3 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: (i % 10) * 0.02 + Math.floor(i / 10) * 0.035, type: "spring", stiffness: 400, damping: 22 }}
            className="rounded-[4px] transition-opacity"
            style={{ backgroundColor: c.color, opacity: active && active !== c.key ? 0.22 : 1 }}
          />
        ))}
      </div>
      <ul className="flex-1 space-y-1.5 min-w-0">
        {categories.map((c) => {
          const pct = total > 0 ? Math.round((c.value / total) * 100) : 0;
          return (
            <li key={c.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(c.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(c.key)}
                onBlur={() => setActive(null)}
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-xs flex-1 truncate">{c.label}</span>
                <span className="text-xs font-semibold">{c.value}</span>
                <span className="text-[11px] text-slate w-9 text-right">{pct}%</span>
              </button>
            </li>
          );
        })}
        {caption && <li className="text-[11px] text-slate px-2 pt-1">{caption}</li>}
      </ul>
    </div>
  );
}
