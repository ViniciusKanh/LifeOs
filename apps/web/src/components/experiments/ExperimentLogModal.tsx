import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import type { Experiment, ExperimentCheckinStatus, ExperimentPerception } from "@/types";

const PERCEPTION_OPTIONS: Array<{ value: ExperimentPerception; label: string; emoji: string }> = [
  { value: "muito_ruim", label: "Muito ruim", emoji: "😞" },
  { value: "ruim", label: "Ruim", emoji: "🙁" },
  { value: "neutro", label: "Neutro", emoji: "😐" },
  { value: "bom", label: "Bom", emoji: "🙂" },
  { value: "muito_bom", label: "Muito bom", emoji: "😄" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Modal "Registrar observação" (seção 17) — quando a verificação é manual, também mostra o check-in do dia, porque é o mesmo registro. */
export function ExperimentLogModal({
  experiment,
  onClose,
  onSave,
  isSaving,
}: {
  experiment: Experiment;
  onClose: () => void;
  onSave: (input: { logDate: string; checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) => Promise<unknown>;
  isSaving?: boolean;
}) {
  const [logDate, setLogDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [perception, setPerception] = useState<ExperimentPerception | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<ExperimentCheckinStatus | null>(null);

  const handleSave = async () => {
    await onSave({ logDate, notes: notes.trim() || null, perception, checkinStatus });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <p className="text-sm font-semibold">Nova observação</p>
          <button onClick={onClose} className="text-slate" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Data" type="date" value={logDate} max={today()} onChange={(e) => setLogDate(e.target.value)} />

          {experiment.verification_type === "manual" && (
            <div>
              <p className="text-xs text-slate mb-1.5">Você seguiu o comportamento proposto neste dia?</p>
              <div className="flex gap-2">
                <Button type="button" variant={checkinStatus === "done" ? "primary" : "secondary"} onClick={() => setCheckinStatus("done")}>
                  Sim
                </Button>
                <Button type="button" variant={checkinStatus === "missed" ? "primary" : "secondary"} onClick={() => setCheckinStatus("missed")}>
                  Não
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate">Como foi hoje?</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Ex.: Dormi às 22h40 e acordei bem disposto."
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-slate">Percepção</label>
            <div className="flex items-center gap-2 mt-1.5">
              {PERCEPTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPerception(perception === opt.value ? null : opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg border transition-colors ${
                    perception === opt.value ? "border-brand-500 bg-brand-500/10" : "border-paper-border dark:border-ink-border"
                  }`}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-paper-border dark:border-ink-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>Salvar observação</Button>
        </div>
      </div>
    </div>
  );
}
