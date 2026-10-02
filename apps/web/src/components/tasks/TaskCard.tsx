import { ArrowRightLeft, Calendar, Check, Clock, FolderKanban, Repeat, Sparkles, Target } from "lucide-react";
import type { Task } from "@/types";
import { describeRecurrenceRule } from "@/utils/recurrence";
import { dueInfo } from "@/utils/taskInsights";
import { DONE_STATUS } from "@/utils/taskStatus";
import type { KanbanDragProps } from "@/components/kanban/KanbanBoard";

const PRIORITY_BAR: Record<Task["priority"], string> = {
  Alta: "bg-drop",
  Média: "bg-signal",
  Baixa: "bg-cat-teal",
};
const PRIORITY_TONE: Record<Task["priority"], string> = {
  Alta: "text-drop bg-drop/10",
  Média: "text-signal-deep bg-signal/15 dark:text-signal",
  Baixa: "text-slate bg-slate/10",
};

function fmtMinutes(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

/**
 * Card de tarefa do Kanban. Ações rápidas no próprio card (concluir e
 * "mover para") funcionam também no celular, onde arrastar não existe.
 * As props extras são opcionais: quem não passa (Educação) continua com
 * o card simples.
 */
export function TaskCard({
  task,
  onClick,
  dragProps,
  onToggleDone,
  onMove,
  statuses,
  projectName,
}: {
  task: Task;
  onClick: () => void;
  dragProps: KanbanDragProps;
  onToggleDone?: () => void;
  onMove?: (status: string) => void;
  statuses?: string[];
  projectName?: string | null;
}) {
  const due = dueInfo(task);
  const isDone = task.status === DONE_STATUS;
  const recurrenceLabel = describeRecurrenceRule(task.recurrence_rule);

  return (
    <div
      draggable={dragProps.draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        dragProps.onDragStart();
      }}
      onDragEnd={dragProps.onDragEnd}
      className={`group relative w-full rounded-xl bg-paper-raised dark:bg-ink-raised border shadow-card cursor-grab active:cursor-grabbing transition-all hover:-translate-y-px hover:shadow-md ${
        due?.kind === "overdue" ? "border-drop/35" : "border-paper-border dark:border-ink-border hover:border-brand-500/40"
      } ${dragProps.isDragging ? "ring-2 ring-brand-500/50" : ""}`}
    >
      <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${PRIORITY_BAR[task.priority]} ${isDone ? "opacity-30" : ""}`} aria-hidden />

      <div className="flex items-start gap-2.5 pl-3.5 pr-2.5 pt-3 pb-2.5">
        {onToggleDone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            aria-label={isDone ? `Reabrir "${task.title}"` : `Concluir "${task.title}"`}
            className={`mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${
              isDone
                ? "bg-growth border-growth text-white"
                : "border-paper-border dark:border-ink-border hover:border-growth hover:bg-growth/10 text-transparent hover:text-growth"
            }`}
          >
            <Check size={11} strokeWidth={3} />
          </button>
        )}

        <button type="button" onClick={onClick} className="flex-1 min-w-0 text-left outline-none">
          <span className={`block text-sm font-medium leading-snug line-clamp-2 ${isDone ? "line-through text-slate" : ""}`}>{task.title}</span>
          {task.description && !isDone && <span className="block text-xs text-slate mt-0.5 line-clamp-1">{task.description}</span>}

          <span className="flex items-center flex-wrap gap-1.5 mt-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
            {due && !isDone && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${due.tone}`}>
                <Calendar size={10} /> {due.label}
              </span>
            )}
            {projectName && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate max-w-[120px]" title={projectName}>
                <FolderKanban size={10} className="shrink-0" /> <span className="truncate">{projectName}</span>
              </span>
            )}
            {task.estimate_minutes ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate">
                <Clock size={10} /> {fmtMinutes(task.estimate_minutes)}
              </span>
            ) : null}
            {recurrenceLabel && (
              <span className="inline-flex items-center text-[10px] text-slate" title={recurrenceLabel}>
                <Repeat size={10} />
              </span>
            )}
            {task.goal_id && (
              <span className="inline-flex items-center text-[10px] text-cat-purple" title="Ligada a uma meta">
                <Target size={10} />
              </span>
            )}
            {task.habit_id && (
              <span className="inline-flex items-center gap-1 text-[10px] text-cat-green" title="Gerada a partir de um hábito">
                <Sparkles size={10} /> Hábito
              </span>
            )}
          </span>
        </button>

        {onMove && statuses && (
          // Select nativo invisível sobre o ícone: acessível e funciona no toque.
          <label
            className="relative shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-opacity"
            title="Mover para…"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowRightLeft size={13} />
            <select
              aria-label={`Mover "${task.title}" para`}
              value={task.status}
              onChange={(e) => onMove(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
