import { useState, type FormEvent } from "react";
import { Inbox, Check, Mic } from "lucide-react";
import { useInboxCapture } from "@/hooks/useInbox";
import { useSpeechCapture } from "@/hooks/useSpeechCapture";

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
  const [offlineSaved, setOfflineSaved] = useState(false);
  // Ditado por voz: o texto reconhecido entra direto no campo (dá para revisar antes de capturar).
  const speech = useSpeechCapture((t) => setText((cur) => (cur ? `${cur} ${t}` : t)));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || isCapturing) return;
    setError(null);
    try {
      speech.stop();
      const saved = await capture(content);
      setText("");
      setOpen(false);
      setOfflineSaved(saved === null);
      setJustCaptured(true);
      setTimeout(() => setJustCaptured(false), 1800);
      setTimeout(() => setOfflineSaved(false), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível capturar agora. Tente de novo.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Captura rápida"
        className="fixed z-20 bottom-[10.75rem] md:bottom-[5.5rem] right-4 md:right-6 w-12 h-12 rounded-full flex items-center justify-center bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border text-brand-600 dark:text-brand-400 shadow-card"
      >
        {justCaptured ? <Check size={20} className="text-growth" /> : <Inbox size={19} />}
      </button>
      {offlineSaved && (
        <div role="status" className="fixed z-30 bottom-[14.5rem] md:bottom-[9rem] right-4 md:right-6 max-w-[240px] rounded-xl bg-[#1E2537] text-white text-xs px-3 py-2 shadow-lg">
          Sem conexão: guardado no aparelho. Sobe sozinho quando a internet voltar.
        </div>
      )}

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
            <div className="relative">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={speech.listening ? "Pode falar…" : "Escreva ou dite uma ideia, lembrete ou tarefa solta..."}
                className="w-full rounded-xl pl-3.5 pr-12 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? "Parar ditado" : "Ditar por voz"}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    speech.listening ? "bg-drop text-white animate-pulse" : "text-slate hover:text-brand-600 hover:bg-black/[0.04]"
                  }`}
                >
                  <Mic size={15} />
                </button>
              )}
            </div>
            {speech.interim && <p className="text-xs text-slate italic mt-1.5">{speech.interim}…</p>}
            {speech.error && <p className="text-xs text-drop mt-1.5">{speech.error}</p>}
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
