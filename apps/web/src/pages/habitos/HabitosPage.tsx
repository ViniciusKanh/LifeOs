import { useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis } from "recharts";
import { Link } from "react-router-dom";
import { useHabitEntriesRange, useHabits } from "@/hooks/useHabits";
import { useHabitsInsight } from "@/hooks/useCopilot";
import { Button, Card, Field, IconBadge, EmptyState } from "@/components/ui/primitives";
import type { Habit } from "@/types";

/* ------------------------------------------------------------------ */
/* Categorias predefinidas de hábito — mesmo padrão visual (ícone +    */
/* cor) usado em toda a aplicação. Um hábito pode ficar sem categoria  */
/* ("Geral"), nunca é obrigatório inventar uma.                        */
/* ------------------------------------------------------------------ */
const HABIT_CATEGORIES: Array<{ value: string; label: string; tone: "green" | "blue" | "purple" | "amber"; icon: typeof Heart }> = [
  { value: "Saúde", label: "Saúde", tone: "green", icon: Heart },
  { value: "Estudo", label: "Estudo", tone: "blue", icon: BookOpen },
  { value: "Bem-estar", label: "Bem-estar", tone: "purple", icon: Sparkles },
  { value: "Produtividade", label: "Produtividade", tone: "amber", icon: Zap },
];
const CATEGORY_BY_VALUE = new Map(HABIT_CATEGORIES.map((c) => [c.value, c]));
const FALLBACK_CATEGORY = { label: "Geral", tone: "blue" as const, icon: Target };

const DONUT_COLORS: Record<string, string> = {
  green: "#2E7D6B",
  blue: "#3B6FE0",
  purple: "#8B5CF6",
  amber: "#C9821E",
};

/** Frases motivacionais fixas — usadas só como pano de fundo estético do card, nunca como dado analítico. */
const FALLBACK_QUOTES = [
  "Disciplina hoje, liberdade amanhã.",
  "Cada pequeno hábito é um voto na pessoa que você quer se tornar.",
  "Consistência vence intensidade.",
  "Você não precisa ser perfeito, só precisa continuar.",
];
function fallbackQuoteOfTheDay() {
  return FALLBACK_QUOTES[Math.floor(Date.now() / 86_400_000) % FALLBACK_QUOTES.length];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function diasLabel(n: number) {
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

/** Segunda a domingo da semana ATUAL (datas reais, não uma janela rolante). */
function currentWeekDates() {
  const now = new Date();
  const dow = now.getDay(); // 0 = domingo
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const days: Array<{ iso: string; weekday: string; dayNum: string }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      dayNum: String(d.getDate()),
    });
  }
  return days;
}

type FilterTab = "Todos" | "Hoje" | "Concluidos" | "EmRisco";

