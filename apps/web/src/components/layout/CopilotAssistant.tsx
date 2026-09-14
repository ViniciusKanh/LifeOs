import { useState, type FormEvent } from "react";
import { Sparkles, X, Send, Check, Ban } from "lucide-react";
import { useCopilotAssistant } from "@/hooks/useCopilot";
import { Button } from "@/components/ui/primitives";
import type { CopilotActionProposal } from "@/services/copilotService";

type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "assistant-proposal"; proposal: CopilotActionProposal; status: "pending" | "confirmed" | "cancelled" }
  | { role: "assistant-error"; text: string };

/**
 * Copilot com ações reais — o próximo passo depois do Copilot que só
 * escrevia texto (insight do dia). Aqui o usuário pode pedir "cria
 * uma tarefa de X", "marca o hábito Y como feito hoje", "conclui a
 * tarefa Z", "cria um evento..." em linguagem natural. O Gemini pode
 * PROPOR uma dessas ações via function calling, mas o backend nunca
 * grava nada sozinho — toda proposta aparece aqui como um cartão de
 * confirmação, e só é executada quando o usuário clica em "Confirmar"
 * (nenhuma exceção, nem para ações reversíveis como marcar hábito).
 */
export function CopilotAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const { ask, isAsking, confirm, isConfirming } = useCopilotAssistant();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isAsking) return;
    setInput("");
    setHistory((h) => [...h, { role: "user", text: message }]);

    try {
      const res = await ask(message);
      if (res.kind === "reply") {
        setHistory((h) => [...h, { role: "assistant", text: res.text }]);
      } else if (res.kind === "clarify") {
        setHistory((h) => [...h, { role: "assistant", text: res.message }]);
      } else {
        setHistory((h) => [...h, { role: "assistant-proposal", proposal: res.proposal, status: "pending" }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui falar com o Copilot agora.";
      setHistory((h) => [...h, { role: "assistant-error", text: message }]);
    }
  };

  const handleConfirm = async (index: number, proposal: CopilotActionProposal) => {
    try {
      const res = await confirm({ action: proposal.action, args: proposal.args });
      setHistory((h) => {
        const next = [...h];
        next[index] = { ...(next[index] as Extract<ChatEntry, { role: "assistant-proposal" }>), status: "confirmed" };
        return [...next, { role: "assistant", text: res.message }];
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui executar essa ação.";
      setHistory((h) => [...h, { role: "assistant-error", text: message }]);
    }
  };

  const handleCancel = (index: number) => {
    setHistory((h) => {
      const next = [...h];
      next[index] = { ...(next[index] as Extract<ChatEntry, { role: "assistant-proposal" }>), status: "cancelled" };
      return next;
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir o LifeOS Copilot"
        className="fixed z-20 bottom-20 md:bottom-6 right-4 md:right-6 w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-brand-500 to-signal text-white shadow-glow-brand"
      >
        <Sparkles size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center md:justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="w-full md:w-[400px] md:mr-6 md:mb-6 h-[85vh] md:h-[600px] max-h-[85vh] rounded-t-2xl md:rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-paper-border dark:border-ink-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500/15 to-signal/15 text-brand-600 dark:text-brand-400">
                  <Sparkles size={15} />
                </span>
                <p className="text-sm font-semibold">LifeOS Copilot</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {history.length === 0 && (
                <div className="text-xs text-slate space-y-2">
                  <p>Peça pra eu fazer algo: criar uma tarefa, concluir uma tarefa, marcar um hábito, mover uma tarefa ou criar um evento.</p>
                  <p className="italic">Eu sempre mostro o que vou fazer antes de gravar qualquer coisa — nada acontece sem você confirmar.</p>
                </div>
              )}
              {history.map((entry, i) => {
                if (entry.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm bg-gradient-to-r from-brand-500 to-signal text-white">
                        {entry.text}
                      </p>
                    </div>
                  );
                }
                if (entry.role === "assistant") {
                  return (
                    <div key={i} className="flex justify-start">
                      <p className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border">
                        {entry.text}
                      </p>
                    </div>
                  );
                }
                if (entry.role === "assistant-error") {
                  return (
                    <div key={i} className="flex justify-start">
                      <p className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm bg-drop/10 text-drop border border-drop/30">
                        {entry.text}
                      </p>
                    </div>
                  );
                }
                // assistant-proposal
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[90%] w-full rounded-2xl rounded-tl-sm border border-brand-500/30 bg-gradient-to-br from-brand-50 to-transparent dark:from-brand-700/15 p-3 space-y-2.5">
                      <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-100">Proposta de ação</p>
                      <p className="text-sm">{entry.proposal.summary}</p>
                      {entry.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <Button onClick={() => handleConfirm(i, entry.proposal)} disabled={isConfirming} className="!py-1.5 !px-3 text-xs">
                            <Check size={13} /> Confirmar
                          </Button>
                          <Button variant="secondary" onClick={() => handleCancel(i)} className="!py-1.5 !px-3 text-xs">
                            <Ban size={13} /> Cancelar
                          </Button>
                        </div>
                      )}
                      {entry.status === "confirmed" && <p className="text-[11px] text-growth font-medium">✓ Confirmado e executado.</p>}
                      {entry.status === "cancelled" && <p className="text-[11px] text-slate font-medium">Cancelado — nada foi gravado.</p>}
                    </div>
                  </div>
                );
              })}
              {isAsking && <p className="text-xs text-slate">Pensando…</p>}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 border-t border-paper-border dark:border-ink-border shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex.: cria uma tarefa de revisar o relatório"
                className="flex-1 min-w-0 rounded-full px-3.5 py-2 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={isAsking || !input.trim()}
                aria-label="Enviar"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-r from-brand-500 to-signal text-white disabled:opacity-50"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
