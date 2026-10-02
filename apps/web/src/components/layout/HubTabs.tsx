import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import type { NavTab } from "./navConfig";

/**
 * Abas do hub atual (ex.: Analytics → Visão geral · Sinais · Previsão ·
 * Qualidade dos dados). Cada aba é uma rota de verdade: links antigos e
 * favoritos continuam funcionando.
 */
export function HubTabs({ tabs, activeTo }: { tabs: NavTab[]; activeTo: string }) {
  return (
    <div className="sticky top-0 z-20 bg-paper/85 dark:bg-ink/85 backdrop-blur border-b border-paper-border/70 dark:border-ink-border/60">
      <nav aria-label="Seções" className="flex gap-1 overflow-x-auto px-4 md:px-8 py-2">
        {tabs.map((t) => {
          const active = t.to === activeTo;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${active ? "text-brand-700 dark:text-brand-100" : "text-slate hover:text-inherit"}`}
            >
              {active && <motion.span layoutId="hub-tab" className="absolute inset-0 rounded-xl bg-white dark:bg-ink-raised shadow-sm ring-1 ring-paper-border dark:ring-ink-border" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
              <span className="relative">{t.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
