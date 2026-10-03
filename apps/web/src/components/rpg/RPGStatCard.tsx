import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { RPG_TONE_TEXT, type RpgTone } from "./rpgAssets";
import { RPGProgressBar } from "./RPGProgressBar";

/** Atributo/indicador do HUD: ícone em slot, valor grande, barra opcional. */
export function RPGStatCard({
  icon,
  label,
  value,
  caption,
  tone = "blue",
  pct,
  to,
  action,
  layout = "stack",
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption?: string;
  tone?: RpgTone;
  pct?: number;
  to?: string;
  action?: ReactNode;
  /** "wide": ícone grande à esquerda e número em destaque (KPIs de cabeçalho, ex.: Forja). */
  layout?: "stack" | "wide";
  /** Variação real (ex.: "+12%"), exibida ao lado do valor no layout "wide". */
  trend?: { text: string; up: boolean } | null;
}) {
  if (layout === "wide") {
    return (
      <div className="rpg-panel rpg-panel-gold flex items-center gap-3 p-3 sm:p-4 min-w-0 h-full">
        <span
          className={clsx("inline-flex w-12 h-12 sm:w-14 sm:h-14 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg", RPG_TONE_TEXT[tone])}
          style={{ borderRadius: 3 }}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 font-rpg text-2xl sm:text-3xl font-bold leading-none text-rpg-text tabular-nums">
            {value}
            {trend && <span className={clsx("font-pixel text-xs", trend.up ? "text-rpg-green" : "text-rpg-red")}>{trend.up ? "↑" : "↓"} {trend.text}</span>}
          </p>
          <p className="mt-1 text-sm text-rpg-text/90 truncate">{label}</p>
          {caption && <p className="text-[11px] text-rpg-muted truncate">{caption}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={clsx("inline-flex w-9 h-9 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg", RPG_TONE_TEXT[tone])} style={{ borderRadius: 3 }} aria-hidden>
          {icon}
        </span>
        <span className="font-pixel text-[11px] uppercase tracking-wide text-rpg-muted leading-tight">{label}</span>
      </div>
      <p className={clsx("mt-2.5 font-pixel font-bold text-xl leading-none tabular-nums", RPG_TONE_TEXT[tone])}>{value}</p>
      {pct !== undefined && <RPGProgressBar className="mt-2.5" tone={tone} label={label} value={pct} showLabel={false} />}
      {caption && <p className="mt-1.5 text-[11px] text-rpg-muted">{caption}</p>}
    </>
  );
  const cls = "rpg-panel block p-3.5 min-w-0 h-full";
  if (to && !action) {
    return (
      <Link to={to} className={clsx(cls, "hover:bg-rpg-panel-hover transition-colors")}>
        {body}
      </Link>
    );
  }
  return (
    <div className={cls}>
      {body}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
