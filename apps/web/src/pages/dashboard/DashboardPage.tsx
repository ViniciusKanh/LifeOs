import { useMemo, useState } from "react";
import { BookOpen, Briefcase, CalendarClock, CalendarDays, CheckSquare, GraduationCap, Heart, ListChecks, Repeat, Target } from "lucide-react";
import { RpgLevelSpotlight } from "@/components/dashboard/RpgHeroSpotlight";
import { RpgDashboardHero, RpgKpiStrip, RpgMainQuest, RpgRecentAchievements } from "@/components/dashboard/RpgDashboardSections";
import {
  AttentionPanel,
  DashboardHero,
  DayTimelineCard,
  DimensionScroller,
  KpiStrip,
  NextBestStep,
  type DimensionItem,
  type KpiData,
} from "@/components/dashboard/DashboardSections";
import { Reveal } from "@/components/charts/motion/Reveal";
import { DEFAULT_QUOTE, findNavItem } from "@/components/layout/navConfig";
import { useAuth } from "@/hooks/useAuth";
import { useLifeScore, useLifeScoreHistory } from "@/hooks/useAnalytics";
import { useTasks, useFocusTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useDeadlineRadar } from "@/hooks/useDeadlineRadar";
import { useEvents } from "@/hooks/useEvents";
import { useTheme } from "@/hooks/useTheme";
import { DONE, buildAttentionItems, buildDayEntries, lifeScoreWeekDelta, localIsoDate } from "@/utils/dashboardMetrics";

/* ============================================================
   Dashboard enxuto — só o resumo: Life Score, XP, missão principal,
   agenda do dia e prazos. Saúde, gráficos, sinais e insights detalhados
   ficam nas próprias telas (Hoje, Saúde, Revisões…), o que reduz as
   consultas desta página de ~23 para 5 próprias.
   Tarefas e hábitos já vêm do cache global; nada aqui é estimado.
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
  const { habits, summaryByHabitId } = useHabits();
  const { data: deadlines } = useDeadlineRadar("7d");
  const { items: calendarItems } = useEvents(today, today);
  const { isRpg } = useTheme();
  const [completing, setCompleting] = useState(false);

  const overall = lifeScore?.overall ?? 0;
  const delta = useMemo(() => lifeScoreWeekDelta(history, today), [history, today]);
  const recentHistory = history.slice(-14);

  const tasksToday = tasks.filter((t) => t.due_date?.slice(0, 10) === today);
  const tasksTodayDone = tasksToday.filter((t) => t.status === DONE).length;
  const overdueCount = tasks.filter((t) => t.status !== DONE && t.due_date && t.due_date.slice(0, 10) < today).length;
  const habitsDone = habits.filter((h) => summaryByHabitId.get(h.id)?.checkedInToday).length;
  const agendaToday = calendarItems.filter((c) => c.startsAt.slice(0, 10) === today);
  const ds = deadlines?.summary;

  const attention = useMemo(
    () => buildAttentionItems({ deadlines, habitsPending: habits.length - habitsDone, hour: now.getHours() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deadlines, habits.length, habitsDone]
  );

  const subtitle =
    attention.length === 0
      ? "Aqui está o resumo do seu dia — nada pedindo atenção agora."
      : `Aqui está o resumo do seu dia — ${attention.length} ${attention.length === 1 ? "item merece" : "itens merecem"} atenção.`;

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
      key: "deadlines",
      label: "Prazos (7 dias)",
      value: ds ? `${ds.dueToday + ds.due7d}` : "—",
      caption: ds ? (ds.overdue > 0 ? `${ds.overdue} vencido(s)` : "nenhum vencido") : "carregando",
      icon: <CalendarClock size={20} />,
      tone: "purple",
      to: "/deadline-radar",
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

  const dayEntries = useMemo(() => buildDayEntries(calendarItems, today), [calendarItems, today]);
  const dimensions: DimensionItem[] = DIM_META.map((d) => ({
    ...d,
    value: Math.round((lifeScore as unknown as Record<string, number> | null)?.[d.key] ?? 0),
    explanation: DIM_EXPLAIN[d.key],
  }));
  const firstName = user?.name?.split(" ")[0] ?? "";
  const heroProps = { firstName, subtitle, overall, isLoading: scoreLoading, delta, history: recentHistory.map((h) => h.overall) };
  const attentionPanel = <AttentionPanel items={attention} onWater={() => undefined} />;
  const agenda = <DayTimelineCard entries={dayEntries} nowLabel={nowLabel} />;

  if (isRpg) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <RpgLevelSpotlight dimensions={dimensions} />
        <RpgDashboardHero {...heroProps} quote={findNavItem("/dashboard")?.item.quote ?? DEFAULT_QUOTE} />
        <RpgKpiStrip items={kpis} />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
          <RpgMainQuest task={nextTask} estimateMinutes={nextTaskEstimate} onComplete={completeNext} isCompleting={completing} />
          <RpgRecentAchievements />
        </div>
        <Reveal>{attentionPanel}</Reveal>
        <Reveal>{agenda}</Reveal>
        <Reveal>
          <DimensionScroller items={dimensions} />
        </Reveal>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
      <DashboardHero {...heroProps} />
      <KpiStrip items={kpis} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
        <NextBestStep task={nextTask} estimateMinutes={nextTaskEstimate} onComplete={completeNext} isCompleting={completing} />
        <Reveal>{agenda}</Reveal>
      </div>
      <Reveal>{attentionPanel}</Reveal>
      <Reveal>
        <DimensionScroller items={dimensions} />
      </Reveal>
    </div>
  );
}
