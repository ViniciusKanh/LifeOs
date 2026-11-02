import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronRight, Menu, X } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { ProfileMenu } from "./ProfileMenu";
import { AchievementToast } from "./AchievementToast";
import { GamificationFeedback } from "./GamificationFeedback";
import { RPGPlayerHUD } from "@/components/rpg/RPGPlayerHUD";
import { HeroClassChip } from "@/components/rpg/HeroClass";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";
import { AppUpdateWatcher } from "./AppUpdateWatcher";
import { AchievementHeaderPulse } from "./AchievementHeaderPulse";
import { NotificationBell } from "./NotificationBell";
import { OnboardingFlow } from "./OnboardingFlow";
import { DesktopGlobalSearch, MobileGlobalSearch } from "./GlobalSearch";
import { CopilotAssistant } from "./CopilotAssistant";
import { CommandPalette } from "@/components/command/CommandPalette";
import { QuickCaptureButton } from "./QuickCaptureButton";
import { Sidebar, NavGroups, useSidebarCollapsed } from "./Sidebar";
import { AppFooter } from "./AppFooter";
import { MobileMagicNav } from "./MobileMagicNav";
import { TermsGate } from "@/components/legal/TermsGate";
import { DEFAULT_QUOTE, findNavItem, navLabel, visibleGroups } from "./navConfig";
import { AppScrollContext } from "./AppScrollContext";
import { OfflineStatus } from "./OfflineStatus";
import { HubTabs } from "./HubTabs";
import { ThemeCycleIcon, themeCycleLabel } from "./themeToggle";
import { RPG_LOGO } from "@/components/rpg/rpgAssets";
import { IS_DESKTOP } from "@/platform";
import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";
import { useBankPendingCount } from "@/hooks/useBank";

// Aviso de nova versão do app nativo — só existe (e só é baixado) no LifeOS Desktop.
const DesktopUpdatePrompt = IS_DESKTOP ? lazy(() => import("@/components/desktop/DesktopUpdatePrompt")) : null;

/**
 * Estrutura principal: Sidebar (desktop, ≥1024px) + cabeçalho com trilha de
 * navegação e busca global + conteúdo + rodapé. No celular, barra inferior
 * com 4 atalhos e um menu em gaveta com todos os módulos agrupados.
 * Toda a navegação vem de navConfig.ts (fonte única).
 */


/**
 * Gaveta de módulos do celular/tablet. Fica sempre montada e abre/fecha só
 * por CSS (transform + visibility): sem depender da animação de saída do
 * AnimatePresence, que em algumas telas travava e deixava a gaveta presa
 * mesmo tocando no X. Fechada, ela fica `inert` (sem foco nem toque).
 */
