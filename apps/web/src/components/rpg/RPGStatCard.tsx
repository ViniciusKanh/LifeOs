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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption?: string;
  tone?: RpgTone;
  pct?: number;
  to?: string;
  action?: ReactNode;
}) {
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
