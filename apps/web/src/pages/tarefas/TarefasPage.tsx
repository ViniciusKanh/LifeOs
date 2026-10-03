import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Archive,
  Hourglass,
  ScrollText,
  Swords,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flame,
  FolderKanban,
  LayoutGrid,
  List,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { TASK_STATUSES, DONE_STATUS } from "@/utils/taskStatus";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useTheme } from "@/hooks/useTheme";
import { RPGButton, RPGIconSlot, RPGPageHeader, RPGPanel, RPGQuestCard } from "@/components/rpg";
import { DEFAULT_QUOTE, findNavItem } from "@/components/layout/navConfig";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskImportModal } from "@/components/tasks/TaskImportModal";
import {
  DUE_GROUPS,
  compareTasks,
  dueGroupOf,
  dueInfo,
  matchesQuickFilter,
  taskFocusScore,
  type QuickFilter,
} from "@/utils/taskInsights";
import type { Task } from "@/types";
import { COLUMN_ACCENT_RPG, COLUMN_HINT_RPG, COLUMN_ICON_RPG } from "@/components/kanban/rpgColumns";
import { useGamificationRules } from "@/hooks/useGamification";
import { localToday, previewTaskReward } from "@/utils/gamification";

const COLUMNS = TASK_STATUSES;
const DONE_LIMIT = 6;
const REOPEN_STATUS = "A Fazer";

// Cores das colunas seguem a paleta: cinza (backlog), azul (a fazer),
// roxo (em andamento), laranja (revisão), verde (concluído).
const COLUMN_ACCENT: Record<string, string> = {
  Backlog: "#98A2B3",
  "A Fazer": "#2F80FF",
  "Em Andamento": "#9550FF",
  "Em Revisão": "#F59E0B",
  Concluído: "#12B76A",
};

const PRIORITIES: Array<Task["priority"]> = ["Alta", "Média", "Baixa"];

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string; icon: JSX.Element; tone: string }> = [
  { key: "overdue", label: "Atrasadas", icon: <AlertTriangle size={13} />, tone: "text-drop" },
  { key: "today", label: "Para hoje", icon: <CalendarClock size={13} />, tone: "text-signal-deep dark:text-signal" },
  { key: "week", label: "7 dias", icon: <CalendarDays size={13} />, tone: "text-cat-purple" },
  { key: "high", label: "Alta prioridade", icon: <Flame size={13} />, tone: "text-drop" },
  { key: "no_date", label: "Sem prazo", icon: <CalendarDays size={13} />, tone: "text-slate" },
];

type View = "quadro" | "lista";

function readView(): View {
  try {
    return localStorage.getItem("lifeos.tasks.view") === "lista" ? "lista" : "quadro";
  } catch {
    return "quadro";
  }
}

