import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  Gauge,
  Hourglass,
  LayoutGrid,
  List,
  Percent,
  Plus,
  Scale,
  Search,
  Sparkles,
  Target,
  Timer,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { useUrlTab } from "@/components/hero/HeroShared";
import { Empty, Section, Tag, errMsg } from "@/components/forge3/ForgeShared";
import { Modal } from "@/components/ui/Modal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskImportModal } from "@/components/tasks/TaskImportModal";
import { PriorityRewardsPanel } from "@/components/profile/PriorityRewardsPanel";
import { DifficultyRewardsPanel } from "@/components/profile/DifficultyRewardsPanel";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useGoals } from "@/hooks/useGoals";
import { useContracts } from "@/hooks/useContracts";
import { useMissionsHub } from "@/hooks/usePlanningHub";
import { useAutomations } from "@/hooks/useAutomations";
import { useDifficultySettings, useGamificationRules } from "@/hooks/useGamification";
import { useMissionsBoardActions, useMissionsOverview } from "@/hooks/useMissions3";
import { TODAY_HUB_KEY } from "@/hooks/useDayHero";
import { dayHeroService } from "@/services/dayHeroService";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import { fmtMin, type MissionsOverview } from "@/services/missions3Service";
import type { MissionsHub } from "@/services/planningHubService";
import { TASK_STATUSES } from "@/utils/taskStatus";
import { previewTaskReward } from "@/utils/gamification";
import type { Task } from "@/types";
import { MissionAdvisor, type AdvisorSeed } from "./MissionAdvisor";
import { MissionBoard, type SortMode } from "./MissionBoard";
import { MissionAnalytics, MissionCalendar, MissionDeadlines, MissionList, MissionLoadView } from "./MissionViews";
import { DONE, Frame, MISSIONS_ART, addDaysIso, isForToday, isOverdue, type BoardTask } from "./MissionsShared";

const TABS = ["quadro", "lista", "calendario", "carga", "prazos", "analises", "automacoes"] as const;
type TabKey = (typeof TABS)[number];
const TAB_META: Array<[TabKey, string, ReactNode]> = [
  ["quadro", "Quadro", <LayoutGrid key="i" size={14} />],
  ["lista", "Lista", <List key="i" size={14} />],
  ["calendario", "Calendário", <CalendarDays key="i" size={14} />],
  ["carga", "Carga", <Gauge key="i" size={14} />],
  ["prazos", "Prazos", <CalendarClock key="i" size={14} />],
  ["analises", "Análises", <BarChart3 key="i" size={14} />],
  ["automacoes", "Automações", <Workflow key="i" size={14} />],
];
type IndicatorFilter = "done" | "open" | "inProgress" | "today" | "overdue" | null;
const FIELD = "border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold";
const PRIORITIES: Array<Task["priority"]> = ["Alta", "Média", "Baixa"];

