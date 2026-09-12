import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, Sun, ListChecks, Timer, BookOpen, GraduationCap, Menu, X, SunMedium, Moon, Sparkles } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/hoje", label: "Hoje", icon: Sun },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks },
  { to: "/foco", label: "Focus", icon: Timer },
  { to: "/biblioteca", label: "Biblioteca", icon: BookOpen },
  { to: "/educacao", label: "Educação", icon: GraduationCap },
];

export function AppShell() {
  const { isDark, setMode } = useTheme();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="w-full min-h-screen flex bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      {/* sidebar desktop/tablet */}
      <aside className="hidden md:flex md:flex-col shrink-0 md:w-[76px] lg:w-[224px] p-3 lg:p-4 border-r border-paper-border dark:border-ink-border">
        <div className="flex items-center gap-2 px-1 mb-8">
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-signal">
            <Sparkles size={16} className="text-ink" />
          </div>
          <span className="hidden lg:inline text-sm font-medium">LifeOS</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "font-semibold bg-black/5 dark:bg-white/10" : "text-slate font-medium"
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => setMode(isDark ? "light" : "dark")}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate"
        >
          {isDark ? <SunMedium size={18} /> : <Moon size={18} />}
          <span className="hidden lg:inline">{isDark ? "Tema claro" : "Tema escuro"}</span>
        </button>

        <button onClick={() => logout()} className="mt-1 text-left px-3 py-2 text-xs text-slate hover:opacity-80">
          Sair {user ? `(${user.name})` : ""}
        </button>
      </aside>

      {/* coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-paper-border dark:border-ink-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-signal">
              <Sparkles size={14} className="text-ink" />
            </div>
            <span className="text-sm font-medium">LifeOS</span>
          </div>
          <button onClick={() => setMode(isDark ? "light" : "dark")} className="text-slate">
            {isDark ? <SunMedium size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </div>

        {/* navegação inferior mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 bg-paper-raised dark:bg-ink-raised border-t border-paper-border dark:border-ink-border">
          {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-1 px-2 py-1">
              {({ isActive }) => (
                <>
                  <Icon size={19} className={isActive ? "text-signal" : "text-slate"} />
                  <span className={`text-[10px] ${isActive ? "font-semibold" : "text-slate"}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 px-2 py-1">
            <Menu size={19} className="text-slate" />
            <span className="text-[10px] text-slate">Mais</span>
          </button>
        </div>

        {moreOpen && (
          <div
            className="md:hidden fixed inset-0 z-20 flex items-end bg-black/40"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="w-full rounded-t-2xl p-5 bg-paper-raised dark:bg-ink-raised"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold">Mais módulos</span>
                <button onClick={() => setMoreOpen(false)} className="text-slate">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NavLink
                  to="/educacao"
                  onClick={() => setMoreOpen(false)}
                  className="rounded-xl px-3 py-4 text-xs text-center text-slate border border-paper-border dark:border-ink-border"
                >
                  Educação
                </NavLink>
                {["Projetos", "Saúde", "Hábitos", "Metas", "Analytics", "Calendário", "Insights", "Config."].map((m) => (
                  <div
                    key={m}
                    className="rounded-xl px-3 py-4 text-xs text-center text-slate border border-paper-border dark:border-ink-border"
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
