import type { ReactNode } from "react";
import clsx from "clsx";
import { RPG_TONE_TEXT, type RpgTone } from "./rpgAssets";

/** Ícone da tela numa moldura dourada (cabeçalhos das telas sem personagem). */
export function RPGIconSlot({ icon, tone = "gold", size = "lg" }: { icon: ReactNode; tone?: RpgTone; size?: "md" | "lg" }) {
  return (
    <span
      className={clsx("inline-flex items-center justify-center border-2 border-rpg-gold/80 bg-rpg-bg/80 shadow-rpg", size === "lg" ? "w-12 h-12 sm:w-14 sm:h-14" : "w-10 h-10", RPG_TONE_TEXT[tone])}
      style={{ borderRadius: 4 }}
      aria-hidden
    >
      {icon}
    </span>
  );
}
