import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { ThemeCycleIcon, themeCycleLabel } from "./themeToggle";
import { RPG_LOGO } from "@/components/rpg/rpgAssets";
import { navLabel, findNavItem, type NavGroup } from "./navConfig";

/**
 * Sidebar do LifeOS: grupos recolhíveis seguindo o ciclo do produto, item
 * ativo com indicador animado (layoutId do motion desliza entre itens),
 * modo compacto só com ícones + tooltip, e rolagem própria para que o
 * rodapé (tema/recolher) nunca suma da tela.
 *
 * Preferências visuais (compacto / grupos fechados) ficam em
 * localStorage — são só conveniência de interface, nunca dado do usuário.
 */

const COLLAPSED_KEY = "lifeos.sidebar.collapsed";
const CLOSED_GROUPS_KEY = "lifeos.sidebar.closedGroups";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegação privada / storage bloqueado: a preferência só não persiste.
  }
}

/**
 * Estado compacto da sidebar. No tablet (768–1023px) ela é sempre compacta
 * — 264px expandidos esmagariam o conteúdo; no desktop, vale a preferência
 * do usuário.
 */
export function useSidebarCollapsed() {
  const [preferred, setPreferred] = useState<boolean>(() => readStorage(COLLAPSED_KEY, false));
  const [isDesktop, setIsDesktop] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () =>
    setPreferred((c) => {
      writeStorage(COLLAPSED_KEY, !c);
      return !c;
    });
  return { collapsed: !isDesktop || preferred, canToggle: isDesktop, toggle };
}

