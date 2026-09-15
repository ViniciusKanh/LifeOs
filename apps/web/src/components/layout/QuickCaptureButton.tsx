import { useState, type FormEvent } from "react";
import { Inbox, Check } from "lucide-react";
import { useInboxCapture } from "@/hooks/useInbox";

/**
 * Captura rápida (Inbox/GTD) — botão flutuante disponível em qualquer
 * tela do app. Sem formulário, sem escolher projeto/status/prioridade
 * na hora: só escreve e captura. Processar (virar tarefa ou
 * descartar) acontece depois, na tela /inbox — o objetivo aqui é
 * reduzir ao máximo o atrito de "onde eu anoto isso agora".
 */
export function QuickCaptureButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [justCaptured, setJustCaptured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { capture, isCapturing } = useInboxCapture();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || isCapturing) return;
    setError(null);
    try {
      await capture(content);
      setText("");
      setOpen(false);
      setJustCaptured(true);
      setTimeout(() => setJustCaptured(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível capturar agora. Tente de novo.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Captura rápida"
        className="fixed z-20 bottom-20 md:bottom-6 left-4 md:left-6 w-12 h-12 rounded-full flex items-center justify-center bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border text-brand-600 dark:text-brand-400 shadow-card"
      >
        {justCaptured ? <Check size={20} className="text-growth" /> : <Inbox size={19} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center md:justify-start bg-black/40" onClick={() => setOpen(false)}>
          <form
            onSubmit={handleSubmit}
            className="w-full md:w-[400px] md:ml-6 md:mb-6 rounded-t-2xl md:rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-2.5 flex items-center gap-2">
              <Inbox size={15} className="text-brand-600 dark:text-brand-400" /> Captura rápida
            </p>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva uma ideia, lembrete ou tarefa solta..."
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-slate mt-2">
              Não precisa decidir projeto nem prioridade agora — isso é só pra não perder a ideia. Depois você processa tudo em Inbox.
            </p>
            {error && <p className="text-xs text-drop mt-2">{error}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border border-paper-border dark:border-ink-border text-slate"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!text.trim() || isCapturing}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-brand-500 to-signal text-white disabled:opacity-50"
              >
                {isCapturing ? "Capturando..." : "Capturar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
