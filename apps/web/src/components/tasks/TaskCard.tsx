import { Calendar, Repeat } from "lucide-react";
import type { Task } from "@/types";
import { describeRecurrenceRule } from "@/utils/recurrence";

const PRIORITY_TONE: Record<Task["priority"], string> = {
  Alta: "text-drop bg-drop/10",
  Média: "text-signal-deep bg-signal/15",
  Baixa: "text-slate bg-slate/10",
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function TaskCard({
  task,
  onClick,
  dragProps,
}: {
  task: Task;
  onClick: () => void;
  dragProps: { draggable: boolean; onDragStart: () => void; onDragEnd: () => void };
}) {
  const dueLabel = formatDate(task.due_date);
  const isOverdue = task.due_date && task.status !== "Concluído" && new Date(task.due_date) < new Date(new Date().toDateString());
  const isDone = task.status === "Concluído";
  const recurrenceLabel = describeRecurrenceRule(task.recurrence_rule);

  return (
    <button
      onClick={onClick}
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      className="w-full text-left rounded-xl p-3.5 cursor-grab active:cursor-grabbing text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-card hover:border-brand-500/50 transition-colors"
    >
      <span className={`leading-snug block ${isDone ? "line-through text-slate" : ""}`}>{task.title}</span>
      {task.description && <p className="text-xs text-slate mt-1 line-clamp-2">{task.description}</p>}

      <div className="flex items-center flex-wrap gap-2 mt-2.5">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
        {dueLabel && (
          <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-drop font-semibold" : "text-slate"}`}>
            <Calendar size={11} /> {dueLabel}
          </span>
        )}
        {recurrenceLabel && (
          <span className="flex items-center gap-1 text-[10px] text-slate" title={recurrenceLabel}>
            <Repeat size={11} />
          </span>
        )}
      </div>

    </button>
  );
}
