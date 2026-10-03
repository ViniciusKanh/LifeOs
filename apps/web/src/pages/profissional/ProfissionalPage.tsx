import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, BarChart3, Briefcase, CalendarClock, CheckCircle2, Clock, Flame, Grid3x3, Hourglass, NotebookPen, Plus, Sparkles, Target, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useProfessionalTasks, useTasks } from "@/hooks/useTasks";
import { useWorkNotes } from "@/hooks/useWorkNotes";
import { useProfessionalOverview } from "@/hooks/useProfessional";
import { Button, Card, EmptyState, Field, PageHeader, StatTile } from "@/components/ui/primitives";
import { useTheme } from "@/hooks/useTheme";
import { RPGPageHeader, RPGPanel, RPGProgressBar, RPGStatCard, RPG_SECTION_TITLE } from "@/components/rpg";
import { TaskModal } from "@/components/tasks/TaskModal";
import { ProjectLoadBoard } from "@/components/projects/ProjectLoadBoard";
import { ComparisonGrid, DayMatrix, WeekdayBars } from "@/components/professional/ProfessionalInsights";
import { formatMinutes } from "@/components/projects/projectMeta";
import type { Task } from "@/types";

const COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];

function formatDate(value: string) {
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function Section({ icon, title, subtitle, action, children, className }: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-4 sm:p-5 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-2 font-display font-semibold text-[15px] ${RPG_SECTION_TITLE}`}>{icon} {title}</p>
          {subtitle && <p className="text-xs text-slate mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function deltaCaption(current: number, previous: number, unit: (v: number) => string) {
  if (previous === 0 && current === 0) return "sem registros nas 2 últimas semanas";
  if (previous === 0) return `semana anterior: 0`;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs semana anterior (${unit(previous)})`;
}

/**
 * Área Profissional — o trabalho cruzado com o resto do LifeOS:
 * KPIs da semana, matriz dia a dia (tarefas, horas, reuniões, sono e
 * energia), "o que influencia seu trabalho" (comparações com Saúde e
 * Hábitos), carga por projeto profissional, prazos, Priority Score, melhor
 * dia da semana, metas de carreira, Diário e reuniões 1:1.
 * Todos os números vêm de GET /api/professional/overview (dados reais).
 */
export function ProfissionalPage() {
  const { tasks: professionalTasks, isLoading: tasksLoading } = useProfessionalTasks();
  const { updateTask, removeTask } = useTasks();
  const { overview, isLoading: overviewLoading } = useProfessionalOverview();
  const { isRpg } = useTheme();
  const { notes, isLoading: notesLoading, createNote, isCreating, removeNote } = useWorkNotes();

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [noteError, setNoteError] = useState<string | null>(null);

  const careerGoals = overview?.careerGoals ?? [];
  const k = overview?.kpis;

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || isCreating) return;
    setNoteError(null);
    try {
      await createNote({ title: noteTitle.trim(), content: noteContent.trim() || null, occurredAt: noteDate || new Date().toISOString().slice(0, 10) });
      setNoteTitle("");
      setNoteContent("");
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Não foi possível salvar a anotação.");
    }
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full">
      {isRpg ? (
        <RPGPageHeader
          banner="tarefas"
          size="md"
          eyebrow="Guilda · Carreira"
          title="Profissional"
          subtitle="Seu trabalho cruzado com sono, energia, exercícios, hábitos, reuniões, Diário e metas de carreira."
          className="mb-5"
        />
      ) : (
      <PageHeader
        icon={<Briefcase size={20} />}
        title="Profissional"
        subtitle="Seu trabalho cruzado com sono, energia, exercícios, hábitos, reuniões, Diário e metas de carreira."
      />
      )}

      {isRpg ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <RPGStatCard
            icon={<Briefcase size={18} />}
            label="Missões em aberto"
            value={overviewLoading ? "…" : String(k?.open ?? 0)}
            tone="purple"
            caption={k ? (k.overdue > 0 ? `${k.overdue} atrasadas · ${k.dueThisWeek} vencem em 7 dias` : `${k.dueThisWeek} vencem em 7 dias`) : undefined}
          />
          <RPGStatCard icon={<CheckCircle2 size={18} />} label="Concluídas (7 dias)" value={overviewLoading ? "…" : String(k?.done7 ?? 0)} tone="green" caption={k ? deltaCaption(k.done7, k.donePrev7, (v) => String(v)) : undefined} />
          <RPGStatCard icon={<Clock size={18} />} label="Horas registradas (7 dias)" value={overviewLoading ? "…" : formatMinutes(k?.logged7 ?? 0)} tone="blue" caption={k ? deltaCaption(k.logged7, k.loggedPrev7, formatMinutes) : undefined} />
          <RPGStatCard
            icon={<Hourglass size={18} />}
            label="Restante estimado"
            value={overviewLoading ? "…" : formatMinutes(k?.remainingMinutes ?? 0)}
            tone="orange"
            caption={k ? (k.unestimatedOpen > 0 ? `${k.unestimatedOpen} tarefas sem estimativa` : `${k.meetings30} reuniões/anotações em 30 dias`) : undefined}
          />
        </div>
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile
          icon={<Briefcase size={16} />}
          label="Em aberto"
          value={overviewLoading ? "…" : String(k?.open ?? 0)}
          tone="purple"
          caption={k ? (k.overdue > 0 ? `${k.overdue} atrasadas · ${k.dueThisWeek} vencem em 7 dias` : `${k.dueThisWeek} vencem em 7 dias`) : undefined}
        />
        <StatTile
          icon={<CheckCircle2 size={16} />}
          label="Concluídas (7 dias)"
          value={overviewLoading ? "…" : String(k?.done7 ?? 0)}
          tone="green"
          caption={k ? deltaCaption(k.done7, k.donePrev7, (v) => String(v)) : undefined}
        />
        <StatTile
          icon={<Clock size={16} />}
          label="Horas registradas (7 dias)"
          value={overviewLoading ? "…" : formatMinutes(k?.logged7 ?? 0)}
          tone="blue"
          caption={k ? deltaCaption(k.logged7, k.loggedPrev7, formatMinutes) : undefined}
        />
        <StatTile
          icon={<Hourglass size={16} />}
          label="Restante estimado"
          value={overviewLoading ? "…" : formatMinutes(k?.remainingMinutes ?? 0)}
          tone="amber"
          caption={k ? (k.unestimatedOpen > 0 ? `${k.unestimatedOpen} tarefas sem estimativa` : `${k.meetings30} reuniões/anotações em 30 dias`) : undefined}
        />
      </div>
      )}

      {overview && (
        <>
          <Section
            className="mb-4"
            icon={<Grid3x3 size={16} className="text-cat-purple" />}
            title="Seus últimos 14 dias de trabalho"
            subtitle="Tarefas profissionais concluídas e horas registradas lado a lado com reuniões, sono e energia. Quadrado tracejado = sem registro naquele dia."
          >
            <DayMatrix daily={overview.daily} />
          </Section>

          <Section
            className="mb-4"
            icon={<Sparkles size={16} className="text-cat-purple" />}
            title={isRpg ? "Desempenho da jornada profissional" : "O que acompanha seus melhores dias de trabalho"}
            subtitle={
              isRpg
                ? "Média de missões profissionais concluídas por dia, com e sem cada condição. Associação observada nos seus registros — não prova causa."
                : "Média de tarefas profissionais concluídas por dia, comparando dias com e sem cada condição."
            }
          >
            <ComparisonGrid comparisons={overview.comparisons} windowDays={overview.windowDays} />
          </Section>

          {isRpg && careerGoals.length > 0 && (
            <RPGPanel title="Trilha de carreira" icon={<Target size={16} />} className="mb-4" actions={<Link to="/metas" className="text-xs text-rpg-gold-light hover:underline">Metas</Link>}>
              <ol className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {careerGoals.map((g, i) => (
                  <li key={g.id} className={`rpg-panel p-3 ${g.pct >= 100 ? "rpg-panel-success" : ""}`}>
                    <p className="font-pixel text-[10px] uppercase tracking-wider text-rpg-gold">Etapa {i + 1}</p>
                    <p className="mt-0.5 font-rpg font-semibold text-rpg-text break-words">{g.title}</p>
                    <RPGProgressBar className="mt-2" tone={g.pct >= 100 ? "green" : "purple"} label="Progresso real da meta" value={g.pct} valueLabel={`${g.pct}%`} />
                    {g.dueDate && <p className="mt-1 text-[11px] text-rpg-muted">Prazo {formatDate(g.dueDate)}</p>}
                  </li>
                ))}
              </ol>
            </RPGPanel>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            <Section
              className="xl:col-span-2"
              icon={<Hourglass size={16} className="text-brand-600" />}
              title={isRpg ? "Carga das jornadas profissionais" : "Carga dos projetos profissionais"}
              action={<Link to="/projetos" className="text-xs font-medium text-brand-600 dark:text-brand-100 hover:underline shrink-0">Projetos</Link>}
            >
              <ProjectLoadBoard
                workload={overview.workload}
                isLoading={false}
                emptyText="Nenhum projeto do tipo Profissional com tarefas. Em Projetos, marque o tipo como Profissional e vincule tarefas."
              />
            </Section>
            <div className="space-y-4">
              <Section icon={<CalendarClock size={16} className="text-signal-deep" />} title="Prazos dos próximos 14 dias">
                {overview.upcoming.length === 0 ? (
                  <p className="text-xs text-slate">Nenhuma tarefa profissional com prazo nos próximos 14 dias.</p>
                ) : (
                  <ul className="space-y-1">
                    {overview.upcoming.map((u) => {
                      const late = u.dueDate < overview.today;
                      return (
                        <li key={u.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                          <span className={`text-[11px] font-semibold w-12 shrink-0 ${late ? "text-drop" : "text-slate"}`}>{formatDate(u.dueDate)}</span>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: u.projectColor ?? "#7C4DFF" }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm truncate">{u.title}</span>
                            <span className="block text-[10px] text-slate truncate">{u.projectName} · {u.status}</span>
                          </span>
                          {late && <AlertTriangle size={13} className="text-drop shrink-0" aria-label="Atrasada" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
              <Section icon={<BarChart3 size={16} className="text-cat-blue" />} title="Melhor dia da semana" subtitle={`Últimos ${overview.windowDays} dias`}>
                <WeekdayBars weekday={overview.weekday} best={overview.bestWeekday} />
              </Section>
            </div>
          </div>
        </>
      )}

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
          {!overviewLoading && careerGoals.length === 0 ? (
            <p className="text-xs text-slate">
              Nenhuma meta ativa na categoria "Carreira" ainda —{" "}
              <Link to="/metas" className="text-brand-600 dark:text-brand-500 font-medium">
                cadastre uma em Metas
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {careerGoals.map((g) => (
                <div key={g.id}>
                  <div className="flex justify-between gap-2 text-xs">
                    <p className="font-medium truncate">{g.title}</p>
                    <span className="text-slate shrink-0">{g.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-1.5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${g.pct}%` }} />
                  </div>
                  {g.dueDate && <p className="text-[10px] text-slate mt-1">prazo {formatDate(g.dueDate)}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-paper-border dark:border-ink-border">
            <p className="flex items-center gap-1.5 text-sm font-semibold mb-2">
              <NotebookPen size={14} className="text-cat-pink" /> No Diário
            </p>
            {!overview || overview.journal.recent.length === 0 ? (
              <p className="text-xs text-slate">
                Nenhuma entrada do Diário ligada a projetos profissionais. No{" "}
                <Link to="/diario" className="text-brand-600 dark:text-brand-500 font-medium">Diário</Link>, use “Vincular a projeto”.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-slate mb-2">{overview.journal.linkedEntries30} entrada(s) sobre trabalho nos últimos 30 dias.</p>
                <ul className="space-y-2">
                  {overview.journal.recent.map((j) => (
                    <li key={`${j.date}-${j.projectName}`}>
                      <Link to={`/diario?date=${j.date}`} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                        <p className="text-[11px] font-semibold text-cat-pink">{formatDate(j.date)} · {j.projectName}</p>
                        {j.preview && <p className="text-xs text-slate line-clamp-2">{j.preview}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
        {noteError && <p className="text-xs text-drop bg-drop/10 rounded-lg px-3 py-2.5 mb-4">{noteError}</p>}

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
