import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Plus,
  Droplets,
  Moon,
  Target,
  Star,
  History as HistoryIcon,
  Sparkles,
  CheckSquare,
  Repeat,
  Dumbbell,
  BookOpen,
  Brain,
  GraduationCap,
  Wand2,
  Flame,
} from "lucide-react";
import { useTasks, useFocusTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useHealthSummary, useHealth } from "@/hooks/useHealth";
import { useFocus } from "@/hooks/useFocus";
import { useTimeline } from "@/hooks/useAnalytics";
import { useCopilotInsight } from "@/hooks/useCopilot";
import { Button, Card, IconBadge, StatTile } from "@/components/ui/primitives";
import { TaskModal } from "@/components/tasks/TaskModal";
import type { Task, TimelineEvent } from "@/types";

// Frases de abertura variadas para o card do Copilot antes do primeiro
// insight gerado no dia — trocam por dia (não por render) para não
// parecerem aleatórias a cada F5, e nunca fingem ser um insight real.
const FALLBACK_QUOTES = [
  "Pequenas ações consistentes hoje constroem a vida que você deseja amanhã.",
  "Você não precisa de um dia perfeito — precisa de um dia que some com os outros.",
  "O progresso de hoje é a base do resultado de amanhã. Um passo de cada vez.",
  "Feito é melhor que perfeito. Avance no que dá para avançar agora.",
];
function fallbackQuoteOfTheDay() {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return FALLBACK_QUOTES[dayIndex % FALLBACK_QUOTES.length];
}

// Metas de referência usadas só para calcular "% da meta" nos
// indicadores — ainda não são configuráveis por usuário no backend
// (não existe uma tabela de metas de saúde por enquanto). O valor
// registrado (litros bebidos, minutos dormidos, minutos de foco)
// é sempre real; só o denominador é um padrão fixo.
const WATER_GOAL_ML = 2500;
const SLEEP_GOAL_MINUTES = 8 * 60;
const FOCUS_GOAL_MINUTES = 25;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const TIMELINE_ICON: Record<TimelineEvent["type"], typeof CheckSquare> = {
  task: CheckSquare,
  habit: Repeat,
  workout: Dumbbell,
  reading: BookOpen,
  focus: Brain,
  education: GraduationCap,
  sleep: Moon,
};

function timelineLabel(e: TimelineEvent): string {
  switch (e.type) {
    case "task":
      return `Tarefa concluída: ${e.label}`;
    case "habit":
      return `Hábito cumprido: ${e.label}`;
    case "workout":
      return e.label;
    case "reading":
      return `Leitura: ${e.label}`;
    case "focus":
      return "Sessão de foco";
    case "education":
      return `Disciplina concluída: ${e.label}`;
    default:
      return e.label;
  }
}

