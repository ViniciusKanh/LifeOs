import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";

/** Cabeçalho de seção: ícone num "slot" quadrado, título dourado e ação à direita. */
export function RPGSectionHeader({
  icon,
  title,
  actions,
  action,
  parchment = false,
}: {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
  action?: { label: string; to: string };
  parchment?: boolean;
}) {
  return (
    <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
      {icon && (
        <span
          className={clsx(
            "inline-flex w-7 h-7 shrink-0 items-center justify-center border-2",
            parchment ? "border-rpg-bronze bg-rpg-ink/10 text-rpg-ink" : "border-rpg-border bg-rpg-bg text-rpg-gold-light"
          )}
          style={{ borderRadius: 3 }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <h2 className={clsx("font-pixel text-[13px] font-semibold uppercase tracking-[0.08em] truncate", parchment ? "text-rpg-ink" : "text-rpg-gold-light")}>
        {title}
      </h2>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {actions}
        {action && (
          <Link to={action.to} className={clsx("text-xs font-semibold hover:underline underline-offset-4", parchment ? "text-rpg-ink" : "text-rpg-muted hover:text-rpg-gold-light")}>
            {action.label} →
          </Link>
        )}
      </div>
    </header>
  );
}
