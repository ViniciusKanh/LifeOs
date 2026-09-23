import { useMemo, useState, type ReactNode } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
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
  Wand2,
} from "lucide-react";
import { useAnalyticsOverview, useInsights, useLifeScore } from "@/hooks/useAnalytics";
import { useAnalyticsInsight } from "@/hooks/useCopilot";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { DailySeriesPoint } from "@/types";

// Metas de referência fixas (documentadas), usadas só como denominador de
// exibição — nunca como um número inventado no lugar de um dado real.
const SLEEP_GOAL_MINUTES = 480; // 8h
const WATER_GOAL_ML = 2500; // 2,5L
const READING_GOAL_MONTHLY_PAGES = 150; // páginas/mês — meta de referência do LifeOS, escalada ao período selecionado

const RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const HOUR_LABEL = (h: number) => `${h.toString().padStart(2, "0")}h`;
const WEEKDAY_SHORT: Record<string, string> = { Domingo: "Dom", Segunda: "Seg", Terça: "Ter", Quarta: "Qua", Quinta: "Qui", Sexta: "Sex", Sábado: "Sáb" };

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

/** Mini gráfico de linha (sparkline) — mostra a série diária real por trás de cada cartão de métrica. */
function Sparkline({ data, colorVar }: { data: DailySeriesPoint[]; colorVar: string }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) return null;
  return (
    <div className="w-16 h-9 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="total" stroke={colorVar} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
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
  sparkData,
  sparkColor,
}: {
  icon: ReactNode;
  tone: "blue" | "purple" | "pink" | "amber" | "green" | "teal";
  label: string;
  value: string;
  changePct: number | null;
  sublabel: string;
  progressPct: number | null;
  barTone: string;
  sparkData: DailySeriesPoint[];
  sparkColor: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <IconBadge icon={icon} tone={tone} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-semibold leading-tight">{value}</p>
              <Trend pct={changePct} />
            </div>
            <p className="text-xs text-slate leading-tight mt-0.5">{label}</p>
          </div>
        </div>
        <Sparkline data={sparkData} colorVar={sparkColor} />
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
  const analyticsInsight = useAnalyticsInsight();

  const chartData = (overview?.tasksCompletedByDay ?? []).map((d) => ({
    day: d.day.slice(5),
    total: Number(d.total),
  }));

  const productivityEvolution = useMemo(() => {
    if (!overview) return [];
    const { tasks } = overview.dailySeries;
    return tasks.map((d) => ({
      day: d.day,
      "Tarefas concluídas": d.total,
    }));
  }, [overview]);

  const timeDistributionData = useMemo(() => {
    if (!overview) return [];
    const t = overview.timeDistribution;
    return [
      { name: "Leitura", value: t.leitura, color: "#D6488F" },
      { name: "Exercício", value: t.exercicio, color: "#C9821E" },
    ].filter((d) => d.value > 0);
  }, [overview]);
  const timeDistributionTotal = timeDistributionData.reduce((s, d) => s + d.value, 0);

  const weekdayChartData = useMemo(
    () => (insights?.weekdayBreakdown ?? []).map((d) => ({ day: WEEKDAY_SHORT[d.label] ?? d.label.slice(0, 3), avg: d.avgCompleted })),
    [insights]
  );

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
    if (insights?.bestWeekday) {
      list.push({ icon: <Trophy size={16} />, text: `Seu melhor dia foi ${insights.bestWeekday.label.toLowerCase()}-feira, com média de ${insights.bestWeekday.avgCompleted} tarefas concluídas.` });
    } else if (c.tasksCompleted !== null && c.tasksCompleted !== 0) {
      list.push({
        icon: <Trophy size={16} />,
        text: `Você concluiu ${Math.abs(c.tasksCompleted)}% ${c.tasksCompleted > 0 ? "mais" : "menos"} tarefas do que no período anterior.`,
      });
    }
    if (c.pagesRead !== null && c.pagesRead !== 0) {
      list.push({
        icon: <BookOpen size={16} />,
        text: `Você leu ${Math.abs(c.pagesRead)}% ${c.pagesRead > 0 ? "mais" : "menos"} páginas do que no período anterior.`,
      });
    }
    if (insights && insights.sleepVsNextDayProductivity.r !== null && insights.sleepVsNextDayProductivity.r > 0.2) {
      list.push({ icon: <Moon size={16} />, text: `Nos dias com mais sono, sua produtividade no dia seguinte tende a subir.` });
    } else if (c.avgSleepMinutes !== null && c.avgSleepMinutes !== 0) {
      list.push({
        icon: <Moon size={16} />,
        text: `Seu sono médio ${c.avgSleepMinutes > 0 ? "melhorou" : "caiu"} ${Math.abs(c.avgSleepMinutes)}% em relação ao período anterior.`,
      });
    }
    return list.slice(0, 4);
  }, [overview, insights]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto space-y-5">
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
          {/* Mobile-first: 1 coluna em telas muito estreitas evita espremer ícone + sparkline no mesmo cartão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<CheckCircle2 size={18} />}
              tone="blue"
              label="Tarefas concluídas"
              value={String(overview.tasksCompleted)}
              changePct={overview.changePct.tasksCompleted}
              sublabel={overview.tasksPlanned > 0 ? `de ${overview.tasksPlanned} planejadas` : "Nenhuma tarefa planejada no período"}
              progressPct={overview.tasksPlanned > 0 ? (overview.tasksCompleted / overview.tasksPlanned) * 100 : null}
              barTone="bg-cat-blue"
              sparkData={overview.dailySeries.tasks}
              sparkColor="#5B6EF5"
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
              sparkData={overview.dailySeries.pages}
              sparkColor="#D6488F"
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
              sparkData={overview.dailySeries.workouts}
              sparkColor="#C9821E"
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
              sparkData={overview.dailySeries.habits}
              sparkColor="#D6488F"
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
              sparkData={overview.dailySeries.sleep}
              sparkColor="#8B5CF6"
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
              sparkData={overview.dailySeries.water}
              sparkColor="#2FB6C4"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="p-3 sm:p-4 md:p-5 xl:col-span-1">
              <p className="text-sm font-semibold mb-1">Evolução da produtividade</p>
              <p className="text-xs text-slate mb-3">Tarefas concluídas ao longo dos últimos {days} dias.</p>
              {productivityEvolution.every((d) => d["Tarefas concluídas"] === 0) ? (
                <p className="text-xs text-slate py-10 text-center">Sem atividade registrada nesse período ainda.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={productivityEvolution}>
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate" />
                      <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate" allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="Tarefas concluídas" stroke="#5B6EF5" fill="#5B6EF5" fillOpacity={0.18} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-3 sm:p-4 md:p-5 xl:col-span-1">
              <p className="text-sm font-semibold mb-1">Distribuição do tempo</p>
              <p className="text-xs text-slate mb-3">Tempo ativo (média/dia) entre leitura e exercício.</p>
              {timeDistributionData.length === 0 ? (
                <p className="text-xs text-slate py-10 text-center">Registre atividades para ver a distribuição aqui.</p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-28 h-28 shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={timeDistributionData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} paddingAngle={2}>
                          {timeDistributionData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${v}min/dia`, ""]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-sm font-bold leading-none">{formatMinutes(timeDistributionTotal)}</p>
                      <p className="text-[9px] text-slate">por dia</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-0 flex-1">
                    {timeDistributionData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="truncate">{d.name}</span>
                        <span className="text-slate ml-auto">{Math.round((d.value / timeDistributionTotal) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-3 sm:p-4 md:p-5 xl:col-span-1">
              <p className="text-sm font-semibold mb-3">Equilíbrio da rotina (Life Score)</p>
              {!lifeScore || radarData.every((d) => d.value === 0) ? (
                <p className="text-xs text-slate py-10 text-center">Registre atividades nos módulos para ver seu equilíbrio aqui.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke="currentColor" className="text-paper-border dark:text-ink-border" />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate" />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar dataKey="value" stroke="#5B6EF5" fill="#5B6EF5" fillOpacity={0.35} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-3 sm:p-4 md:p-5 xl:col-span-1">
              <p className="text-sm font-semibold mb-1">Conclusões por dia da semana</p>
              <p className="text-xs text-slate mb-3">Média de tarefas concluídas por dia.</p>
              {weekdayChartData.length === 0 ? (
                <p className="text-xs text-slate py-10 text-center">Conclua tarefas em mais dias para ver este padrão.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekdayChartData}>
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate" />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="avg" fill="#5B6EF5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-4 sm:p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Trophy size={15} className="text-signal-deep" />
              <p className="text-sm font-semibold">Insights do período</p>
            </div>
            <p className="text-xs text-slate mb-4">Baseado nos seus dados dos últimos {days} dias.</p>
            {periodInsights.length === 0 ? (
              <p className="text-xs text-slate">Registre mais atividades para revelar padrões aqui.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {periodInsights.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs">
                    <span className="text-signal-deep mt-0.5 shrink-0">{item.icon}</span>
                    <p className="text-ink dark:text-paper leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <Card className="p-4 sm:p-5 md:p-6 xl:col-span-2">
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
                      ? `Ainda sem dados suficientes.`
                      : correlationText(insights.sleepVsNextDayProductivity.r)
                  }
                  r={insights?.sleepVsNextDayProductivity.r ?? null}
                />
                <InsightTile
                  icon={<CalendarDays size={15} />}
                  title="Melhor dia da semana"
                  body={
                    insights?.bestWeekday
                      ? `${insights.bestWeekday.label} é seu dia mais produtivo, com média de ${insights.bestWeekday.avgCompleted} tarefa(s) concluída(s).`
                      : "Conclua tarefas em mais dias diferentes para revelar seu melhor dia."
                  }
                />
              </div>
            </Card>

            <Card className="p-4 sm:p-5 md:p-6 xl:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={15} className="text-brand-600 dark:text-brand-500" />
                <p className="text-sm font-semibold">Resumo do período</p>
              </div>
              <div className="space-y-3.5">
                <GoalRow
                  icon={<BookOpen size={13} />}
                  label="Meta de leitura"
                  current={overview.pagesRead}
                  target={Math.max(1, Math.round(READING_GOAL_MONTHLY_PAGES * (days / 30)))}
                  unit="páginas"
                  tone="bg-cat-pink"
                />
                <GoalRow icon={<Droplet size={13} />} label="Meta de água" current={overview.avgWaterMl} target={WATER_GOAL_ML} unit="ml" displayScale={1000} displayUnit="L" tone="bg-cat-teal" />
                <GoalRow icon={<Heart size={13} />} label="Hábitos" current={overview.habitsCompletionPct} target={100} unit="%" tone="bg-cat-green" suffixLabel="de consistência" />
              </div>
            </Card>

            <Card className="p-4 sm:p-5 md:p-6 xl:col-span-1 bg-brand-50 dark:bg-brand-700/10 border-brand-100 dark:border-brand-700/30">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Lightbulb size={15} className="text-brand-600 dark:text-brand-500" />
                  <p className="text-sm font-semibold">Dica personalizada</p>
                </div>
              </div>
              <p className="text-xs text-slate mb-3">Análise da IA sobre seu progresso.</p>
              <button
                onClick={() => analyticsInsight.generate(days)}
                disabled={analyticsInsight.isGenerating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 dark:border-brand-700/40 bg-paper-raised dark:bg-ink-raised px-3.5 py-2 text-xs font-semibold hover:bg-paper dark:hover:bg-ink-overlay disabled:opacity-60 transition-colors"
              >
                <Wand2 size={13} />
                {analyticsInsight.isGenerating ? "Analisando..." : analyticsInsight.text ? "Gerar outra análise" : "Analisar com IA"}
              </button>

              {analyticsInsight.error ? (
                <p className="text-xs mt-3 bg-drop/10 text-drop rounded-xl px-3 py-2.5">
                  {analyticsInsight.error.message}
                  {analyticsInsight.error.status === 400 && (
                    <>
                      {" "}
                      <Link to="/configuracoes" className="underline font-semibold">
                        Ir para Configurações
                      </Link>
                    </>
                  )}
                </p>
              ) : analyticsInsight.text ? (
                <blockquote className="text-sm italic text-ink dark:text-paper leading-relaxed mt-3">
                  "{analyticsInsight.text}"
                  <footer className="text-xs not-italic text-slate mt-2">— LifeOS Copilot</footer>
                </blockquote>
              ) : (
                <p className="text-xs text-slate mt-3">Peça uma análise para o Copilot cruzar seus números do período e apontar um padrão real.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function correlationText(r: number) {
  const abs = Math.abs(r);
  const strength = abs >= 0.6 ? "forte" : abs >= 0.3 ? "moderada" : "leve";
  const direction = r >= 0 ? "positiva" : "negativa";
  return `Correlação ${direction} ${strength} (r = ${r.toFixed(2)}).`;
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

/** Linha de progresso do card "Resumo do período" — sempre atual/meta com uma barra, a partir de dados já calculados no overview. */
function GoalRow({
  icon,
  label,
  current,
  target,
  unit,
  tone,
  displayScale,
  displayUnit,
  suffixLabel,
}: {
  icon: ReactNode;
  label: string;
  current: number;
  target: number;
  unit: string;
  tone: string;
  displayScale?: number;
  displayUnit?: string;
  suffixLabel?: string;
}) {
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  const fmt = (v: number) => (displayScale ? (v / displayScale).toFixed(1) : Math.round(v).toString());
  const unitLabel = displayUnit ?? unit;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-xs text-slate">
          {icon} {label}
        </span>
        <span className="text-xs font-semibold shrink-0">
          {suffixLabel ? `${Math.round(current)}${unit} ${suffixLabel}` : `${fmt(current)} / ${fmt(target)} ${unitLabel}`} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}