function formatTime(at: string) {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function HojePage() {
  const { tasks, createTask, moveTask } = useTasks();
  const { focusTasks } = useFocusTasks(5);
  const { habits, summaryByHabitId, checkIn } = useHabits();
  const { summary: health } = useHealthSummary();
  const { addWater } = useHealth();
  const { summary: focus } = useFocus();
  const today = todayStr();
  const { events } = useTimeline({ from: today, to: today });
  const copilot = useCopilotInsight();
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const priorities = useMemo(() => {
    const priorityWeight: Record<Task["priority"], number> = { Alta: 0, Média: 1, Baixa: 2 };
    return tasks
      .filter((t) => t.status !== "Concluído")
      .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .slice(0, 6);
  }, [tasks]);
  const prioritiesDone = tasks.filter((t) => t.status === "Concluído" && t.due_date?.slice(0, 10) === today).length;
  const prioritiesTotal = priorities.length + prioritiesDone;
  const prioritiesPct = prioritiesTotal > 0 ? Math.round((prioritiesDone / prioritiesTotal) * 100) : 0;

  const habitsDone = habits.filter((h) => summaryByHabitId.get(h.id)?.checkedInToday).length;
  const waterPct = health ? Math.round((health.waterMl / WATER_GOAL_ML) * 100) : 0;
  const sleepPct = health?.lastSleepMinutes ? Math.round((health.lastSleepMinutes / SLEEP_GOAL_MINUTES) * 100) : 0;
  const focusPct = focus ? Math.round((focus.todayMinutes / FOCUS_GOAL_MINUTES) * 100) : 0;

  const todaysEvents = [...events]
    .filter((e) => String(e.at).slice(0, 10) === today)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const toggleTask = (id: string, currentStatus: string) => {
    moveTask({ id, status: currentStatus === "Concluído" ? "A Fazer" : "Concluído" });
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <p className="font-display font-bold text-2xl">Hoje</p>
      <p className="text-sm text-slate mt-1 mb-5">
        {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} · {prioritiesPct}% das
        prioridades concluídas
      </p>

      {/* Stat tiles — 2 colunas no celular (mobile-first) para caber bem em telas ~360-400px */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 mb-4">
        <StatTile
          tone="blue"
          icon={<CheckCircle2 size={18} />}
          label="Prioridades do dia"
          value={`${prioritiesDone} / ${prioritiesTotal}`}
          progressPct={prioritiesPct}
          caption={`${prioritiesPct}% concluídas`}
        />
        <StatTile
          tone="green"
          icon={<Target size={18} />}
          label="Hábitos de hoje"
          value={`${habitsDone} / ${habits.length}`}
          progressPct={habits.length > 0 ? Math.round((habitsDone / habits.length) * 100) : 0}
          caption={`${habits.length > 0 ? Math.round((habitsDone / habits.length) * 100) : 0}% concluídos`}
        />
        <StatTile
          tone="blue"
          icon={<Droplets size={18} />}
          label="Água"
          value={`${((health?.waterMl ?? 0) / 1000).toFixed(1)} / ${(WATER_GOAL_ML / 1000).toFixed(1)} L`}
          progressPct={Math.min(waterPct, 100)}
          caption={`${waterPct}% da meta`}
        />
        <StatTile
          tone="purple"
          icon={<Moon size={18} />}
          label="Sono"
          value={health?.lastSleepMinutes ? formatHM(health.lastSleepMinutes) : "—"}
          progressPct={Math.min(sleepPct, 100)}
          caption={health?.lastSleepMinutes ? `${sleepPct}% da meta` : "sem registro"}
        />
        <StatTile
          tone="amber"
          icon={<Target size={18} />}
          label="Foco"
          value={formatHM(focus?.todayMinutes ?? 0)}
          caption={`Meta: ${FOCUS_GOAL_MINUTES}min`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          <Card className="p-5">
            {/* Cabeçalho com quebra em telas estreitas: título/legenda encolhem e o botão desce de linha se faltar espaço */}
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconBadge tone="amber" size={32} icon={<Star size={15} />} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Prioridades</p>
                  <p className="text-xs text-slate">Suas tarefas mais importantes para hoje.</p>
                </div>
              </div>
              <Button onClick={() => setTaskModalOpen(true)} className="shrink-0">
                <Plus size={14} /> Adicionar tarefa
              </Button>
            </div>

            {priorities.length === 0 ? (
              <p className="text-xs text-slate mt-4">Nenhuma tarefa pendente — bom trabalho!</p>
            ) : (
              <div className="mt-3 space-y-1">
                {priorities.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTask(t.id, t.status)}
                    className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <Circle size={17} className="text-slate shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{t.title}</span>
                    </span>
                    <PriorityBadge priority={t.priority} />
                    {t.due_date && (
                      <span className="text-[11px] text-slate shrink-0">
                        {new Date(`${t.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-1">
              <IconBadge tone="pink" size={32} icon={<Flame size={15} />} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Foque nisso agora</p>
                <p className="text-xs text-slate">Priorização automática, calculada por prazo, prioridade e dependências.</p>
              </div>
            </div>

            {focusTasks.length === 0 ? (
              <p className="text-xs text-slate mt-4">
                Tudo em dia por aqui — nenhuma tarefa pedindo atenção urgente agora.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {focusTasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-paper-border dark:border-ink-border px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        onClick={() => moveTask({ id: t.id, status: "Concluído" })}
                        aria-label="Marcar como concluída"
                        className="mt-0.5 shrink-0"
                      >
                        <Circle size={17} className="text-slate hover:text-brand-600 dark:hover:text-brand-500" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{t.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {t.dueDate && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate/10 text-slate shrink-0">
                              {new Date(`${t.dueDate.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                          {t.reasons.map((reason) => (
                            <span
                              key={reason}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-signal/15 text-signal-deep dark:text-signal shrink-0"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Bem-estar</p>
              <Link to="/saude" className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                Ver mais →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Droplets size={15} className="text-cat-blue" />
                  <span className="text-sm font-semibold">Água</span>
                </div>
                <p className="font-display font-bold text-2xl">
                  {((health?.waterMl ?? 0) / 1000).toFixed(1)}
                  <span className="text-sm font-normal text-slate"> / {(WATER_GOAL_ML / 1000).toFixed(1)} L</span>
                </p>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border my-2">
                  <div className="h-full rounded-full bg-cat-blue" style={{ width: `${Math.min(waterPct, 100)}%` }} />
                </div>
                <button
                  onClick={() => addWater(300)}
                  className="text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 hover:bg-paper dark:hover:bg-ink"
                >
                  + Registrar água
                </button>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Moon size={15} className="text-cat-purple" />
                  <span className="text-sm font-semibold">Sono</span>
                </div>
                <p className="font-display font-bold text-2xl">
                  {health?.lastSleepMinutes ? formatHM(health.lastSleepMinutes) : "—"}
                </p>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border my-2">
                  <div className="h-full rounded-full bg-cat-purple" style={{ width: `${Math.min(sleepPct, 100)}%` }} />
                </div>
                <Link
                  to="/saude"
                  className="inline-block text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 hover:bg-paper dark:hover:bg-ink"
                >
                  Registrar noite
                </Link>
              </div>
            </div>
          </Card>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <IconBadge tone="blue" size={32} icon={<HistoryIcon size={15} />} />
                <div>
                  <p className="text-sm font-semibold">Linha do dia</p>
                  <p className="text-xs text-slate">O que você já registrou hoje.</p>
                </div>
              </div>
            </div>

            {todaysEvents.length === 0 ? (
              <p className="text-xs text-slate mt-4">
                Nada registrado ainda hoje — conclua tarefas, marque hábitos ou registre um treino para ver aqui.
              </p>
            ) : (
              <div className="mt-3 relative pl-4 border-l-2 border-paper-border dark:border-ink-border space-y-4">
                {todaysEvents.map((e) => {
                  const Icon = TIMELINE_ICON[e.type] ?? CheckSquare;
                  return (
                    <div key={`${e.type}-${e.id}`} className="relative">
                      <span className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-paper-raised dark:ring-ink-raised" />
                      <div className="flex items-start gap-2.5">
                        <Icon size={14} className="text-slate mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{timelineLabel(e)}</p>
                          <p className="text-[11px] text-slate">{formatTime(String(e.at))}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6 bg-gradient-to-br from-brand-600 to-cat-purple text-white border-0 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 mb-3">
                  <Sparkles size={18} />
                </span>
                <p className="font-display font-bold text-lg leading-snug">Copilot do dia</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed mt-3 bg-white/10 rounded-xl px-4 py-3">
              {copilot.text && !copilot.error ? copilot.text : fallbackQuoteOfTheDay()}
            </p>

            {copilot.error && (
              <p className="text-xs mt-2.5 opacity-90">
                {copilot.error.message}
                {copilot.error.status === 400 && (
                  <>
                    {" "}
                    <Link to="/configuracoes" className="underline font-semibold">
                      Ir para Configurações
                    </Link>
                  </>
                )}
              </p>
            )}

            <button
              onClick={() => copilot.generate()}
              disabled={copilot.isGenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <Wand2 size={15} />
              {copilot.isGenerating ? "Gerando..." : copilot.text ? "Gerar outro insight" : "Gerar insight do dia com IA"}
            </button>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Hábitos rápidos</p>
              <Link to="/habitos" className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                Ver todos →
              </Link>
            </div>
            {habits.length === 0 ? (
              <p className="text-xs text-slate">Crie seu primeiro hábito para vê-lo aqui.</p>
            ) : (
              // 2 colunas fixas: já é o ideal tanto no celular quanto na coluna
              // direita (mais estreita) do layout desktop — evita apertar 3+ cards.
              <div className="grid grid-cols-2 gap-2.5">
                {habits.slice(0, 4).map((h) => {
                  const done = summaryByHabitId.get(h.id)?.checkedInToday ?? false;
                  return (
                    <button
                      key={h.id}
                      onClick={() => checkIn({ id: h.id, entryDate: today })}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        done
                          ? "border-growth/40 bg-growth/10"
                          : "border-paper-border dark:border-ink-border hover:bg-paper dark:hover:bg-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg">{h.icon ?? "✅"}</span>
                        {done ? (
                          <CheckCircle2 size={15} className="text-growth" />
                        ) : (
                          <Circle size={15} className="text-slate" />
                        )}
                      </div>
                      <p className="text-xs font-medium mt-2 truncate">{h.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {taskModalOpen && (
        <TaskModal
          task={null}
          statusOptions={["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"]}
          onClose={() => setTaskModalOpen(false)}
          onSave={createTask}
        />
      )}
    </div>
  );
}

const PRIORITY_TONE: Record<Task["priority"], string> = {
  Alta: "text-drop bg-drop/10",
  Média: "text-signal-deep bg-signal/15",
  Baixa: "text-slate bg-slate/10",
};

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_TONE[priority]}`}>{priority}</span>;
}

