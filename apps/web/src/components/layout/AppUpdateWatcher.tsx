import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";

const CHECK_EVERY_MS = 20 * 60_000;

/**
 * Cada deploy na Vercel publica um service worker novo. Ele assume na hora
 * (skipWaiting + clientsClaim), mas a página aberta continua com o código
 * antigo até recarregar — por isso telas novas "não apareciam" no app
 * instalado. Aqui: procuramos versão nova ao focar a janela e a cada 20 min;
 * quando ela assume, recarregamos sozinhos na próxima troca de tela (momento
 * seguro, sem perder o que está sendo digitado) e mostramos um aviso para
 * atualizar já.
 */
export function AppUpdateWatcher() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const firstPath = useRef(location.pathname);

  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const hadController = !!sw.controller;
    const onChange = () => {
      if (hadController) setReady(true);
    };
    sw.addEventListener("controllerchange", onChange);
    const check = () => void sw.getRegistration().then((r) => r?.update()).catch(() => undefined);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    check();
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  // Troca de tela com versão nova pronta: recarrega (nada digitado se perde).
  useEffect(() => {
    if (ready && location.pathname !== firstPath.current) window.location.reload();
    firstPath.current = location.pathname;
  }, [location.pathname, ready]);

  if (!ready || dismissed) return null;
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 z-[65] -translate-x-1/2 px-4 w-full max-w-md" role="status">
      <div className="flex items-center gap-3 rounded-xl border border-brand-500/40 bg-paper-raised dark:bg-ink-raised px-4 py-3 shadow-lg rpg:rounded-[3px] rpg:border-rpg-gold/70 rpg:bg-rpg-panel">
        <RefreshCw size={16} className="shrink-0 text-brand-600 rpg:text-rpg-gold-light" aria-hidden />
        <p className="min-w-0 flex-1 text-sm rpg:text-rpg-text">Nova versão do LifeOS disponível.</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 rpg:rounded-[3px] rpg:bg-rpg-purple">
          Atualizar agora
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-slate hover:text-inherit" aria-label="Fechar aviso de atualização">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