function MobileDrawer({ open, onClose, isAdmin, badges }: { open: boolean; onClose: () => void; isAdmin: boolean; badges?: Record<string, number> }) {
  const { mode, cycle } = useTheme();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current?.parentElement;
    if (panel) {
      if (open) panel.removeAttribute("inert");
      else panel.setAttribute("inert", "");
    }
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco vai para o botão de fechar (acessibilidade de diálogo).
    window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <div className={`lg:hidden fixed inset-0 z-[45] ${open ? "visible pointer-events-auto" : "invisible pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de módulos"
        className={`absolute inset-y-0 left-0 w-[86%] max-w-[320px] flex flex-col bg-paper-raised dark:bg-ink-raised shadow-2xl rpg:bg-rpg-bg-2 rpg:border-r-2 rpg:border-rpg-border transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-4 border-b border-paper-border dark:border-ink-border rpg:border-rpg-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-signal p-[2.5px] rpg:hidden">
              <img src="/logo/icon-64.png" alt="" className="w-full h-full rounded-[10px] object-cover bg-white" />
            </span>
            <img src={RPG_LOGO.icon} alt="" loading="lazy" className="hidden rpg:block w-10 h-10 object-contain" />
            <span className="leading-tight min-w-0">
              <span className="block font-display font-bold rpg:rpg-title">LifeOS</span>
              <span className="block text-[10.5px] text-slate truncate">Transforme sua rotina em progresso</span>
            </span>
          </div>
          <button
            type="button"
            data-drawer-close
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-slate hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          <NavGroups groups={visibleGroups(isAdmin)} compact={false} onNavigate={onClose} layoutPrefix="drawer" badges={badges} animated={false} />
        </nav>
        <div className="shrink-0 border-t border-paper-border dark:border-ink-border rpg:border-rpg-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={cycle} className="w-full min-h-[44px] flex items-center gap-2.5 rounded-xl px-3 text-sm text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.05]" aria-label={themeCycleLabel(mode)}>
            <ThemeCycleIcon mode={mode} size={17} />
            <span className="truncate">{themeCycleLabel(mode)}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export function AppShell() {
  const { mode, cycle, isRpg } = useTheme();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const { collapsed, canToggle, toggle } = useSidebarCollapsed();
  useDesktopNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Indicadores de pendência no menu (ex.: Banco com investimentos prontos ou empréstimo vencido) — sempre dado real.
  const bankPending = useBankPendingCount();
  const navBadges: Record<string, number> = bankPending > 0 ? { "/banco": bankPending } : {};

  const current = findNavItem(location.pathname);
  // Sub-página = rota mais funda que o item/aba (ex.: /projetos/:id); uma aba do hub não é sub-página.
  const isSubPage = !!current && location.pathname !== (current.tab?.to ?? current.item.to);
  const quote = current?.item.quote ?? DEFAULT_QUOTE;

  // A janela nunca rola (comportamento de app): só este contêiner. Cada troca de rota volta ao topo dele.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Qualquer troca de rota fecha a gaveta mobile -- nunca fica presa aberta
  // esperando que o item clicado chame onNavigate.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Ao girar o tablet/aumentar a janela até o layout com sidebar fixa, a gaveta não pode ficar aberta por trás.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="app-shell fixed inset-0 w-full flex overflow-hidden bg-paper text-[#1E2537] dark:bg-ink dark:text-[#E7EAF2] rpg:rpg-backdrop rpg:text-rpg-text">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] rounded-lg px-3 py-2 bg-brand-600 text-white text-sm">
        Pular para o conteúdo
      </a>

      <Sidebar groups={visibleGroups(isAdmin)} collapsed={collapsed} canToggle={canToggle} onToggle={toggle} badges={navBadges} />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <header className="shrink-0 relative z-30 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 lg:px-8 border-b border-paper-border dark:border-ink-border bg-paper-raised/85 dark:bg-ink-raised/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper-raised/70 dark:supports-[backdrop-filter]:bg-ink-raised/70 rpg:bg-rpg-bg-2 rpg:backdrop-blur-none rpg:border-b-2 rpg:border-rpg-border">
          {/* Filete dourado sob o cabeçalho — só no tema RPG */}
          <div className="hidden rpg:block absolute inset-x-0 -bottom-[3px] rpg-ornament-line opacity-70" aria-hidden />
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-slate hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Abrir menu de módulos"
          >
            <Menu size={19} />
          </button>

          <div className="min-w-0 flex-1 lg:flex-none lg:w-auto lg:min-w-[220px]">
            <nav aria-label="Trilha de navegação" className="flex items-center gap-1 text-[11px] text-slate leading-none rpg:font-pixel rpg:uppercase rpg:tracking-[0.14em] rpg:text-rpg-gold">
              <span className="hidden sm:inline"><span className="hidden rpg:inline" aria-hidden>/ </span>{current?.group.label ?? "LifeOS"}</span>
              {isSubPage && current && (
                <>
                  <ChevronRight size={11} className="hidden sm:inline" />
                  <NavLink to={current.item.to} className="hover:text-brand-600">{current.item.label}</NavLink>
                </>
              )}
            </nav>
            <p className="font-display font-semibold text-[15px] md:text-base leading-tight truncate mt-0.5 rpg:rpg-title rpg:text-lg">
              {current ? (isSubPage ? "Detalhes" : current.tab && current.tab.to !== current.item.to ? current.tab.label : navLabel(current.item, isRpg)) : "LifeOS"}
            </p>
          </div>

          <div className="hidden lg:flex flex-1 justify-center min-w-0">
            <DesktopGlobalSearch />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto lg:ml-0">
            <MobileGlobalSearch />
            <button
              onClick={cycle}
              className="hidden sm:flex lg:hidden w-9 h-9 rounded-full items-center justify-center border border-paper-border dark:border-ink-border"
              aria-label={themeCycleLabel(mode)}
            >
              <ThemeCycleIcon mode={mode} size={16} />
            </button>
            {isRpg && <HeroClassChip />}
            {isRpg && <RPGPlayerHUD compact />}
            {/* Em telas muito estreitas o troféu sai do cabeçalho (continua em Conquistas) para o título não ser esmagado. */}
            <div className="hidden min-[400px]:block">
              <AchievementHeaderPulse />
            </div>
            <NotificationBell />
            <span className="hidden sm:block w-px h-6 bg-paper-border dark:bg-ink-border mx-0.5" aria-hidden />
            <ProfileMenu />
          </div>
        </header>

        <OfflineStatus />
        <AppUpdateWatcher />
        {DesktopUpdatePrompt && (
          <Suspense fallback={null}>
            <DesktopUpdatePrompt />
          </Suspense>
        )}
        {/* Única área rolável do app: limitada entre o cabeçalho e a borda da tela, sem "elástico" além dos limites. */}
        <div ref={scrollRef} id="app-scroll" className="app-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <AppScrollContext.Provider value={scrollRef}>
        {current?.item.tabs && <HubTabs tabs={current.item.tabs} activeTo={current.tab?.to ?? current.item.to} />}
        <div className="hidden xl:flex justify-end px-8 pt-3 -mb-1">
          <p className="text-xs italic text-slate">
            <span className="text-brand-500 rpg:text-rpg-gold not-italic font-display font-semibold mr-0.5">&ldquo;</span>
            {quote}
            <span className="text-brand-500 rpg:text-rpg-gold not-italic font-display font-semibold ml-0.5">&rdquo;</span>
          </p>
        </div>

        <main id="conteudo" className="flex-1 min-w-0">
          <ScreenErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ScreenErrorBoundary>
        </main>

        <div className="pb-24 lg:pb-0">
          <AppFooter />
        </div>
        </AppScrollContext.Provider>
        </div>

        {/* navegação inferior mobile (indicador "magic navigation") */}
        <MobileMagicNav onOpenModules={() => setDrawerOpen((v) => !v)} modulesOpen={drawerOpen} />

        <MobileDrawer open={drawerOpen} onClose={closeDrawer} isAdmin={isAdmin} badges={navBadges} />

        <TermsGate />
        <AchievementToast />
        <GamificationFeedback />
        <OnboardingFlow />
        <CopilotAssistant />
        <CommandPalette />
        <QuickCaptureButton />
      </div>
    </div>
  );
}
