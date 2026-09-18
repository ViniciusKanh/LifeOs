import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { CATEGORY_LABEL } from "./experimentDisplay";
import type { Experiment, ExperimentCategory, UpdateExperimentInput } from "@/types";

/** Edição dos campos textuais do experimento — data/métricas ficam fixas após o início para não invalidar a comparação já em andamento. */
export function ExperimentEditModal({ experiment, onClose, onSave, isSaving }: { experiment: Experiment; onClose: () => void; onSave: (patch: UpdateExperimentInput) => Promise<unknown>; isSaving?: boolean }) {
  const [title, setTitle] = useState(experiment.title);
  const [description, setDescription] = useState(experiment.description ?? "");
  const [hypothesis, setHypothesis] = useState(experiment.hypothesis ?? "");
  const [category, setCategory] = useState<ExperimentCategory>(experiment.category);

  const handleSave = async () => {
    await onSave({ title: title.trim(), description: description.trim() || undefined, hypothesis: hypothesis.trim() || undefined, category });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <p className="text-sm font-semibold">Editar experimento</p>
          <button onClick={onClose} className="text-slate" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Nome" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="text-xs text-slate">Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ExperimentCategory)} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border">
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none" />
          </div>
          <div>
            <label className="text-xs text-slate">Hipótese</label>
            <textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={3} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-paper-border dark:border-ink-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>Salvar alterações</Button>
        </div>
      </div>
    </div>
  );
}
