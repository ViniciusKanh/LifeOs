import { useEffect, useState } from "react";
import { X, Play, Square, Trash2, Repeat } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { useTaskTimer } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { WEEKDAY_CODES, WEEKDAY_LABELS, buildRecurrenceRule, parseRecurrenceRule, type RecurrenceFreq } from "@/utils/recurrence";
import type { Task, TaskPriority } from "@/types";
import type { TaskInput } from "@/services/taskService";

/**
 * Rótulo do tipo de projeto no seletor — é o que faz uma tarefa
 * "contar" como profissional na dimensão Profissional do Life Score
 * (ver professionalScore em apps/api/src/services/metricsService.ts):
 * sem vincular a tarefa a um projeto Workspace/Profissional aqui, ela
 * nunca entra nesse cálculo, mesmo que seja trabalho de verdade.
 */
const KIND_LABEL: Record<string, string> = {
  personal: "Pessoal",
  workspace: "Workspace",
  professional: "Profissional",
  academic: "Acadêmico",
};

/** Seletor 1-5 compacto (pontinhos) usado pelos campos de Priority Score — 0 = não preenchido. */
function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] text-slate">{label}</label>
      <div className="flex items-center gap-1 mt-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? 0 : n)}
            aria-label={`${label}: ${n}`}
            className={`w-5 h-5 rounded-full border transition-colors ${
              n <= value ? "bg-brand-500 border-brand-500" : "border-paper-border dark:border-ink-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

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
  const [projectId, setProjectId] = useState<string>(task?.project_id ?? "");
  const [impact, setImpact] = useState(task?.impact ?? 0);
  const [urgency, setUrgency] = useState(task?.urgency ?? 0);
  const [effort, setEffort] = useState(task?.effort ?? 0);
  const initialRecurrence = parseRecurrenceRule(task?.recurrence_rule ?? null);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>(initialRecurrence.freq);
  const [recurrenceByDay, setRecurrenceByDay] = useState<string[]>(initialRecurrence.byDay);
  const [saving, setSaving] = useState(false);

  const { projects } = useProjects();
  const selectedProject = projects.find((p) => p.id === projectId);
  const isProfessional = selectedProject?.kind === "professional";
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
        projectId: projectId || null,
        impact: isProfessional && impact > 0 ? impact : null,
        urgency: isProfessional && urgency > 0 ? urgency : null,
        effort: isProfessional && effort > 0 ? effort : null,
        recurrenceRule: buildRecurrenceRule({ freq: recurrenceFreq, byDay: recurrenceByDay }),
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

          <div>
            <label className="text-xs text-slate">Projeto (opcional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="">Sem projeto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {KIND_LABEL[p.kind] ?? p.kind}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate mt-1">
              Vincular a um projeto Workspace ou Profissional é o que faz a tarefa contar na dimensão "Profissional" do Life Score.
            </p>
          </div>

          {isProfessional && (
            <div className="rounded-xl p-4 border border-paper-border dark:border-ink-border">
              <p className="text-xs font-semibold mb-0.5">Priority Score (opcional)</p>
              <p className="text-[11px] text-slate mb-3">
                Preenchendo os três, a tarefa entra ordenada por score na tela Profissional — impacto × urgência ÷ esforço.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <ScoreField label="Impacto" value={impact} onChange={setImpact} />
                <ScoreField label="Urgência" value={urgency} onChange={setUrgency} />
                <ScoreField label="Esforço" value={effort} onChange={setEffort} />
              </div>
              {impact > 0 && urgency > 0 && effort > 0 && (
                <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium mt-2.5">
                  Score: {((impact * urgency) / effort).toFixed(1)}
                </p>
              )}
            </div>
          )}

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

          <div className="rounded-xl p-4 border border-paper-border dark:border-ink-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Repeat size={14} className="text-slate" />
              <p className="text-xs font-semibold">Repetir</p>
            </div>
            <select
              value={recurrenceFreq}
              onChange={(e) => {
                const freq = e.target.value as RecurrenceFreq;
                setRecurrenceFreq(freq);
                if (freq !== "WEEKLY") setRecurrenceByDay([]);
              }}
              className="w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="">Não repetir</option>
              <option value="DAILY">Diariamente</option>
              <option value="WEEKLY">Semanalmente</option>
              <option value="MONTHLY">Mensalmente</option>
            </select>
            {recurrenceFreq === "WEEKLY" && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {WEEKDAY_CODES.map((code) => {
                  const active = recurrenceByDay.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() =>
                        setRecurrenceByDay((prev) =>
                          active ? prev.filter((d) => d !== code) : [...prev, code]
                        )
                      }
                      className={`w-10 h-8 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-paper-border dark:border-ink-border text-slate"
                      }`}
                    >
                      {WEEKDAY_LABELS[code]}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate mt-2">
              Ao concluir, uma nova tarefa é criada automaticamente na próxima data — o histórico desta é preservado.
            </p>
          </div>

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
