import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Droplets,
  Dumbbell,
  Flame,
  GraduationCap,
  Layers,
  ListChecks,
  Moon,
  Repeat,
  Smile,
  Sparkles,
  Target,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTimeline } from "@/hooks/useAnalytics";
import { Card, EmptyState, IconBadge } from "@/components/ui/primitives";
import type { TimelineEvent } from "@/types";

type EventType = TimelineEvent["type"] | "mood" | "water";
type Tone = "blue" | "purple" | "green" | "pink" | "teal" | "amber";

const TYPE_CONFIG: Record<EventType, { tab: string; tag: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  task: { tab: "Tarefas", tag: "Tarefas", tone: "blue", icon: CheckCircle2 },
  habit: { tab: "Hábitos", tag: "Hábitos", tone: "pink", icon: Repeat },
  workout: { tab: "Saúde", tag: "Saúde", tone: "green", icon: Dumbbell },
  reading: { tab: "Leitura", tag: "Leitura", tone: "teal", icon: BookOpen },
  focus: { tab: "Foco", tag: "Foco", tone: "purple", icon: Target },
  education: { tab: "Estudo", tag: "Estudo", tone: "amber", icon: GraduationCap },
  sleep: { tab: "Sono", tag: "Sono", tone: "purple", icon: Moon },
  mood: { tab: "Humor", tag: "Humor", tone: "amber", icon: Smile },
  water: { tab: "Água", tag: "Água", tone: "blue", icon: Droplets },
  work_note: { tab: "Profissional", tag: "Profissional", tone: "purple", icon: Briefcase },
};

const TAG_PILL: Record<Tone, string> = {
  blue: "bg-cat-blue/10 text-cat-blue dark:bg-cat-blue/15 dark:text-cat-blue-dark",
  purple: "bg-cat-purple/10 text-cat-purple dark:bg-cat-purple/15 dark:text-cat-purple-dark",
  green: "bg-cat-green/10 text-cat-green dark:bg-cat-green/15 dark:text-cat-green-dark",
  pink: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark",
  teal: "bg-cat-teal/10 text-cat-teal dark:bg-cat-teal/15 dark:text-cat-teal-dark",
  amber: "bg-signal/15 text-signal-deep dark:text-signal",
};

const TONE_HEX: Record<Tone, string> = {
  blue: "#3B82F6",
  purple: "#8B5CF6",
  green: "#16A34A",
  pink: "#EC4899",
  teal: "#0D9488",
  amber: "#D9860F",
};

const TABS: Array<{ value: EventType | "todos"; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "task", label: "Tarefas" },
  { value: "habit", label: "Hábitos" },
  { value: "education", label: "Estudo" },
  { value: "work_note", label: "Profissional" },
  { value: "workout", label: "Saúde" },
  { value: "focus", label: "Foco" },
  { value: "reading", label: "Leitura" },
  { value: "sleep", label: "Sono" },
  { value: "mood", label: "Humor" },
  { value: "water", label: "Água" },
];

const RANGE_OPTIONS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 14, label: "Últimos 14 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
];

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** Título de ação + detalhe real do evento — nunca um texto genérico sem dado por trás. */
function eventContent(e: TimelineEvent): { title: string; detail: string | null } {
  switch (e.type) {
    case "task":
      return { title: "Tarefa concluída", detail: e.project_name ? `${e.label} · ${e.project_name}` : (e.label as string) };
    case "mood":
      return {
        title: "Humor e energia",
        detail: `humor ${e.mood}/5 · energia ${e.energy}/5${e.stress ? ` · estresse ${e.stress}/5` : ""}`,
      };
    case "water":
      return { title: "Água", detail: `${e.amount_ml}ml` };
    case "habit":
      return { title: e.label, detail: Number(e.count ?? 1) > 1 ? `${e.count}x hoje` : "Hábito concluído" };
    case "workout": {
      const parts: string[] = [];
      if (e.duration_minutes) parts.push(formatMinutes(Number(e.duration_minutes)));
      if (e.distance_km) parts.push(`${e.distance_km} km`);
      return { title: e.label, detail: parts.length > 0 ? parts.join(" · ") : null };
    }
    case "reading":
      return { title: "Leitura", detail: `${e.pages_read ?? 0} páginas · ${e.label}` };
    case "focus":
      return { title: "Sessão de foco", detail: e.actual_minutes ? `${e.actual_minutes} minutos` : null };
    case "education":
      return { title: "Disciplina concluída", detail: e.label };
    case "work_note":
      return { title: "Reunião/anotação profissional", detail: e.label };
    case "sleep":
      return { title: "Dormir", detail: e.duration_minutes ? `${formatMinutes(Number(e.duration_minutes))} de sono` : "Boa noite!" };
    default:
      return { title: e.label, detail: null };
  }
}

