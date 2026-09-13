import { useEffect, useState } from "react";
import { X, Play, Square, Trash2 } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { useTaskTimer } from "@/hooks/useTasks";
import type { Task, TaskPriority } from "@/types";
import type { TaskInput } from "@/services/taskService";

function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}min` : `${m}min`;
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function TaskModal({
  task,
  statusOptions,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  statusOptions: string[];
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
}) {
  const isEditing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState(task?.status ?? statusOptions[0]);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "Média");
  const [startDate, setStartDate] = useState(toDateInput(task?.start_date ?? null));
  const [dueDate, setDueDate] = useState(toDateInput(task?.due_date ?? null));
  const [estimateMinutes, setEstimateMinutes] = useState(task?.estimate_minutes ? String(task.estimate_minutes) : "");
  const [saving, setSaving] = useState(false);

  const { activeEntry, start, stop, isStarting, isStopping } = useTaskTimer(task?.id ?? null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }
    const startedAt = new Date(activeEntry.started_at.replace(" ", "T") + "Z").getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimateMinutes: estimateMinutes ? Number(estimateMinutes) : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <p className="text-sm font-semibold">{isEditing ? "Editar tarefa" : "Nova tarefa"}</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 md:p-6 space-y-4">
          <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />

          <div>
            <label className="text-xs text-slate">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalhes, critérios de conclusão, links..."
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de início" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Field label="Data de término" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <Field
            label="Estimativa (minutos, opcional)"
            type="number"
            min={0}
            value={estimateMinutes}
            onChange={(e) => setEstimateMinutes(e.target.value)}
          />

          {isEditing && task && (
            <div className="rounded-xl p-4 border border-paper-border dark:border-ink-border">
              <p className="text-xs font-semibold mb-2">Tempo dedicado</p>
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  Total registrado: <span className="font-semibold">{formatMinutes(task.time_spent_minutes)}</span>
                </p>
                {activeEntry ? (
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg tabular-nums">{formatClock(elapsed)}</span>
                    <Button variant="secondary" onClick={() => stop()} disabled={isStopping}>
                      <Square size={13} /> Parar
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => start()} disabled={isStarting}>
                    <Play size={13} /> Iniciar cronômetro
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate mt-2">
                Inicie o cronômetro enquanto trabalha nesta tarefa — o tempo é somado automaticamente ao total ao parar.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {isEditing && onDelete ? (
              <button
                onClick={async () => {
                  await onDelete(task!.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 text-xs text-drop"
              >
                <Trash2 size={14} /> Excluir tarefa
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar tarefa"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
