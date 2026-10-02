import type { ReactNode } from "react";
import clsx from "clsx";
import { RPGSectionHeader } from "./RPGSectionHeader";

export type RPGPanelVariant = "default" | "gold" | "quest" | "danger" | "success" | "parchment" | "legendary";

const VARIANT_CLASS: Record<RPGPanelVariant, string> = {
  default: "rpg-panel",
  gold: "rpg-panel rpg-panel-gold",
  quest: "rpg-panel rpg-panel-gold",
  danger: "rpg-panel rpg-panel-danger",
  success: "rpg-panel rpg-panel-success",
  legendary: "rpg-panel rpg-panel-legendary",
  parchment: "rpg-parchment",
};

/**
 * Painel base do tema RPG. Cabeçalho opcional (ícone + título dourado +
 * ação), corpo livre e rodapé. Todas as telas RPG montam blocos com ele
 * em vez de recriar bordas e sombras.
 */
export function RPGPanel({
  title,
  icon,
  variant = "default",
  actions,
  footer,
  className,
  bodyClassName,
  children,
  as: Tag = "section",
}: {
  title?: string;
  icon?: ReactNode;
  variant?: RPGPanelVariant;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={clsx(VARIANT_CLASS[variant], "min-w-0", className)}>
      {title && <RPGSectionHeader icon={icon} title={title} actions={actions} parchment={variant === "parchment"} />}
      <div className={clsx(title ? "px-4 pb-4" : "p-4", bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-rpg-border/70 px-4 py-2.5">{footer}</div>}
    </Tag>
  );
}
