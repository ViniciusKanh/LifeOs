import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { flushQueue, onQueueChange, pendingCount } from "@/lib/offlineQueue";

/**
 * Faixa de status offline: avisa quando o app está sem conexão (mostrando
 * os dados guardados no aparelho) e quantas capturas esperam envio. Ao
 * reconectar, envia a fila e atualiza as telas.
 */
export function OfflineStatus() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [pending, setPending] = useState(() => pendingCount());
  const [synced, setSynced] = useState<number | null>(null);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      flushQueue();
    };
    const down = () => setOnline(false);
    const onSynced = (e: Event) => {
      setSynced((e as CustomEvent<number>).detail);
      qc.invalidateQueries();
      window.setTimeout(() => setSynced(null), 3000);
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("lifeos:offline-synced", onSynced);
    const off = onQueueChange(setPending);
    flushQueue();
    // Reenvio periódico: cobre redes "conectadas" que ainda não respondem.
    const t = window.setInterval(() => pendingCount() > 0 && flushQueue(), 30_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("lifeos:offline-synced", onSynced);
      off();
      window.clearInterval(t);
    };
  }, [qc]);

  const show = !online || pending > 0 || synced != null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          role="status"
          aria-live="polite"
          className={`shrink-0 overflow-hidden text-xs font-medium ${synced != null ? "bg-growth/12 text-growth" : !online ? "bg-signal/15 text-signal-deep dark:text-signal" : "bg-cat-blue/10 text-cat-blue"}`}
        >
          <div className="flex items-center justify-center gap-2 px-4 py-1.5">
            {synced != null ? (
              <span>✓ {synced} {synced === 1 ? "captura sincronizada" : "capturas sincronizadas"}</span>
            ) : !online ? (
              <>
                <CloudOff size={13} />
                <span>
                  Sem conexão — mostrando o que está salvo neste aparelho.{pending > 0 ? ` ${pending} ${pending === 1 ? "captura aguarda" : "capturas aguardam"} envio.` : " Capturas ficam guardadas e sobem sozinhas."}
                </span>
              </>
            ) : (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Enviando {pending} {pending === 1 ? "captura feita" : "capturas feitas"} offline…</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
