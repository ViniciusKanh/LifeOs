import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Archive, CalendarClock, CheckCircle2, FolderKanban, GanttChartSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useProjects, useProjectForecast } from "@/hooks/useProjects";
import { Button, Card, EmptyState, IconBadge, PageHeader, StatTile } from "@/components/ui/primitives";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { KIND_META, PRIORITY_META, STATUS_META, formatProjectDate } from "@/components/projects/projectMeta";
import type { Project, ProjectKind, ProjectStatus } from "@/types";

/**
 * Projetos — visão de portfólio. Cada cartão leva ao detalhe completo
 * (/projetos/:id) com metadados, tarefas, documentos e cronograma.
 * Progresso é sempre derivado das tarefas vinculadas.
 */

type StatusFilter = "all" | ProjectStatus;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Chip de previsão por ritmo real de conclusão — some quando não há histórico suficiente. */
function ProjectForecastChip({ project }: { project: Project }) {
  const { forecast } = useProjectForecast(project.status === "completed" ? undefined : project.id);
  if (!forecast) return null;
  return <p className="text-[11px] text-growth">No ritmo atual: {formatProjectDate(forecast.date, { day: "2-digit", month: "short" })}</p>;
}

function ProjectCard({ project, onEdit, onDelete }: { project: Project; onEdit: () => void; onDelete: () => void }) {
  const meta = KIND_META[project.kind];
  const Icon = meta.icon;
  const status = STATUS_META[project.status] ?? STATUS_META.active;
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0;
  const overdue = project.due_date && project.status !== "completed" && project.due_date.slice(0, 10) < todayIso();

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="relative group">
      <Link to={`/projetos/${project.id}`} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl">
        <Card className="h-full p-4 sm:p-5 overflow-hidden relative transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-brand-500/40">
          <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: project.color ?? "#7C4DFF" }} aria-hidden />
          <div className="flex items-start gap-3 pr-14">
            <IconBadge tone={meta.tone} size={36} icon={<Icon size={16} />} />
            <div className="min-w-0">
              <p className="font-semibold leading-tight truncate">{project.name}</p>
              <p className="text-[11px] text-slate mt-0.5 truncate">
                {meta.label}
                {project.client ? ` · ${project.client}` : ""}
                {project.area ? ` · ${project.area}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
            </span>
            {project.priority && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_META[project.priority]}`}>{project.priority}</span>}
            {project.due_date && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${overdue ? "bg-drop/10 text-drop font-semibold" : "bg-paper dark:bg-ink text-slate"}`}>
                <CalendarClock size={10} /> {formatProjectDate(project.due_date, { day: "2-digit", month: "short" })}
              </span>
            )}
          </div>

          {project.description && <p className="text-xs text-slate mt-3 line-clamp-2">{project.description}</p>}

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-slate mb-1.5">
              <span>{project.done_count}/{project.task_count} tarefas</span>
              <span className="font-semibold text-inherit">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
              <motion.div className="h-full rounded-full bg-growth" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
            </div>
            <div className="mt-1.5 min-h-[16px]">
              <ProjectForecastChip project={project} />
            </div>
          </div>

          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {project.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] text-brand-600 dark:text-brand-100">#{t}</span>
              ))}
              {project.tags.length > 4 && <span className="text-[10px] text-slate">+{project.tags.length - 4}</span>}
            </div>
          )}
        </Card>
      </Link>
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button onClick={onEdit} aria-label={`Editar projeto ${project.name}`} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate/70 hover:text-brand-600 hover:bg-brand-500/10 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} aria-label={`Excluir projeto ${project.name}`} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate/70 hover:text-drop hover:bg-drop/10 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </motion.div>
  );
}

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
    const overdue = projects.filter((p) => p.due_date && p.status !== "completed" && p.status !== "cancelled" && p.due_date.slice(0, 10) < todayIso()).length;
    return { active, completed, openTasks, overdue };
  }, [projects]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
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

      {!isLoading && projects.length === 0 && !showArchived ? (
        <EmptyState
          title="Nenhum projeto ainda"
          description="Cadastre um projeto com objetivo, prazo e escopo. Depois vincule tarefas a ele — progresso, documentos e cronograma aparecem sozinhos."
          ctaLabel="Criar projeto"
          onCta={() => setFormOpen(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile icon={<FolderKanban size={16} />} label="Projetos ativos" value={String(stats.active)} tone="purple" />
            <StatTile icon={<CheckCircle2 size={16} />} label="Concluídos" value={String(stats.completed)} tone="green" />
            <StatTile icon={<GanttChartSquare size={16} />} label="Tarefas em aberto" value={String(stats.openTasks)} tone="blue" />
            <StatTile icon={<CalendarClock size={16} />} label="Prazos vencidos" value={String(stats.overdue)} tone="amber" />
          </div>

          <Card className="p-3 mb-5 flex flex-col lg:flex-row lg:items-center gap-3">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Buscar projetos</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, cliente, área ou etiqueta…"
                className="w-full rounded-xl pl-9 pr-3 py-2 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
            </label>
            <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist" aria-label="Filtrar por status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  role="tab"
                  aria-selected={statusFilter === f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === f.value ? "text-brand-700 dark:text-brand-100" : "text-slate hover:text-inherit"}`}
                >
                  {statusFilter === f.value && <motion.span layoutId="project-status-filter" className="absolute inset-0 rounded-lg bg-brand-500/10" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                  <span className="relative">{f.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as ProjectKind | "all")}
                aria-label="Filtrar por tipo"
                className="rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none"
              >
                <option value="all">Todos os tipos</option>
                {Object.entries(KIND_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </select>
              <button
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border transition-colors ${showArchived ? "border-brand-500/50 text-brand-600 bg-brand-500/5" : "border-paper-border dark:border-ink-border text-slate"}`}
              >
                <Archive size={13} /> Arquivados
              </button>
            </div>
          </Card>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((p) => (
                  <ProjectCard key={p.id} project={p} onEdit={() => setProjectToEdit(p)} onDelete={() => setProjectToDelete(p)} />
                ))}
              </AnimatePresence>
            </div>
          )}
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
