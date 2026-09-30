import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { findNavItem, MOBILE_PRIMARY, NAV_GROUPS } from "./navConfig";
import "@/styles/mobile-nav.css";

/**
 * Navegação inferior do celular: 4 atalhos + "Módulos" (abre a gaveta com
 * todos os módulos). Cada item tem a cor do seu significado no LifeOS.
 * Quando a rota atual não é um dos 4 atalhos, "Módulos" fica ativo — o
 * indicador nunca aponta para um lugar onde o usuário não está.
 */
const ITEM_COLORS: Record<string, string> = {
  "/dashboard": "#7C4DFF",
  "/hoje": "#FF7A45",
  "/tarefas": "#2F80FF",
  "/projetos": "#12B76A",
};
const MODULES_COLOR = "#FF3D93";

export function MobileMagicNav({ onOpenModules, modulesOpen }: { onOpenModules: () => void; modulesOpen: boolean }) {
  const location = useLocation();
  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const primary = MOBILE_PRIMARY.map((to) => allItems.find((i) => i.to === to)).filter((i): i is (typeof allItems)[number] => !!i);
  const current = findNavItem(location.pathname)?.item.to;
  const primaryIndex = primary.findIndex((p) => p.to === current);
  const activeIndex = modulesOpen || primaryIndex === -1 ? primary.length : primaryIndex;
  const slots = primary.length + 1;

  return (
    <nav
      aria-label="Atalhos"
      className="magic-nav md:hidden fixed z-20 inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] h-16 rounded-2xl shadow-[0_10px_30px_-8px_rgba(30,37,55,0.25)] border border-paper-border/70 dark:border-ink-border"
    >
      <ul className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
        {primary.map(({ to, label, icon: Icon }, i) => (
          <li key={to} className="magic-nav__item relative z-[2]" data-active={i === activeIndex} style={{ ["--clr" as string]: ITEM_COLORS[to] ?? "#7C4DFF" }}>
            <Link to={to} aria-label={label} aria-current={i === activeIndex ? "page" : undefined} className="relative flex h-full w-full flex-col items-center justify-center">
              <span className="magic-nav__icon">
                <Icon size={21} />
              </span>
              <span className="magic-nav__label">{label}</span>
            </Link>
          </li>
        ))}
        <li className="magic-nav__item relative z-[2]" data-active={activeIndex === primary.length} style={{ ["--clr" as string]: MODULES_COLOR }}>
          <button type="button" onClick={onOpenModules} aria-label="Todos os módulos" aria-expanded={modulesOpen} className="relative flex h-full w-full flex-col items-center justify-center">
            <span className="magic-nav__icon">
              <Menu size={21} />
            </span>
            <span className="magic-nav__label">Módulos</span>
          </button>
        </li>
        <span aria-hidden className="magic-nav__indicator" style={{ left: `calc(${activeIndex} * (100% / ${slots}) + (100% / ${slots}) / 2 - 35px)` }} />
      </ul>
    </nav>
  );
}
