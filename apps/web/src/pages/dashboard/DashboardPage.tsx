import { RpgActiveContracts, RpgLevelSpotlight, RpgXpSources } from "@/components/dashboard/RpgHeroSpotlight";
import { useMemo, useState } from "react";
import { useAppScrollRef } from "@/components/layout/AppScrollContext";
import { motion, useScroll, useSpring } from "motion/react";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Droplets,
  FolderKanban,
  GraduationCap,
  Heart,
  LayoutGrid,
  ListChecks,
  Repeat,
  Target,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLifeScore, useLifeScoreHistory, useAnalyticsOverview, useInsights, useTimeline } from "@/hooks/useAnalytics";
import { useTasks, useFocusTasks } from "@/hooks/useTasks";
import { useProjectWorkload } from "@/hooks/useProjects";
import { Link } from "react-router-dom";
import { RpgJourneyRhythm, RpgMissionWaffle, RpgXpHistory } from "@/components/dashboard/RpgProgressionSection";
import { RPGPanel } from "@/components/rpg";
import { ProjectLoadBoard } from "@/components/projects/ProjectLoadBoard";
import { useHabits } from "@/hooks/useHabits";
import { useHealth, useHealthSummary } from "@/hooks/useHealth";
import { useBooks } from "@/hooks/useBooks";
import { useSignals } from "@/hooks/useSignals";
import { useDeadlineRadar } from "@/hooks/useDeadlineRadar";
import { useGoalForecast } from "@/hooks/useGoalForecast";
import { useEvents } from "@/hooks/useEvents";
import { useDailyInsight } from "@/hooks/useCopilot";
import { useTheme } from "@/hooks/useTheme";
import { RpgCopilotPanel, RpgDashboardHero, RpgDayAttributes, RpgKpiStrip, RpgMainQuest, RpgRecentAchievements } from "@/components/dashboard/RpgDashboardSections";
import { DEFAULT_QUOTE, findNavItem } from "@/components/layout/navConfig";
import { WATER_GOAL_ML } from "@/components/health/healthUtils";
import { Card } from "@/components/ui/primitives";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { WaffleChart } from "@/components/charts/motion/WaffleChart";
import { Reveal } from "@/components/charts/motion/Reveal";
import {
  AttentionPanel,
  ContinueReading,
  CopilotBanner,
  DashboardHero,
  DayTimelineCard,
  DimensionScroller,
  GoalsCard,
  InsightCard,
  KpiStrip,
  NextBestStep,
  SectionTitle,
  SignalsNow,
  type DimensionItem,
  type KpiData,
} from "@/components/dashboard/DashboardSections";
import {
  DONE,
  buildAttentionItems,
  buildDayEntries,
  lifeScoreWeekDelta,
  localIsoDate,
  dayLabel,
  taskComposition,
} from "@/utils/dashboardMetrics";

/* ============================================================
   Dashboard v2 — "centro de comando" do dia.
   Topo: saudação + Life Score com evolução real; KPIs clicáveis.
   Meio: próximo melhor passo, sinais, alertas e o dia em linha do tempo.
   Rolagem: seções surgem ao entrar na tela (motion whileInView) e uma
   barra de progresso de rolagem acompanha a leitura; dimensões do Life
   Score num scroller horizontal; visuais de carga (treemap), composição
   (waffle) e ritmo (linhas animadas).
   Todos os números vêm dos módulos originais — nada é estimado.
   ============================================================ */

const DIM_META: Array<{ key: keyof typeof DIM_EXPLAIN; label: string; color: string; icon: JSX.Element; to: string }> = [
  { key: "productivity", label: "Produtividade", color: "#2F80FF", icon: <CheckSquare size={14} />, to: "/tarefas" },
  { key: "health", label: "Saúde", color: "#12B76A", icon: <Heart size={14} />, to: "/saude" },
  { key: "habits", label: "Hábitos", color: "#08B6A6", icon: <Repeat size={14} />, to: "/habitos" },
  { key: "goals", label: "Metas", color: "#FF7A45", icon: <Target size={14} />, to: "/metas" },
  { key: "reading", label: "Leitura", color: "#FF3D93", icon: <BookOpen size={14} />, to: "/biblioteca" },
  { key: "education", label: "Educação", color: "#9550FF", icon: <GraduationCap size={14} />, to: "/educacao" },
  { key: "professional", label: "Profissional", color: "#7C4DFF", icon: <Briefcase size={14} />, to: "/profissional" },
];