function formatTime(at: string) {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayIso() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function dayHeaderLabel(day: string) {
  const formatted = new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  if (day === todayIso()) return `Hoje · ${formatted}`;
  if (day === yesterdayIso()) return `Ontem · ${formatted}`;
  return formatted;
}

/** Rótulo curto usado nos "Destaques" (sem a data completa) — "hoje", "ontem" ou "há N dias". */
function relativeDayLabel(day: string) {
  if (day === todayIso()) return "hoje";
  if (day === yesterdayIso()) return "ontem";
  const diffDays = Math.round((Date.parse(todayIso()) - Date.parse(day)) / 86_400_000);
  return `há ${diffDays} dias`;
}

export function TimelinePage() {
  const [filter, setFilter] = useState<EventType | "todos">("todos");
  const [rangeDays, setRangeDays] = useState(7);
  const [sortAsc, setSortAsc] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const to = useMemo(() => todayIso(), []);
  const from = useMemo(() => new Date(Date.now() - (rangeDays - 1) * 86_400_000).toISOString().slice(0, 10), [rangeDays]);
  const { events, isLoading } = useTimeline({ from, to });

  const filtered = filter === "todos" ? events : events.filter((e) => e.type === filter);

  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of filtered) {
    const day = String(e.at).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  const days = [...byDay.keys()].sort((a, b) => (sortAsc ? a.localeCompare(b) : b.localeCompare(a)));

  // Cartões de resumo do topo — sempre a partir dos eventos já carregados.
  const categoriesPresent = new Set(events.map((e) => e.type)).size;
  const daysWithRecords = new Set(events.map((e) => String(e.at).slice(0, 10))).size;

  // "Resumo da atividade" — contagem real por categoria, no período selecionado.
  const categoryBreakdown = useMemo(() => {
    const counts = new Map<EventType, number>();
    for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count, tag: TYPE_CONFIG[type].tag, tone: TYPE_CONFIG[type].tone }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  // "Destaques" — dia mais ativo, horário mais frequente, maior sequência de
  // hábito e último registro de estudo, tudo derivado dos eventos reais do
  // período; nunca um valor fixo quando não há dado por trás.
  const highlights = useMemo(() => {
    if (events.length === 0) return null;

    const perDay = new Map<string, number>();
    const perHour = new Map<number, number>();
    for (const e of events) {
      const day = String(e.at).slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      const iso = String(e.at).includes("T") ? String(e.at) : String(e.at).replace(" ", "T");
      const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
      if (!Number.isNaN(d.getTime())) perHour.set(d.getUTCHours(), (perHour.get(d.getUTCHours()) ?? 0) + 1);
    }
    let mostActiveDay: string | null = null;
    for (const [day, count] of perDay.entries()) {
      if (!mostActiveDay || count > perDay.get(mostActiveDay)!) mostActiveDay = day;
    }
    let bestHour: number | null = null;
    for (const [hour, count] of perHour.entries()) {
      if (bestHour === null || count > perHour.get(bestHour)!) bestHour = hour;
    }

    // Maior sequência: entre os hábitos com check-in no período, a maior
    // sequência de dias consecutivos registrados na própria timeline.
    const habitDates = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.type !== "habit") continue;
      const set = habitDates.get(e.label) ?? new Set<string>();
      set.add(String(e.at).slice(0, 10));
      habitDates.set(e.label, set);
    }
    let bestStreakHabit: { name: string; streak: number } | null = null;
    for (const [name, dateSet] of habitDates.entries()) {
      const sorted = [...dateSet].sort();
      let running = 1;
      let best = 1;
      for (let i = 1; i < sorted.length; i++) {
        const gap = Math.round((Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 86_400_000);
        running = gap === 1 ? running + 1 : 1;
        best = Math.max(best, running);
      }
      if (!bestStreakHabit || best > bestStreakHabit.streak) bestStreakHabit = { name, streak: best };
    }

    const studyEvents = events.filter((e) => e.type === "education").sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const lastStudyDay = studyEvents[0] ? String(studyEvents[0].at).slice(0, 10) : null;

    return { mostActiveDay, bestHour, bestStreakHabit, lastStudyDay };
  }, [events]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-slate">HISTÓRICO</p>
        <p className="font-display font-bold text-2xl mt-0.5">Timeline</p>
        <p className="text-sm text-slate mt-1">Histórico cronológico das suas atividades, hábitos, leitura, exercícios, foco e educação.</p>
      </div>

      {/* Mobile-first: cartões empilham em telas estreitas, evitando espremer ícone + número em 3 colunas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <IconBadge icon={<CalendarDays size={17} />} tone="blue" size={38} />
          <div>
            <p className="text-lg font-semibold leading-tight">{events.length}</p>
            <p className="text-xs text-slate leading-tight">atividades</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge icon={<Layers size={17} />} tone="purple" size={38} />
          <div>
            <p className="text-lg font-semibold leading-tight">{categoriesPresent}</p>
            <p className="text-xs text-slate leading-tight">categorias</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <IconBadge icon={<ListChecks size={17} />} tone="green" size={38} />
          <div>
            <p className="text-lg font-semibold leading-tight">{daysWithRecords}</p>
            <p className="text-xs text-slate leading-tight">dias com registros</p>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const count = t.value === "todos" ? events.length : events.filter((e) => e.type === t.value).length;
            const active = filter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setFilter(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active ? "bg-brand-500 text-white border-brand-500" : "border-paper-border dark:border-ink-border text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                }`}
              >
                {t.label} {count > 0 ? `(${count})` : ""}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <button
              onClick={() => {
                setRangeOpen((v) => !v);
                setSortOpen(false);
              }}
              className="flex items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2 text-xs font-medium hover:bg-paper dark:hover:bg-ink-overlay transition-colors"
            >
              <CalendarDays size={13} /> {RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label} <ChevronDown size={13} />
            </button>
            {rangeOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card dark:shadow-card-dark z-20 py-1">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => {
                      setRangeDays(r.days);
                      setRangeOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-paper dark:hover:bg-ink-overlay transition-colors ${r.days === rangeDays ? "font-semibold text-brand-600 dark:text-brand-500" : ""}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setSortOpen((v) => !v);
                setRangeOpen(false);
              }}
              className="flex items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2 text-xs font-medium hover:bg-paper dark:hover:bg-ink-overlay transition-colors"
            >
              <Clock3 size={13} /> {sortAsc ? "Mais antigos" : "Mais recentes"} <ChevronDown size={13} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 mt-1 w-40 rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card dark:shadow-card-dark z-20 py-1">
                <button
                  onClick={() => {
                    setSortAsc(false);
                    setSortOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-paper dark:hover:bg-ink-overlay transition-colors ${!sortAsc ? "font-semibold text-brand-600 dark:text-brand-500" : ""}`}
                >
                  Mais recentes
                </button>
                <button
                  onClick={() => {
                    setSortAsc(true);
                    setSortOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-paper dark:hover:bg-ink-overlay transition-colors ${sortAsc ? "font-semibold text-brand-600 dark:text-brand-500" : ""}`}
                >
                  Mais antigos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isLoading && days.length === 0 && (
        <EmptyState
          title="Ainda sem atividade registrada"
          description="Conclua tarefas, registre hábitos, leituras e exercícios para ver sua linha do tempo aparecer aqui."
          ctaLabel="Ver Hoje"
          onCta={() => (window.location.href = "/hoje")}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {days.map((day) => {
            const dayEvents = [...byDay.get(day)!].sort((a, b) => String(b.at).localeCompare(String(a.at)));
            const collapsed = collapsedDays.has(day);
            return (
              <Card key={day} className="p-4 sm:p-5">
                <button
                  onClick={() =>
                    setCollapsedDays((prev) => {
                      const next = new Set(prev);
                      if (next.has(day)) next.delete(day);
                      else next.add(day);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between mb-3"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays size={14} className="text-slate" />
                    <p className="text-sm font-semibold">{dayHeaderLabel(day)}</p>
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-slate">
                    {dayEvents.length} {dayEvents.length === 1 ? "atividade" : "atividades"}
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </span>
                </button>
                {!collapsed && (
                  <div className="space-y-3">
                    {dayEvents.map((e) => {
                      const cfg = TYPE_CONFIG[e.type];
                      const Icon = cfg.icon;
                      const { title, detail } = eventContent(e);
                      return (
                        <div key={`${e.type}-${e.id}`} className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-paper-border dark:bg-ink-border shrink-0" />
                          <span className="text-xs text-slate w-11 shrink-0 tabular-nums">{formatTime(String(e.at))}</span>
                          <IconBadge icon={<Icon size={16} />} tone={cfg.tone} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{title}</p>
                            {detail && <p className="text-xs text-slate truncate">{detail}</p>}
                          </div>
                          <span className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-full ${TAG_PILL[cfg.tone]}`}>{cfg.tag}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <p className="text-sm font-semibold mb-1">Resumo da atividade</p>
            <p className="text-xs text-slate mb-3">Distribuição de atividades no período selecionado.</p>
            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate">Sem atividades no período.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 shrink-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        dataKey="count"
                        nameKey="tag"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={2}
                      >
                        {categoryBreakdown.map((d, i) => (
                          <Cell key={i} fill={TONE_HEX[d.tone]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-lg font-bold leading-none">{events.length}</p>
                    <p className="text-[9px] text-slate">atividades</p>
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  {categoryBreakdown.map((d) => (
                    <div key={d.type} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TONE_HEX[d.tone] }} />
                      <span className="truncate">{d.tag}</span>
                      <span className="text-slate ml-auto">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-sm font-semibold mb-3">Destaques</p>
            {!highlights ? (
              <p className="text-xs text-slate">Registre atividades para ver destaques aqui.</p>
            ) : (
              <div className="space-y-3">
                <HighlightRow
                  icon={<CalendarDays size={14} />}
                  label="Dia mais ativo"
                  value={highlights.mostActiveDay ? relativeDayLabel(highlights.mostActiveDay) : "—"}
                />
                <HighlightRow
                  icon={<Clock3 size={14} />}
                  label="Horário mais frequente"
                  value={highlights.bestHour !== null ? `${highlights.bestHour}h` : "—"}
                />
                <HighlightRow
                  icon={<Flame size={14} />}
                  label="Maior sequência"
                  value={highlights.bestStreakHabit ? `${highlights.bestStreakHabit.name} — ${highlights.bestStreakHabit.streak} dias` : "—"}
                />
                <HighlightRow
                  icon={<GraduationCap size={14} />}
                  label="Último estudo"
                  value={highlights.lastStudyDay ? relativeDayLabel(highlights.lastStudyDay) : "Sem registros"}
                />
              </div>
            )}
          </Card>

          <Card className="p-6 bg-gradient-to-br from-brand-600 to-cat-purple text-white border-0">
            <Sparkles size={20} className="mb-2 opacity-90" />
            <p className="font-display font-bold text-base leading-snug">Cada registro conta.</p>
            <p className="text-xs opacity-90 mt-2 leading-relaxed">Sua evolução fica mais clara quando você enxerga a jornada completa.</p>
            <Link
              to="/analytics"
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold bg-white/15 hover:bg-white/25 transition-colors rounded-lg px-3 py-2"
            >
              Ver insights →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HighlightRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-slate shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate truncate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}
