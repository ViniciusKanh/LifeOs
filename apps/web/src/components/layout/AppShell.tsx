import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Menu, Moon, SunMedium, X } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { NotificationsBell } from "./NotificationsBell";
import { ProfileMenu } from "./ProfileMenu";
import { AchievementToast } from "./AchievementToast";
import { AchievementHeaderPulse } from "./AchievementHeaderPulse";
import { OnboardingFlow } from "./OnboardingFlow";
import { DesktopGlobalSearch, MobileGlobalSearch } from "./GlobalSearch";
import { CopilotAssistant } from "./CopilotAssistant";
import { QuickCaptureButton } from "./QuickCaptureButton";
import { Sidebar, NavGroups, useSidebarCollapsed } from "./Sidebar";
import { AppFooter } from "./AppFooter";
import { DEFAULT_QUOTE, MOBILE_PRIMARY, NAV_GROUPS, findNavItem, visibleGroups } from "./navConfig";

/**
 * Estrutura principal: Sidebar (desktop/tablet) + cabeçalho com trilha de
 * navegação e busca global + conteúdo + rodapé. No celular, barra inferior
 * com 4 atalhos e um menu em gaveta com todos os módulos agrupados.
 * Toda a navegação vem de navConfig.ts (fonte única).
 */

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function MobileDrawer({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="md:hidden fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu de módulos"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] flex flex-col bg-paper-raised dark:bg-ink-raised shadow-2xl"
          >
            <div className="flex items-center justify-between h-16 px-4 border-b border-paper-border dark:border-ink-border">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-signal p-[2.5px]">
                  <img src="/logo/icon-64.png" alt="" className="w-full h-full rounded-[10px] object-cover bg-white" />
                </span>
                <span className="leading-tight">
                  <span className="block font-display font-bold">LifeOS</span>
                  <span className="block text-[10.5px] text-slate">Transforme sua rotina em progresso</span>
                </span>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate" aria-label="Fechar menu">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-2">
              <NavGroups groups={visibleGroups(isAdmin)} compact={false} onNavigate={onClose} layoutPrefix="drawer" />
            </nav>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppShell() {
  const { isDark, setMode } = useTheme();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const { collapsed, canToggle, toggle } = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = findNavItem(location.pathname);
  const isSubPage = !!current && location.pathname !== current.item.to;
  const quote = current?.item.quote ?? DEFAULT_QUOTE;
  const mobilePrimary = MOBILE_PRIMARY.map((to) => ALL_ITEMS.find((i) => i.to === to)).filter((i): i is (typeof ALL_ITEMS)[number] => !!i);

  // Cada troca de rota volta ao topo — o conteúdo rola na janela, não num contêiner.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="w-full min-h-screen flex bg-paper text-[#1E2537] dark:bg-ink dark:text-[#E7EAF2]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] rounded-lg px-3 py-2 bg-brand-600 text-white text-sm">
        Pular para o conteúdo
      </a>

      <Sidebar groups={visibleGroups(isAdmin)} collapsed={collapsed} canToggle={canToggle} onToggle={toggle} />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 md:px-6 lg:px-8 border-b border-paper-border dark:border-ink-border bg-paper-raised/85 dark:bg-ink-raised/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper-raised/70 dark:supports-[backdrop-filter]:bg-ink-raised/70">
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-slate hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Abrir menu de módulos"
          >
            <Menu size={19} />
          </button>

          <div className="min-w-0 flex-1 md:flex-none md:w-auto lg:min-w-[220px]">
            <nav aria-label="Trilha de navegação" className="flex items-center gap-1 text-[11px] text-slate leading-none">
              <span className="hidden sm:inline">{current?.group.label ?? "LifeOS"}</span>
              {isSubPage && current && (
                <>
                  <ChevronRight size={11} className="hidden sm:inline" />
                  <NavLink to={current.item.to} className="hover:text-brand-600">{current.item.label}</NavLink>
                </>
              )}
            </nav>
            <p className="font-display font-semibold text-[15px] md:text-base leading-tight truncate mt-0.5">
              {current ? (isSubPage ? "Detalhes" : current.item.label) : "LifeOS"}
            </p>
          </div>

          <div className="hidden md:flex flex-1 justify-center min-w-0">
            <DesktopGlobalSearch />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto md:ml-0">
            <MobileGlobalSearch />
            <button
              onClick={() => setMode(isDark ? "light" : "dark")}
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center border border-paper-border dark:border-ink-border"
              aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {isDark ? <SunMedium size={16} /> : <Moon size={16} />}
            </button>
            <AchievementHeaderPulse />
            <NotificationsBell />
            <span className="hidden sm:block w-px h-6 bg-paper-border dark:bg-ink-border mx-0.5" aria-hidden />
            <ProfileMenu />
          </div>
        </header>

        <div className="hidden xl:flex justify-end px-8 pt-3 -mb-1">
          <p className="text-xs italic text-slate">
            <span className="text-brand-500 not-italic font-display font-semibold mr-0.5">&ldquo;</span>
            {quote}
            <span className="text-brand-500 not-italic font-display font-semibold ml-0.5">&rdquo;</span>
          </p>
        </div>

        <main id="conteudo" className="flex-1 min-w-0">
          <Outlet />
        </main>

        <div className="pb-[4.5rem] md:pb-0">
          <AppFooter />
        </div>

        {/* navegação inferior mobile */}
        <nav
          aria-label="Atalhos"
          className="md:hidden fixed bottom-0 inset-x-0 z-20 grid grid-cols-5 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur border-t border-paper-border dark:border-ink-border"
        >
          {mobilePrimary.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 py-1 rounded-xl">
              {({ isActive }) => (
                <>
                  <span className="relative flex items-center justify-center w-11 h-7">
                    {isActive && (
                      <motion.span layoutId="mobile-tab" className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-500 to-signal" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    <Icon size={17} className={`relative ${isActive ? "text-white" : "text-slate"}`} />
                  </span>
                  <span className={`text-[10px] ${isActive ? "font-semibold text-brand-700 dark:text-brand-100" : "text-slate"}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-0.5 py-1" aria-label="Todos os módulos">
            <span className="flex items-center justify-center w-11 h-7 text-slate">
              <Menu size={17} />
            </span>
            <span className="text-[10px] text-slate">Módulos</span>
          </button>
        </nav>

        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isAdmin={isAdmin} />

        <AchievementToast />
        <OnboardingFlow />
        <CopilotAssistant />
        <QuickCaptureButton />
      </div>
    </div>
  );
}
