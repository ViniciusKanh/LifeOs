import clsx from "clsx";
import { RPG_TONE_TEXT, type RpgTone } from "./rpgAssets";

/** Anel de progresso segmentado (estilo medidor de RPG). Valor sempre real, 0–100. */
export function RPGProgressRing({ value, size = 96, tone = "green", label, className }: { value: number; size?: number; tone?: RpgTone; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className={clsx("relative shrink-0", RPG_TONE_TEXT[tone], className)} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r + 5} fill="none" stroke="currentColor" strokeOpacity={0} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={9} className="stroke-rpg-ink/80" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700"
        />
        {/* Marcações de 10% — dão o ar de medidor segmentado */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={9} strokeDasharray={`1.5 ${c / 20 - 1.5}`} className="stroke-rpg-ink/70" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-pixel font-bold text-2xl text-rpg-ink tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}
