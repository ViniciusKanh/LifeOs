import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, Legend } from "recharts";
import {
  TrendingUp,
  ListChecks,
  Target,
  Droplets,
  Heart,
  Circle,
  CheckCircle2,
  Flame,
  Info,
  BookOpen,
  Flag,
  Wrench,
  Plus,
  Timer,
  Check,
  Sparkles,
  Briefcase,
  GraduationCap,
  Repeat,
  History as HistoryIcon,
  CheckSquare,
  Dumbbell,
  Brain,
  Moon,
  Wand2,
} from "lucide-react";
import { LifeScoreRadar } from "@/components/charts/LifeScoreRadar";
import { useLifeScore, useAnalyticsOverview, useTimeline } from "@/hooks/useAnalytics";
import { useWeeklyReviewHistory } from "@/hooks/useReviews";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useHealth, useHealthSummary } from "@/hooks/useHealth";
import { useFocus } from "@/hooks/useFocus";
import { useBooks } from "@/hooks/useBooks";
import { useGoals } from "@/hooks/useGoals";
import { useDailyInsight } from "@/hooks/useCopilot";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { TimelineEvent } from "@/types";

const DIMENSION_LABELS: Record<string, string> = {
  productivity: "Produtividade",
  professional: "Profissional",
  health: "Saúde",
  education: "Educação",
  reading: "Leitura",
  habits: "Hábitos",
  goals: "Metas",
};

// Cor de cada dimensão no radar/lista — o mesmo significado usado em
// toda a aplicação (ver comentário em primitives.tsx: IconBadge).
const DIMENSION_BAR_TONE: Record<string, string> = {
  productivity: "bg-signal",
  professional: "bg-signal",
  health: "bg-cat-blue",
  education: "bg-cat-purple",
  reading: "bg-cat-pink",
  habits: "bg-cat-green",
  goals: "bg-cat-teal",
};

// Meta diária de água — ainda não é configurável por usuário no
// backend, então usamos um valor de referência fixo só para calcular
// o "% da meta" exibido; o litro registrado em si é sempre real.
const WATER_GOAL_ML = 2500;

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

