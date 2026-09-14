import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Sun,
  ListChecks,
  Timer,
  BookOpen,
  GraduationCap,
  HeartPulse,
  Repeat,
  Target,
  BarChart3,
  History,
  ClipboardList,
  Menu,
  X,
  SunMedium,
  Moon,
  CalendarDays,
  Trophy,
  GanttChartSquare,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { NotificationsBell } from "./NotificationsBell";
import { ProfileMenu } from "./ProfileMenu";
import { AchievementToast } from "./AchievementToast";
import { OnboardingFlow } from "./OnboardingFlow";
import { DesktopGlobalSearch, MobileGlobalSearch } from "./GlobalSearch";
import { CopilotAssistant } from "./CopilotAssistant";

// Frases curtas por área — só decoração de cabeçalho, sem dado
// nenhum embutido; caem no padrão caso a rota não tenha uma frase própria.
const PAGE_QUOTES: Record<string, string> = {
  "/dashboard": "Disciplina de hoje, liberdade de amanhã.",
  "/hoje": "Consistência hoje, resultados amanhã.",
  "/tarefas": "Disciplina de hoje, liberdade de amanhã.",
  "/foco": "Foco é a ponte entre onde você está e onde quer chegar.",
  "/biblioteca": "Livros constroem a melhor versão de nós.",
  "/educacao": "Estudo hoje, liberdade amanhã.",
  "/saude": "Corpo saudável, mente mais forte.",
  "/habitos": "Disciplina é a ponte entre seus objetivos e seus sonhos.",
  "/metas": "Um objetivo sem plano é apenas um desejo.",
  "/calendario": "Quem planeja o tempo, comanda o progresso.",
  "/conquistas": "Cada conquista começou com um hábito repetido.",
  "/analytics": "Dados transformam esforço em clareza.",
  "/timeline": "Disciplina de hoje, liberdade de amanhã.",
  "/weekly-review": "Pequenos ajustes hoje, grandes resultados amanhã.",
};
const DEFAULT_QUOTE = "Disciplina de hoje, liberdade de amanhã.";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/hoje", label: "Hoje", icon: Sun },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks },
  { to: "/projetos", label: "Projetos", icon: GanttChartSquare },
  { to: "/foco", label: "Focus", icon: Timer },
];

