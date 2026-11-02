import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Archive, CalendarClock, CheckCircle2, ChevronDown, FolderKanban, GanttChartSquare, Hourglass, LayoutGrid, List, Mail, Plus, Search, Sparkles } from "lucide-react";
import { useProjects, useProjectWorkload } from "@/hooks/useProjects";
import { ProjectLoadBoard } from "@/components/projects/ProjectLoadBoard";
import { Button, Card, EmptyState, IconBadge, PageHeader, StatTile } from "@/components/ui/primitives";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { KIND_META, STATUS_META, compareByUrgency, projectHealth } from "@/components/projects/projectMeta";
import { CampaignCard, NextMissionsPanel, ProjectRow } from "@/components/projects/ProjectPortfolio";
import type { Project, ProjectKind, ProjectStatus } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { useTasks } from "@/hooks/useTasks";
import { useMyProjectInvites } from "@/hooks/useProjectSharing";
import { useProjectsXp } from "@/hooks/useGamification";
import { RPGButton, RPGPageHeader, RPGStatCard } from "@/components/rpg";
import { currentMissionFor } from "@/components/projects/RpgCampaignCard";

/**
 * Projetos — visão de portfólio. Cada cartão leva ao detalhe completo
 * (/projetos/:id) com metadados, tarefas, documentos e cronograma.
 * Progresso é sempre derivado das tarefas vinculadas.
 */

type StatusFilter = "all" | ProjectStatus;

/**
 * Convites de projeto pendentes pra mim, de qualquer dono ("Colaboração
 * total"). Mesmo padrão da Guilda: aparece no topo da própria listagem,
 * não precisa de um módulo de notificações à parte.
 */
function ProjectInvitesBanner() {
  const { invites, emailVerified, isResponding, respond } = useMyProjectInvites();

  if (invites.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5 mb-5 border-brand-500/30">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="purple" size={32} icon={<Mail size={15} />} />
        <div>
          <p className="text-sm font-semibold">Convites de projeto ({invites.length})</p>
          <p className="text-xs text-slate">Quem convidou te chamou para colaborar — você verá e poderá mexer em todas as tarefas do projeto.</p>
        </div>
      </div>
      {!emailVerified && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Confirme seu e-mail para responder a convites — é assim que provamos que o convite é seu.</p>
      )}
      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.id} className="rounded-xl p-3 bg-paper dark:bg-ink space-y-2">
            <p className="text-sm">
              <strong>{inv.ownerName}</strong> te chamou para colaborar em <strong>{inv.projectName}</strong>.
            </p>
            {inv.message && <p className="text-xs italic text-slate break-words">“{inv.message}”</p>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!emailVerified || isResponding} onClick={() => respond({ inviteId: inv.id, accept: true })}>
                Aceitar
              </Button>
              <Button variant="ghost" disabled={isResponding} onClick={() => respond({ inviteId: inv.id, accept: false })}>
                Recusar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Data local (não UTC): à noite no Brasil o UTC já virou o dia. */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Preferências de visualização (só conveniência de interface, nunca dado do usuário).
const VIEW_KEY = "lifeos.projects.view";
const COLLAPSED_KEY = "lifeos.projects.collapsedGroups";
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage bloqueado: a preferência só não persiste */
  }
}

const GROUP_ORDER: ProjectStatus[] = ["active", "planning", "paused", "completed", "cancelled"];
const GROUP_RPG_LABEL: Record<ProjectStatus, string> = {
  active: "Campanhas em curso",
  planning: "Em preparação",
  paused: "Acampamento (pausadas)",
  completed: "Lendas concluídas",
  cancelled: "Abandonadas",
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Em andamento" },
  { value: "planning", label: "Planejamento" },
  { value: "paused", label: "Pausados" },
  { value: "completed", label: "Concluídos" },
];