/** Missões 3.0 — quadro RPG, visões e Conselheiro de Missões (tela reconstruída do zero sobre o mesmo modelo de tarefas). */
export function MissionsScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useUrlTab(TABS, "quadro");
  const [params, setParams] = useSearchParams();
  const { tasks: rawTasks, isLoading, createTask, updateTask, removeTask, moveTask } = useTasks();
  const overviewQ = useMissionsOverview();
  const { data: hub } = useMissionsHub();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { contracts } = useContracts();
  const { automations } = useAutomations("missions");
  const { reorder, archive } = useMissionsBoardActions();
  const { data: rules } = useGamificationRules(true);
  const { rewards: scale, priority: priorityScale } = useDifficultySettings(true);

  const [toast, setToast] = useState<{ m: string; tone: "success" | "error" } | null>(null);
  const notify = (m: string, tone: "success" | "error" = "success") => setToast({ m, tone });
  const [modal, setModal] = useState<{ task: Task | null; status?: string; due?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorWide, setAdvisorWide] = useState(false);
  const [seed, setSeed] = useState<AdvisorSeed | null>(null);
  const [indicator, setIndicator] = useState<IndicatorFilter>(null);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("todos");
  const [goalId, setGoalId] = useState("todas");
  const [contractId, setContractId] = useState("todos");
  const [priority, setPriority] = useState<string>("todas");
  const [sort, setSort] = useState<SortMode>("manual");
  const [hideDone, setHideDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const overview = overviewQ.data;
  const today = overview?.today ?? new Date().toISOString().slice(0, 10);
  const tasks = useMemo(() => (rawTasks as BoardTask[]).filter((t) => !t.archived_at), [rawTasks]);
  const names = useMemo(
    () => ({
      project: new Map(projects.map((p) => [p.id, p.name])),
      goal: new Map(goals.map((g) => [g.id, g.title])),
      contract: new Map(contracts.map((c) => [c.id, c.title])),
    }),
    [projects, goals, contracts],
  );
  const auto = (key: string) => automations.find((a) => a.key === key);
  const focusOn = auto("focus_timer")?.enabled ?? true;
  const breakdownOn = auto("breakdown_offer")?.enabled ?? true;
  const breakdownMin = Number(auto("breakdown_offer")?.config?.minMinutes ?? 120) || 120;

  // Recompensa prevista = motor oficial (mesma função da tela de Hoje e do Kanban antigo).
  const rewardOf = (t: BoardTask) => previewTaskReward(rules, { priority: t.priority, dueDate: t.due_date, habitId: t.habit_id, difficulty: t.difficulty }, today, false, scale, priorityScale);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (indicator === "done" && t.status !== DONE) return false;
      if (indicator === "open" && t.status === DONE) return false;
      if (indicator === "inProgress" && t.status !== "Em Andamento") return false;
      if (indicator === "today" && !isForToday(t, today)) return false;
      if (indicator === "overdue" && !isOverdue(t, today)) return false;
      if (projectId === "sem" ? t.project_id : projectId !== "todos" && t.project_id !== projectId) return false;
      if (goalId !== "todas" && t.goal_id !== goalId) return false;
      if (contractId !== "todos" && t.contract_id !== contractId) return false;
      if (priority !== "todas" && t.priority !== priority) return false;
      if (hideDone && t.status === DONE) return false;
      if (term && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tasks, indicator, projectId, goalId, contractId, priority, hideDone, search, today]);
  const activeFilters = [indicator, projectId !== "todos", goalId !== "todas", contractId !== "todos", priority !== "todas", hideDone, search].filter(Boolean).length;
  const clearFilters = () => {
    setIndicator(null);
    setProjectId("todos");
    setGoalId("todas");
    setContractId("todos");
    setPriority("todas");
    setHideDone(false);
    setSearch("");
  };

  const openAdvisor = (s?: AdvisorSeed) => {
    if (s) setSeed({ ...s });
    setAdvisorOpen(true);
  };

  // Comandos externos (paleta Ctrl K, PWA, Loja e links de outras telas).
  useEffect(() => {
    const keys = ["nova", "importar", "valores", "task", "conselheiro"];
    if (!keys.some((k) => params.get(k))) return;
    if (params.get("nova")) setModal({ task: null });
    if (params.get("importar")) setImportOpen(true);
    if (params.get("valores")) setValuesOpen(true);
    if (params.get("conselheiro")) openAdvisor({ message: params.get("conselheiro") === "1" ? "" : params.get("conselheiro")! });
    const id = params.get("task");
    if (id) {
      if (!tasks.length) return;
      const t = tasks.find((x) => x.id === id);
      if (t) setModal({ task: t });
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, tasks.length]);

  // Atalhos: "n" nova missão, "/" busca, "i" conselheiro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || modal || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n") {
        e.preventDefault();
        setModal({ task: null });
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "i") {
        e.preventDefault();
        openAdvisor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  /** Move/reordena com atualização otimista; mudança de coluna passa pelo fluxo oficial do Kanban (recompensa única). */
  const moveCard = (t: BoardTask, status: string, beforeId: string | null, afterId: string | null) => {
    const prev = qc.getQueryData<Task[]>(["tasks"]);
    qc.setQueryData<Task[]>(["tasks"], (old) => old?.map((x) => (x.id === t.id ? { ...x, status } : x)));
    reorder.mutate(
      { taskId: t.id, status, beforeId, afterId },
      {
        onSuccess: () => {
          if (status === DONE && t.status !== DONE) {
            triggerAchievementsCheck();
            notify(`Missão concluída: “${t.title}”.`);
          }
        },
        onError: (e) => {
          if (prev) qc.setQueryData(["tasks"], prev);
          notify(errMsg(e, "Não consegui mover a missão."), "error");
        },
      },
    );
  };
  const toggleDone = (t: BoardTask) => {
    const done = t.status === DONE;
    moveTask({ id: t.id, status: done ? "A Fazer" : DONE });
    notify(done ? `“${t.title}” reaberta.` : `Missão concluída: “${t.title}”.`);
  };
  const doArchive = (t: BoardTask) =>
    archive.mutate(
      { id: t.id, archived: true },
      {
        onSuccess: () => notify(`“${t.title}” arquivada. Ela continua no histórico, Analytics e Crônica.`),
        onError: (e) => notify(errMsg(e, "Não consegui arquivar."), "error"),
      },
    );
  const startFocus = async (t: BoardTask) => {
    try {
      await dayHeroService.startTimer({ mode: "free", linkType: "task", linkId: t.id, plannedMinutes: t.estimate_minutes ?? null });
      void qc.invalidateQueries({ queryKey: TODAY_HUB_KEY });
      notify(`Foco iniciado em “${t.title}”. O cronômetro fica no Hoje e registra o tempo nesta missão.`);
    } catch (e) {
      notify(errMsg(e, "Não consegui iniciar o foco."), "error");
    }
  };
  const postpone = (t: BoardTask, days: number) =>
    updateTask({ id: t.id, patch: { dueDate: addDaysIso(today, days) } })
      .then(() => notify(`Prazo de “${t.title}” movido para ${days === 1 ? "amanhã" : "daqui a 7 dias"}.`))
      .catch((e: unknown) => notify(errMsg(e, "Não consegui alterar o prazo."), "error"));

  const handleSave = async (input: Parameters<typeof createTask>[0]) => {
    if (modal?.task) return updateTask({ id: modal.task.id, patch: input });
    return createTask({ ...input, status: input.status ?? modal?.status, dueDate: input.dueDate ?? modal?.due ?? null });
  };

  const handlers = {
    onOpen: (t: BoardTask) => setModal({ task: t }),
    onToggleDone: toggleDone,
    onMove: moveCard,
    onAdd: (status: string) => setModal({ task: null, status }),
    onArchive: doArchive,
    onFocus: focusOn ? (t: BoardTask) => void startFocus(t) : null,
    onBreakdown: breakdownOn ? (t: BoardTask) => openAdvisor({ mode: "breakdown", taskId: t.id, message: "Divida esta missão em etapas executáveis, com estimativa e ordem.", autoSend: true }) : null,
  };

  const advisor = (layout: "panel" | "drawer") => (
    <MissionAdvisor
      tasks={tasks}
      seed={seed}
      layout={layout}
      expanded={advisorWide}
      onToggleExpand={() => setAdvisorWide((v) => !v)}
      onClose={layout === "drawer" ? () => setAdvisorOpen(false) : undefined}
      onCreated={(ids) => {
        setTab("quadro");
        notify(ids.length > 1 ? `${ids.length} missões criadas no quadro.` : "Missão criada no quadro.");
      }}
      onOpenSettings={() => setTab("automacoes")}
      notify={notify}
    />
  );

  const showFilters = tab === "quadro" || tab === "lista" || tab === "calendario" || tab === "prazos";

  return (
    <div className="w-full px-3 py-4 sm:px-5 md:px-6 md:py-6">
      <div className={clsx("grid items-start gap-4", advisorWide ? "2xl:grid-cols-[minmax(0,1fr)_640px]" : "2xl:grid-cols-[minmax(0,1fr)_440px]")}>
        <div className="min-w-0 space-y-4">
          <nav className="flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Visões de Missões">
            {TAB_META.map(([k, label, icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={clsx("flex shrink-0 items-center gap-1.5 border-2 px-3 py-1.5 text-sm font-semibold transition-colors", tab === k ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")}
                style={{ borderRadius: 4 }}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>

          <Banner onNew={() => setModal({ task: null })} onAi={() => openAdvisor()} onImport={() => setImportOpen(true)} onRewards={() => setValuesOpen(true)} />

          <Indicators o={overview} loading={overviewQ.isLoading} error={overviewQ.isError} active={indicator} onFilter={(f) => {
            setIndicator((cur) => (cur === f ? null : f));
            if (!["quadro", "lista", "prazos", "calendario"].includes(tab)) setTab("quadro");
          }} onTab={setTab} />

          {showFilters && (
            <div className="rpg-panel flex flex-wrap items-center gap-2 p-2">
              <label className="relative min-w-[180px] flex-1">
                <span className="sr-only">Buscar missão</span>
                <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar missão (/)" className={clsx(FIELD, "w-full pl-7")} style={{ borderRadius: 3 }} />
              </label>
              <Select label="Projeto" value={projectId} onChange={setProjectId} options={[["todos", "Todos os projetos"], ["sem", "Sem projeto"], ...projects.map((p) => [p.id, p.name] as [string, string])]} />
              <Select label="Meta" value={goalId} onChange={setGoalId} options={[["todas", "Todas as metas"], ...goals.map((g) => [g.id, g.title] as [string, string])]} />
              <Select label="Contrato" value={contractId} onChange={setContractId} options={[["todos", "Todos os contratos"], ...contracts.map((c) => [c.id, c.title] as [string, string])]} />
              <Select label="Prioridade" value={priority} onChange={setPriority} options={[["todas", "Toda prioridade"], ...PRIORITIES.map((p) => [p, p] as [string, string])]} />
              {tab === "quadro" && (
                <Select label="Ordenar" value={sort} onChange={(v) => setSort(v as SortMode)} options={[["manual", "Ordem manual"], ["prazo", "Por prazo"], ["prioridade", "Por prioridade"]]} />
              )}
              <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="accent-[rgb(var(--rpg-gold))]" />
                Ocultar concluídas
              </label>
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-semibold text-rpg-gold-light hover:underline">
                  <X size={12} /> Limpar ({activeFilters})
                </button>
              )}
            </div>
          )}
          {indicator && showFilters && (
            <p className="flex items-center gap-1.5 text-xs text-rpg-muted">
              <Filter size={12} aria-hidden /> Filtrando pelo indicador <strong className="text-rpg-gold-light">{INDICATOR_LABEL[indicator]}</strong> — {filtered.length} missão(ões).
            </p>
          )}

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-5" aria-busy aria-label="Carregando missões">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="rpg-panel h-64 animate-pulse" />
              ))}
            </div>
          ) : tab === "quadro" ? (
            <MissionBoard tasks={filtered} today={today} cards={overview?.cards ?? {}} names={names} rewardOf={rewardOf} sort={sort} breakdownMin={breakdownMin} h={handlers} />
          ) : tab === "lista" ? (
            <MissionList tasks={filtered} today={today} names={names} rewardOf={rewardOf} onOpen={handlers.onOpen} onToggleDone={toggleDone} onMove={(t, s) => moveCard(t, s, null, null)} />
          ) : tab === "calendario" ? (
            <MissionCalendar tasks={filtered} today={today} onOpen={handlers.onOpen} onNewOn={(d) => setModal({ task: null, due: d })} />
          ) : tab === "prazos" ? (
            <MissionDeadlines tasks={filtered} today={today} onOpen={handlers.onOpen} onPostpone={postpone} />
          ) : tab === "carga" ? (
            overview ? <MissionLoadView overview={overview} /> : <Empty icon={<Gauge size={20} />} title="Carregando indicadores…" />
          ) : tab === "analises" ? (
            overview ? <MissionAnalytics overview={overview} /> : <Empty icon={<BarChart3 size={20} />} title="Carregando indicadores…" />
          ) : (
            <AutomationsPanel module="missions" title="Automações de Missões" icon={<Workflow size={18} />} intro="Automações A–J. As de evento agem junto da ação na tela (nunca criam missão sem a sua aprovação); as diárias só sugerem e avisam." />
          )}

          <ComboPanel hub={hub} />
        </div>

        {/* Conselheiro: painel fixo em telas largas; gaveta no restante. */}
        <aside className="hidden min-w-0 2xl:sticky 2xl:top-4 2xl:block" aria-label="Conselheiro de Missões">
          {advisor("panel")}
        </aside>
      </div>

      {!advisorOpen && (
        <button
          onClick={() => openAdvisor()}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 border-2 border-rpg-gold bg-rpg-purple px-3 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgb(0_0_0/0.45)] md:bottom-6 2xl:hidden"
          style={{ borderRadius: 6 }}
          aria-label="Abrir o Conselheiro de Missões"
        >
          <Sparkles size={16} aria-hidden /> Conselheiro
        </button>
      )}
      {advisorOpen && <div className="2xl:hidden">{advisor("drawer")}</div>}

      <TaskImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <Modal open={valuesOpen} onClose={() => setValuesOpen(false)} title="Configurar recompensas" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-rpg-muted">Estes valores alimentam o motor oficial: concluir uma missão paga uma única vez, pela prioridade e pela dificuldade definidas aqui.</p>
          <PriorityRewardsPanel />
          <DifficultyRewardsPanel />
        </div>
      </Modal>
      {modal && (
        <TaskModal
          task={modal.task}
          statusOptions={modal.status ? [modal.status, ...TASK_STATUSES.filter((s) => s !== modal.status)] : [...TASK_STATUSES]}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={removeTask}
        />
      )}
      <RPGToast message={toast?.m ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

const INDICATOR_LABEL: Record<Exclude<IndicatorFilter, null>, string> = { done: "Concluídas", open: "Abertas", inProgress: "Em andamento", today: "Para hoje", overdue: "Atrasadas" };

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={clsx(FIELD, "max-w-[180px]")} style={{ borderRadius: 3 }}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/* ═════════════ Banner ═════════════ */

function Banner({ onNew, onAi, onImport, onRewards }: { onNew: () => void; onAi: () => void; onImport: () => void; onRewards: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden">
      <img src={`${MISSIONS_ART}/banner-castle.webp`} alt="" aria-hidden decoding="async" className="pixelated pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto max-w-[40%] object-contain object-right-bottom opacity-80 lg:block" />
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-rpg-panel from-55% via-rpg-panel/60 via-70% to-transparent lg:block" aria-hidden />
      <div className="relative grid items-stretch sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
        <div className="relative h-36 overflow-hidden sm:h-auto sm:min-h-[200px]" aria-hidden>
          <img src={`${MISSIONS_ART}/banner-knight.webp`} alt="" decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-rpg-panel via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:from-70% sm:to-rpg-panel" />
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-2 px-4 py-4 sm:px-5 lg:py-5">
          <p className="font-pixel text-[11px] uppercase tracking-[0.2em] text-rpg-gold">Central de execução</p>
          <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl xl:text-[2.75rem]">Missões da Jornada</h1>
          <p className="max-w-xl text-sm text-rpg-text sm:text-base">Transforme objetivos em missões épicas, organize sua execução e conquiste resultados reais.</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <RPGButton variant="primary" onClick={onNew} title="Nova missão (N)">
              <Plus size={15} aria-hidden /> Nova missão
            </RPGButton>
            <RPGButton variant="secondary" onClick={onAi} title="Criar com o Conselheiro (I)">
              <Sparkles size={15} aria-hidden /> Criar com IA
            </RPGButton>
            <RPGButton variant="secondary" onClick={onImport} title="Importar do Todoist, Notion ou Google Tasks">
              <Upload size={15} aria-hidden /> Importar
            </RPGButton>
            <RPGButton variant="secondary" onClick={onRewards} title="Valor de XP e moedas por prioridade e dificuldade">
              <Scale size={15} aria-hidden /> Recompensas
            </RPGButton>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ═════════════ Indicadores ═════════════ */

function Indicators({
  o,
  loading,
  error,
  active,
  onFilter,
  onTab,
}: {
  o: MissionsOverview | undefined;
  loading: boolean;
  error: boolean;
  active: IndicatorFilter;
  onFilter: (f: Exclude<IndicatorFilter, null>) => void;
  onTab: (t: TabKey) => void;
}) {
  if (loading) return <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">{Array.from({ length: 9 }, (_, i) => <div key={i} className="rpg-panel h-[86px] animate-pulse" />)}</div>;
  if (error || !o)
    return (
      <p className="rpg-panel flex items-center gap-2 p-3 text-sm text-rpg-red">
        <AlertTriangle size={15} aria-hidden /> Não consegui carregar os indicadores agora.
      </p>
    );
  const i = o.indicators;
  const items: Array<{ key: string; icon: ReactNode; tone: RpgTone; value: string; label: string; hint: string; onClick: () => void; pressed?: boolean }> = [
    { key: "done", icon: <CheckCircle2 size={18} />, tone: "green", value: String(i.done), label: "Concluídas", hint: "Filtrar concluídas", onClick: () => onFilter("done"), pressed: active === "done" },
    { key: "open", icon: <Target size={18} />, tone: "blue", value: String(i.open), label: "Abertas", hint: "Filtrar abertas", onClick: () => onFilter("open"), pressed: active === "open" },
    { key: "prog", icon: <Hourglass size={18} />, tone: "purple", value: String(i.inProgress), label: "Em execução", hint: "Filtrar em execução", onClick: () => onFilter("inProgress"), pressed: active === "inProgress" },
    { key: "today", icon: <CalendarClock size={18} />, tone: "orange", value: String(i.today), label: "Para hoje", hint: "Prazo ou planejamento para hoje", onClick: () => onFilter("today"), pressed: active === "today" },
    { key: "late", icon: <AlertTriangle size={18} />, tone: "red", value: String(i.overdue), label: "Atrasadas", hint: "Prazo já passou", onClick: () => onFilter("overdue"), pressed: active === "overdue" },
    { key: "rate", icon: <Percent size={18} />, tone: "green", value: i.completionRate == null ? "—" : `${i.completionRate}%`, label: "Conclusão 30d", hint: i.definitions.completionRate, onClick: () => onTab("analises") },
    { key: "xp", icon: <Zap size={18} />, tone: "gold", value: String(i.xpLast30), label: "XP 30d", hint: i.definitions.xpLast30, onClick: () => onTab("analises") },
    { key: "est", icon: <Clock size={18} />, tone: "cyan", value: fmtMin(i.estimatedOpenMinutes), label: "Estimado aberto", hint: `${i.unestimatedOpen} missão(ões) sem estimativa`, onClick: () => onTab("carga") },
    { key: "exec", icon: <Timer size={18} />, tone: "pink", value: fmtMin(i.executedLast30Minutes), label: "Executado 30d", hint: i.definitions.executedLast30Minutes, onClick: () => onTab("analises") },
  ];
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9" aria-label="Indicadores das missões">
      {items.map((it) => (
        <li key={it.key}>
          <button
            onClick={it.onClick}
            aria-pressed={it.pressed}
            title={it.hint}
            className={clsx("rpg-panel flex h-full w-full flex-col items-center gap-1 px-1.5 py-2 text-center transition-colors hover:border-rpg-gold", it.pressed && "!border-rpg-gold bg-rpg-gold/10 ring-1 ring-rpg-gold/50")}
          >
            <Frame tone={it.tone} size="sm">
              {it.icon}
            </Frame>
            <span className="text-lg font-bold leading-none tabular-nums text-rpg-text">{it.value}</span>
            <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-rpg-muted">{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ═════════════ Combo diário ═════════════ */

function ComboPanel({ hub }: { hub: MissionsHub | undefined }) {
  if (!hub) return <div className="rpg-panel h-32 animate-pulse" aria-busy aria-label="Carregando combo" />;
  const c = hub.combo;
  const next = c.milestones.find((m) => !m.reached) ?? null;
  return (
    <Section title="Combo diário" icon={<Flame size={14} />} tone="gold" action={<span className="text-[11px] text-rpg-muted">recorde {c.best} dia(s)</span>}>
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="font-rpg text-4xl font-bold leading-none text-rpg-orange">{c.current}</span>
            <span className="font-pixel text-[12px] uppercase tracking-wider text-rpg-gold-light">dia(s) seguido(s)</span>
          </p>
          <ul className="mt-2 flex gap-1" aria-label="Últimos 14 dias">
            {c.history.map((h) => (
              <li
                key={h.day}
                title={`${new Date(`${h.day}T12:00:00`).toLocaleDateString("pt-BR")}: ${h.completed} concluída(s)`}
                className={clsx("h-6 flex-1 border-2", h.completed > 0 ? "border-rpg-gold bg-rpg-orange/70 shadow-[inset_0_0_6px_rgb(var(--rpg-gold-light)/0.6)]" : "border-rpg-border bg-rpg-bg")}
                style={{ borderRadius: 2 }}
              />
            ))}
          </ul>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {c.milestones.map((m) => (
              <li key={m.days}>
                <Tag tone={m.reached ? "gold" : "muted"}>
                  {m.reached ? "★" : "☆"} {m.days} dias
                </Tag>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-rpg-muted">Hoje: {c.todayDone} concluída(s). Um dia sem conclusão zera o combo; hoje sem conclusão ainda não quebra.</p>
        </div>
        <div className="flex items-center gap-3 border-t border-rpg-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <img src={`${MISSIONS_ART}/chest.webp`} alt="" aria-hidden className="pixelated h-20 w-20 object-contain drop-shadow-[0_4px_8px_rgb(0_0_0/0.5)]" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-gold">Próximo marco</p>
            {next ? (
              <>
                <p className="font-rpg text-xl font-bold text-rpg-text">{next.days} dias</p>
                <p className="text-[11px] text-rpg-muted">faltam {Math.max(0, next.days - c.current)} dia(s)</p>
              </>
            ) : (
              <p className="font-rpg text-lg font-bold text-rpg-green">Todos alcançados!</p>
            )}
            <p className="mt-0.5 max-w-[180px] text-[10px] text-rpg-muted">Marcos são selos de constância — não pagam XP extra (sem recompensa duplicada).</p>
          </div>
        </div>
      </div>
    </Section>
  );
}
