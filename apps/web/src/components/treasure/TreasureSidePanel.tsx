import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Painel lateral do Tesouro. No desktop fica sempre aberto; no celular e
 * tablet vira acordeão (o cabeçalho expande/recolhe o conteúdo).
 */
export function TreasureSidePanel({
  id,
  title,
  icon,
  actions,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rpg-panel rpg-panel-gold min-w-0" aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-rpg-border/60">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex flex-1 min-w-0 items-center gap-2 text-left lg:pointer-events-none"
        >
          <span className="text-rpg-gold shrink-0" aria-hidden>
            {icon}
          </span>
          <h2 id={`${id}-title`} className="font-pixel text-xs uppercase tracking-[0.14em] text-rpg-gold truncate">
            {title}
          </h2>
          <ChevronDown size={14} className={clsx("ml-auto text-rpg-muted transition-transform lg:hidden", open && "rotate-180")} aria-hidden />
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div id={`${id}-body`} className={clsx("p-3", !open && "hidden lg:block")}>
        {children}
      </div>
    </section>
  );
}
