import { useMemo, useState } from "react";
import { Clock, X } from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";
import type { CapacityDayTask, CapacityPlannedBlock } from "@/types";

const FILTERS: Array<{ value: "Todas" | "Alta" | "Média" | "Baixa" }> = [
  { value: "Todas" },
  { value: "Alta" },
  { value: "Média" },
  { value: "Baixa" },
];

function suggestTimes(estimateMinutes: number | null): { start: string; end: string } {
  const start = "09:00";
  const dur = estimateMinutes ?? 30;
  const endMinutes = 9 * 60 + dur;
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return { start, end };
}

export function DayTasksCard({
  tasks,
  blocks,
  onToggleDone,
  onSchedule,
  onRemoveSchedule,
}: {
  tasks: CapacityDayTask[];
  blocks: CapacityPlannedBlock[];
  onToggleDone: (taskId: string) => void;
  onSchedule: (taskId: string, startTime: string, endTime: string) => void;
  onRemoveSchedule: (blockId: string) => void;
}) {
  const [filter, setFilter] = useState<"Todas" | "Alta" | "Média" | "Baixa">("Todas");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ start: "09:00", end: "09:30" });

  const filtered = useMemo(() => (filter === "Todas" ? tasks : tasks.filter((t) => t.priority === filter)), [tasks, filter]);
  const blockByTaskId = useMemo(() => new Map(blocks.filter((b) => b.entityType === "task" && b.entityId).map((b) => [b.entityId as string, b])), [blocks]);

  function startEditing(task: CapacityDayTask) {
    setDraft(suggestTimes(task.estimateMinutes));
    setEditingTaskId(task.id);
  }

  function saveSchedule(taskId: string) {
    onSchedule(taskId, draft.start, draft.end);
    setEditingTaskId(null);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm font-semibold">Tarefas do dia</p>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "primary" : "secondary"}
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => setFilter(f.value)}
            >
              {f.value}
            </Button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhuma tarefa para hoje.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const block = blockByTaskId.get(t.id);
            const isEditing = editingTaskId === t.id;
            return (
              <li key={t.id} className="rounded-xl border border-paper-border dark:border-ink-border px-3 py-2.5 transition-colors hover:border-brand-300 dark:hover:border-brand-700">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => onToggleDone(t.id)}
                    className="w-4 h-4 rounded accent-brand-600 shrink-0 cursor-pointer"
                    aria-label={`Marcar "${t.title}" como concluída`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-[11px] text-slate truncate">
                      {t.estimateMinutes != null ? `${t.estimateMinutes}min` : "Sem estimativa"}
                      {t.projectName ? ` · ${t.projectName}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate shrink-0">{t.priority}</span>
                  {block ? (
                    <button
                      onClick={() => onRemoveSchedule(block.id)}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-cat-blue/10 text-cat-blue shrink-0 hover:bg-drop/10 hover:text-drop transition-colors"
                      title="Remover horário planejado"
                    >
                      {t.plannedStart}
                      <X size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={() => startEditing(t)}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg text-brand-600 dark:text-brand-400 hover:bg-paper dark:hover:bg-ink shrink-0"
                      title="Agendar horário"
                    >
                      <Clock size={12} /> Agendar
                    </button>
                  )}
                </div>
                {isEditing && (
                  <div className="flex items-center gap-2 mt-2.5 pl-7">
                    <input
                      type="time"
                      value={draft.start}
                      onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                      className="text-xs rounded-lg border border-paper-border dark:border-ink-border bg-paper dark:bg-ink px-2 py-1"
                      aria-label="Horário de início"
                    />
                    <span className="text-xs text-slate">até</span>
                    <input
                      type="time"
                      value={draft.end}
                      onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                      className="text-xs rounded-lg border border-paper-border dark:border-ink-border bg-paper dark:bg-ink px-2 py-1"
                      aria-label="Horário de término"
                    />
                    <Button className="!px-3 !py-1 !text-xs" onClick={() => saveSchedule(t.id)}>
                      Salvar
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => setEditingTaskId(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
