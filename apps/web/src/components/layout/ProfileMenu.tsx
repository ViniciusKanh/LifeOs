import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { User, Settings, Users, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function ProfileMenu() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 border border-paper-border dark:border-ink-border hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-paper-border dark:bg-ink-border shrink-0">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <User size={14} className="text-slate" />
          )}
        </span>
        <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
        <ChevronDown size={13} className="text-slate" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised overflow-hidden z-40">
          <div className="px-4 py-3 border-b border-paper-border dark:border-ink-border">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate truncate">{user.email}</p>
          </div>
          <nav className="py-1.5">
            <NavLink
              to="/perfil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <User size={15} /> Meu perfil
            </NavLink>
            {isAdmin && (
              <>
                <NavLink
                  to="/configuracoes"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Settings size={15} /> Configurações
                </NavLink>
                <NavLink
                  to="/admin/usuarios"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Users size={15} /> Usuários
                </NavLink>
              </>
            )}
          </nav>
          <div className="border-t border-paper-border dark:border-ink-border py-1.5">
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-drop hover:bg-black/5 dark:hover:bg-white/5"
            >
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
