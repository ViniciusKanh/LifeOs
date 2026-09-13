import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Droplet,
  GraduationCap,
  Heart,
  Lightbulb,
  Minus,
  Moon,
  Smile,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useAnalyticsOverview, useInsights, useLifeScore } from "@/hooks/useAnalytics";
import { Card, IconBadge } from "@/components/ui/primitives";

// Metas de referência fixas (documentadas), usadas só como denominador de
// exibição — nunca como um número inventado no lugar de um dado real.
const SLEEP_GOAL_MINUTES = 480; // 8h
const WATER_GOAL_ML = 2500; // 2,5L

const RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const HOUR_LABEL = (h: number) => `${h.toString().padStart(2, "0")}h`;

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[11px] text-slate">—</span>;
  if (pct === 0) return <span className="text-[11px] text-slate">0%</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-growth" : "text-drop"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct)}%
    </span>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  changePct,
  sublabel,
  progressPct,
  barTone,
}: {
  icon: ReactNode;
  tone: "blue" | "purple" | "pink" | "amber" | "green" | "teal";
  label: string;
  value: string;
  changePct: number | null;
  sublabel: string;
  progressPct: number | null;
  barTone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={icon} tone={tone} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-semibold leading-tight">{value}</p>
            <Trend pct={changePct} />
          </div>
          <p className="text-xs text-slate leading-tight mt-0.5">{label}</p>
        </div>
      </div>
      {progressPct !== null && (
        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-3">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
        </div>
      )}
      <p className="text-[11px] text-slate mt-2">{sublabel}</p>
    </Card>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { overview, isLoading } = useAnalyticsOverview(days);
  const { insights } = useInsights(Math.max(days, 30));
  const { lifeScore } = useLifeScore();

  const chartData = (overview?.tasksCompletedByDay ?? []).map((d) => ({
    day: d.day.slice(5),
    total: Number(d.total),
  }));

  const radarData = lifeScore
    ? [
        { dim: "Produtividade", value: lifeScore.productivity },
        { dim: "Profissional", value: lifeScore.professional },
        { dim: "Saúde", value: lifeScore.health },
        { dim: "Educação", value: lifeScore.education },
        { dim: "Leitura", value: lifeScore.reading },
        { dim: "Hábitos", value: lifeScore.habits },
        { dim: "Metas", value: lifeScore.goals },
      ]
    : [];

  // "Insights do período" — cada frase só aparece quando há uma variação
  // real para descrever; nunca um texto genérico fixo.
  const periodInsights = useMemo(() => {
    if (!overview) return [];
    const list: Array<{ icon: ReactNode; text: string }> = [];
    const c = overview.changePct;
    if (c.tasksCompleted !== null && c.tasksCompleted !== 0) {
      list.push({
        icon: <Trophy size={14} />,
        text: `Você concluiu ${Math.abs(c.tasksCompleted)}% ${c.tasksCompleted > 0 ? "mais" : "menos"} tarefas do que no período anterior.`,
      });
    }
    if (c.avgSleepMinutes !== null && c.avgSleepMinutes !== 0) {
      list.push({
        icon: <Moon size={14} />,
        text: `Seu sono médio ${c.avgSleepMinutes > 0 ? "melhorou" : "caiu"} ${Math.abs(c.avgSleepMinutes)}% em relação ao período anterior.`,
      });
    }
    if (overview.habitsCompletionPct > 0) {
      list.push({ icon: <Target size={14} />, text: `Você manteve consistência em ${overview.habitsCompletionPct}% dos seus hábitos.` });
    }
    if (c.focusMinutes !== null && c.focusMinutes !== 0) {
      list.push({
        icon: <Clock3 size={14} />,
        text: `Seus minutos de foco ${c.focusMinutes > 0 ? "cresceram" : "caíram"} ${Math.abs(c.focusMinutes)}% frente ao período anterior.`,
      });
    }
    return list;
  }, [overview]);

  // "Dica personalizada" — construída só a partir de sinais reais já
  // calculados; nunca uma frase motivacional solta sem dado por trás.
  const personalTip = useMemo(() => {
    if (!overview || !insights) return null;
    const c = overview.changePct;
    if (insights.bestFocusHour) {
      return `Suas sessões de foco rendem mais por volta das ${HOUR_LABEL(insights.bestFocusHour.hour)}. Tente reservar esse horário para as tarefas mais importantes.`;
    }
    if (c.tasksCompleted !== null && c.tasksCompleted >= 15) {
      return `Sua produtividade está ${c.tasksCompleted}% acima do período anterior. Mantenha o ritmo atual — está funcionando.`;
    }
    if (c.avgSleepMinutes !== null && c.avgSleepMinutes < -5) {
      return `Seu sono médio caiu ${Math.abs(c.avgSleepMinutes)}% frente ao período anterior. Dormir melhor tende a refletir no seu foco no dia seguinte.`;
    }
    if (insights.bestWeekday) {
      return `${insights.bestWeekday.label} costuma ser seu dia mais produtivo. Aproveite para planejar as tarefas mais importantes nesse dia.`;
    }
    return null;
  }, [overview, insights]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <p className="font-display font-semibold text-2xl">Analytics</p>
          <p className="text-sm text-slate mt-1">Acompanhe seu progresso e veja como pequenas ações geram grandes resultados.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-paper-border dark:border-ink-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                days === r.days ? "bg-brand-500 text-white" : "text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !overview ? (
        <p className="text-sm text-slate">Carregando métricas...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<CheckCircle2 size={18} />}
              tone="blue"
              label="Tarefas concluídas"
              value={String(overview.tasksCompleted)}
              changePct={overview.changePct.tasksCompleted}
              sublabel={overview.tasksPlanned > 0 ? `de ${overview.tasksPlanned} planejadas` : "Nenhuma tarefa planejada no período"}
              progressPct={overview.tasksPlanned > 0 ? (overview.tasksCompleted / overview.tasksPlanned) * 100 : null}
              barTone="bg-cat-blue"
            />
            <MetricCard
              icon={<Target size={18} />}
              tone="purple"
              label="Minutos de foco"
              value={`${overview.focusMinutes}min`}
              changePct={overview.changePct.focusMinutes}
              sublabel={`Média de ${Math.round(overview.focusMinutes / days)}min/dia`}
              progressPct={null}
              barTone="bg-cat-purple"
            />
            <MetricCard
              icon={<BookOpen size={18} />}
              tone="pink"
              label="Páginas lidas"
              value={String(overview.pagesRead)}
              changePct={overview.changePct.pagesRead}
              sublabel={`Média de ${(overview.pagesRead / days).toFixed(1)} páginas/dia`}
              progressPct={null}
              barTone="bg-cat-pink"
            />
            <MetricCard
              icon={<Dumbbell size={18} />}
              tone="amber"
              label="Exercícios"
              value={String(overview.workouts)}
              changePct={overview.changePct.workouts}
              sublabel={`Média de ${(overview.workouts / (days / 7)).toFixed(1)} por semana`}
              progressPct={null}
              barTone="bg-signal"
            />
            <MetricCard
              icon={<GraduationCap size={18} />}
              tone="blue"
              label="Minutos de estudo"
              value={`${overview.studyMinutes}min`}
              changePct={overview.changePct.studyMinutes}
              sublabel={`Média de ${Math.round(overview.studyMinutes / days)}min/dia`}
              progressPct={null}
              barTone="bg-cat-blue"
            />
            <MetricCard
              icon={<Heart size={18} />}
              tone="pink"
              label="Hábitos cumpridos"
              value={`${overview.habitsCompletionPct}%`}
              changePct={overview.changePct.habitsCompletionPct}
              sublabel={`Média de ${(overview.habitsDoneCount / days).toFixed(1)} hábitos/dia`}
              progressPct={overview.habitsCompletionPct}
              barTone="bg-cat-pink"
            />
            <MetricCard
              icon={<Moon size={18} />}
              tone="purple"
              label="Sono médio"
              value={overview.avgSleepMinutes > 0 ? formatMinutes(overview.avgSleepMinutes) : "—"}
              changePct={overview.changePct.avgSleepMinutes}
              sublabel={`Meta: ${formatMinutes(SLEEP_GOAL_MINUTES)}`}
              progressPct={overview.avgSleepMinutes > 0 ? (overview.avgSleepMinutes / SLEEP_GOAL_MINUTES) * 100 : null}
              barTone="bg-cat-purple"
            />
            <MetricCard
              icon={<Droplet size={18} />}
              tone="teal"
              label="Água média/dia"
              value={overview.avgWaterMl > 0 ? `${(overview.avgWaterMl / 1000).toFixed(1)}L` : "—"}
              changePct={overview.changePct.avgWaterMl}
              sublabel={`Meta: ${(WATER_GOAL_ML / 1000).toFixed(1)}L`}
              progressPct={overview.avgWaterMl > 0 ? (overview.avgWaterMl / WATER_GOAL_ML) * 100 : null}
              barTone="bg-cat-teal"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">Tarefas concluídas por dia</p>
                <span className="text-[11px] text-slate">Últimos {days} dias</span>
              </div>
              <p className="text-xs text-slate mb-4">Veja sua consistência ao longo do tempo.</p>
              {chartData.length === 0 ? (
                <p className="text-sm text-slate">Sem tarefas concluídas nesse período ainda.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
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
              <p className="text-sm font-semibold mb-4">Equilíbrio da rotina (Life Score)</p>
              {!lifeScore || radarData.every((d) => d.value === 0) ? (
                <p className="text-sm text-slate">Registre atividades nos módulos para ver seu equilíbrio aqui.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="currentColor" className="text-paper-border dark:text-ink-border" />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar dataKey="value" stroke="#5B6EF5" fill="#5B6EF5" fillOpacity={0.35} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 md:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Trophy size={15} className="text-signal-deep" />
                <p className="text-sm font-semibold">Insights do período</p>
              </div>
              <p className="text-xs text-slate mb-4">Baseado nos seus dados dos últimos {days} dias.</p>
              {periodInsights.length === 0 ? (
                <p className="text-xs text-slate">Registre mais atividades para revelar padrões aqui.</p>
              ) : (
                <div className="space-y-2.5">
                  {periodInsights.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="text-signal-deep mt-0.5 shrink-0">{item.icon}</span>
                      <p className="text-ink dark:text-paper leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 md:p-6 bg-brand-50 dark:bg-brand-700/10 border-brand-100 dark:border-brand-700/30">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb size={15} className="text-brand-600 dark:text-brand-500" />
                <p className="text-sm font-semibold">Dica personalizada</p>
              </div>
              <p className="text-xs text-slate mb-4">Com base no seu progresso.</p>
              {personalTip ? (
                <blockquote className="text-sm italic text-ink dark:text-paper leading-relaxed">
                  "{personalTip}"
                  <footer className="text-xs not-italic text-slate mt-2">— LifeOS</footer>
                </blockquote>
              ) : (
                <p className="text-xs text-slate">Continue registrando suas atividades para receber uma dica personalizada.</p>
              )}
            </Card>
          </div>

          <Card className="p-5 md:p-6">
            <p className="text-sm font-semibold mb-1">Correlações</p>
            <p className="text-xs text-slate mb-4">
              Calculadas a partir dos seus próprios registros — nunca um diagnóstico, apenas um padrão pessoal.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InsightTile
                icon={<Moon size={15} />}
                title="Sono → produtividade do dia seguinte"
                body={
                  insights?.sleepVsNextDayProductivity.r === null || !insights
                    ? `Ainda sem dados suficientes (mínimo 5 noites com sono e tarefas registradas no mesmo período).`
                    : correlationText(insights.sleepVsNextDayProductivity.r, "noites de sono bem registradas", "mais tarefas concluídas no dia seguinte")
                }
                r={insights?.sleepVsNextDayProductivity.r ?? null}
              />
              <InsightTile
                icon={<Smile size={15} />}
                title="Humor → minutos de foco"
                body={
                  insights?.moodVsFocusMinutes.r === null || !insights
                    ? `Ainda sem dados suficientes (mínimo 5 dias com humor e foco registrados no mesmo dia).`
                    : correlationText(insights.moodVsFocusMinutes.r, "dias com humor mais alto", "mais minutos de foco")
                }
                r={insights?.moodVsFocusMinutes.r ?? null}
              />
              <InsightTile
                icon={<CalendarDays size={15} />}
                title="Melhor dia da semana"
                body={
                  insights?.bestWeekday
                    ? `${insights.bestWeekday.label} é seu dia mais produtivo, com média de ${insights.bestWeekday.avgCompleted} tarefa(s) concluída(s).`
                    : "Conclua tarefas em mais dias diferentes para revelar seu melhor dia da semana."
                }
              />
              <InsightTile
                icon={<Clock3 size={15} />}
                title="Melhor horário de foco"
                body={
                  insights?.bestFocusHour
                    ? `Suas sessões de foco rendem mais por volta das ${HOUR_LABEL(insights.bestFocusHour.hour)}, com ${insights.bestFocusHour.totalMinutes} minutos acumulados no período.`
                    : "Use o Focus Mode para descobrir seu horário de maior produtividade."
                }
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function correlationText(r: number, xLabel: string, yLabel: string) {
  const abs = Math.abs(r);
  const strength = abs >= 0.6 ? "forte" : abs >= 0.3 ? "moderada" : "fraca";
  const direction = r >= 0 ? "mais" : "menos";
  return `Correlação ${strength} (r = ${r.toFixed(2)}): ${xLabel} tendem a vir acompanhadas de ${direction} ${yLabel}.`;
}

function InsightTile({ icon, title, body, r }: { icon: ReactNode; title: string; body: string; r?: number | null }) {
  const trendIcon =
    r === undefined || r === null ? <Minus size={13} className="text-slate" /> : r >= 0 ? (
      <TrendingUp size={13} className="text-growth" />
    ) : (
      <TrendingDown size={13} className="text-drop" />
    );

  return (
    <div className="rounded-xl p-3.5 border border-paper-border dark:border-ink-border">
      <div className="flex items-center gap-2 mb-1.5 text-slate">
        {icon}
        <p className="text-xs font-semibold text-ink dark:text-paper">{title}</p>
        <span className="ml-auto">{trendIcon}</span>
      </div>
      <p className="text-xs text-slate leading-relaxed">{body}</p>
    </div>
  );
}
