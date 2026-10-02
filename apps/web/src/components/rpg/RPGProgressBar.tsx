import clsx from "clsx";
import { RPG_TONE_BG, RPG_TONE_TEXT, type RpgTone } from "./rpgAssets";

/** Barra de status de RPG (vida/mana/XP), sempre com rótulo acessível. */
export function RPGProgressBar({
  value,
  max = 100,
  tone = "purple",
  label,
  valueLabel,
  showLabel = true,
  className,
}: {
  value: number;
  max?: number;
  tone?: RpgTone;
  label: string;
  valueLabel?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={clsx("min-w-0", className)}>
      {showLabel && (
        <div className="flex items-center justify-between gap-2 mb-1 text-[11px]">
          <span className="text-rpg-muted truncate">{label}</span>
          <span className={clsx("font-pixel font-semibold tabular-nums", RPG_TONE_TEXT[tone])}>{valueLabel ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div className="rpg-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        <span className={RPG_TONE_BG[tone]} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
