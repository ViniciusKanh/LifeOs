import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { checkForUpdate, installUpdate, useDesktopUpdate } from "@/platform/desktopUpdater";

const LABEL = {
  idle: "Ainda não verificado nesta sessão",
  checking: "Verificando…",
  "up-to-date": "Você está na versão mais recente",
  available: "Nova versão disponível",
  downloading: "Baixando atualização…",
  installing: "Instalando — o LifeOS vai reiniciar",
  error: "Falha na última tentativa",
} as const;

/** "Verificar atualizações" (Perfil → LifeOS Desktop). Carregado só no Desktop. */
export default function DesktopUpdateStatus() {
  const u = useDesktopUpdate();
  const busy = u.status === "checking" || u.status === "downloading" || u.status === "installing";
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p>
        <span className="opacity-70">Atualizações: </span>
        {LABEL[u.status]}
        {u.status === "available" && u.version ? ` (${u.version})` : ""}
        {u.lastChecked && u.status !== "checking" ? ` · ${new Date(u.lastChecked).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>
      {u.status === "error" && u.error && <p className="text-xs text-drop rpg:text-rpg-red">{u.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void checkForUpdate()} disabled={busy}>
          <RefreshCw size={14} className={u.status === "checking" ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Verificar atualizações
        </Button>
        {u.status === "available" && (
          <Button onClick={() => void installUpdate()}>Atualizar para {u.version}</Button>
        )}
      </div>
    </div>
  );
}
