import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Briefcase, GanttChartSquare, GraduationCap, Home, Plus, Users, X } from "lucide-react";
import { useProjects, useGantt, useProjectForecast } from "@/hooks/useProjects";
import { taskService } from "@/services/taskService";
import { Button, Card, EmptyState, Field, IconBadge, PageHeader } from "@/components/ui/primitives";
import { GanttChart } from "@/components/projects/GanttChart";
import { GanttDatesModal } from "@/components/projects/GanttDatesModal";
import type { GanttTask, Project, ProjectKind } from "@/types";

const KIND_META: Record<ProjectKind, { label: string; icon: typeof Home; tone: "blue" | "purple" | "green" | "pink" }> = {
  personal: { label: "Pessoal", icon: Home, tone: "pink" },
  workspace: { label: "Workspace", icon: Users, tone: "blue" },
  professional: { label: "Profissional", icon: Briefcase, tone: "purple" },
  academic: { label: "Acadêmico", icon: GraduationCap, tone: "green" },
};

function formatDate(value: string) {
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/**
 * Chip de previsão de conclusão do projeto — ritmo real de conclusão de
 * tarefas (nunca IA, nunca um número inventado). Some silenciosamente
 * quando não há histórico suficiente ainda.
 */
function ProjectForecastChip({ project }: { project: Project }) {
  const { forecast } = useProjectForecast(project.id);
  if (!forecast) return null;
  return (
    <p className="text-[11px] text-growth mt-1">No ritmo atual, conclusão prevista para {formatDate(forecast.date)}</p>
  );
}

export function ProjetosPage() {
  const queryClient = useQueryClient();
  const { projects, isLoading, createProject } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  useEffect(() => {
    if (!selectedId && projects.length > 0) setSelectedId(projects[0].id);
  }, [projects, selectedId]);

  const { data: gantt, isLoading: ganttLoading, addDependency, removeDependency } = useGantt(selectedId ?? undefined);
  const selectedProject = projects.find((p) => p.id === selectedId);

  const handleSaveDates = async (patch: { startDate: string | null; dueDate: string | null }) => {
    if (!editingTask) return;
    await taskService.update(editingTask.id, patch);
    // O Gantt lê de um cache próprio (useGantt) — precisa ser invalidado
    // manualmente porque essa mutação passou por taskService direto,
    // não pela mutation interna de useGantt (que só sabe de dependências).
    await queryClient.invalidateQueries({ queryKey: ["projects", "gantt", selectedId] });
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<GanttChartSquare size={20} />}
        title="Projetos"
        subtitle="Organize tarefas em projetos e acompanhe o cronograma no Gantt."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Novo projeto
          </Button>
        }
      />

      {!isLoading && projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto ainda"
          description="Crie um projeto e vincule tarefas com datas de início e prazo para acompanhar o cronograma no Gantt."
          ctaLabel="Criar projeto"
          onCta={() => setModalOpen(true)}
        />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
            {projects.map((p) => {
              const meta = KIND_META[p.kind];
              const Icon = meta.icon;
              const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
              const active = p.id === selectedId;
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)} className="shrink-0 text-left">
                  <Card
                    className={`p-3.5 w-52 transition-colors ${active ? "border-brand-500 shadow-card" : "hover:border-brand-500/40"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <IconBadge tone={meta.tone} size={28} icon={<Icon size={13} />} />
                      <p className="text-sm font-semibold truncate flex-1">{p.name}</p>
                    </div>
                    <p className="text-[11px] text-slate mb-1.5">
                      {p.done_count}/{p.task_count} tarefas concluídas
                    </p>
                    <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                      <div className="h-full rounded-full bg-growth" style={{ width: `${pct}%` }} />
                    </div>
                    <ProjectForecastChip project={p} />
                  </Card>
                </button>
              );
            })}
          </div>

          {selectedProject && (
            <Card className="p-5">
              <p className="text-sm font-semibold mb-4">Cronograma — {selectedProject.name}</p>
              {ganttLoading ? (
                <p className="text-sm text-slate py-8 text-center">Carregando...</p>
              ) : (
                <GanttChart
                  tasks={gantt?.tasks ?? []}
                  onEditDates={setEditingTask}
                  onAddDependency={(taskId, dependsOnId) => addDependency({ taskId, dependsOnId })}
                  onRemoveDependency={(taskId, dependsOnId) => removeDependency({ taskId, dependsOnId })}
                />
              )}
            </Card>
          )}
        </>
      )}

      {modalOpen && (
        <NovoProjetoModal
          onClose={() => setModalOpen(false)}
          onCreate={async (input) => {
            const created = await createProject(input);
            setSelectedId(created.id);
          }}
        />
      )}

      {editingTask && (
        <GanttDatesModal task={editingTask} onClose={() => setEditingTask(null)} onSave={handleSaveDates} />
      )}
    </div>
  );
}

function NovoProjetoModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; kind: ProjectKind }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("personal");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), kind });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Novo projeto</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lançamento do site" />
          <div>
            <label className="text-xs text-slate">Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ProjectKind)}
              className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none"
            >
              {Object.entries(KIND_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Criando..." : "Criar projeto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