const SECONDARY_NAV = [
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/biblioteca", label: "Biblioteca", icon: BookOpen },
  { to: "/educacao", label: "Educação", icon: GraduationCap },
  { to: "/saude", label: "Saúde", icon: HeartPulse },
  { to: "/habitos", label: "Hábitos", icon: Repeat },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/conquistas", label: "Conquistas", icon: Trophy },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/timeline", label: "Timeline", icon: History },
  { to: "/weekly-review", label: "Weekly Review", icon: ClipboardList },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
    isActive
      ? "font-semibold text-brand-700 bg-gradient-to-r from-brand-50 to-transparent dark:from-brand-700/20 dark:to-transparent dark:text-brand-100"
      : "text-slate font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
  }`;
}

/* Barrinha de destaque à esquerda do item ativo — só decoração de estado, não estrutura nova. */
function ActiveRail({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b from-brand-500 to-signal transition-opacity ${
        isActive ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

export function AppShell() {
  const { isDark, setMode } = useTheme();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreItems = [
    ...SECONDARY_NAV.map(({ to, label }) => ({ to, label })),
    ...(isAdmin ? [{ to: "/configuracoes", label: "Configurações" }, { to: "/admin/usuarios", label: "Usuários" }] : []),
  ];

  const quote = PAGE_QUOTES[location.pathname] ?? DEFAULT_QUOTE;

  return (
    <div className="w-full min-h-screen flex bg-paper text-[#1E2537] dark:bg-ink dark:text-[#E7EAF2]">
      {/* sidebar desktop/tablet */}
      <aside className="hidden md:flex md:flex-col shrink-0 md:w-[76px] lg:w-[248px] p-3 lg:p-4 bg-paper-raised dark:bg-ink-raised border-r border-paper-border dark:border-ink-border relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-aurora opacity-70 dark:opacity-40" />

        <div className="relative flex items-center gap-2.5 px-1 mb-7">
          <div className="relative shrink-0 w-10 h-10 rounded-xl2 bg-gradient-to-br from-brand-500 to-signal p-[3px] shadow-glow-brand">
            <img src="/logo/icon-64.png" alt="LifeOS" className="w-full h-full rounded-[13px] object-cover bg-white" />
          </div>
          <div className="hidden lg:block leading-tight">
            <span className="block text-lg font-bold font-display tracking-tight">LifeOS</span>
            <span className="block text-[11px] text-slate">progresso em movimento</span>
          </div>
        </div>

        <nav className="relative flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <ActiveRail isActive={isActive} />
                  <Icon size={18} className="shrink-0" />
                  <span className="hidden lg:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          <div className="my-3 border-t border-paper-border dark:border-ink-border" />

          {SECONDARY_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <ActiveRail isActive={isActive} />
                  <Icon size={18} className="shrink-0" />
                  <span className="hidden lg:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => setMode(isDark ? "light" : "dark")}
          className="relative mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
        >
          {isDark ? <SunMedium size={18} /> : <Moon size={18} />}
          <span className="hidden lg:inline">{isDark ? "Tema claro" : "Tema escuro"}</span>
        </button>
      </aside>

      {/* coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* cabeçalho */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 md:px-8 py-3 border-b border-paper-border dark:border-ink-border bg-paper-raised/90 dark:bg-ink-raised/90 backdrop-blur supports-[backdrop-filter]:bg-paper-raised/75 dark:supports-[backdrop-filter]:bg-ink-raised/75">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo/icon-64.png" alt="LifeOS" className="w-7 h-7 rounded-lg object-contain" />
            <span className="text-sm font-bold font-display">LifeOS</span>
          </div>

          <DesktopGlobalSearch />

          <div className="flex items-center gap-2">
            <MobileGlobalSearch />
            <button
              onClick={() => setMode(isDark ? "light" : "dark")}
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center border border-paper-border dark:border-ink-border"
            >
              {isDark ? <SunMedium size={16} /> : <Moon size={16} />}
            </button>
            <NotificationsBell />
            <ProfileMenu />
          </div>
        </header>

        <div className="hidden md:flex justify-end px-8 pt-3">
          <p className="text-xs italic text-slate">
            <span className="text-brand-500 not-italic font-display font-semibold mr-0.5">&ldquo;</span>
            {quote}
            <span className="text-brand-500 not-italic font-display font-semibold ml-0.5">&rdquo;</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </div>

        {/* navegação inferior mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur border-t border-paper-border dark:border-ink-border">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-colors">
              {({ isActive }) => (
                <>
                  <span
                    className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors ${
                      isActive ? "bg-gradient-to-r from-brand-500 to-signal text-white" : "text-slate"
                    }`}
                  >
                    <Icon size={17} />
                  </span>
                  <span className={`text-[10px] ${isActive ? "font-semibold text-brand-700 dark:text-brand-100" : "text-slate"}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 px-3 py-1.5">
            <span className="flex items-center justify-center w-9 h-7 text-slate">
              <Menu size={17} />
            </span>
            <span className="text-[10px] text-slate">Mais</span>
          </button>
        </div>

        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-20 flex items-end bg-black/40" onClick={() => setMoreOpen(false)}>
            <div className="w-full rounded-t-2xl p-5 bg-paper-raised dark:bg-ink-raised" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold">Mais módulos</span>
                <button onClick={() => setMoreOpen(false)} className="text-slate">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {moreItems.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `rounded-xl px-3 py-4 text-xs text-center border transition-colors ${
                        isActive
                          ? "border-brand-500/40 bg-gradient-to-br from-brand-50 to-transparent text-brand-700 font-semibold dark:from-brand-700/20 dark:text-brand-100"
                          : "text-slate border-paper-border dark:border-ink-border"
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}

        <AchievementToast />
        <OnboardingFlow />
        <CopilotAssistant />
      </div>
    </div>
  );
}
