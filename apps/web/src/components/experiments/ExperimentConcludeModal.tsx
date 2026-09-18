import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { ExperimentPerceivedResult, ExperimentWorthContinuing } from "@/types";

const WORTH_OPTIONS: Array<{ value: ExperimentWorthContinuing; label: string }> = [
  { value: "yes", label: "Sim" },
  { value: "maybe", label: "Talvez" },
  { value: "no", label: "Não" },
];

const RESULT_OPTIONS: Array<{ value: ExperimentPerceivedResult; label: string }> = [
  { value: "improved", label: "Melhorou" },
  { value: "no_change", label: "Sem mudança clara" },
  { value: "worsened", label: "Piorou" },
];

/** Fluxo de conclusão pessoal (seção 31) — a interpretação estatística já apareceu antes; aqui é a opinião do próprio usuário. */
export function ExperimentConcludeModal({
  onClose,
  onConfirm,
  isSaving,
}: {
  onClose: () => void;
  onConfirm: (input: { personalConclusion?: string; worthContinuing?: ExperimentWorthContinuing; perceivedResult?: ExperimentPerceivedResult }) => Promise<unknown>;
  isSaving?: boolean;
}) {
  const [conclusion, setConclusion] = useState("");
  const [worth, setWorth] = useState<ExperimentWorthContinuing | null>(null);
  const [result, setResult] = useState<ExperimentPerceivedResult | null>(null);

  const handleConfirm = async () => {
    await onConfirm({ personalConclusion: conclusion.trim() || undefined, worthContinuing: worth ?? undefined, perceivedResult: result ?? undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <p className="text-sm font-semibold">Como você avalia este experimento?</p>
          <button onClick={onClose} className="text-slate" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate">Conclusão pessoal</label>
            <textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              rows={3}
              placeholder="O que você aprendeu com este experimento?"
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
            />
          </div>

          <div>
            <p className="text-xs text-slate mb-1.5">O comportamento vale a pena continuar?</p>
            <div className="flex gap-2">
              {WORTH_OPTIONS.map((opt) => (
                <Button key={opt.value} type="button" variant={worth === opt.value ? "primary" : "secondary"} onClick={() => setWorth(opt.value)}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate mb-1.5">Resultado percebido</p>
            <div className="flex gap-2 flex-wrap">
              {RESULT_OPTIONS.map((opt) => (
                <Button key={opt.value} type="button" variant={result === opt.value ? "primary" : "secondary"} onClick={() => setResult(opt.value)}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-paper-border dark:border-ink-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isSaving}>Concluir experimento</Button>
        </div>
      </div>
    </div>
  );
}