export function TarefasPage() {
  const { tasks, isLoading, createTask, updateTask, removeTask, moveTask } = useTasks();
  const { projects } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>(readView);
  const [search, setSearch] = useState("");
  const [priorities, setPriorities] = useState<Set<Task["priority"]>>(new Set());
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [projectId, setProjectId] = useState<string>("todos");
  const [hideDone, setHideDone] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; task: Task | null; initialStatus?: string }>({ open: false, task: null });
  const searchRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { isRpg } = useTheme();

  useEffect(() => {
    try {
      localStorage.setItem("lifeos.tasks.view", view);
    } catch {
      // sem armazenamento: só não lembra a visão
    }
  }, [view]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const openNew = (status?: string) => setModal({ open: true, task: null, initialStatus: status });
  const openEdit = (task: Task) => setModal({ open: true, task });
  const close = () => setModal({ open: false, task: null });

  // Deep link ?task=<id> (ex.: alertas do Life Map) abre a tarefa direto.
  useEffect(() => {
    const id = searchParams.get("task");
    if (!id || tasks.length === 0) return;
    const t = tasks.find((x) => x.id === id);
    if (t) openEdit(t);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, tasks, setSearchParams]);

  // Comandos vindos da paleta (Ctrl K) e atalhos do PWA: ?nova=1 e ?importar=1.
  useEffect(() => {
    const nova = searchParams.get("nova");
    const importar = searchParams.get("importar");
    if (!nova && !importar) return;
    if (nova) openNew();
    if (importar) setImportOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("nova");
        next.delete("importar");
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  // Atalhos: "n" nova tarefa, "/" busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || modal.open) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openNew();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (priorities.size > 0 && !priorities.has(t.priority)) return false;
      if (projectId === "sem" ? t.project_id : projectId !== "todos" && t.project_id !== projectId) return false;
      if (quick && !matchesQuickFilter(t, quick)) return false;
      if (hideDone && t.status === DONE_STATUS) return false;
      if (term && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tasks, priorities, projectId, quick, hideDone, search]);

  const open = tasks.filter((t) => t.status !== DONE_STATUS);
  const doneTotal = tasks.length - open.length;
  const donePct = tasks.length > 0 ? Math.round((doneTotal / tasks.length) * 100) : 0;
  const quickCounts = useMemo(() => {
    const c = {} as Record<QuickFilter, number>;
    for (const f of QUICK_FILTERS) c[f.key] = tasks.filter((t) => matchesQuickFilter(t, f.key)).length;
    return c;
  }, [tasks]);
  const focusTask = useMemo(() => [...open].sort((a, b) => taskFocusScore(b) - taskFocusScore(a))[0] ?? null, [open]);
  const inProgress = tasks.filter((t) => t.status === "Em Andamento").length;
  const { data: rules } = useGamificationRules(isRpg);
  const focusReward = focusTask ? previewTaskReward(rules, { priority: focusTask.priority, dueDate: focusTask.due_date, habitId: focusTask.habit_id }, localToday()) : null;

  // Concluídas: mostra as mais recentes primeiro, com limite na coluna.
  const boardItems = useMemo(() => {
    const done = filtered
      .filter((t) => t.status === DONE_STATUS)
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));
    const rest = filtered.filter((t) => t.status !== DONE_STATUS).sort(compareTasks);
    return [...rest, ...(showAllDone ? done : done.slice(0, DONE_LIMIT))];
  }, [filtered, showAllDone]);
  const doneFilteredCount = filtered.filter((t) => t.status === DONE_STATUS).length;

  const activeFilters = (priorities.size > 0 ? 1 : 0) + (quick ? 1 : 0) + (projectId !== "todos" ? 1 : 0) + (search ? 1 : 0) + (hideDone ? 1 : 0);
  const clearFilters = () => {
    setPriorities(new Set());
    setQuick(null);
    setProjectId("todos");
    setSearch("");
    setHideDone(false);
  };

  const toggleDone = (t: Task) => moveTask({ id: t.id, status: t.status === DONE_STATUS ? REOPEN_STATUS : DONE_STATUS });

  const handleSave = async (input: Parameters<typeof createTask>[0]) => {
    if (modal.task) return updateTask({ id: modal.task.id, patch: input });
    // Devolve a tarefa criada para o TaskModal enviar os anexos que ficaram na fila.
    return createTask({ ...input, status: input.status ?? modal.initialStatus });
  };

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      {isRpg ? (
        <RPGPageHeader
          banner="missoes"
          size="md"
          leading={<RPGIconSlot icon={<ScrollText size={26} />} />}
          eyebrow="Quadro de missões"
          title="Missões"
          subtitle="Organize suas missões e avance na sua jornada. Grandes conquistas começam com pequenas missões."
          footnote={<span className="italic">&ldquo;{findNavItem("/tarefas")?.item.quote ?? DEFAULT_QUOTE}&rdquo;</span>}
          actions={
            <>
              <RPGButton variant="secondary" onClick={() => setImportOpen(true)} title="Importar do Todoist, Notion ou Google Tasks">
                <Upload size={15} /> Importar
              </RPGButton>
              <RPGButton variant="primary" onClick={() => openNew()} title="Nova tarefa (N)">
                <Plus size={15} /> Nova missão
              </RPGButton>
            </>
          }
          className="mb-4"
        />
      ) : (
        <PageHeader
          icon={<ListChecks size={20} />}
          title="Tarefas"
          subtitle="Planeje, execute e conclua — o progresso vem do que foi finalizado de verdade."
          actions={
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)} title="Importar do Todoist, Notion ou Google Tasks">
                <Upload size={15} /> Importar
              </Button>
              <Button onClick={() => openNew()} title="Nova tarefa (N)">
                <Plus size={15} /> Nova tarefa
              </Button>
            </>
          }
        />
      )}

      {/* Resumo: foco + filtros rápidos clicáveis */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 mb-4">
        {isRpg ? (
          <RPGPanel title="Missão em destaque" icon={<Sparkles size={14} />} variant="quest" className="h-full" actions={<span className="font-pixel text-[11px] uppercase tracking-wider text-rpg-gold">Foque nisso agora</span>}>
            <RPGQuestCard
              label={focusTask?.status ?? "Missão em destaque"}
              badges={
                focusReward ? (
                  <>
                    <span className="font-pixel text-[11px] px-1.5 py-0.5 border border-rpg-purple/60 bg-rpg-purple text-rpg-text" style={{ borderRadius: 2 }}>+{focusReward.xp} XP</span>
                    <span className="font-pixel text-[11px] px-1.5 py-0.5 border border-rpg-bronze bg-rpg-ink/10 text-rpg-ink" style={{ borderRadius: 2 }}>+{focusReward.coins} 🪙</span>
                  </>
                ) : undefined
              }
              title={focusTask?.title ?? null}
              onTitleClick={focusTask ? () => openEdit(focusTask) : undefined}
              priority={focusTask?.priority}
              reasons={
                focusTask
                  ? [focusTask.status, focusTask.project_id ? projectName.get(focusTask.project_id) : null, focusTask.description].filter(Boolean).join(" · ")
                  : null
              }
              facts={
                focusTask
                  ? [
                      { icon: <CalendarClock size={15} />, label: "Prazo", value: dueInfo(focusTask)?.label ?? "Sem prazo" },
                      { icon: <Clock size={15} />, label: "Tempo estimado", value: focusTask.estimate_minutes ? `${focusTask.estimate_minutes} min` : "Não estimado" },
                      { icon: <Flame size={15} />, label: "Dificuldade", value: focusTask.priority },
                    ]
                  : []
              }
              emptyText="Nada pendente. Bom momento para planejar a próxima entrega."
              actions={
                focusTask ? (
                  <RPGButton variant="primary" onClick={() => toggleDone(focusTask)} className="flex-1">
                    <Check size={15} /> Concluir missão
                  </RPGButton>
                ) : undefined
              }
            />
          </RPGPanel>
        ) : (
          <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-white bg-gradient-to-br from-brand-600 via-cat-purple to-signal shadow-card">
            <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden />
            <div className="relative flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  <Sparkles size={12} /> Foque nisso agora
                </p>
                {focusTask ? (
                  <>
                    <button onClick={() => openEdit(focusTask)} className="mt-1.5 block text-left font-display text-lg sm:text-xl font-bold leading-snug hover:underline underline-offset-4 line-clamp-2">
                      {focusTask.title}
                    </button>
                    <p className="mt-1 text-xs text-white/80">
                      {focusTask.priority} · {focusTask.status}
                      {dueInfo(focusTask) ? ` · ${dueInfo(focusTask)!.label}` : ""}
                      {focusTask.project_id && projectName.get(focusTask.project_id) ? ` · ${projectName.get(focusTask.project_id)}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-white/90">Nada pendente. Bom momento para planejar a próxima entrega.</p>
                )}
              </div>
              {focusTask && (
                <button
                  onClick={() => toggleDone(focusTask)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-semibold transition-colors"
                >
                  <Check size={14} /> Concluir
                </button>
              )}
            </div>
            <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { v: open.length, l: "abertas" },
                { v: inProgress, l: "em andamento" },
                { v: `${donePct}%`, l: "concluído" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl bg-white/15 px-2 py-2">
                  <p className="text-lg font-bold leading-none">{s.v}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-white/75">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 min-w-0">
        {isRpg && (
          <RPGPanel title="Progresso das missões" icon={<ListChecks size={14} />}>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { v: open.length, l: "abertas", tone: "text-rpg-blue" },
                { v: inProgress, l: "em andamento", tone: "text-rpg-purple" },
                { v: `${donePct}%`, l: "concluído", tone: "text-rpg-green" },
              ].map((st) => (
                <div key={st.l} className="border-2 border-rpg-border bg-rpg-bg/60 px-2.5 py-2" style={{ borderRadius: 3 }}>
                  <dd className={`font-pixel text-2xl font-bold leading-none tabular-nums ${st.tone}`}>{st.v}</dd>
                  <dt className="mt-1 font-pixel text-[10px] uppercase tracking-wide text-rpg-muted">{st.l}</dt>
                </div>
              ))}
            </dl>
          </RPGPanel>
        )}
        <div className="rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 sm:p-4 shadow-card rpg:rpg-panel">
          <p className="text-xs font-semibold text-slate mb-2 rpg:font-pixel rpg:uppercase rpg:tracking-[0.12em] rpg:text-rpg-gold rpg:text-[13px]">Filtros rápidos</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_FILTERS.map((f) => {
              const active = quick === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setQuick(active ? null : f.key)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left border transition-all ${
                    active ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30 rpg:border-rpg-gold rpg:bg-rpg-gold/10 rpg:ring-rpg-gold/40" : "border-paper-border dark:border-ink-border hover:border-brand-500/40 rpg:bg-rpg-bg/50 rpg:hover:border-rpg-gold/50"
                  }`}
                >
                  <span className={f.tone}>{f.icon}</span>
                  <span className="flex-1 min-w-0 text-xs font-medium truncate">{f.label}</span>
                  <span className={`text-sm font-bold tabular-nums ${quickCounts[f.key] > 0 && (f.key === "overdue") ? "text-drop" : ""}`}>{quickCounts[f.key]}</span>
                </button>
              );
            })}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-growth/10">
              <CheckCircle2 size={13} className="text-growth" />
              <span className="flex-1 text-xs font-medium">Concluídas</span>
              <span className="text-sm font-bold tabular-nums text-growth">{doneTotal}</span>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Barra de ferramentas (fica presa no topo ao rolar) */}
      <div className="sticky top-0 z-20 -mx-4 md:mx-0 px-4 md:px-0 py-2 mb-3 bg-paper/85 dark:bg-ink/85 backdrop-blur rpg:bg-rpg-bg/90 rpg:backdrop-blur-none">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-2 shadow-card rpg:rpg-panel">
          <div role="tablist" aria-label="Visualização" className="flex items-center rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-0.5">
            {([
              { key: "quadro", label: "Quadro", icon: <LayoutGrid size={13} /> },
              { key: "lista", label: "Lista", icon: <List size={13} /> },
            ] as const).map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === v.key ? "text-brand-700 dark:text-brand-100" : "text-slate"}`}
              >
                {view === v.key && <motion.span layoutId="tasks-view-pill" className="absolute inset-0 rounded-lg bg-white dark:bg-ink-raised shadow-sm rpg:bg-rpg-purple/35 rpg:ring-1 rpg:ring-rpg-gold/50" />}
                <span className="relative flex items-center gap-1.5">
                  {v.icon} {v.label}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRpg ? "Buscar missões…  ( / )" : "Buscar tarefas…  ( / )"}
              aria-label="Buscar tarefas"
              className="w-full rounded-xl pl-8 pr-3 py-2 text-xs bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Prioridade">
            {PRIORITIES.map((p) => {
              const on = priorities.has(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    setPriorities((prev) => {
                      const next = new Set(prev);
                      if (next.has(p)) next.delete(p);
                      else next.add(p);
                      return next;
                    })
                  }
                  aria-pressed={on}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-colors ${
                    on ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-100" : "border-paper-border dark:border-ink-border text-slate"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <label className="relative flex items-center">
            <FolderKanban size={13} className="absolute left-2.5 text-slate pointer-events-none" />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Projeto"
              className="appearance-none rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink pl-7 pr-3 py-1.5 text-[11px] font-medium max-w-[170px] truncate"
            >
              <option value="todos">Todos os projetos</option>
              <option value="sem">Sem projeto</option>
              {projects
                .filter((p) => !p.archived_at)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          <button
            onClick={() => setHideDone((v) => !v)}
            aria-pressed={hideDone}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold border transition-colors ${
              hideDone ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-100" : "border-paper-border dark:border-ink-border text-slate"
            }`}
          >
            {hideDone ? <EyeOff size={13} /> : <Eye size={13} />} Concluídas
          </button>

          {activeFilters > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 px-1">
              <X size={12} /> Limpar ({activeFilters})
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate tabular-nums hidden lg:inline">
            {filtered.length} de {tasks.length}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3" aria-busy="true">
          {COLUMNS.map((c) => (
            <div key={c} className="h-64 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState title="Nenhuma tarefa ainda" description="Crie a primeira e mova pelo fluxo até concluir. Dica: aperte N para criar rápido." ctaLabel="Nova tarefa" onCta={() => openNew()} />
      ) : view === "quadro" ? (
        <KanbanBoard
          columns={COLUMNS}
          items={boardItems}
          getId={(t) => t.id}
          getStatus={(t) => t.status}
          onMove={(id, status) => moveTask({ id, status })}
          columnAccent={isRpg ? COLUMN_ACCENT_RPG : COLUMN_ACCENT}
          columnIcon={isRpg ? COLUMN_ICON_RPG : undefined}
          columnHint={isRpg ? COLUMN_HINT_RPG : undefined}
          tintHeaders={isRpg}
          storageKey="lifeos.tasks.collapsedColumns"
          emptyHint={activeFilters > 0 ? "Nada com esses filtros" : "Solte uma tarefa aqui"}
          renderCard={(task, dragProps) => (
            <TaskCard
              task={task}
              onClick={() => openEdit(task)}
              dragProps={dragProps}
              onToggleDone={() => toggleDone(task)}
              onMove={(status) => moveTask({ id: task.id, status })}
              statuses={COLUMNS}
              projectName={task.project_id ? projectName.get(task.project_id) ?? null : null}
            />
          )}
          renderColumnFooter={(col) => (
            <div className="mt-2 space-y-1.5">
              {col === DONE_STATUS && doneFilteredCount > DONE_LIMIT && (
                <button
                  onClick={() => setShowAllDone((v) => !v)}
                  className="w-full text-xs font-semibold text-growth rounded-lg px-2 py-1.5 bg-growth/10 hover:bg-growth/15"
                >
                  {showAllDone ? "Mostrar só as recentes" : `Ver todas as concluídas (${doneFilteredCount})`}
                </button>
              )}
              {col !== DONE_STATUS && (
                <button
                  onClick={() => openNew(col)}
                  className="w-full text-xs text-slate rounded-lg px-2 py-2 border border-dashed border-paper-border dark:border-ink-border hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={12} /> Adicionar
                </button>
              )}
            </div>
          )}
        />
      ) : (
        <TaskListView tasks={filtered} projectName={projectName} onOpen={openEdit} onToggleDone={toggleDone} onMove={(t, s) => moveTask({ id: t.id, status: s })} />
      )}

      <TaskImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      {modal.open && <TaskModal task={modal.task} statusOptions={COLUMNS} onClose={close} onSave={handleSave} onDelete={removeTask} />}
    </div>
  );
}

