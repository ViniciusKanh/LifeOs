import { useState, type FormEvent } from "react";
import { Briefcase, Flame, Plus, Target, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useProfessionalTasks, useTasks } from "@/hooks/useTasks";
import { useGoals } from "@/hooks/useGoals";
import { useWorkNotes } from "@/hooks/useWorkNotes";
import { Button, Card, EmptyState, Field, PageHeader } from "@/components/ui/primitives";
import { TaskModal } from "@/components/tasks/TaskModal";
import type { Task } from "@/types";

const COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];

function formatDate(value: string) {
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/**
 * Área Profissional — reúne o que o briefing original pedia como
 * módulo próprio, mas até agora só existia implicitamente: o
 * Priority Score (impact*urgência/esforço, campos que já existiam no
 * banco sem nenhuma tela), as metas de carreira já cadastradas em
 * Metas (categoria "Carreira") e um log rápido de reuniões 1:1 e
 * anotações de trabalho.
 */
export function ProfissionalPage() {
  const { tasks: professionalTasks, isLoading: tasksLoading } = useProfessionalTasks();
  const { updateTask, removeTask } = useTasks();
  const { goals, isLoading: goalsLoading } = useGoals();
  const { notes, isLoading: notesLoading, createNote, isCreating, removeNote } = useWorkNotes();

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));

  const careerGoals = goals.filter((g) => g.category === "Carreira" && g.status === "active");

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    await createNote({ title: noteTitle.trim(), content: noteContent.trim() || null, occurredAt: noteDate });
    setNoteTitle("");
    setNoteContent("");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<Briefcase size={20} />}
        title="Profissional"
        subtitle="Priority Score das suas tarefas de trabalho, metas de carreira e o histórico de 1:1s e anotações."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ============== Priority Score ============== */}
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Flame size={15} className="text-signal" />
            <p className="text-sm font-semibold">Priority Score</p>
          </div>
          {!tasksLoading && professionalTasks.length === 0 ? (
            <EmptyState
              title="Nenhuma tarefa profissional em aberto"
              description="Vincule uma tarefa a um projeto do tipo Profissional (em Projetos ou Tarefas) para ela aparecer aqui ordenada por impacto × urgência ÷ esforço."
              ctaLabel="Ir para Projetos"
              onCta={() => window.location.assign("/projetos")}
            />
          ) : (
            <div className="space-y-2">
              {professionalTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setEditingTask(task)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl p-3 border border-paper-border dark:border-ink-border hover:border-brand-500/40 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate">
                      <span>{task.status}</span>
                      {task.due_date && <span>· prazo {formatDate(task.due_date)}</span>}
                    </div>
                  </div>
                  {task.priority_score != null ? (
                    <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-signal/15 text-signal-deep">
                      {task.priority_score.toFixed(1)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-slate">sem score</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ============== Metas de carreira ============== */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={15} className="text-brand-600 dark:text-brand-400" />
              <p className="text-sm font-semibold">Metas de carreira</p>
            </div>
            <Link to="/metas" className="text-xs text-brand-600 dark:text-brand-500 font-medium">
              Ver todas →
            </Link>
          </div>
          {!goalsLoading && careerGoals.length === 0 ? (
            <p className="text-xs text-slate">
              Nenhuma meta ativa na categoria "Carreira" ainda —{" "}
              <Link to="/metas" className="text-brand-600 dark:text-brand-500 font-medium">
                cadastre uma em Metas
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {careerGoals.map((g) => {
                const pct = g.target_value ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : g.current_value > 0 ? 100 : 0;
                return (
                  <div key={g.id}>
                    <p className="text-xs font-medium truncate">{g.title}</p>
                    <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-1.5">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ============== Reuniões 1:1 / Anotações ============== */}
      <Card className="p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-cat-purple" />
          <p className="text-sm font-semibold">Reuniões 1:1 e anotações</p>
        </div>

        <form onSubmit={handleAddNote} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 mb-4">
          <Field label="" placeholder="Título (ex: 1:1 com o gestor)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          <Field label="" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
          <Button type="submit" disabled={!noteTitle.trim() || isCreating} className="self-end">
            <Plus size={14} /> {isCreating ? "Salvando..." : "Adicionar"}
          </Button>
        </form>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          rows={2}
          placeholder="Notas da conversa (opcional)..."
          className="w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none mb-4"
        />

        {!notesLoading && notes.length === 0 ? (
          <p className="text-xs text-slate">Nenhuma anotação registrada ainda.</p>
        ) : (
          <div className="space-y-2.5">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl p-3 border border-paper-border dark:border-ink-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{note.title}</p>
                    <p className="text-[11px] text-slate">{formatDate(note.occurred_at)}</p>
                  </div>
                  <button onClick={() => removeNote(note.id)} aria-label="Excluir anotação" className="shrink-0 text-slate/60 hover:text-drop transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                {note.content && <p className="text-xs text-slate mt-2 whitespace-pre-wrap">{note.content}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {editingTask && (
        <TaskModal
          task={editingTask}
          statusOptions={COLUMNS}
          onClose={() => setEditingTask(null)}
          onSave={(input) => updateTask({ id: editingTask.id, patch: input })}
          onDelete={removeTask}
        />
      )}
    </div>
  );
}
