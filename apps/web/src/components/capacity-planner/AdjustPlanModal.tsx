import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { EFFORT_LABEL } from "./capacityColors";
import type { CapacityPlanningSuggestion } from "@/types";

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function AdjustPlanModal({
  suggestion,
  loading,
  applying,
  onClose,
  onConfirm,
}: {
  suggestion: CapacityPlanningSuggestion | undefined;
  loading: boolean;
  applying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-card max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-paper-border dark:border-ink-border flex items-center gap-2.5">
          <Wand2 size={18} className="text-brand-600 dark:text-brand-400" />
          <p className="font-display font-bold text-lg">✨ Ajustar plano automaticamente</p>
        </div>
        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-slate">Calculando sugestão…</p>
          ) : !suggestion ? (
            <p className="text-sm text-slate">Não foi possível calcular uma sugestão agora.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-paper-border dark:border-ink-border p-3">
                  <p className="text-[11px] text-slate">⚠️ Sobrecarga atual</p>
                  <p className="font-display font-bold text-lg">{fmt(suggestion.overloadBeforeMinutes)}</p>
                </div>
                <div className="rounded-xl border border-paper-border dark:border-ink-border p-3">
                  <p className="text-[11px] text-slate">✅ Sobrecarga após o plano</p>
                  <p className="font-display font-bold text-lg">{fmt(suggestion.overloadAfterMinutes)}</p>
                </div>
              </div>

              {suggestion.proposed.length === 0 ? (
                <p className="text-sm text-slate">Nenhuma tarefa pôde ser reorganizada.</p>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate mb-2">🗓️ Plano sugerido</p>
                  <ul className="space-y-1.5">
                    {suggestion.proposed.map((p) => (
                      <li key={p.taskId} className="flex items-center justify-between text-sm rounded-lg bg-paper dark:bg-ink px-3 py-2">
                        <span className="truncate">{p.title}</span>
                        <span className="text-xs text-slate shrink-0 ml-2">
                          {p.startTime}–{p.endTime} · {EFFORT_LABEL[p.blockType]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestion.deferred.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate mb-2">⏳ Não coube hoje</p>
                  <ul className="space-y-1.5">
                    {suggestion.deferred.map((d) => (
                      <li key={d.taskId} className="text-xs text-slate">
                        {d.title} — {d.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-5 border-t border-paper-border dark:border-ink-border flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={loading || applying || !suggestion || suggestion.proposed.length === 0}>
            {applying ? "Aplicando…" : "Aplicar plano"}
          </Button>
        </div>
      </div>
    </div>
  );
}
