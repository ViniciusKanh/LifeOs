import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import type { GanttTask } from "@/types";

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/** Modal enxuto pra editar as datas de uma tarefa direto do Gantt, sem abrir o TaskModal completo (que exige mais campos). */
export function GanttDatesModal({
  task,
  onClose,
  onSave,
}: {
  task: GanttTask;
  onClose: () => void;
  onSave: (patch: { startDate: string | null; dueDate: string | null }) => Promise<unknown>;
}) {
  const [startDate, setStartDate] = useState(toDateInput(task.startDate));
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ startDate: startDate || null, dueDate: dueDate || null });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold truncate pr-2">{task.title}</p>
          <button onClick={onClose} className="text-slate shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Início" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Field label="Prazo" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Salvar datas"}
          </Button>
        </div>
      </div>
    </div>
  );
}