function formatEventTime(at: string) {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(total: number) {
  if (total <= 0) return "0min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}min` : `${m}min`;
}

function weekShortLabel(monday: string) {
  const d = new Date(`${monday}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function DashboardPage() {
  const { user } = useAuth();
  const { lifeScore, isLoading } = useLifeScore();
  const { tasks, moveTask, createTask } = useTasks();
  const { habits, summaryByHabitId, checkIn } = useHabits();
  const { summary: health } = useHealthSummary();
  const { addWater } = useHealth();
  const { summary: focus, activeSession, start: startFocus } = useFocus();
  const { books } = useBooks({ status: "lendo" });
  const { stats: goalStats } = useGoals();
  const { overview } = useAnalyticsOverview(14);
  const { history: reviewHistory } = useWeeklyReviewHistory(8);
  const today = new Date().toISOString().slice(0, 10);
  const { events } = useTimeline({ from: today, to: today });
  const copilot = useDailyInsight();

  const [quickTitle, setQuickTitle] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const dims = lifeScore
    ? Object.entries(DIMENSION_LABELS).map(([key, dim]) => ({
        key,
        dim,
        value: (lifeScore as unknown as Record<string, number>)[key] ?? 0,
      }))
    : Object.entries(DIMENSION_LABELS).map(([key, dim]) => ({ key, dim, value: 0 }));

  const overall = lifeScore?.overall ?? 0;

  const tasksToday = tasks.filter((t) => t.due_date?.slice(0, 10) === today);
  const tasksTodayDone = tasksToday.filter((t) => t.status === "Concluído").length;

  const priorities = tasks
    .filter((t) => t.status !== "Concluído")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 5);

  const todaysEvents = useMemo(
    () =>
      [...events]
        .filter((e) => String(e.at).slice(0, 10) === today)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 5),
    [events, today]
  );

  const habitsDoneToday = habits.filter((h) => summaryByHabitId.get(h.id)?.checkedInToday).length;
  const waterPct = health ? Math.round((health.waterMl / WATER_GOAL_ML) * 100) : 0;
  const currentBook = books[0];

  const weekGoalStat = goalStats?.periods.find((p) => p.period === "semanal") ?? null;
  const nextMilestone = goalStats?.upcomingMilestones[0] ?? null;

  const toggleTask = (id: string, currentStatus: string) => {
    moveTask({ id, status: currentStatus === "Concluído" ? "A Fazer" : "Concluído" });
  };

  const flash = (message: string) => {
    setActionFeedback(message);
    setTimeout(() => setActionFeedback((cur) => (cur === message ? null : cur)), 2500);
  };

  const handleQuickWater = async () => {
    await addWater(250);
    flash("+250ml de água registrados!");
  };

  const handleQuickFocus = async () => {
    if (activeSession) return;
    await startFocus({ mode: "pomodoro", plannedMinutes: 25 });
    flash("Sessão de foco de 25min iniciada!");
  };

  const handleQuickTask = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    await createTask({ title, status: "A Fazer" });
    setQuickTitle("");
    flash("Tarefa adicionada!");
  };

  // Tarefas concluídas por dia (últimos 14 dias) — reaproveita o mesmo
  // dado real já usado em Analytics, sem nova consulta ao backend.
  const tasksChartData = (overview?.tasksCompletedByDay ?? []).map((d) => ({
    day: d.day.slice(5),
    total: Number(d.total),
  }));

  // Evolução do Life Score ao longo das revisões semanais salvas —
  // dado real (nunca estimado): sem pelo menos 2 revisões salvas, o
  // gráfico mostra um estado vazio em vez de uma linha inventada.
  const reviewTrendData = useMemo(() => {
    return [...reviewHistory]
      .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
      .map((r) => {
        const dims5 = [r.productivity_pct, r.health_pct, r.education_pct, r.reading_pct, r.habits_pct].map((v) => v ?? 0);
        const overallAvg = Math.round(dims5.reduce((a, b) => a + b, 0) / dims5.length);
        return { week: weekShortLabel(r.week_start_date), overall: overallAvg };
      });
  }, [reviewHistory]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <p className="font-display font-bold text-2xl">Olá, {user?.name?.split(" ")[0] ?? ""} 👋</p>
      </div>
      <p className="text-sm text-slate -mt-4 mb-6">Aqui está o retrato atual da sua rotina. Continue evoluindo!</p>

      {/* Linha de stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatTile tone="blue" icon={<TrendingUp size={18} />} label="Life Score" value={`${isLoading ? "—" : overall} / 100`} />
        <StatTile
          tone="purple"
          icon={<ListChecks size={18} />}
          label="Tarefas Hoje"
          value={`${tasksTodayDone} / ${tasksToday.length}`}
          progressPct={tasksToday.length > 0 ? Math.round((tasksTodayDone / tasksToday.length) * 100) : 0}
        />
        <StatTile tone="teal" icon={<Target size={18} />} label="Foco hoje" value={formatMinutes(focus?.todayMinutes ?? 0)} />
        <StatTile
          tone="blue"
          icon={<Droplets size={18} />}
          label="Água"
          value={`${((health?.waterMl ?? 0) / 1000).toFixed(1)} L`}
          progressPct={Math.min(waterPct, 100)}
        />
        <StatTile
          tone="green"
          icon={<Heart size={18} />}
          label="Hábitos"
          value={`${habitsDoneToday} / ${habits.length}`}
          progressPct={habits.length > 0 ? Math.round((habitsDoneToday / habits.length) * 100) : 0}
        />
        <StatTile
          tone="amber"
          icon={<Flag size={18} />}
          label="Metas na semana"
          value={weekGoalStat ? `${weekGoalStat.doneCount} / ${weekGoalStat.totalCount}` : "0 / 0"}
          progressPct={weekGoalStat?.pct ?? 0}
        />
      </div>

      {/* Life Score + Como é calculado */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 mb-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-semibold">Life Score</p>
              <p className="text-xs text-slate">Visão geral das suas 7 dimensões de vida.</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate">
              <Info size={12} />
              <span>Calculado a partir de dados reais</span>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-6 mt-4">
            <div className="w-full md:w-44 h-44 shrink-0">
              <LifeScoreRadar data={dims} />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-end gap-2">
                <span className="font-display font-extrabold text-4xl leading-none">{isLoading ? "—" : overall}</span>
                <span className="text-sm mb-1 text-slate">/ 100 · Seu Life Score</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {dims.map((d) => (
                  <div key={d.dim} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 text-slate">{d.dim}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                      <div className={`h-full rounded-full ${DIMENSION_BAR_TONE[d.key]}`} style={{ width: `${d.value}%` }} />
                    </div>
                    <span className="w-6 text-right font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Info size={15} className="text-slate" />
            <p className="text-sm font-semibold">Como o Life Score é calculado</p>
          </div>
          <p className="text-xs text-slate mb-4">
            O Life Score reflete o seu progresso nas principais áreas da vida, com base em dados reais da sua rotina.
          </p>
          <div className="space-y-3">
            <ExplainRow
              tone="amber"
              icon={<Briefcase size={14} />}
              title="Produtividade e Profissional"
              description="% de tarefas concluídas (geral e por projetos profissionais)."
            />
            <ExplainRow tone="blue" icon={<Heart size={14} />} title="Saúde" description="Água, sono e exercício de hoje." />
            <ExplainRow
              tone="purple"
              icon={<GraduationCap size={14} />}
              title="Educação"
              description="Progresso médio das suas formações."
            />
            <ExplainRow tone="pink" icon={<BookOpen size={14} />} title="Leitura" description="Progresso dos livros que você está lendo." />
            <ExplainRow tone="green" icon={<Repeat size={14} />} title="Hábitos" description="% de hábitos cumpridos hoje." />
            <ExplainRow tone="teal" icon={<Flag size={14} />} title="Metas" description="Progresso médio das metas ativas." />
          </div>
          <p className="text-[11px] text-slate mt-4 pt-3 border-t border-paper-border dark:border-ink-border">
            💡 Todas as dimensões vêm de dados reais registrados no LifeOS — nada aqui é estimado.
          </p>
        </Card>
      </div>

      {/* LifeOS Copilot — insight gerado por IA */}
      <Card className="p-6 mb-4 bg-gradient-to-br from-brand-600 to-cat-purple text-white border-0 shadow-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="font-display font-semibold text-base">LifeOS Copilot</p>
              <p className="text-xs opacity-90 mt-0.5 max-w-md">
                Insight do dia gerado por IA com base nos seus dados reais — tarefas, hábitos, água e leitura.
              </p>
            </div>
          </div>
          <button
            onClick={() => copilot.regenerate()}
            disabled={copilot.isRegenerating || copilot.isLoading}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            <Wand2 size={15} />
            {copilot.isRegenerating ? "Gerando..." : "Gerar outro insight"}
          </button>
        </div>

        {copilot.isLoading && <p className="text-sm mt-4 bg-white/10 rounded-xl px-4 py-3 opacity-80">Preparando o insight de hoje...</p>}

        {copilot.error && (
          <p className="text-sm mt-4 bg-white/10 rounded-xl px-4 py-3">
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

        {copilot.text && !copilot.error && !copilot.isLoading && (
          <p className="text-sm leading-relaxed mt-4 bg-white/10 rounded-xl px-4 py-3">{copilot.text}</p>
        )}
      </Card>

      {/* Gráficos de análise */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-5 md:p-6">
          <p className="text-sm font-semibold mb-1">Tarefas concluídas</p>
          <p className="text-xs text-slate mb-4">Últimos 14 dias.</p>
          {tasksChartData.length === 0 ? (
            <p className="text-sm text-slate">Sem tarefas concluídas nesse período ainda.</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tasksChartData}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="total" fill="#5B6EF5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <p className="text-sm font-semibold mb-1">Evolução do Life Score</p>
          <p className="text-xs text-slate mb-4">Com base nas suas revisões semanais salvas.</p>
          {reviewTrendData.length < 2 ? (
            <p className="text-sm text-slate">
              Salve pelo menos duas revisões semanais no Weekly Review para ver sua evolução aqui.
            </p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reviewTrendData}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="overall" name="Life Score" stroke="#5B6EF5" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Linha principal — mesma composição do protótipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card className="p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <IconBadge tone="blue" size={30} icon={<HistoryIcon size={14} />} />
            <p className="text-sm font-semibold">Resumo do dia</p>
          </div>
          {todaysEvents.length === 0 ? (
            <p className="text-xs text-slate">Nada registrado ainda hoje.</p>
          ) : (
            <div className="relative pl-4 border-l-2 border-paper-border dark:border-ink-border space-y-3">
              {todaysEvents.map((e) => {
                const Icon = TIMELINE_ICON[e.type] ?? CheckSquare;
                return (
                  <div key={`${e.type}-${e.id}`} className="relative">
                    <span className="absolute -left-[19px] top-0.5 w-2 h-2 rounded-full bg-brand-500 ring-4 ring-paper-raised dark:ring-ink-raised" />
                    <div className="flex items-start gap-2">
                      <Icon size={12} className="text-slate mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{timelineLabel(e)}</p>
                        <p className="text-[10px] text-slate">{formatEventTime(String(e.at))}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/hoje" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-3 inline-block">
            Ver hoje →
          </Link>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Próximas prioridades</p>
          {priorities.length === 0 ? (
            <p className="text-xs text-slate">Nenhuma tarefa pendente — bom trabalho!</p>
          ) : (
            <div className="space-y-1">
              {priorities.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTask(t.id, t.status)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <Circle size={15} className="text-slate shrink-0" />
                  <span className="text-xs truncate flex-1">{t.title}</span>
                </button>
              ))}
            </div>
          )}
          <Link to="/tarefas" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-2 inline-block">
            Ver todas →
          </Link>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Hábitos de hoje</p>
          {habits.length === 0 ? (
            <p className="text-xs text-slate">Crie seu primeiro hábito para acompanhar aqui.</p>
          ) : (
            <div className="space-y-1">
              {habits.slice(0, 5).map((h) => {
                const done = summaryByHabitId.get(h.id)?.checkedInToday ?? false;
                const streak = summaryByHabitId.get(h.id)?.currentStreak ?? 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => checkIn({ id: h.id, entryDate: today })}
                    className="w-full flex items-center justify-between rounded-lg px-1.5 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <span className="flex items-center gap-2.5 text-xs">
                      {done ? <CheckCircle2 size={15} className="text-growth" /> : <Circle size={15} className="text-slate" />}
                      <span className="truncate">
                        {h.icon ? `${h.icon} ` : ""}
                        {h.name}
                      </span>
                    </span>
                    {streak > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-slate shrink-0">
                        <Flame size={11} className="text-signal" /> {streak}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Link to="/habitos" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-2 inline-block">
            Ver todos →
          </Link>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Leitura atual</p>
          {!currentBook ? (
            <p className="text-xs text-slate">Nenhum livro em andamento — comece um na Biblioteca.</p>
          ) : (
            <div className="flex gap-3">
              {currentBook.cover_url ? (
                <img
                  src={currentBook.cover_url}
                  alt={currentBook.title}
                  className="w-12 h-[72px] object-cover rounded-md shrink-0 border border-paper-border dark:border-ink-border"
                />
              ) : (
                <div className="w-12 h-[72px] rounded-md shrink-0 bg-cat-pink/10 flex items-center justify-center">
                  <BookOpen size={18} className="text-cat-pink" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug truncate">{currentBook.title}</p>
                {currentBook.author && <p className="text-xs text-slate mt-0.5 truncate">{currentBook.author}</p>}
                {currentBook.total_pages ? (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate mb-1">
                      <span>
                        Página {currentBook.current_page} de {currentBook.total_pages}
                      </span>
                      <span>{Math.round((currentBook.current_page / currentBook.total_pages) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                      <div
                        className="h-full rounded-full bg-cat-pink"
                        style={{ width: `${Math.round((currentBook.current_page / currentBook.total_pages) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <Link to="/biblioteca" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-3 inline-block">
            Continuar lendo →
          </Link>
        </Card>
      </div>

      {/* Linha secundária */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={15} className="text-slate" />
            <p className="text-sm font-semibold">Ações rápidas</p>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickTask()}
                placeholder="Nova tarefa rápida..."
                className="flex-1 rounded-xl px-3 py-2.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 transition-colors"
              />
              <button
                onClick={handleQuickTask}
                disabled={!quickTitle.trim()}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-brand-500 text-white disabled:opacity-40"
                title="Adicionar tarefa"
              >
                <Plus size={16} />
              </button>
            </div>

            <button
              onClick={handleQuickWater}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
            >
              <IconBadge tone="blue" size={28} icon={<Droplets size={13} />} />
              <span className="flex-1 text-left">Registrar +250ml de água</span>
            </button>

            <button
              onClick={handleQuickFocus}
              disabled={!!activeSession}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              <IconBadge tone="teal" size={28} icon={<Timer size={13} />} />
              <span className="flex-1 text-left">
                {activeSession ? "Sessão de foco já em andamento" : "Iniciar foco (Pomodoro 25min)"}
              </span>
            </button>

            <Link
              to="/saude"
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
            >
              <IconBadge tone="pink" size={28} icon={<Heart size={13} />} />
              <span className="flex-1 text-left">Registrar humor do dia</span>
            </Link>

            {actionFeedback && (
              <p className="flex items-center gap-1.5 text-[11px] text-growth pt-1">
                <Check size={12} /> {actionFeedback}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Foco e bem-estar</p>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate">Minutos de foco hoje</span>
              <span className="font-semibold">{formatMinutes(focus?.todayMinutes ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Água</span>
              <span className="font-semibold">{((health?.waterMl ?? 0) / 1000).toFixed(1)} L</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Sono (última noite)</span>
              <span className="font-semibold">
                {health?.lastSleepMinutes ? `${Math.floor(health.lastSleepMinutes / 60)}h${health.lastSleepMinutes % 60}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Exercícios hoje</span>
              <span className="font-semibold">{health?.workoutsToday ?? 0}</span>
            </div>
          </div>
          <Link to="/saude" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-3 inline-block">
            Ver saúde →
          </Link>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Metas em destaque</p>
          {!nextMilestone ? (
            <p className="text-xs text-slate">Nenhuma meta com próxima ação definida ainda.</p>
          ) : (
            <div>
              <p className="text-sm font-semibold leading-snug truncate">{nextMilestone.goalTitle}</p>
              {nextMilestone.category && <p className="text-xs text-slate mt-0.5">{nextMilestone.category}</p>}
              {nextMilestone.nextAction && (
                <p className="text-xs mt-2.5 flex items-start gap-1.5">
                  <Flag size={12} className="text-signal-deep mt-0.5 shrink-0" />
                  <span>{nextMilestone.nextAction}</span>
                </p>
              )}
              {nextMilestone.nextActionDue && (
                <p className="text-[11px] text-slate mt-1">
                  Prazo: {new Date(`${nextMilestone.nextActionDue}T12:00:00`).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          )}
          <Link to="/metas" className="text-xs text-brand-600 dark:text-brand-500 font-medium mt-3 inline-block">
            Ver metas →
          </Link>
        </Card>
      </div>
    </div>
  );
}

function ExplainRow({
  tone,
  icon,
  title,
  description,
}: {
  tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <IconBadge tone={tone} icon={icon} size={30} />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-slate leading-snug">{description}</p>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
  progressPct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber";
  progressPct?: number;
}) {
  const barTone: Record<string, string> = {
    blue: "bg-cat-blue",
    purple: "bg-cat-purple",
    green: "bg-cat-green",
    pink: "bg-cat-pink",
    teal: "bg-cat-teal",
    amber: "bg-signal",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5 mb-2.5">
        <IconBadge tone={tone} icon={icon} size={36} />
        <span className="text-xs text-slate leading-tight">{label}</span>
      </div>
      <p className="font-display font-bold text-xl leading-none">{value}</p>
      {progressPct !== undefined && (
        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-3">
          <div className={`h-full rounded-full ${barTone[tone]}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
        </div>
      )}
    </Card>
  );
}
