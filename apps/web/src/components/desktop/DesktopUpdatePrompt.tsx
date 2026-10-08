import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { checkForUpdate, installUpdate, useDesktopUpdate } from "@/platform/desktopUpdater";

const DISMISS_KEY = "lifeos:desktop-update-dismissed";
const FIRST_CHECK_MS = 8_000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

function dismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Aviso global de nova versão do app nativo. Verifica pouco depois de abrir e
 * a cada 6 h. Nunca instala sozinho: o usuário escolhe "Atualizar agora"
 * (o app fecha e reabre) ou "Mais tarde" (não pergunta de novo por esta versão).
 */
export default function DesktopUpdatePrompt() {
  const u = useDesktopUpdate();
  const [skipped, setSkipped] = useState<string | null>(dismissedVersion);

  useEffect(() => {
    const first = window.setTimeout(() => void checkForUpdate(), FIRST_CHECK_MS);
    const every = window.setInterval(() => void checkForUpdate(), INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  const busy = u.status === "downloading" || u.status === "installing";
  const open = !!u.version && (busy || (u.status === "available" && skipped !== u.version) || (u.status === "error" && !!u.version && skipped !== u.version));
  const later = () => {
    if (!u.version) return;
    try {
      localStorage.setItem(DISMISS_KEY, u.version);
    } catch {
      /* preferência só desta sessão */
    }
    setSkipped(u.version);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : later}
      title={`Nova versão do LifeOS Desktop: ${u.version ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={later} disabled={busy}>
            Mais tarde
          </Button>
          <Button onClick={() => void installUpdate()} disabled={busy}>
            <Download size={15} aria-hidden /> {busy ? (u.status === "installing" ? "Instalando…" : "Baixando…") : "Atualizar agora"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>Esta atualização é da parte nativa do app (janela, recursos do Windows). Suas telas e dados já ficam sempre na versão mais recente.</p>
        {u.notes && <p className="whitespace-pre-line rounded-lg border border-black/10 dark:border-white/10 rpg:border-rpg-border p-3 opacity-90">{u.notes}</p>}
        <p className="text-xs opacity-75">O LifeOS vai fechar para instalar e abrir de novo. Se houver uma sessão de foco ou cronômetro em andamento, finalize antes.</p>
        {busy && (
          <div role="progressbar" aria-label="Download da atualização" aria-valuenow={u.progress ?? undefined} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div className="h-full bg-gradient-to-r from-brand-500 to-cat-purple rpg:from-rpg-purple rpg:to-rpg-gold transition-[width]" style={{ width: `${u.progress ?? 40}%` }} />
          </div>
        )}
        {u.status === "error" && u.error && (
          <p className="text-xs text-drop rpg:text-rpg-red" role="alert">
            {u.error}
          </p>
        )}
      </div>
    </Modal>
  );
}
