import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flame,
  LayoutGrid,
  List,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { Button, PageHeader, StatTile } from "@/components/ui/primitives";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskModal } from "@/components/tasks/TaskModal";
import type { Task } from "@/types";

const COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];
const PRIORITY_OPTIONS: Array<Task["priority"] | "todas"> = ["todas", "Alta", "Média", "Baixa"];
const DONE_LIMIT = 4;

function dateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function taskFocusScore(task: Task) {
  const priority = task.priority === "Alta" ? 35 : task.priority === "Média" ? 20 : 8;
  const status = task.status === "Em Andamento" ? 18 : task.status === "Em Revisão" ? 12 : task.status === "A Fazer" ? 8 : 0;
  const due = task.due_date?.slice(0, 10);
  const today = dateKey();
  const urgency = due ? (due < today ? 35 : due === today ? 28 : due <= addDays(3) ? 18 : 6) : 0;
  return priority + status + urgency;
}

function formatDueDate(value: string | null) {
  if (!value) return "Sem prazo";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

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
  const highCount = tasks.filter((t) => t.priority === "Alta" && t.status !== "Concluído").length;
  const inProgressCount = tasks.filter((t) => t.status === "Em Andamento").length;
  const totalOpen = tasks.filter((t) => t.status !== "Concluído").length;
  const donePct = tasks.length > 0 ? Math.round((tasks.filter((t) => t.status === "Concluído").length / tasks.length) * 100) : 0;
  const today = dateKey();
  const weekEnd = addDays(7);
  const overdueCount = tasks.filter((t) => t.status !== "Concluído" && t.due_date && t.due_date.slice(0, 10) < today).length;
  const dueThisWeek = tasks.filter((t) => t.status !== "Concluído" && t.due_date && t.due_date.slice(0, 10) >= today && t.due_date.slice(0, 10) <= weekEnd);
  const nextBestTask = [...tasks].filter((t) => t.status !== "Concluído").sort((a, b) => taskFocusScore(b) - taskFocusScore(a))[0] ?? null;
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
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<ListChecks size={20} />}
        title="Tarefas"
        subtitle="Organize suas tarefas e mantenha o foco no que realmente importa."
        actions={
          <Button onClick={() => openNew()}>
            <Plus size={15} /> Adicionar
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-brand-500/15 bg-gradient-to-br from-brand-600 via-cat-purple to-signal p-5 text-white shadow-card">
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-display text-2xl font-bold">Central de execução</p>
              <p className="mt-1 max-w-xl text-sm text-white/85">
                Priorize o que vence primeiro, mova as tarefas pelo fluxo e conclua pelo status. O progresso vem do que realmente foi finalizado.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/15 px-3 py-2">
                <p className="text-xl font-bold">{totalOpen}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/75">abertas</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2">
                <p className="text-xl font-bold">{dueThisWeek.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/75">7 dias</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2">
                <p className="text-xl font-bold">{donePct}%</p>
                <p className="text-[10px] uppercase tracking-wide text-white/75">feito</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-paper-border bg-paper-raised p-5 shadow-card dark:border-ink-border dark:bg-ink-raised">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-brand-600 dark:text-brand-400" />
            <p className="text-sm font-semibold">Foque nisso agora</p>
          </div>
          {nextBestTask ? (
            <button onClick={() => openEdit(nextBestTask)} className="w-full rounded-xl border border-brand-500/20 bg-brand-50/70 p-3 text-left transition-colors hover:border-brand-500/50 dark:bg-brand-700/15">
              <p className="text-sm font-semibold">{nextBestTask.title}</p>
              <p className="mt-1 text-xs text-slate">
                {nextBestTask.priority} · {nextBestTask.status} · {formatDueDate(nextBestTask.due_date)}
              </p>
            </button>
          ) : (
            <p className="rounded-xl border border-dashed border-paper-border px-3 py-4 text-xs text-slate dark:border-ink-border">
              Nada pendente por aqui. Bom momento para planejar a próxima entrega.
            </p>
          )}
        </div>
      </div>

      <div className="-mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-5">
        <StatTile tone="blue" icon={<ListChecks size={18} />} label="Em aberto" value={String(totalOpen)} />
        <StatTile tone="amber" icon={<Flame size={18} />} label="Prioridade alta" value={String(highCount)} />
        <StatTile tone="purple" icon={<Clock size={18} />} label="Em andamento" value={String(inProgressCount)} />
        <StatTile tone="pink" icon={<AlertTriangle size={18} />} label="Atrasadas" value={String(overdueCount)} />
        <StatTile
          tone="green"
          icon={<CheckCircle2 size={18} />}
          label="Concluídas"
          value={String(doneCount)}
          progressPct={donePct}
          caption={`${donePct}% do total`}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <TaskInsight
          icon={<CalendarDays size={15} />}
          title="Próximos 7 dias"
          description={
            dueThisWeek.length > 0
              ? `${dueThisWeek.length} tarefa${dueThisWeek.length === 1 ? "" : "s"} com prazo nesta semana.`
              : "Nenhum prazo urgente nos próximos 7 dias."
          }
        />
        <TaskInsight
          icon={<Target size={15} />}
          title="Ritmo do quadro"
          description={inProgressCount > 3 ? "Muita coisa em andamento. Vale terminar antes de puxar novas tarefas." : "Seu WIP está controlado para manter foco."}
        />
        <TaskInsight
          icon={<TrendingUp size={15} />}
          title="Conclusão"
          description={tasks.length > 0 ? `${donePct}% das tarefas cadastradas já foram concluídas.` : "Crie suas primeiras tarefas para formar histórico."}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-paper-border bg-paper-raised p-2 shadow-card dark:border-ink-border dark:bg-ink-raised">
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

        <Button className="ml-auto hidden sm:inline-flex" onClick={() => openNew()}>
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
        <div className="max-w-4xl space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate">Nenhuma tarefa encontrada.</p>
          ) : (
            filtered.map((t) => {
              const priorityAccent =
                t.priority === "Alta" ? "bg-drop" : t.priority === "Média" ? "bg-signal" : "bg-cat-teal";
              return (
                <button
                  key={t.id}
                  onClick={() => openEdit(t)}
                  className="w-full flex items-center gap-3 rounded-xl pl-3 pr-4 py-3 text-left bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border hover:border-brand-500/50 hover:shadow-card transition-all"
                >
                  <span className={`w-1 self-stretch rounded-full shrink-0 ${priorityAccent}`} />
                  {t.status === "Concluído" ? (
                    <CheckCircle2 size={16} className="text-growth shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-paper-border dark:border-ink-border shrink-0" />
                  )}
                  <span className={`text-sm flex-1 truncate ${t.status === "Concluído" ? "line-through text-slate" : ""}`}>{t.title}</span>
                  {t.due_date && (
                    <span className="text-[11px] text-slate shrink-0 hidden sm:inline">
                      {new Date(`${t.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  )}
                  <span className="text-[11px] font-medium text-slate shrink-0 rounded-full px-2 py-0.5 bg-paper dark:bg-ink border border-paper-border dark:border-ink-border">
                    {t.status}
                  </span>
                </button>
              );
            })
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

function TaskInsight({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-paper-border bg-paper-raised p-4 shadow-card dark:border-ink-border dark:bg-ink-raised">
      <div className="mb-2 flex items-center gap-2 text-brand-600 dark:text-brand-400">
        {icon}
        <p className="text-sm font-semibold text-inherit">{title}</p>
      </div>
      <p className="text-xs leading-relaxed text-slate">{description}</p>
    </div>
  );
}