/** Lista agrupada por prazo — tabela no desktop, cartões compactos no celular. */
function TaskListView({
  tasks,
  projectName,
  onOpen,
  onToggleDone,
  onMove,
}: {
  tasks: Task[];
  projectName: Map<string, string>;
  onOpen: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onMove: (t: Task, status: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const g = dueGroupOf(t);
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return DUE_GROUPS.map((g) => ({ ...g, items: (map.get(g.key) ?? []).sort(compareTasks) })).filter((g) => g.items.length > 0);
  }, [tasks]);

  if (tasks.length === 0) return <p className="text-sm text-slate py-8 text-center">Nenhuma tarefa com esses filtros.</p>;

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-2 ${g.key === "overdue" ? "text-drop" : "text-slate"}`}>
            {g.label}
            <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-black/[0.05] dark:bg-white/[0.08]">{g.items.length}</span>
          </h2>
          <div className="rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised overflow-hidden divide-y divide-paper-border dark:divide-ink-border">
            <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_160px_90px_120px_140px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate bg-black/[0.02] dark:bg-white/[0.02]">
              <span />
              <span>Tarefa</span>
              <span>Projeto</span>
              <span>Prioridade</span>
              <span>Prazo</span>
              <span>Status</span>
            </div>
            {g.items.map((t) => {
              const done = t.status === DONE_STATUS;
              const due = dueInfo(t);
              const proj = t.project_id ? projectName.get(t.project_id) : null;
              return (
                <div key={t.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_160px_90px_120px_140px] gap-x-3 gap-y-1 items-center px-4 py-2.5 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                  <button
                    onClick={() => onToggleDone(t)}
                    aria-label={done ? `Reabrir "${t.title}"` : `Concluir "${t.title}"`}
                    className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${done ? "bg-growth border-growth text-white" : "border-paper-border dark:border-ink-border hover:border-growth text-transparent hover:text-growth"}`}
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <button onClick={() => onOpen(t)} className="min-w-0 text-left">
                    <span className={`block text-sm truncate ${done ? "line-through text-slate" : "font-medium"}`}>{t.title}</span>
                    <span className="md:hidden flex flex-wrap gap-1.5 mt-1 text-[10px] text-slate">
                      {due && !done && <span className={`px-1.5 py-0.5 rounded-md font-semibold ${due.tone}`}>{due.label}</span>}
                      <span>{t.priority}</span>
                      {proj && <span className="truncate max-w-[140px]">· {proj}</span>}
                    </span>
                  </button>
                  <span className="hidden md:block text-xs text-slate truncate">{proj ?? "—"}</span>
                  <span className="hidden md:block text-xs">{t.priority}</span>
                  <span className="hidden md:block text-xs">
                    {due ? <span className={`px-1.5 py-0.5 rounded-md font-semibold text-[11px] capitalize ${done ? "text-slate" : due.tone}`}>{due.label}</span> : <span className="text-slate">—</span>}
                  </span>
                  <select
                    value={t.status}
                    onChange={(e) => onMove(t, e.target.value)}
                    aria-label={`Status de "${t.title}"`}
                    className="text-[11px] font-medium rounded-lg border border-paper-border dark:border-ink-border bg-paper dark:bg-ink px-2 py-1 max-w-[130px]"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
