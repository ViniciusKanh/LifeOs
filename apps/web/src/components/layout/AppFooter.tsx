import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wifi, WifiOff } from "lucide-react";
import pkg from "../../../package.json";
import { useAuth } from "@/hooks/useAuth";

/**
 * Rodapé institucional do app. Só mostra informação real: versão do
 * build (package.json), estado da conexão do navegador (importante no
 * PWA offline) e atalhos para páginas que existem de fato.
 */
function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function AppFooter() {
  const online = useOnlineStatus();
  const { isAdmin } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-paper-border dark:border-ink-border bg-paper-raised/60 dark:bg-ink-raised/60">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-xs text-slate">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo/icon-64.png" alt="" className="w-5 h-5 rounded-md" />
          <span className="font-semibold text-[#1E2537] dark:text-[#E7EAF2]">LifeOS</span>
          <span className="hidden lg:inline truncate">Planejar → Executar → Registrar → Medir → Melhorar</span>
        </div>

        <nav aria-label="Links do rodapé" className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto">
          <Link to="/privacidade" className="hover:text-brand-600 transition-colors">Privacidade</Link>
          <Link to="/termos" className="hover:text-brand-600 transition-colors">Termo de Uso</Link>
          <Link to="/data-health" className="hover:text-brand-600 transition-colors">Qualidade dos dados</Link>
          {isAdmin && <Link to="/configuracoes" className="hover:text-brand-600 transition-colors">Configurações</Link>}
        </nav>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${online ? "bg-growth/10 text-growth" : "bg-drop/10 text-drop"}`}
            role="status"
          >
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            {online ? "Online" : "Offline"}
          </span>
          <span>v{pkg.version}</span>
          <span>© {year}</span>
        </div>
      </div>
    </footer>
  );
}