/** Lista de grupos + itens — compartilhada entre a sidebar e o menu mobile. */
export function NavGroups({
  groups,
  compact,
  onNavigate,
  layoutPrefix,
}: {
  groups: NavGroup[];
  compact: boolean;
  onNavigate?: () => void;
  layoutPrefix: string;
}) {
  const location = useLocation();
  const currentNav = findNavItem(location.pathname);
  const { isRpg } = useTheme();
  const activeGroupId = currentNav?.group.id;
  // Hubs: /signals ativa "Analytics", /capacity-planner ativa "Tarefas" etc.
  const activeTo = currentNav?.item.to;
  const [closed, setClosed] = useState<string[]>(() => readStorage(CLOSED_GROUPS_KEY, []));

  // O grupo da rota atual sempre abre — nunca esconder onde o usuário está.
  useEffect(() => {
    if (activeGroupId && closed.includes(activeGroupId)) {
      const next = closed.filter((id) => id !== activeGroupId);
      setClosed(next);
      writeStorage(CLOSED_GROUPS_KEY, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  // Tooltip do modo compacto em posição fixa: a <nav> rola (overflow-y), e
  // um tooltip absoluto dentro dela seria cortado pela borda da sidebar.
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showTooltip = (label: string, el: HTMLElement) => {
    if (!compact) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hideTooltip = () => setTooltip(null);

  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter((g) => g !== id) : [...closed, id];
    setClosed(next);
    writeStorage(CLOSED_GROUPS_KEY, next);
  };

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        const isOpen = compact || !closed.includes(group.id);
        return (
          <div key={group.id} className="mb-1">
            {compact ? (
              <div className="mx-auto my-2 h-px w-6 bg-paper-border dark:bg-ink-border rpg:bg-rpg-gold/40 first:hidden" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between px-3 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate/80 hover:text-slate transition-colors rpg:font-pixel rpg:text-[11.5px] rpg:tracking-[0.16em] rpg:text-rpg-gold rpg:hover:text-rpg-gold-light"
              >
                <span className="flex items-center gap-2">
                  {/* Losango ornamental — só no tema RPG */}
                  <span className="hidden rpg:inline-block w-1.5 h-1.5 rotate-45 bg-rpg-gold" aria-hidden />
                  {group.label}
                </span>
                <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
                  <ChevronDown size={13} />
                </motion.span>
              </button>
            )}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden flex flex-col gap-0.5"
                >
                  {group.items.map(({ to, label: baseLabel, rpgLabel, icon: Icon }) => {
                    const label = navLabel({ label: baseLabel, rpgLabel }, isRpg);
                    return (
                    <li key={to} className="relative">
                      <NavLink
                        to={to}
                        onClick={() => {
                          hideTooltip();
                          onNavigate?.();
                        }}
                        onMouseEnter={(e) => showTooltip(label, e.currentTarget)}
                        onMouseLeave={hideTooltip}
                        onFocus={(e) => showTooltip(label, e.currentTarget)}
                        onBlur={hideTooltip}
                        aria-label={compact ? label : undefined}
                        className={({ isActive: routeActive }) => {
                          const isActive = routeActive || activeTo === to;
                          return `relative flex items-center gap-3 rounded-xl text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                            compact ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2"
                          } ${isActive ? "text-brand-700 dark:text-brand-100 font-semibold rpg:text-rpg-gold-light" : "text-slate hover:text-[#1E2537] dark:hover:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.05] rpg:text-rpg-muted rpg:hover:text-rpg-text rpg:hover:bg-rpg-panel-hover/60"}`;
                        }}
                      >
                        {({ isActive: routeActive }) => {
                          const isActive = routeActive || activeTo === to;
                          return (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId={`${layoutPrefix}-active`}
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500/[0.12] to-brand-500/[0.03] dark:from-brand-500/25 dark:to-brand-500/5 ring-1 ring-brand-500/15 rpg:from-rpg-blue/55 rpg:to-rpg-purple/30 rpg:ring-2 rpg:ring-rpg-gold/80 rpg:shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                              />
                            )}
                            {isActive && !compact && (
                              <motion.span
                                layoutId={`${layoutPrefix}-rail`}
                                className="absolute -left-3 lg:-left-4 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-brand-500 to-signal rpg:from-rpg-gold-light rpg:to-rpg-gold"
                              />
                            )}
                            <Icon size={17} className="relative shrink-0" />
                            {!compact && <span className="relative truncate">{label}</span>}
                          </>
                          );
                        }}
                      </NavLink>
                    </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      <AnimatePresence>
        {compact && tooltip && (
          <motion.span
            key={tooltip.label}
            role="tooltip"
            initial={{ opacity: 0, x: -4, y: "-50%" }}
            animate={{ opacity: 1, x: 0, y: "-50%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ top: tooltip.top, left: tooltip.left }}
            className="pointer-events-none fixed z-[60] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium bg-[#1E2537] text-white shadow-lg dark:bg-white dark:text-[#1E2537]"
          >
            {tooltip.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({ groups, collapsed, canToggle, onToggle }: { groups: NavGroup[]; collapsed: boolean; canToggle: boolean; onToggle: () => void }) {
  const { mode, cycle, isRpg } = useTheme();

  return (
    <motion.aside
      animate={{ width: collapsed ? 80 : 264 }}
      transition={{ type: "spring", stiffness: 300, damping: 34 }}
      className="hidden md:flex flex-col shrink-0 h-full bg-paper-raised dark:bg-ink-raised border-r border-paper-border dark:border-ink-border z-20 relative rpg:rpg-backdrop rpg:bg-rpg-bg-2 rpg:border-r-2 rpg:border-rpg-border rpg:shadow-[inset_-1px_0_0_rgb(var(--rpg-gold)/0.35)]"
      aria-label="Navegação principal"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-aurora opacity-50 dark:opacity-30 rpg:hidden" aria-hidden />

      <div className={`relative flex items-center gap-2.5 h-16 shrink-0 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <NavLink to="/hoje" className="flex items-center gap-2.5 min-w-0" aria-label="LifeOS — ir para Hoje">
          {isRpg ? (
            <img src={RPG_LOGO.icon} alt="" width={44} height={44} className="shrink-0 w-11 h-11 object-contain drop-shadow-[0_2px_0_rgb(0_0_0/0.6)]" />
          ) : (
            <span className="relative shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-signal p-[2.5px] shadow-glow-brand">
              <img src="/logo/icon-64.png" alt="" className="w-full h-full rounded-[10px] object-cover bg-white" />
            </span>
          )}
          {!collapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="leading-tight min-w-0">
              <span className="block text-[17px] font-bold font-display tracking-tight rpg:rpg-title rpg:text-xl">LifeOS</span>
              <span className="block text-[10.5px] text-slate truncate rpg:font-pixel rpg:uppercase rpg:tracking-[0.08em] rpg:text-[9.5px] rpg:text-rpg-muted">Transforme sua rotina em progresso</span>
            </motion.span>
          )}
        </NavLink>
      </div>

      <div className="hidden rpg:block rpg-ornament-line mx-3 shrink-0" aria-hidden />

      <nav className={`relative flex-1 overflow-y-auto overflow-x-visible pb-4 ${collapsed ? "px-2" : "px-3 lg:px-4"} [scrollbar-width:thin]`}>
        <NavGroups groups={groups} compact={collapsed} layoutPrefix="sidebar" />
      </nav>

      <div className={`relative shrink-0 border-t border-paper-border dark:border-ink-border rpg:border-rpg-border p-3 flex ${collapsed ? "flex-col items-center gap-1" : "items-center gap-1"}`}>
        <button
          type="button"
          onClick={cycle}
          className={`flex items-center gap-2.5 rounded-xl text-sm text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors ${collapsed ? "w-10 h-10 justify-center" : "flex-1 px-3 py-2"}`}
          aria-label={themeCycleLabel(mode)}
          title={themeCycleLabel(mode)}
        >
          <ThemeCycleIcon mode={mode} size={17} />
          {!collapsed && <span className="truncate">{themeCycleLabel(mode)}</span>}
        </button>
        {canToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
          aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        )}
      </div>
    </motion.aside>
  );
}
