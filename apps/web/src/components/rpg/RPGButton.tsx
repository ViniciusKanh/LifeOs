import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type RPGButtonVariant = "primary" | "blue" | "pink" | "secondary" | "danger" | "success" | "gold" | "ghost";

/**
 * Classes literais (não montar `rpg-btn-${variant}`): o Tailwind só mantém no
 * CSS final as classes de @layer que aparecem escritas no código — montadas
 * por template, "gold" e "success" sumiam do build e o botão ficava sem cor.
 */
const VARIANT_CLASS: Record<RPGButtonVariant, string> = {
  primary: "rpg-btn-primary",
  blue: "rpg-btn-blue",
  pink: "rpg-btn-pink",
  secondary: "rpg-btn-secondary",
  danger: "rpg-btn-danger",
  success: "rpg-btn-success",
  gold: "rpg-btn-gold",
  ghost: "rpg-btn-ghost",
};

/** Botão RPG (borda de 2px, highlight superior, afunda no clique). */
export function RPGButton({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: RPGButtonVariant }) {
  return <button className={clsx("rpg-btn", VARIANT_CLASS[variant], className)} {...props} />;
}

/** Mesmas classes para quando a ação é um link (<Link className={rpgButtonClass("gold")}>). */
export function rpgButtonClass(variant: RPGButtonVariant = "primary", className?: string) {
  return clsx("rpg-btn", VARIANT_CLASS[variant], className);
}
