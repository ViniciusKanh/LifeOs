import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type RPGButtonVariant = "primary" | "blue" | "secondary" | "danger" | "success" | "gold" | "ghost";

/** Botão RPG (borda de 2px, highlight superior, afunda no clique). */
export function RPGButton({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: RPGButtonVariant }) {
  return <button className={clsx("rpg-btn", `rpg-btn-${variant}`, className)} {...props} />;
}

/** Mesmas classes para quando a ação é um link (<Link className={rpgButtonClass("gold")}>). */
export function rpgButtonClass(variant: RPGButtonVariant = "primary", className?: string) {
  return clsx("rpg-btn", `rpg-btn-${variant}`, className);
}