export function ProjetosPage() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const { projects, isLoading, createProject, updateProject, removeProject } = useProjects(showArchived);
  const [formOpen, setFormOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<ProjectKind | "all">("all");
  const [search, setSearch] = useState("");
  const { workload, isLoading: workloadLoading } = useProjectWorkload({ days: 30, kind: kindFilter === "all" ? undefined : kindFilter });
  const [loadOpen, setLoadOpen] = useState(false);
  const [view, setView] = useState<"cards" | "list">(() => readPref<"cards" | "list">(VIEW_KEY, "cards"));
  const [collapsedGroups, setCollapsedGroups] = useState<ProjectStatus[]>(() => readPref<ProjectStatus[]>(COLLAPSED_KEY, ["completed", "cancelled"]));
  const today = todayIso();
  const { isRpg } = useTheme();
  const { tasks } = useTasks();
  const { data: projectsXp } = useProjectsXp(isRpg);
  const totalEarnedXp = useMemo(() => Object.values(projectsXp ?? {}).reduce((a, x) => a + x.earnedXp, 0), [projectsXp]);
  const loadById = useMemo(() => new Map((workload?.projects ?? []).filter((p) => p.id).map((p) => [p.id as string, p])), [workload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (q && ![p.name, p.description, p.client, p.area, ...p.tags].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, statusFilter, kindFilter, search]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status === "active" || p.status === "planning").length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const openTasks = projects.reduce((sum, p) => sum + (p.task_count - p.done_count), 0);
    let late = 0;
    let risk = 0;
    for (const p of projects) {
      const h = projectHealth(p, loadById.get(p.id)?.overdue ?? 0, today).key;
      if (h === "late") late++;
      else if (h === "risk") risk++;
    }
    return { active, completed, openTasks, late, risk };
  }, [projects, loadById, today]);

  // Portfólio agrupado por status e ordenado por urgência (atrasados primeiro).
  const groups = useMemo(() => {
    const overdueOf = (id: string) => loadById.get(id)?.overdue ?? 0;
    return GROUP_ORDER.map((status) => ({
      status,
      items: filtered.filter((p) => p.status === status).sort((a, b) => compareByUrgency(a, b, overdueOf, today)),
    })).filter((g) => g.items.length > 0);
  }, [filtered, loadById, today]);

  const changeView = (v: "cards" | "list") => {
    setView(v);
    writePref(VIEW_KEY, v);
  };
  const toggleGroup = (status: ProjectStatus) =>
    setCollapsedGroups((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      writePref(COLLAPSED_KEY, next);
      return next;
    });

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      {isRpg ? (
        <RPGPageHeader
          banner="tarefas"
          size="md"
          eyebrow="Jornadas"
          title="Projetos"
          subtitle="Cada projeto é uma jornada com missões, progresso real e XP — e pode integrar uma campanha da Forja."
          actions={
            <RPGButton variant="gold" onClick={() => setFormOpen(true)}>
              <Plus size={15} aria-hidden /> Novo projeto
            </RPGButton>
          }
          className="mb-5"
        />
      ) : (
      <PageHeader
        icon={<GanttChartSquare size={20} />}
        title="Projetos"
        subtitle="Portfólio completo: metadados, tarefas, documentos e cronograma de cada projeto."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Novo projeto
          </Button>
        }
      />
      )}

      <ProjectInvitesBanner />

      {!isLoading && projects.length === 0 && !showArchived ? (
        <EmptyState
          title="Nenhum projeto ainda"
          description="Cadastre um projeto com objetivo, prazo e escopo. Depois vincule tarefas a ele — progresso, documentos e cronograma aparecem sozinhos."
          ctaLabel="Criar projeto"
          onCta={() => setFormOpen(true)}
        />
      ) : (
        <>
          {/* Mesa de comando: números do portfólio + o que fazer agora. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] mb-5">
            <div className="grid grid-cols-2 gap-3 content-start">
              {isRpg ? (
                <>
                  <RPGStatCard icon={<FolderKanban size={18} />} label="Campanhas ativas" value={String(stats.active)} tone="purple" />
                  <RPGStatCard icon={<GanttChartSquare size={18} />} label="Missões em aberto" value={String(stats.openTasks)} tone="blue" />
                  <RPGStatCard icon={<CalendarClock size={18} />} label="Atrasadas / em risco" value={`${stats.late} / ${stats.risk}`} tone={stats.late > 0 ? "red" : stats.risk > 0 ? "orange" : "muted"} />
                  <RPGStatCard icon={<Sparkles size={18} />} label="XP em projetos" value={totalEarnedXp.toLocaleString("pt-BR")} tone="gold" caption={`${stats.completed} concluída(s)`} />
                </>
              ) : (
                <>
                  <StatTile icon={<FolderKanban size={16} />} label="Projetos ativos" value={String(stats.active)} tone="purple" />
                  <StatTile icon={<GanttChartSquare size={16} />} label="Tarefas em aberto" value={String(stats.openTasks)} tone="blue" />
                  <StatTile icon={<CalendarClock size={16} />} label="Atrasados / em risco" value={`${stats.late} / ${stats.risk}`} tone="amber" />
                  <StatTile icon={<CheckCircle2 size={16} />} label="Concluídos" value={String(stats.completed)} tone="green" />
                </>
              )}
            </div>
            <NextMissionsPanel tasks={tasks} projects={projects} today={today} />
          </div>

          {/* Barra de filtros — rola horizontalmente no celular, sem quebrar o layout. */}
          <div className="mb-4 space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Buscar projetos</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, cliente, área ou etiqueta…"
                  className="w-full min-h-[42px] rounded-xl pl-9 pr-3 py-2 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-brand-500 rpg:rounded-[3px] rpg:bg-rpg-bg rpg:border-rpg-border rpg:focus:border-rpg-gold"
                />
              </label>
              <div className="flex gap-2">
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as ProjectKind | "all")}
                  aria-label="Filtrar por tipo"
                  className="flex-1 sm:flex-none min-h-[42px] rounded-xl px-3 py-2 text-xs bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none rpg:rounded-[3px] rpg:bg-rpg-bg rpg:border-rpg-border"
                >
                  <option value="all">Todos os tipos</option>
                  {Object.entries(KIND_META).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="inline-flex shrink-0 rounded-xl border border-paper-border dark:border-ink-border p-0.5 rpg:rounded-[3px] rpg:border-rpg-border" role="group" aria-label="Modo de visualização">
                  {(
                    [
                      ["cards", LayoutGrid, "Cartões"],
                      ["list", List, "Lista"],
                    ] as const
                  ).map(([v, Icon, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => changeView(v)}
                      aria-pressed={view === v}
                      aria-label={label}
                      title={label}
                      className={`w-10 h-[38px] flex items-center justify-center rounded-lg rpg:rounded-[2px] ${view === v ? "bg-brand-500/10 text-brand-600 rpg:bg-rpg-gold/15 rpg:text-rpg-gold-light" : "text-slate"}`}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  aria-pressed={showArchived}
                  aria-label="Mostrar arquivados"
                  title="Arquivados"
                  className={`inline-flex shrink-0 items-center gap-1.5 min-h-[42px] rounded-xl px-3 text-xs border transition-colors rpg:rounded-[3px] ${showArchived ? "border-brand-500/50 text-brand-600 bg-brand-500/5 rpg:border-rpg-gold rpg:text-rpg-gold-light" : "border-paper-border dark:border-ink-border text-slate rpg:border-rpg-border"}`}
                >
                  <Archive size={14} /> <span className="hidden sm:inline">Arquivados</span>
                </button>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtrar por status">
              {STATUS_FILTERS.map((f) => {
                const count = f.value === "all" ? projects.length : projects.filter((p) => p.status === f.value).length;
                const on = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setStatusFilter(f.value)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors rpg:rounded-[3px] ${
                      on
                        ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-100 rpg:border-rpg-gold rpg:bg-rpg-gold/15 rpg:text-rpg-gold-light"
                        : "border-paper-border dark:border-ink-border text-slate rpg:border-rpg-border"
                    }`}
                  >
                    {f.label}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="h-52 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm font-semibold">Nenhum projeto com esses filtros</p>
              <p className="text-xs text-slate mt-1">Ajuste a busca ou os filtros acima.</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => {
                const collapsed = collapsedGroups.includes(g.status);
                return (
                  <section key={g.status} aria-labelledby={`grp-${g.status}`}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.status)}
                      aria-expanded={!collapsed}
                      className="mb-3 flex w-full items-center gap-2 text-left"
                    >
                      <span className="hidden rpg:inline-block w-1.5 h-1.5 rotate-45 bg-rpg-gold" aria-hidden />
                      <h2 id={`grp-${g.status}`} className="text-sm font-semibold uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-gold rpg:tracking-[0.14em]">
                        {isRpg ? GROUP_RPG_LABEL[g.status] : STATUS_META[g.status].label}
                      </h2>
                      <span className="rounded-full bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums rpg:rounded-[2px] rpg:bg-rpg-bg-2 rpg:text-rpg-muted">{g.items.length}</span>
                      <span className="flex-1 h-px bg-paper-border dark:bg-ink-border rpg:bg-rpg-border" aria-hidden />
                      <ChevronDown size={16} className={`text-slate transition-transform ${collapsed ? "-rotate-90" : ""}`} aria-hidden />
                    </button>
                    {!collapsed &&
                      (view === "list" ? (
                        <ul className="space-y-2">
                          {g.items.map((p) => (
                            <ProjectRow key={p.id} project={p} load={loadById.get(p.id)} today={today} />
                          ))}
                        </ul>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4">
                          <AnimatePresence mode="popLayout">
                            {g.items.map((p) => (
                              <motion.div key={p.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex min-w-0">
                                <CampaignCard
                                  project={p}
                                  load={loadById.get(p.id)}
                                  xp={projectsXp?.[p.id]}
                                  currentMission={currentMissionFor(tasks, p.id)}
                                  today={today}
                                  onEdit={() => setProjectToEdit(p)}
                                  onDelete={() => setProjectToDelete(p)}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      ))}
                  </section>
                );
              })}
            </div>
          )}

          {/* Carga de trabalho: análise detalhada, recolhida por padrão para não poluir o portfólio. */}
          <Card className="p-4 sm:p-5 mt-6">
            <button onClick={() => setLoadOpen((v) => !v)} aria-expanded={loadOpen} className="w-full flex items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-display font-semibold text-[15px] rpg:rpg-title">
                  <Hourglass size={17} className="text-brand-600 rpg:text-rpg-gold" /> Carga de trabalho por projeto
                </span>
                <span className="block text-xs text-slate mt-0.5">
                  Tarefas em aberto, horas estimadas × registradas (últimos 30 dias) e prazos{kindFilter !== "all" ? ` · ${KIND_META[kindFilter].label}` : ""}.
                </span>
              </span>
              <ChevronDown size={18} className={`text-slate shrink-0 transition-transform ${loadOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {loadOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-4">
                    <ProjectLoadBoard
                      workload={workload}
                      isLoading={workloadLoading}
                      emptyText="Nenhuma tarefa vinculada a projetos ainda. Vincule tarefas a um projeto para ver a carga, as horas e a pressão de prazo."
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </>
      )}

      <AnimatePresence>
        {formOpen && (
          <ProjectFormModal
            onClose={() => setFormOpen(false)}
            onSubmit={async (input) => {
              const created = await createProject(input);
              navigate(`/projetos/${created.id}`);
            }}
          />
        )}
        {projectToEdit && (
          <ProjectFormModal
            project={projectToEdit}
            onClose={() => setProjectToEdit(null)}
            onSubmit={(input) => updateProject({ id: projectToEdit.id, patch: input })}
          />
        )}
      </AnimatePresence>

      {projectToDelete && (
        <ConfirmDeleteProjectModal
          project={projectToDelete}
          onCancel={() => setProjectToDelete(null)}
          onConfirm={async () => {
            await removeProject(projectToDelete.id);
            setProjectToDelete(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Confirmação antes de excluir um projeto — apagar pode desvincular várias
 * tarefas de uma vez (elas continuam existindo, só perdem o vínculo).
 */
export function ConfirmDeleteProjectModal({
  project,
  onCancel,
  onConfirm,
}: {
  project: Project;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-2">Excluir "{project.name}"?</p>
        <p className="text-xs text-slate mb-4">
          {project.task_count > 0
            ? `As ${project.task_count} tarefas deste projeto continuam existindo, mas perdem o vínculo com ele. Prefira arquivar se quiser manter o histórico.`
            : "Esta ação não pode ser desfeita."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1" disabled={deleting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={deleting} className="flex-1 !bg-drop !from-drop !to-drop">
            {deleting ? "Excluindo..." : "Excluir"}
          </Button>
        </div>
      </div>
    </div>
  );
}
