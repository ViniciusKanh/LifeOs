import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search, ChevronDown } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { Button } from "@/components/ui/primitives";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskModal } from "@/components/tasks/TaskModal";
import type { Task } from "@/types";

const COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];
const PRIORITY_OPTIONS: Array<Task["priority"] | "todas"> = ["todas", "Alta", "Média", "Baixa"];
const DONE_LIMIT = 4;

export function TarefasPage() {
  const { tasks, createTask, updateTask, removeTask, moveTask } = useTasks();
  const [view, setView] = useState<"quadro" | "lista">("quadro");
  const [priorityFilter, setPriorityFilter] = useState<Task["priority"] | "todas">("todas");
  const [search, setSearch] = useState("");
  const [showAllDone, setShowAllDone] = useState(false);
  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null; initialStatus?: string }>({
    open: false,
    task: null,
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (priorityFilter !== "todas" && t.priority !== priorityFilter) return false;
      if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [tasks, priorityFilter, search]);

  const doneCount = filtered.filter((t) => t.status === "Concluído").length;
  const visible = useMemo(() => {
    if (showAllDone || doneCount <= DONE_LIMIT) return filtered;
    const hiddenIds = new Set(
      filtered
        .filter((t) => t.status === "Concluído")
        .slice(DONE_LIMIT)
        .map((t) => t.id)
    );
    return filtered.filter((t) => !hiddenIds.has(t.id));
  }, [filtered, showAllDone, doneCount]);

  const openNew = (status?: string) => setModalState({ open: true, task: null, initialStatus: status });
  const openEdit = (task: Task) => setModalState({ open: true, task });
  const close = () => setModalState({ open: false, task: null });

  const handleSave = async (input: Parameters<typeof createTask>[0]) => {
    if (modalState.task) {
      await updateTask({ id: modalState.task.id, patch: input });
    } else {
      await createTask({ ...input, status: input.status ?? modalState.initialStatus });
    }
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between mb-1 max-w-none gap-3 flex-wrap">
        <div>
          <p className="font-display font-bold text-2xl">Tarefas</p>
          <p className="text-sm text-slate mt-0.5">Organize suas tarefas e mantenha o foco no que realmente importa.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-5 mb-5">
        <div className="flex items-center rounded-xl border border-paper-border dark:border-ink-border p-1 bg-paper-raised dark:bg-ink-raised">
          <button
            onClick={() => setView("quadro")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              view === "quadro" ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate"
            }`}
          >
            <LayoutGrid size={13} /> Quadro
          </button>
          <button
            onClick={() => setView("lista")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              view === "lista" ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate"
            }`}
          >
            <List size={13} /> Lista
          </button>
        </div>

        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Task["priority"] | "todas")}
            className="appearance-none rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised pl-3 pr-8 py-2 text-xs font-medium"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === "todas" ? "Todas as prioridades" : p}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefas..."
            className="w-full rounded-xl pl-8 pr-3 py-2 text-xs bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
          />
        </div>

        <Button className="ml-auto" onClick={() => openNew()}>
          <Plus size={15} /> Adicionar
        </Button>
      </div>

      {view === "quadro" ? (
        <KanbanBoard
          columns={COLUMNS}
          items={visible}
          getId={(t) => t.id}
          getStatus={(t) => t.status}
          onMove={(id, status) => moveTask({ id, status })}
          renderCard={(task, dragProps) => <TaskCard task={task} onClick={() => openEdit(task)} dragProps={dragProps} />}
          renderColumnFooter={(col) => (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={() => openNew(col)}
                className="w-full text-xs text-slate rounded-lg px-2 py-2 border border-dashed border-paper-border dark:border-ink-border hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={12} /> Adicionar tarefa
              </button>
              {col === "Concluído" && doneCount > DONE_LIMIT && (
                <button
                  onClick={() => setShowAllDone((v) => !v)}
                  className="w-full text-xs font-semibold text-brand-600 dark:text-brand-500 rounded-lg px-2 py-1.5 bg-brand-50 dark:bg-brand-700/15"
                >
                  {showAllDone ? "Ver menos" : `Ver tarefas concluídas (${doneCount})`}
                </button>
              )}
            </div>
          )}
        />
      ) : (
        <div className="space-y-1.5 max-w-3xl">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate">Nenhuma tarefa encontrada.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => openEdit(t)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border hover:border-brand-500/50 transition-colors"
              >
                <span className={`text-sm flex-1 truncate ${t.status === "Concluído" ? "line-through text-slate" : ""}`}>{t.title}</span>
                <span className="text-xs text-slate shrink-0">{t.status}</span>
              </button>
            ))
          )}
        </div>
      )}

      {modalState.open && (
        <TaskModal
          task={modalState.task}
          statusOptions={COLUMNS}
          onClose={close}
          onSave={handleSave}
          onDelete={removeTask}
        />
      )}
    </div>
  );
}
