import type { ReactNode } from "react";
import clsx from "clsx";
import { RPG_TONE_SOFT, type RpgTone } from "./rpgAssets";

/** Selo curto (prioridade, status, "Missão principal"). Texto sempre presente: cor nunca é o único sinal. */
export function RPGBadge({ tone = "muted", icon, children, className }: { tone?: RpgTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-pixel font-semibold uppercase tracking-wide leading-none", RPG_TONE_SOFT[tone], className)}
      style={{ borderRadius: 2 }}
    >
      {icon}
      {children}
    </span>
  );
}
