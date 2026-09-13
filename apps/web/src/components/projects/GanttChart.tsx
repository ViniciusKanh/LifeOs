import { useMemo, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import type { GanttTask } from "@/types";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function formatShort(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

const PRIORITY_COLOR: Record<string, string> = {
  Alta: "bg-drop",
  Média: "bg-signal",
  Baixa: "bg-cat-teal",
};

/**
 * Gantt real, desenhado com divs/CSS (sem lib externa): cada tarefa
 * vira uma linha, a barra é posicionada e dimensionada em % dentro da
 * janela [menor start_date/due_date, maior due_date] do projeto.
 * Tarefas concluídas ficam esverdeadas independente da prioridade —
 * o que importa visualmente ali é "já terminou", não a prioridade
 * que ela tinha.
 */
export function GanttChart({
  tasks,
  onEditDates,
  onAddDependency,
  onRemoveDependency,
}: {
  tasks: GanttTask[];
  onEditDates: (task: GanttTask) => void;
  onAddDependency: (taskId: string, dependsOnId: string) => void;
  onRemoveDependency: (taskId: string, dependsOnId: string) => void;
}) {
  const [addingDepFor, setAddingDepFor] = useState<string | null>(null);

  const { rangeStart, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    for (const t of tasks) {
      const s = parseDate(t.startDate);
      const d = parseDate(t.dueDate);
      if (s) dates.push(s);
      if (d) dates.push(d);
    }
    if (dates.length === 0) {
      const today = new Date();
      return { rangeStart: today, totalDays: 14 };
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    // Uma folga de 1 dia de cada lado pra as barras não colarem na borda.
    min.setDate(min.getDate() - 1);
    max.setDate(max.getDate() + 1);
    return { rangeStart: min, totalDays: Math.max(1, daysBetween(min, max)) };
  }, [tasks]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const todayOffset = useMemo(() => {
    const pct = (daysBetween(rangeStart, new Date()) / totalDays) * 100;
    return pct >= 0 && pct <= 100 ? pct : null;
  }, [rangeStart, totalDays]);

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-slate py-10 text-center">
        Nenhuma tarefa deste projeto tem data de início ou prazo ainda — adicione datas nas tarefas para vê-las aqui.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex items-center justify-between text-[11px] text-slate mb-2 px-1">
          <span>{formatShort(rangeStart)}</span>
          <span>{formatShort(new Date(rangeStart.getTime() + totalDays * 86_400_000))}</span>
        </div>

        <div className="relative space-y-2">
          {todayOffset !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-brand-500/60 z-10"
              style={{ left: `${todayOffset}%` }}
              title="Hoje"
            />
          )}

          {tasks.map((task) => {
            const start = parseDate(task.startDate) ?? parseDate(task.dueDate)!;
            const end = parseDate(task.dueDate) ?? parseDate(task.startDate)!;
            const offsetPct = Math.max(0, (daysBetween(rangeStart, start) / totalDays) * 100);
            const widthPct = Math.max(2, (Math.max(1, daysBetween(start, end)) / totalDays) * 100);
            const isDone = task.status === "Concluído";
            const barColor = isDone ? "bg-growth" : PRIORITY_COLOR[task.priority] ?? "bg-cat-blue";

            return (
              <div key={task.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 truncate text-xs" title={task.title}>
                  {task.title}
                </div>
                <div className="relative flex-1 h-7 rounded-lg bg-paper dark:bg-ink">
                  <button
                    onClick={() => onEditDates(task)}
                    className={`absolute top-1 bottom-1 rounded-md ${barColor} hover:brightness-110 transition-all flex items-center px-1.5 overflow-hidden`}
                    style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                    title={`${task.title} — clique para editar as datas`}
                  >
                    {task.dependsOn.length > 0 && <Link2 size={10} className="text-white/90 shrink-0" />}
                  </button>
                </div>
                <div className="w-32 shrink-0 flex items-center gap-1 flex-wrap">
                  {task.dependsOn.map((depId) => {
                    const dep = byId.get(depId);
                    if (!dep) return null;
                    return (
                      <span
                        key={depId}
                        className="inline-flex items-center gap-1 text-[10px] rounded-full pl-2 pr-1 py-0.5 bg-paper dark:bg-ink text-slate"
                        title={`Depende de: ${dep.title}`}
                      >
                        <span className="truncate max-w-[70px]">{dep.title}</span>
                        <button onClick={() => onRemoveDependency(task.id, depId)} className="hover:text-drop">
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                  {addingDepFor === task.id ? (
                    <select
                      autoFocus
                      onChange={(e) => {
                        if (e.target.value) onAddDependency(task.id, e.target.value);
                        setAddingDepFor(null);
                      }}
                      onBlur={() => setAddingDepFor(null)}
                      className="text-[10px] rounded-full px-1.5 py-0.5 bg-paper dark:bg-ink border border-paper-border dark:border-ink-border"
                    >
                      <option value="">Depende de...</option>
                      {tasks
                        .filter((t) => t.id !== task.id && !task.dependsOn.includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setAddingDepFor(task.id)}
                      className="inline-flex items-center gap-0.5 text-[10px] text-slate rounded-full px-1.5 py-0.5 border border-dashed border-paper-border dark:border-ink-border hover:border-brand-500 hover:text-brand-600"
                    >
                      <Plus size={9} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
