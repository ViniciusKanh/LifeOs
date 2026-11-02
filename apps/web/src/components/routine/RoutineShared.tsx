import clsx from "clsx";
import type { ReactNode } from "react";

/** Peças visuais compartilhadas por Hábitos, Biblioteca e Administração 3.0. */

export const R = { borderRadius: 4 } as const;
export const FIELD = "min-h-[40px] w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";
export const nf = (n: number) => n.toLocaleString("pt-BR");
export const fmtDay = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—");
export const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Anel de progresso (SVG) usado no Ritual de Hoje e na Mesa do Leitor. */
export function ProgressRing({ value, max, size = 120, label, children, tone = "green" }: { value: number; max: number; size?: number; label: string; children?: ReactNode; tone?: "green" | "purple" | "gold" }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const color = { green: "rgb(var(--rpg-green))", purple: "rgb(var(--rpg-purple))", gold: "rgb(var(--rpg-gold))" }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value} de ${max}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--rpg-border))" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeDasharray={`${c * pct} ${c}`} strokeLinecap="butt" style={{ transition: "stroke-dasharray 600ms ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Grade mensal estilo heatmap (6 semanas, segunda a domingo). */
export function HeatGrid<T extends { day: string; future: boolean }>({
  cells,
  level,
  title,
  selected,
  onSelect,
}: {
  cells: T[];
  level: (c: T) => 0 | 1 | 2 | 3 | -1;
  title: (c: T) => string;
  selected?: string | null;
  onSelect?: (day: string) => void;
}) {
  const tone = ["bg-rpg-bg-2 border-rpg-border", "bg-rpg-green/30 border-rpg-green/40", "bg-rpg-green/60 border-rpg-green/70", "bg-rpg-green border-rpg-green"];
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center font-pixel text-[9px] text-rpg-muted">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const l = level(c);
          return (
            <button
              key={c.day}
              type="button"
              disabled={c.future || !onSelect}
              onClick={() => onSelect?.(c.day)}
              title={title(c)}
              aria-label={title(c)}
              aria-pressed={selected === c.day}
              className={clsx("aspect-square min-h-[22px] border", c.future ? "border-dashed border-rpg-border/40 bg-transparent" : l === -1 ? "border-rpg-blue/50 bg-rpg-blue/20" : tone[l], selected === c.day && "outline outline-2 outline-rpg-gold")}
              style={{ borderRadius: 3 }}
            />
          );
        })}
      </div>
    </div>
  );
}