const DIM_EXPLAIN = {
  productivity: "% das suas tarefas concluídas.",
  health: "Água, sono e exercício de hoje.",
  habits: "% dos hábitos cumpridos hoje.",
  goals: "Equilíbrio entre metas semanais, mensais e anuais.",
  reading: "Meta diária de páginas ou progresso dos livros em leitura.",
  education: "Progresso médio das suas formações.",
  professional: "Tarefas concluídas em projetos profissionais.",
};

export function DashboardPage() {
  const today = localIsoDate();
  const now = new Date();
  const nowLabel = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const { user } = useAuth();
  const { lifeScore, isLoading: scoreLoading } = useLifeScore();
  const { history } = useLifeScoreHistory(30, !!lifeScore);
  const { tasks, moveTask } = useTasks();
  const { focusTasks } = useFocusTasks(1);
  const { workload, isLoading: workloadLoading } = useProjectWorkload({ days: 30 });
  const { habits, summaryByHabitId } = useHabits();
  const { summary: health } = useHealthSummary();
  const { addWater } = useHealth();
  const { books } = useBooks({ status: "Lendo" });
  const { overview } = useAnalyticsOverview(14);
  const { insights } = useInsights(30);
  const { data: signals, isLoading: signalsLoading } = useSignals("today");
  const { data: deadlines } = useDeadlineRadar("7d");
  const { data: goalForecast } = useGoalForecast("all");
  const { items: calendarItems } = useEvents(today, today);
  const { events } = useTimeline({ from: today, to: today });
  const copilot = useDailyInsight();
  const { isRpg } = useTheme();
  const [completing, setCompleting] = useState(false);

  // Barra de progresso da rolagem (fica logo abaixo do cabeçalho fixo).
  const scrollRef = useAppScrollRef();
  const { scrollYProgress } = useScroll(scrollRef ? { container: scrollRef } : undefined);
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  const overall = lifeScore?.overall ?? 0;
  const delta = useMemo(() => lifeScoreWeekDelta(history, today), [history, today]);

  const tasksToday = tasks.filter((t) => t.due_date?.slice(0, 10) === today);
  const tasksTodayDone = tasksToday.filter((t) => t.status === DONE).length;
  const overdueCount = tasks.filter((t) => t.status !== DONE && t.due_date && t.due_date.slice(0, 10) < today).length;
  const habitsDone = habits.filter((h) => summaryByHabitId.get(h.id)?.checkedInToday).length;
  const waterMl = health?.waterMl ?? 0;
  const energy = health?.mood?.energy ?? null;
  const agendaToday = calendarItems.filter((c) => c.startsAt.slice(0, 10) === today);

  const attention = useMemo(
    () =>
      buildAttentionItems({
        deadlines,
        goals: goalForecast,
        waterMl,
        waterGoalMl: WATER_GOAL_ML,
        habitsPending: habits.length - habitsDone,
        hour: now.getHours(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deadlines, goalForecast, waterMl, habits.length, habitsDone]
  );

  const subtitle = useMemo(() => {
    const dayLabel = signals?.dayClassification?.label;
    const base = dayLabel ? `Seu dia está ${dayLabel.toLowerCase()}` : "Aqui está o retrato real da sua rotina";
    if (attention.length === 0) return `${base} — nada pedindo atenção agora.`;
    return `${base}, mas ${attention.length} ${attention.length === 1 ? "item merece" : "itens merecem"} atenção.`;
  }, [signals, attention.length]);

  const kpis: KpiData[] = [
    {
      key: "priorities",
      label: "Prioridades de hoje",
      value: `${tasksTodayDone} / ${tasksToday.length}`,
      caption: overdueCount > 0 ? `${overdueCount} atrasada(s)` : "nenhuma atrasada",
      icon: <ListChecks size={20} />,
      tone: "amber",
      to: "/tarefas",
    },
    {
      key: "water",
      label: "Água",
      value: `${(waterMl / 1000).toFixed(1)} L`,
      caption: `de ${(WATER_GOAL_ML / 1000).toFixed(1)} L`,
      icon: <Droplets size={20} />,
      tone: "blue",
      to: "/saude",
      pct: Math.round((waterMl / WATER_GOAL_ML) * 100),
    },
    {
      key: "habits",
      label: "Hábitos",
      value: `${habitsDone} / ${habits.length}`,
      caption: habits.length > 0 ? `${Math.round((habitsDone / habits.length) * 100)}% concluídos` : "nenhum hábito ativo",
      icon: <Repeat size={20} />,
      tone: "green",
      to: "/habitos",
      pct: habits.length > 0 ? Math.round((habitsDone / habits.length) * 100) : undefined,
    },
    {
      key: "energy",
      label: "Energia",
      value: energy !== null ? `${energy} / 5` : "—",
      caption: energy !== null ? (energy >= 4 ? "nível bom hoje" : energy >= 3 ? "nível médio" : "nível baixo") : "registre em Saúde",
      icon: <Zap size={20} />,
      tone: "purple",
      to: "/saude",
    },
    {
      key: "agenda",
      label: "Agenda",
      value: `${agendaToday.length} ${agendaToday.length === 1 ? "evento" : "eventos"}`,
      caption: "no seu dia de hoje",
      icon: <CalendarDays size={20} />,
      tone: "pink",
      to: "/calendario",
    },
  ];

  const nextTask = focusTasks[0] ?? null;
  const nextTaskEstimate = nextTask ? tasks.find((t) => t.id === nextTask.id)?.estimate_minutes ?? null : null;
  const completeNext = async () => {
    if (!nextTask) return;
    setCompleting(true);
    try {
      await moveTask({ id: nextTask.id, status: DONE });
    } finally {
      setCompleting(false);
    }
  };

  const dayEntries = useMemo(() => buildDayEntries(calendarItems, events, today), [calendarItems, events, today]);

  // Insight com base declarada — melhor dia da semana ou relação sono × produtividade.
  const insight = useMemo(() => {
    if (!insights) return { text: null, basis: null };
    const r = insights.sleepVsNextDayProductivity;
    if (r.r !== null && Math.abs(r.r) >= 0.3 && r.pairs >= 7) {
      return {
        text: r.r > 0 ? "Nas noites em que você dorme mais, o dia seguinte tende a render mais tarefas." : "Dormir mais não tem se refletido em mais tarefas no dia seguinte.",
        basis: `Correlação observada (r = ${r.r.toFixed(2)}) em ${r.pairs} pares de dias — associação, não causa.`,
      };
    }
    if (insights.bestWeekday && insights.bestWeekday.avgCompleted > 0) {
      return {
        text: `Seu dia mais produtivo tem sido ${insights.bestWeekday.label.toLowerCase()}, com média de ${insights.bestWeekday.avgCompleted.toFixed(1)} tarefas concluídas.`,
        basis: "Baseado nos seus últimos 30 dias de registros.",
      };
    }
    return { text: null, basis: null };
  }, [insights]);

  const activeGoals = useMemo(
    () =>
      (goalForecast?.goals ?? [])
        .filter((g) => g.status !== "completed" && g.progressPct !== null)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
        .slice(0, 3),
    [goalForecast]
  );

  const dimensions: DimensionItem[] = DIM_META.map((d) => ({
    ...d,
    value: Math.round((lifeScore as unknown as Record<string, number> | null)?.[d.key] ?? 0),
    explanation: DIM_EXPLAIN[d.key],
  }));

  // Evolução semanal: snapshots reais do Life Score quando houver 2+; senão, ritmo de tarefas.
  const recentHistory = history.slice(-14);
  const hasScoreHistory = recentHistory.length >= 2;
  const weekStats = [
    { label: "Life Score", value: `${overall}`, sub: delta ? `${delta.delta >= 0 ? "+" : ""}${delta.delta} pts` : "hoje" },
    { label: "Tarefas", value: `${overview?.tasksCompleted ?? 0}`, sub: "concluídas (14d)" },
    { label: "Hábitos", value: `${overview?.habitsCompletionPct ?? 0}%`, sub: "da meta (14d)" },
    { label: "Leitura", value: `${overview?.pagesRead ?? 0}`, sub: "páginas (14d)" },
  ];

  const series = overview?.dailySeries;
  const rhythmLabels = (series?.tasks ?? []).map((p) => dayLabel(p.day, { weekday: true }));
  const rhythmSeries = useMemo(
    () =>
      series
        ? [
            { key: "tasks", label: "Tarefas concluídas", color: "#7C4DFF", values: series.tasks.map((p) => Number(p.total)) },
            { key: "habits", label: "Hábitos cumpridos", color: "#12B76A", values: series.habits.map((p) => Number(p.total)) },
            { key: "workouts", label: "Exercícios", color: "#FF7A45", values: series.workouts.map((p) => Number(p.total)) },
          ]
        : [],
    [series]
  );
  const [hiddenRhythm, setHiddenRhythm] = useState<Set<string>>(new Set());
  const composition = useMemo(() => taskComposition(tasks, today), [tasks, today]);

  // Blocos compartilhados entre o layout clássico e o RPG (mesmo conteúdo, ordem diferente).
  const weekCard = (
    <Card className="p-5 h-full">
      <SectionTitle icon={<BarChart3 size={17} />} title="Esta semana" action={{ label: "Ver mais", to: "/analytics" }} />
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {weekStats.map((s) => (
          <div key={s.label} className="rounded-xl bg-paper dark:bg-ink px-2 py-2 min-w-0">
            <p className="text-[10px] text-slate truncate">{s.label}</p>
            <p className="text-sm font-bold truncate">{s.value}</p>
            <p className="text-[9px] text-slate truncate">{s.sub}</p>
          </div>
        ))}
      </div>
      {hasScoreHistory ? (
        <AnimatedLineChart
          ariaLabel="Evolução do Life Score"
          labels={recentHistory.map((h) => dayLabel(h.date))}
          series={[{ key: "overall", label: "Life Score", color: "#7C4DFF", values: recentHistory.map((h) => h.overall) }]}
          yMax={100}
          height={150}
        />
      ) : (
        <>
          <AnimatedLineChart
            ariaLabel="Tarefas concluídas por dia"
            labels={rhythmLabels}
            series={[{ key: "tasks", label: "Tarefas concluídas", color: "#7C4DFF", values: (series?.tasks ?? []).map((p) => Number(p.total)) }]}
            height={150}
          />
          <p className="text-[10px] text-slate mt-1">Tarefas concluídas por dia. A evolução do Life Score aparece após alguns dias de uso.</p>
        </>
      )}
    </Card>
  );
  const workloadCard = (
    <Card className="p-5 h-full">
      <SectionTitle icon={<FolderKanban size={17} />} title="Carga por projeto" action={{ label: "Projetos", to: "/projetos" }} />
      <ProjectLoadBoard workload={workload} isLoading={workloadLoading} limit={4} showTotals={false} />
    </Card>
  );
  const compositionCard = (
    <Card className="p-5 h-full">
      <SectionTitle icon={<LayoutGrid size={17} />} title="Suas tarefas em 100 quadrados" action={{ label: "Tarefas", to: "/tarefas" }} />
      {composition.total === 0 ? (
        <p className="text-sm text-slate py-10 text-center">Nenhuma tarefa criada ou concluída nos últimos 30 dias.</p>
      ) : (
        <>
          <WaffleChart
            caption={`${composition.total} tarefas criadas ou concluídas nos últimos 30 dias. Cada quadrado ≈ 1%.`}
            categories={[
              { key: "done", label: "Concluídas", value: composition.done, color: "#12B76A" },
              { key: "doing", label: "Em andamento / revisão", value: composition.doing, color: "#2F80FF" },
              { key: "pending", label: "A fazer / backlog", value: composition.pending, color: "#9550FF" },
              { key: "overdue", label: "Atrasadas", value: composition.overdue, color: "#FF4757" },
            ]}
          />
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Criadas (30d)", value: String(composition.created) },
              { label: "Concluídas (30d)", value: String(composition.completedInPeriod) },
              {
                label: "Tempo típico até concluir",
                value: composition.medianLeadDays === null ? "—" : composition.medianLeadDays < 1 ? "< 1 dia" : `${String(composition.medianLeadDays).replace(".", ",")} dias`,
              },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-paper dark:bg-ink px-3 py-2">
                <dt className="text-[10px] text-slate leading-tight">{m.label}</dt>
                <dd className="font-display font-bold text-base leading-tight mt-0.5">{m.value}</dd>
              </div>
            ))}
          </dl>
          {composition.created > 0 && (
            <p className="text-[11px] text-slate mt-2">
              {composition.completedInPeriod >= composition.created
                ? "Você concluiu tanto quanto criou no período — o backlog não está crescendo."
                : `Entraram ${composition.created - composition.completedInPeriod} tarefa(s) a mais do que saíram no período.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
  const rhythmCard = (
    <Card className="p-5">
      <SectionTitle icon={<BarChart3 size={17} />} title="Ritmo dos últimos 14 dias" action={{ label: "Analytics", to: "/analytics" }} />
      {!series || series.tasks.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">Sem registros no período ainda.</p>
      ) : (
        <>
          {/* Totais do período por série — clique para mostrar/ocultar a linha */}
          <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Séries do gráfico">
            {rhythmSeries.map((s) => {
              const total = s.values.reduce((a, b) => a + b, 0);
              const activeDays = s.values.filter((v) => v > 0).length;
              const hidden = hiddenRhythm.has(s.key);
              return (
                <button
                  key={s.key}
                  aria-pressed={!hidden}
                  onClick={() =>
                    setHiddenRhythm((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.key)) next.delete(s.key);
                      else if (next.size < rhythmSeries.length - 1) next.add(s.key);
                      return next;
                    })
                  }
                  className={`text-left rounded-xl border px-3 py-2 transition-all ${hidden ? "opacity-45 border-paper-border dark:border-ink-border" : "border-paper-border dark:border-ink-border bg-paper/60 dark:bg-ink/60"}`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] text-slate">
                    <span className="w-2.5 h-[3px] rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                  </span>
                  <span className="block font-display font-bold text-base leading-tight">
                    {total} <span className="text-[11px] font-normal text-slate">· {activeDays} de {s.values.length} dias</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="pb-6">
            <AnimatedLineChart
              ariaLabel="Tarefas, hábitos e exercícios por dia"
              labels={rhythmLabels}
              height={220}
              series={rhythmSeries.filter((s) => !hiddenRhythm.has(s.key))}
            />
          </div>
        </>
      )}
    </Card>
  );

  const progressBar = (
    <motion.div aria-hidden style={{ scaleX: progress }} className="fixed left-0 right-0 top-16 z-20 h-[3px] origin-left bg-gradient-to-r from-brand-500 via-cat-purple to-signal rpg:from-rpg-bronze rpg:via-rpg-gold rpg:to-rpg-gold-light" />
  );
  const copilotProps = {
    text: copilot.text,
    isLoading: copilot.isLoading,
    error: copilot.error,
    onRegenerate: () => void copilot.regenerate(),
    isRegenerating: copilot.isRegenerating,
  };

  // Tema RPG: mesmos dados e componentes, organizados como o HUD da referência
  // (herói → indicadores → missão + atributos → semana, conquistas e Copilot).
  if (isRpg) {
    return (
      <>
        {progressBar}
        <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
          {/* Tela principal: o nível do personagem vem primeiro. */}
          <RpgLevelSpotlight dimensions={dimensions} />
          <RpgDashboardHero
            firstName={user?.name?.split(" ")[0] ?? ""}
            subtitle={subtitle}
            quote={findNavItem("/dashboard")?.item.quote ?? DEFAULT_QUOTE}
            overall={overall}
            isLoading={scoreLoading}
            delta={delta}
            history={recentHistory.map((h) => h.overall)}
          />
          <RpgKpiStrip items={kpis} />
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
            <RpgMainQuest task={nextTask} estimateMinutes={nextTaskEstimate} onComplete={completeNext} isCompleting={completing} />
            <RpgDayAttributes health={health} pagesRead14d={overview?.pagesRead ?? null} agendaCount={agendaToday.length} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
            <Reveal>{weekCard}</Reveal>
            <Reveal delay={0.05}>
              <RpgRecentAchievements />
            </Reveal>
            <Reveal delay={0.1} className="lg:col-span-2 2xl:col-span-1">
              <RpgCopilotPanel {...copilotProps} />
            </Reveal>
          </div>
          <Reveal>
            <AttentionPanel items={attention} onWater={() => void addWater(250)} />
          </Reveal>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SignalsNow signals={signals?.signals ?? []} isLoading={signalsLoading} />
            <Reveal>
              <DayTimelineCard entries={dayEntries} nowLabel={nowLabel} />
            </Reveal>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Reveal>
              <InsightCard text={insight.text} basis={insight.basis} />
            </Reveal>
            <Reveal delay={0.05}>
              <GoalsCard goals={activeGoals} />
            </Reveal>
          </div>
          <Reveal>
            <DimensionScroller items={dimensions} />
          </Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Reveal>
              <RpgActiveContracts />
            </Reveal>
            <Reveal delay={0.05}>
              <RpgXpSources />
            </Reveal>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Reveal>
              <RpgXpHistory />
            </Reveal>
            <Reveal delay={0.06}>
              <RpgMissionWaffle tasks={tasks} today={today} />
            </Reveal>
          </div>
          <Reveal>
            <RPGPanel
              title="Carga das campanhas"
              icon={<FolderKanban size={16} />}
              actions={<Link to="/projetos" className="text-xs text-rpg-gold-light hover:underline">Campanhas</Link>}
            >
              <p className="-mt-1 mb-3 text-xs text-rpg-muted">Carga por projeto</p>
              <ProjectLoadBoard workload={workload} isLoading={workloadLoading} limit={6} showTotals={false} />
            </RPGPanel>
          </Reveal>
          <Reveal>
            <RpgJourneyRhythm series={series} />
          </Reveal>
          <Reveal>
            <ContinueReading book={books[0] ?? null} />
          </Reveal>
        </div>
      </>
    );
  }

  return (
    <>
      {progressBar}

      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <DashboardHero
          firstName={user?.name?.split(" ")[0] ?? ""}
          subtitle={subtitle}
          overall={overall}
          isLoading={scoreLoading}
          delta={delta}
          history={recentHistory.map((h) => h.overall)}
        />

        <KpiStrip items={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
          <NextBestStep task={nextTask} estimateMinutes={nextTaskEstimate} onComplete={completeNext} isCompleting={completing} />
          <SignalsNow signals={signals?.signals ?? []} isLoading={signalsLoading} />
        </div>

        <Reveal>
          <AttentionPanel items={attention} onWater={() => void addWater(250)} />
        </Reveal>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Reveal>
            <DayTimelineCard entries={dayEntries} nowLabel={nowLabel} />
          </Reveal>
          <div className="space-y-4">
            <Reveal delay={0.05}>
              <InsightCard text={insight.text} basis={insight.basis} />
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
              <Reveal delay={0.1}>{weekCard}</Reveal>
              <Reveal delay={0.15}>
                <GoalsCard goals={activeGoals} />
              </Reveal>
            </div>
          </div>
        </div>

        <Reveal>
          <DimensionScroller items={dimensions} />
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Reveal>{workloadCard}</Reveal>
          <Reveal delay={0.08}>{compositionCard}</Reveal>
        </div>

        <Reveal>{rhythmCard}</Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
          <Reveal>
            <CopilotBanner {...copilotProps} />
          </Reveal>
          <Reveal delay={0.08}>
            <ContinueReading book={books[0] ?? null} />
          </Reveal>
        </div>
      </div>
    </>
  );
}