export function HabitosPage() {
  const { habits, summaryByHabitId, stats, createHabit, updateHabit, removeHabit, checkIn } = useHabits();
  const insight = useHabitsInsight();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("Todos");
  const today = todayStr();
  const week = useMemo(() => currentWeekDates(), []);
  const entriesByHabitId = useHabitEntriesRange(habits, week[0].iso, week[6].iso);

  const habitsWithStatus = useMemo(
    () =>
      habits.map((h) => {
        const summary = summaryByHabitId.get(h.id);
        const checkedInToday = summary?.checkedInToday ?? false;
        const atRisk = !checkedInToday && (summary?.currentStreak ?? 0) > 0;
        return { habit: h, summary, checkedInToday, atRisk };
      }),
    [habits, summaryByHabitId]
  );

  const completedToday = stats?.completedToday ?? habitsWithStatus.filter((h) => h.checkedInToday).length;
  const completedYesterday = stats?.completedYesterday ?? null;
  const completedDelta = completedYesterday !== null ? completedToday - completedYesterday : null;
  const totalHabits = stats?.totalHabits ?? habits.length;
  const consistency = stats?.consistency;

  const filteredHabits = useMemo(() => {
    switch (filterTab) {
      case "Hoje":
        return habitsWithStatus.filter((h) => !h.checkedInToday);
      case "Concluidos":
        return habitsWithStatus.filter((h) => h.checkedInToday);
      case "EmRisco":
        return habitsWithStatus.filter((h) => h.atRisk);
      default:
        return habitsWithStatus;
    }
  }, [habitsWithStatus, filterTab]);

  const tabCounts: Record<FilterTab, number> = {
    Todos: habits.length,
    Hoje: habitsWithStatus.filter((h) => !h.checkedInToday).length,
    Concluidos: habitsWithStatus.filter((h) => h.checkedInToday).length,
    EmRisco: habitsWithStatus.filter((h) => h.atRisk).length,
  };
  const TAB_LABEL: Record<FilterTab, string> = { Todos: "Todos", Hoje: "Hoje", Concluidos: "Concluídos", EmRisco: "Em risco" };

  // Heatmap agrupado em semanas (colunas), Seg→Dom (linhas) — a partir dos
  // dias reais retornados por /habits/stats.
  const heatmapWeeks = useMemo(() => {
    const days = consistency?.days ?? [];
    if (days.length === 0) return [];
    const weeks: Array<typeof days> = [];
    let cursor = 0;
    const firstDow = new Date(`${days[0].date}T00:00:00`).getDay();
    const firstWeekLen = firstDow === 0 ? 1 : 8 - firstDow;
    weeks.push(days.slice(0, Math.min(firstWeekLen, days.length)));
    cursor = firstWeekLen;
    while (cursor < days.length) {
      weeks.push(days.slice(cursor, cursor + 7));
      cursor += 7;
    }
    return weeks;
  }, [consistency]);

  const heatmapColor = (ratio: number) => {
    if (ratio <= 0) return "bg-paper-border dark:bg-ink-border";
    if (ratio < 0.34) return "bg-cat-green/25";
    if (ratio < 0.67) return "bg-cat-green/55";
    if (ratio < 1) return "bg-cat-green/80";
    return "bg-cat-green";
  };

  const donutData = useMemo(
    () =>
      (stats?.categories ?? []).map((c) => {
        const meta = CATEGORY_BY_VALUE.get(c.category) ?? FALLBACK_CATEGORY;
        return { name: meta.label, value: c.habitCount, color: DONUT_COLORS[meta.tone] };
      }),
    [stats]
  );

  // Horários de melhor desempenho — agrupa as 24h reais em faixas legíveis
  // (manhã/tarde/noite/madrugada) a partir dos check-ins dos últimos 30 dias.
  const bestTimesData = useMemo(() => {
    const raw = stats?.bestTimes ?? [];
    if (raw.length === 0) return { buckets: [], peakLabel: null as string | null };
    const buckets = [
      { label: "Madrugada", range: "0-5h", value: 0 },
      { label: "Manhã", range: "6-11h", value: 0 },
      { label: "Tarde", range: "12-17h", value: 0 },
      { label: "Noite", range: "18-23h", value: 0 },
    ];
    for (const { hour, count } of raw) {
      if (hour < 6) buckets[0].value += count;
      else if (hour < 12) buckets[1].value += count;
      else if (hour < 18) buckets[2].value += count;
      else buckets[3].value += count;
    }
    const peakHourEntry = [...raw].sort((a, b) => b.count - a.count)[0];
    const peakLabel = peakHourEntry && peakHourEntry.count > 0 ? `Pico às ${peakHourEntry.hour}h` : null;
    return { buckets, peakLabel };
  }, [stats]);
  const hasBestTimesData = bestTimesData.buckets.some((b) => b.value > 0);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <p className="font-display font-semibold text-2xl">Hábitos</p>
          <p className="text-sm text-slate mt-1">Pequenas ações, grandes resultados. Construa a vida que você deseja, um dia de cada vez.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Novo hábito
        </Button>
      </div>

      {habits.length === 0 ? (
        <EmptyState
          title="Nenhum hábito criado ainda"
          description="Crie um hábito (água, leitura, exercício, inglês...) para começar a acompanhar sua consistência."
          ctaLabel="Criar hábito"
          onCta={() => setModalOpen(true)}
        />
      ) : (
        <>
          {/* Cartões de estatística */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Flame size={18} />} tone="amber" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{diasLabel(stats?.currentStreakMax ?? 0)}</p>
                  <p className="text-xs text-slate leading-tight">Sequência atual</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Target size={18} />} tone="blue" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg sm:text-xl font-semibold leading-tight">
                      {completedToday} / {totalHabits}
                    </p>
                    {completedDelta !== null && completedDelta !== 0 && (
                      <span className={`text-[11px] font-semibold ${completedDelta > 0 ? "text-growth" : "text-drop"}`}>
                        {completedDelta > 0 ? "↑" : "↓"}{Math.abs(completedDelta)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate leading-tight">Hábitos concluídos hoje</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-2">
                <div className="h-full rounded-full bg-cat-blue" style={{ width: `${totalHabits ? (completedToday / totalHabits) * 100 : 0}%` }} />
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Activity size={18} />} tone="purple" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{totalHabits}</p>
                  <p className="text-xs text-slate leading-tight">Hábitos ativos</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<TrendingUp size={18} />} tone="teal" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg sm:text-xl font-semibold leading-tight">{consistency?.ratePct ?? 0}%</p>
                    {consistency?.changePct !== null && consistency?.changePct !== undefined && consistency.changePct !== 0 && (
                      <span className={`text-[11px] font-semibold ${consistency.changePct > 0 ? "text-growth" : "text-drop"}`}>
                        {consistency.changePct > 0 ? "↑" : "↓"}{Math.abs(consistency.changePct)}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate leading-tight">Consistência (30 dias)</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Sparkles size={18} />} tone="pink" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{diasLabel(stats?.bestStreakMax ?? 0)}</p>
                  <p className="text-xs text-slate leading-tight">Melhor sequência</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* Coluna principal: tabela de hábitos + categorias + horários */}
            <div className="space-y-4 min-w-0">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold">Meus hábitos</p>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["Todos", "Hoje", "Concluidos", "EmRisco"] as FilterTab[]).map((tab) => {
                    const active = filterTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setFilterTab(tab)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          active ? "bg-brand-500 text-white border-brand-500" : "border-paper-border dark:border-ink-border text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        {TAB_LABEL[tab]} ({tabCounts[tab]})
                      </button>
                    );
                  })}
                </div>

                {filteredHabits.length === 0 ? (
                  <p className="text-xs text-slate py-6 text-center">Nenhum hábito nesse filtro.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      <div className="grid gap-2 pb-2 border-b border-paper-border dark:border-ink-border" style={{ gridTemplateColumns: "1.6fr repeat(7, 34px) 70px 60px" }}>
                        <span className="text-[11px] text-slate font-medium">Hábito</span>
                        {week.map((d) => (
                          <span key={d.iso} className="text-[10px] text-slate text-center">
                            <span className="block capitalize">{d.weekday}</span>
                            <span className="block">{d.dayNum}</span>
                          </span>
                        ))}
                        <span className="text-[11px] text-slate font-medium text-center">Sequência</span>
                        <span />
                      </div>
                      {filteredHabits.map(({ habit, summary, atRisk }) => {
                        const meta = CATEGORY_BY_VALUE.get(habit.category?.trim() ?? "") ?? FALLBACK_CATEGORY;
                        const checkedDates = entriesByHabitId.get(habit.id) ?? new Set<string>();
                        return (
                          <div
                            key={habit.id}
                            className="grid items-center gap-2 py-2.5 border-b border-paper-border dark:border-ink-border last:border-0"
                            style={{ gridTemplateColumns: "1.6fr repeat(7, 34px) 70px 60px" }}
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-base leading-none">{habit.icon || "•"}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium truncate">{habit.name}</p>
                                  {atRisk && (
                                    <span className="shrink-0 text-[9px] font-semibold text-drop bg-drop/10 rounded-full px-1.5 py-0.5">Em risco</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate truncate">{meta.label}</p>
                              </div>
                            </div>
                            {week.map((d) => {
                              const done = checkedDates.has(d.iso);
                              const isFuture = d.iso > today;
                              return (
                                <button
                                  key={d.iso}
                                  disabled={isFuture}
                                  onClick={() => checkIn({ id: habit.id, entryDate: d.iso, count: done ? 0 : habit.target_count })}
                                  className="w-7 h-7 mx-auto flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={d.iso}
                                >
                                  {done ? <CheckCircle2 size={20} className="text-growth" /> : <Circle size={18} className="text-paper-border dark:text-ink-border" />}
                                </button>
                              );
                            })}
                            <div className="flex items-center justify-center gap-1 text-xs text-slate">
                              <Flame size={12} className={summary?.currentStreak ? "text-signal" : ""} />
                              {diasLabel(summary?.currentStreak ?? 0)}
                            </div>
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setEditingHabit(habit)} className="text-slate hover:text-inherit">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => removeHabit(habit.id)} className="text-slate hover:text-drop">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-5">
                  <p className="text-sm font-semibold mb-1">Hábitos por categoria</p>
                  <p className="text-xs text-slate mb-3">Distribuição dos seus hábitos ativos.</p>
                  {donutData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-32 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={2}>
                              {donutData.map((d, i) => (
                                <Cell key={i} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2 min-w-0">
                        {donutData.map((d) => (
                          <div key={d.name} className="flex items-center gap-2 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                            <span className="truncate">{d.name}</span>
                            <span className="text-slate ml-auto">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate">Defina uma categoria para seus hábitos para ver a distribuição.</p>
                  )}
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold">Melhores horários</p>
                    {bestTimesData.peakLabel && (
                      <span className="text-[10px] font-semibold text-cat-blue bg-cat-blue/10 rounded-full px-2 py-0.5 flex items-center gap-1">
                        <Clock size={10} /> {bestTimesData.peakLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate mb-3">Quando você mais registra seus check-ins (30 dias).</p>
                  {hasBestTimesData ? (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bestTimesData.buckets}>
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} check-ins`, ""]} />
                          <Bar dataKey="value" fill="#3B6FE0" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-slate py-8 text-center">Ainda sem check-ins suficientes para identificar um padrão de horário.</p>
                  )}
                </Card>
              </div>
            </div>

            {/* Coluna lateral: heatmap de consistência + insight + motivação */}
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Minha consistência</p>
                  <span className="text-[11px] text-slate">Últimos 30 dias</span>
                </div>
                {heatmapWeeks.length > 0 ? (
                  <>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {heatmapWeeks.map((wk, wi) => (
                        <div key={wi} className="flex flex-col gap-1.5">
                          {wk.map((d) => (
                            <div key={d.date} title={`${d.date}: ${d.completed}/${d.total}`} className={`w-4 h-4 rounded-sm ${heatmapColor(d.ratio)}`} />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {[
                        { label: "Perfeito", cls: "bg-cat-green" },
                        { label: "Muito bom", cls: "bg-cat-green/80" },
                        { label: "Bom", cls: "bg-cat-green/55" },
                        { label: "Parcial", cls: "bg-cat-green/25" },
                        { label: "Nenhum", cls: "bg-paper-border dark:bg-ink-border" },
                      ].map((l) => (
                        <span key={l.label} className="flex items-center gap-1 text-[10px] text-slate">
                          <span className={`w-2.5 h-2.5 rounded-sm ${l.cls}`} /> {l.label}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate">Sem check-ins registrados ainda.</p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-xl border border-paper-border dark:border-ink-border p-2.5 sm:p-3 min-w-0">
                    <p className="text-base sm:text-lg font-semibold">{consistency?.ratePct ?? 0}%</p>
                    <p className="text-[11px] text-slate">dias com hábitos</p>
                    {consistency?.changePct !== null && consistency?.changePct !== undefined && (
                      <p className={`text-[11px] mt-0.5 ${consistency.changePct >= 0 ? "text-growth" : "text-drop"}`}>
                        {consistency.changePct >= 0 ? "↑" : "↓"} {Math.abs(consistency.changePct)}%
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-paper-border dark:border-ink-border p-2.5 sm:p-3 min-w-0">
                    <p className="text-base sm:text-lg font-semibold">{consistency?.daysWithAnyHabit ?? 0}</p>
                    <p className="text-[11px] text-slate">dias no período de {consistency?.days.length ?? 30}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <IconBadge tone="pink" size={34} icon={<Sparkles size={15} />} />
                  <div>
                    <p className="text-sm font-semibold">Insights da sua jornada</p>
                    <p className="text-xs text-slate">Análise da IA sobre sequências e consistência.</p>
                  </div>
                </div>
                <button
                  onClick={() => insight.generate()}
                  disabled={insight.isGenerating}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-3.5 py-2 text-xs font-semibold hover:bg-paper dark:hover:bg-ink-overlay disabled:opacity-60 transition-colors"
                >
                  <Wand2 size={13} />
                  {insight.isGenerating ? "Analisando..." : insight.text ? "Gerar outra análise" : "Analisar com IA"}
                </button>

                {insight.error ? (
                  <p className="text-xs mt-3 bg-drop/10 text-drop rounded-xl px-4 py-3">
                    {insight.error.message}
                    {insight.error.status === 400 && (
                      <>
                        {" "}
                        <Link to="/configuracoes" className="underline font-semibold">
                          Ir para Configurações
                        </Link>
                      </>
                    )}
                  </p>
                ) : insight.text ? (
                  <p className="text-sm leading-relaxed mt-3 bg-cat-pink/5 border border-cat-pink/15 rounded-xl px-4 py-3">{insight.text}</p>
                ) : (
                  <p className="text-xs italic text-slate mt-3">{fallbackQuoteOfTheDay()}</p>
                )}
              </Card>

              <Card className="p-5 bg-gradient-to-br from-brand-600 to-brand-700 text-white border-0">
                <p className="font-display font-semibold text-lg">Disciplina hoje, liberdade amanhã.</p>
                <p className="text-xs text-brand-100 mt-2">Cada pequeno hábito é um voto na pessoa que você quer se tornar.</p>
              </Card>
            </div>
          </div>
        </>
      )}

      {modalOpen && (
        <HabitoModal
          onClose={() => setModalOpen(false)}
          onSubmit={async (input) => {
            await createHabit(input);
          }}
        />
      )}
      {editingHabit && (
        <HabitoModal
          habit={editingHabit}
          onClose={() => setEditingHabit(null)}
          onSubmit={async (input) => {
            await updateHabit({ id: editingHabit.id, patch: input });
          }}
        />
      )}
    </div>
  );
}

function HabitoModal({
  habit,
  onClose,
  onSubmit,
}: {
  habit?: Habit;
  onClose: () => void;
  onSubmit: (input: { name: string; icon?: string; category?: string; targetCount?: number }) => Promise<unknown>;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "");
  const [category, setCategory] = useState(habit?.category ?? "");
  const [targetCount, setTargetCount] = useState(String(habit?.target_count ?? 1));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), icon: icon.trim() || undefined, category: category || undefined, targetCount: Number(targetCount) || 1 });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{habit ? "Editar hábito" : "Novo hábito"}</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Nome" placeholder="Beber água, Ler, Inglês..." value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Emoji (opcional)" placeholder="💧" value={icon} onChange={(e) => setIcon(e.target.value)} />
          <div>
            <label className="text-xs text-slate">Categoria (opcional)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="">Sem categoria</option>
              {HABIT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Meta por dia" type="number" min={1} value={targetCount} onChange={(e) => setTargetCount(e.target.value)} />
          <Button onClick={submit} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Salvando..." : habit ? "Salvar alterações" : "Criar hábito"}
          </Button>
        </div>
      </div>
    </div>
  );
}
