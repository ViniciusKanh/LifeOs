import { useMemo, useState, type ReactNode } from "react";
import { WhyChain } from "@/components/direction/WhyChain";
import { ProjectNotes } from "@/components/notes/LinkedNotes";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FolderGit2,
  Image as ImageIcon,
  LayoutList,
  Link2,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Target,
  Wallet,
} from "lucide-react";
import { useGantt, useProjectDetail, useProjectForecast, useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { taskService } from "@/services/taskService";
import { Button, Card, IconBadge, StatTile } from "@/components/ui/primitives";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { KIND_META, PRIORITY_META, STATUS_META, formatCurrency, formatMinutes, formatProjectDate } from "@/components/projects/projectMeta";
import { GanttChart } from "@/components/projects/GanttChart";
import { GanttDatesModal } from "@/components/projects/GanttDatesModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MediaLightbox, type CarouselItem } from "@/components/media/MediaCarousel";
import { TASK_STATUSES, DONE_STATUS } from "@/utils/taskStatus";
import { formatBytes } from "@/utils/files";
import type { GanttTask, Project, ProjectDocument, ProjectOverview, ProjectStatus, Task } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { useProjectsXp } from "@/hooks/useGamification";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { COLUMN_ACCENT_RPG, COLUMN_ICON_RPG } from "@/components/kanban/rpgColumns";
import { TaskCard } from "@/components/tasks/TaskCard";

/**
 * Detalhe do projeto — tudo o que existe sobre um projeto num só lugar:
 * metadados do cadastro, indicadores (derivados das tarefas), lista de
 * tarefas, documentos (anexos das tarefas vinculadas), entradas do Diário
 * ligadas ao projeto e o cronograma (Gantt).
 */

type TabKey = "overview" | "tasks" | "documents" | "timeline";

const PRIORITY_TONE: Record<string, string> = {
  Alta: "text-drop bg-drop/10",
  Média: "text-signal-deep bg-signal/15",
  Baixa: "text-slate bg-slate/10",
};

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-paper-border/70 dark:border-ink-border/60 last:border-0">
      <span className="text-slate mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate">{label}</p>
        <div className="text-sm mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate mb-1">{title}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

function DeadlineBadge({ days, status }: { days: number | null; status: ProjectStatus }) {
  if (days === null || status === "completed" || status === "cancelled") return null;
  const tone = days < 0 ? "bg-drop/10 text-drop" : days <= 7 ? "bg-signal/15 text-signal-deep" : "bg-cat-green/10 text-cat-green";
  const label = days < 0 ? `${Math.abs(days)} dia(s) de atraso` : days === 0 ? "Prazo é hoje" : `${days} dia(s) para o prazo`;
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function OverviewTab({ project, overview, onOpenTask }: { project: Project; overview: ProjectOverview | null; onOpenTask: (id: string) => void }) {
  const { forecast, reason } = useProjectForecast(project.id);
  const t = overview?.totals;
  const maxStatus = Math.max(1, ...(overview?.byStatus.map((s) => s.count) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<CheckCircle2 size={16} />} label="Progresso" value={`${t?.progressPct ?? 0}%`} tone="green" progressPct={t?.progressPct ?? 0} caption={t ? `${t.done} de ${t.tasks} tarefas` : undefined} />
        <StatTile icon={<LayoutList size={16} />} label="Tarefas em aberto" value={String(t?.open ?? 0)} tone="blue" caption={t ? `${t.dueThisWeek} vencem nesta semana` : undefined} />
        <StatTile icon={<AlertTriangle size={16} />} label="Atrasadas" value={String(t?.overdue ?? 0)} tone="amber" />
        <StatTile
          icon={<Clock size={16} />}
          label="Tempo registrado"
          value={formatMinutes(t?.timeSpentMinutes ?? 0)}
          tone="purple"
          progressPct={t && t.estimateMinutes > 0 ? Math.round((t.timeSpentMinutes / t.estimateMinutes) * 100) : undefined}
          caption={t && t.estimateMinutes > 0 ? `de ${formatMinutes(t.estimateMinutes)} estimados` : "sem estimativa nas tarefas"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-5 xl:col-span-2 space-y-4">
          <p className="text-sm font-semibold">Sobre o projeto</p>
          <WhyChain type="project" id={project.id} />
          <ProjectNotes projectId={project.id} />
          {!project.description && !project.objective && !project.scope && !project.success_criteria ? (
            <p className="text-sm text-slate">Nenhuma descrição, objetivo ou escopo cadastrado ainda. Use “Editar” para completar o cadastro.</p>
          ) : (
            <>
              <TextBlock title="Descrição" text={project.description} />
              <TextBlock title="Objetivo" text={project.objective} />
              <TextBlock title="Escopo" text={project.scope} />
              <TextBlock title="Critérios de sucesso" text={project.success_criteria} />
            </>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-1">Metadados</p>
          <MetaRow icon={<CalendarClock size={15} />} label="Período">
            {formatProjectDate(project.start_date) ?? "Sem início"} → {formatProjectDate(project.due_date) ?? "Sem prazo"}
          </MetaRow>
          <MetaRow icon={<Target size={15} />} label="Previsão pelo ritmo atual">
            {forecast ? (
              <span className="text-growth font-medium">{formatProjectDate(forecast.date)} · {forecast.completionsPerWeek} tarefas/semana</span>
            ) : (
              <span className="text-slate text-xs">{reason ?? "Sem dados suficientes."}</span>
            )}
          </MetaRow>
          {project.client && <MetaRow icon={<Target size={15} />} label="Cliente / stakeholder">{project.client}</MetaRow>}
          {project.area && <MetaRow icon={<LayoutList size={15} />} label="Área">{project.area}</MetaRow>}
          {project.budget != null && <MetaRow icon={<Wallet size={15} />} label="Orçamento">{formatCurrency(project.budget)}</MetaRow>}
          {project.repository_url && (
            <MetaRow icon={<FolderGit2 size={15} />} label="Repositório">
              <a href={project.repository_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-100 hover:underline inline-flex items-center gap-1">
                {project.repository_url.replace(/^https?:\/\//, "")} <ExternalLink size={11} />
              </a>
            </MetaRow>
          )}
          {project.links.length > 0 && (
            <MetaRow icon={<Link2 size={15} />} label="Links">
              <ul className="space-y-1">
                {project.links.map((l, i) => (
                  <li key={`${l.url}-${i}`}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-100 hover:underline inline-flex items-center gap-1">
                      {l.label} <ExternalLink size={11} />
                    </a>
                  </li>
                ))}
              </ul>
            </MetaRow>
          )}
          {project.tags.length > 0 && (
            <MetaRow icon={<Paperclip size={15} />} label="Etiquetas">
              <div className="flex flex-wrap gap-1">
                {project.tags.map((tag) => (
                  <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] bg-brand-500/10 text-brand-600 dark:text-brand-100">#{tag}</span>
                ))}
              </div>
            </MetaRow>
          )}
          <MetaRow icon={<Clock size={15} />} label="Criado / atualizado">
            <span className="text-xs">{formatProjectDate(project.created_at)} · {formatProjectDate(project.updated_at)}</span>
          </MetaRow>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Tarefas por status</p>
          {overview && overview.byStatus.length > 0 ? (
            <ul className="space-y-2.5">
              {overview.byStatus.map((s) => (
                <li key={s.status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{s.status}</span>
                    <span className="text-slate">{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${s.status === DONE_STATUS ? "bg-growth" : "bg-cat-blue"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(s.count / maxStatus) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">Nenhuma tarefa vinculada ainda.</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Próximos prazos</p>
          {overview && overview.upcoming.length > 0 ? (
            <ul className="space-y-1">
              {overview.upcoming.map((u) => {
                const late = u.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
                return (
                  <li key={u.id}>
                    <button onClick={() => onOpenTask(u.id)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                      <span className={`text-[11px] font-semibold w-14 shrink-0 ${late ? "text-drop" : "text-slate"}`}>{formatProjectDate(u.dueDate, { day: "2-digit", month: "short" })}</span>
                      <span className="text-sm truncate flex-1">{u.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate">Nenhuma tarefa aberta com prazo.</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><NotebookPen size={14} className="text-cat-pink" /> No Diário</p>
          {overview && overview.journalEntries.length > 0 ? (
            <ul className="space-y-2">
              {overview.journalEntries.map((j) => (
                <li key={j.date}>
                  <Link to={`/diario?date=${j.date}`} className="block rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                    <p className="text-[11px] font-semibold text-cat-pink">{formatProjectDate(j.date)}</p>
                    {j.preview && <p className="text-xs text-slate line-clamp-2">{j.preview}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">Nenhuma entrada do Diário vinculada. No Diário, use “Vincular a projeto” para registrar o dia a dia deste projeto.</p>
          )}
          {overview && overview.recentlyCompleted.length > 0 && (
            <div className="mt-4 pt-3 border-t border-paper-border dark:border-ink-border">
              <p className="text-[11px] text-slate mb-1.5">Concluídas recentemente</p>
              <ul className="space-y-1">
                {overview.recentlyCompleted.map((r) => (
                  <li key={r.id} className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 size={12} className="text-growth shrink-0" />
                    <span className="truncate">{r.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TasksTab({ tasks, isLoading, onOpen, onNew }: { tasks: Array<Task & { attachment_count: number }>; isLoading: boolean; onOpen: (t: Task) => void; onNew: () => void }) {
  const [filter, setFilter] = useState<string>("abertas");
  const visible = tasks.filter((t) => (filter === "todas" ? true : filter === "abertas" ? t.status !== DONE_STATUS : t.status === filter));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["abertas", "todas", ...TASK_STATUSES].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${filter === f ? "border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-100 font-semibold" : "border-paper-border dark:border-ink-border text-slate"}`}
          >
            {f === "abertas" ? "Em aberto" : f === "todas" ? "Todas" : f}
          </button>
        ))}
        <Button className="ml-auto" onClick={onNew}>
          <Plus size={14} /> Nova tarefa
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-paper dark:bg-ink animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate text-center py-10">{tasks.length === 0 ? "Este projeto ainda não tem tarefas." : "Nenhuma tarefa com este filtro."}</p>
      ) : (
        <ul className="divide-y divide-paper-border dark:divide-ink-border">
          {visible.map((t) => {
            const done = t.status === DONE_STATUS;
            const late = !done && t.due_date && t.due_date.slice(0, 10) < today;
            return (
              <li key={t.id}>
                <button onClick={() => onOpen(t)} className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 py-3 px-1 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] rounded-lg">
                  <span className={`text-sm flex-1 min-w-0 truncate ${done ? "line-through text-slate" : "font-medium"}`}>{t.title}</span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded-full px-2 py-0.5 text-[10px] bg-paper dark:bg-ink border border-paper-border dark:border-ink-border">{t.status}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_TONE[t.priority] ?? ""}`}>{t.priority}</span>
                    {t.due_date && (
                      <span className={`text-[11px] ${late ? "text-drop font-semibold" : "text-slate"}`}>{formatProjectDate(t.due_date, { day: "2-digit", month: "short" })}</span>
                    )}
                    {Number(t.attachment_count) > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-slate" title="Anexos">
                        <Paperclip size={11} /> {t.attachment_count}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DocumentsTab({ documents, isLoading, onOpenTask }: { documents: ProjectDocument[]; isLoading: boolean; onOpenTask: (taskId: string) => void }) {
  const [kind, setKind] = useState<"all" | "image" | "document">("all");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const visible = documents.filter((d) => kind === "all" || d.kind === kind);
  const items: CarouselItem[] = visible.map((d) => ({ id: d.id, kind: d.kind === "document" ? "document" : "image", src: d.dataUri, title: d.caption ?? d.fileName, badge: d.taskTitle }));

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([["all", "Todos"], ["image", "Imagens"], ["document", "PDFs"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setKind(v)}
            aria-pressed={kind === v}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${kind === v ? "border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-100 font-semibold" : "border-paper-border dark:border-ink-border text-slate"}`}
          >
            {label}
          </button>
        ))}
        <p className="text-[11px] text-slate ml-auto">Documentos = anexos das tarefas deste projeto.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square rounded-xl bg-paper dark:bg-ink animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10">
          <Paperclip size={22} className="mx-auto text-slate mb-2" />
          <p className="text-sm font-semibold">Nenhum documento ainda</p>
          <p className="text-xs text-slate mt-1">Abra uma tarefa deste projeto e adicione imagens ou PDFs em “Anexos”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {visible.map((d, i) => (
            <div key={d.id} className="group">
              <button onClick={() => setLightbox(i)} className="w-full aspect-square rounded-xl overflow-hidden border border-paper-border dark:border-ink-border bg-paper dark:bg-ink flex items-center justify-center transition-transform group-hover:-translate-y-0.5" aria-label={`Abrir ${d.fileName ?? "documento"}`}>
                {d.kind === "image" ? (
                  <img src={d.dataUri} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1.5 p-3 text-center">
                    <FileText size={28} className="text-cat-pink" />
                    <span className="text-[10px] font-medium line-clamp-2">{d.fileName ?? "PDF"}</span>
                  </span>
                )}
              </button>
              <div className="mt-1.5 px-0.5">
                <p className="text-[11px] font-medium truncate flex items-center gap-1">
                  {d.kind === "image" ? <ImageIcon size={10} className="text-slate shrink-0" /> : <FileText size={10} className="text-slate shrink-0" />}
                  {d.caption ?? d.fileName ?? (d.kind === "image" ? "Imagem" : "PDF")}
                </p>
                <button onClick={() => onOpenTask(d.taskId)} className="text-[10px] text-brand-600 dark:text-brand-100 hover:underline truncate block max-w-full text-left">
                  {d.taskTitle}
                </button>
                <p className="text-[10px] text-slate">{formatProjectDate(d.createdAt, { day: "2-digit", month: "short" })}{d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox !== null && items.length > 0 && <MediaLightbox items={items} startIndex={Math.min(lightbox, items.length - 1)} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </Card>
  );
}

function TimelineTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: gantt, isLoading, addDependency, removeDependency } = useGantt(projectId);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm font-semibold mb-4">Cronograma (Gantt)</p>
      {isLoading ? (
        <p className="text-sm text-slate py-8 text-center">Carregando...</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <GanttChart
            tasks={gantt?.tasks ?? []}
            onEditDates={setEditingTask}
            onAddDependency={(taskId, dependsOnId) => addDependency({ taskId, dependsOnId })}
            onRemoveDependency={(taskId, dependsOnId) => removeDependency({ taskId, dependsOnId })}
          />
        </div>
      )}
      {editingTask && (
        <GanttDatesModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (patch) => {
            await taskService.update(editingTask.id, patch);
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }}
        />
      )}
    </Card>
  );
}

export function ProjetoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, isLoading, error, overview, tasks, isTasksLoading, documents, isDocumentsLoading } = useProjectDetail(id);
  const { updateProject } = useProjects();
  const { createTask, updateTask, removeTask, moveTask } = useTasks();
  const { isRpg } = useTheme();
  const { data: projectsXp } = useProjectsXp(isRpg);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [taskModal, setTaskModal] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });

  const openTaskById = async (taskId: string) => {
    const local = tasks.find((t) => t.id === taskId);
    setTaskModal({ open: true, task: local ?? (await taskService.get(taskId)) });
  };

  const tabs = useMemo(
    () => [
      { key: "overview" as const, label: "Visão geral" },
      { key: "tasks" as const, label: isRpg ? "Missões" : "Tarefas", count: tasks.length },
      { key: "documents" as const, label: "Documentos", count: documents.length },
      { key: "timeline" as const, label: isRpg ? "Roadmap / Gantt" : "Cronograma" },
    ],
    [tasks.length, documents.length, isRpg]
  );

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <div className="h-8 w-40 rounded-lg bg-paper-border dark:bg-ink-border animate-pulse" />
        <Card className="h-36 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Card key={i} className="h-24 animate-pulse" />)}</div>
      </div>
    );
  }

  if (!project || error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="font-display font-semibold text-2xl">Projeto não encontrado</p>
        <p className="text-sm text-slate mt-2">Ele pode ter sido excluído ou não pertence à sua conta.</p>
        <Button className="mt-6" onClick={() => navigate("/projetos")}>Voltar para Projetos</Button>
      </div>
    );
  }

  const meta = KIND_META[project.kind];
  const Icon = meta.icon;
  const status = STATUS_META[project.status] ?? STATUS_META.active;

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      <Link to="/projetos" className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-brand-600 mb-4">
        <ArrowLeft size={14} /> Projetos
      </Link>

      {isRpg ? (
        <RPGPanel variant="gold" className="mb-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-pixel text-[11px] uppercase tracking-wider text-rpg-gold">Jornada</p>
              <h1 className="rpg-title text-2xl sm:text-3xl font-bold leading-tight break-words">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <label className="sr-only" htmlFor="project-status-inline-rpg">Status do projeto</label>
                <select
                  id="project-status-inline-rpg"
                  value={project.status}
                  onChange={(e) => updateProject({ id: project.id, patch: { status: e.target.value as ProjectStatus } })}
                  className="px-2 py-1 text-[11px] font-semibold bg-rpg-bg-2 text-rpg-text border border-rpg-border outline-none focus:border-rpg-gold cursor-pointer"
                  style={{ borderRadius: 3 }}
                >
                  {Object.entries(STATUS_META).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </select>
                {project.priority && <RPGBadge tone={project.priority === "Alta" || project.priority === "Crítica" ? "red" : project.priority === "Média" ? "orange" : "green"}>{project.priority}</RPGBadge>}
                <DeadlineBadge days={overview?.daysToDeadline ?? null} status={project.status} />
                {project.archived_at && <RPGBadge tone="muted">Arquivado</RPGBadge>}
              </div>
              {project.objective && <p className="mt-3 text-sm text-rpg-text/90 max-w-2xl">{project.objective}</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end max-w-2xl">
                <RPGProgressBar
                  tone="green"
                  label={`${overview?.totals.done ?? project.done_count}/${overview?.totals.tasks ?? project.task_count} missões concluídas`}
                  value={overview?.totals.progressPct ?? 0}
                  valueLabel={`${overview?.totals.progressPct ?? 0}%`}
                />
                <p className="font-pixel text-xs text-rpg-muted whitespace-nowrap">
                  <span className="text-rpg-purple">{projectsXp?.[project.id]?.earnedXp ?? 0} XP</span> conquistado ·{" "}
                  <span className="text-rpg-gold-light">{projectsXp?.[project.id]?.availableXp ?? 0} XP</span> disponível
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <RPGButton variant="secondary" onClick={() => updateProject({ id: project.id, patch: { archived: !project.archived_at } })}>
                <Archive size={14} aria-hidden /> {project.archived_at ? "Desarquivar" : "Arquivar"}
              </RPGButton>
              <RPGButton variant="secondary" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden /> Editar
              </RPGButton>
              {project.status !== "completed" && (
                <RPGButton variant="success" onClick={() => updateProject({ id: project.id, patch: { status: "completed" } })}>
                  Concluir projeto
                </RPGButton>
              )}
              <RPGButton variant="gold" onClick={() => setTaskModal({ open: true, task: null })}>
                <Plus size={14} aria-hidden /> Missão
              </RPGButton>
            </div>
          </div>
        </RPGPanel>
      ) : (
      <Card className="relative overflow-hidden p-5 sm:p-6 mb-5">
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: project.color ?? "#7C4DFF" }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-ink-wash opacity-60" aria-hidden />
        <div className="relative flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <IconBadge tone={meta.tone} size={48} icon={<Icon size={22} />} />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-2xl leading-tight break-words">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs text-slate">{meta.label}</span>
                <label className="sr-only" htmlFor="project-status-inline">Status do projeto</label>
                <select
                  id="project-status-inline"
                  value={project.status}
                  onChange={(e) => updateProject({ id: project.id, patch: { status: e.target.value as ProjectStatus } })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border-0 outline-none cursor-pointer ${status.className}`}
                >
                  {Object.entries(STATUS_META).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </select>
                {project.priority && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_META[project.priority]}`}>{project.priority}</span>}
                <DeadlineBadge days={overview?.daysToDeadline ?? null} status={project.status} />
                {project.archived_at && <span className="rounded-full px-2.5 py-1 text-[11px] bg-slate/10 text-slate">Arquivado</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => updateProject({ id: project.id, patch: { archived: !project.archived_at } })}>
              <Archive size={14} /> {project.archived_at ? "Desarquivar" : "Arquivar"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar
            </Button>
            <Button onClick={() => setTaskModal({ open: true, task: null })}>
              <Plus size={14} /> Tarefa
            </Button>
          </div>
        </div>
      </Card>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-paper-border dark:border-ink-border mb-5 -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Seções do projeto">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`relative shrink-0 px-4 py-2.5 text-sm transition-colors ${tab === t.key ? "font-semibold text-brand-700 dark:text-brand-100" : "text-slate hover:text-inherit"}`}
          >
            {t.label}
            {"count" in t && t.count !== undefined && t.count > 0 && <span className="ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 bg-paper-border dark:bg-ink-border">{t.count}</span>}
            {tab === t.key && <motion.span layoutId="project-detail-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-signal" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === "overview" && <OverviewTab project={project} overview={overview} onOpenTask={openTaskById} />}
          {tab === "tasks" &&
            (isRpg ? (
              <KanbanBoard
                columns={TASK_STATUSES}
                items={tasks}
                getId={(t) => t.id}
                getStatus={(t) => t.status}
                onMove={(taskId, status) => moveTask({ id: taskId, status })}
                columnAccent={COLUMN_ACCENT_RPG}
                columnIcon={COLUMN_ICON_RPG}
                tintHeaders
                storageKey="lifeos.project.collapsedColumns"
                emptyHint="Solte uma missão aqui"
                renderCard={(task, dragProps) => (
                  <TaskCard
                    task={task}
                    onClick={() => setTaskModal({ open: true, task })}
                    dragProps={dragProps}
                    onToggleDone={() => moveTask({ id: task.id, status: task.status === DONE_STATUS ? "A Fazer" : DONE_STATUS })}
                    onMove={(status) => moveTask({ id: task.id, status })}
                    statuses={TASK_STATUSES}
                  />
                )}
              />
            ) : (
              <TasksTab tasks={tasks} isLoading={isTasksLoading} onOpen={(t) => setTaskModal({ open: true, task: t })} onNew={() => setTaskModal({ open: true, task: null })} />
            ))}
          {tab === "documents" && <DocumentsTab documents={documents} isLoading={isDocumentsLoading} onOpenTask={openTaskById} />}
          {tab === "timeline" && <TimelineTab projectId={project.id} />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {editing && <ProjectFormModal project={project} onClose={() => setEditing(false)} onSubmit={(input) => updateProject({ id: project.id, patch: input })} />}
      </AnimatePresence>

      {taskModal.open && (
        <TaskModal
          task={taskModal.task}
          statusOptions={TASK_STATUSES}
          defaultProjectId={project.id}
          onClose={() => setTaskModal({ open: false, task: null })}
          onSave={(input) => (taskModal.task ? updateTask({ id: taskModal.task.id, patch: input }) : createTask(input))}
          onDelete={(taskId) => removeTask(taskId)}
        />
      )}
    </div>
  );
}
