import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Check, CheckSquare, Clock, Compass, Plus, Repeat, Target } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useDirection } from "@/hooks/useLifeOs";
import { RPGButton, RPGPanel, RPGProgressBar, RPGStatCard, type RpgTone } from "@/components/rpg";
import { useEvents } from "@/hooks/useEvents";
import { useHabits, useHabitEntriesRange } from "@/hooks/useHabits";
import { Button, Card } from "@/components/ui/primitives";
import type { CalendarItem } from "@/types";

const WEEKDAYS_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const SOURCE_TONE: Record<CalendarItem["sourceType"], "blue" | "purple" | "green" | "amber"> = {
  manual: "blue",
  task: "amber",
  goal: "purple",
  academic_project: "green",
};

// Tema RPG: cor + rótulo de cada origem (a cor nunca é o único sinal).
const SOURCE_RPG: Record<CalendarItem["sourceType"], { tone: RpgTone; label: string; dot: string }> = {
  manual: { tone: "purple", label: "Evento", dot: "bg-rpg-purple" },
  task: { tone: "orange", label: "Tarefa", dot: "bg-rpg-orange" },
  goal: { tone: "gold", label: "Meta", dot: "bg-rpg-gold" },
  academic_project: { tone: "blue", label: "Acadêmico", dot: "bg-rpg-blue" },
};

function timeOf(item: CalendarItem) {
  if (item.allDay || item.startsAt.length <= 10) return null;
  const d = new Date(item.startsAt);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "Em 2h", "Amanhã", "Em 3 dias" — distância real até o início do item. */
function timeUntil(item: CalendarItem, now: Date) {
  const start = new Date(item.startsAt.length <= 10 ? `${item.startsAt}T00:00:00` : item.startsAt);
  const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
  if (diffMin < 60) return diffMin <= 0 ? "Agora" : `Em ${diffMin} min`;
  if (diffMin < 24 * 60) return `Em ${Math.round(diffMin / 60)}h`;
  const days = Math.round(diffMin / (24 * 60));
  return days === 1 ? "Amanhã" : `Em ${days} dias`;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contém `date`. */
function mondayOf(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - weekday);
  return d;
}

function buildWeekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });
}

/**
 * Modo Semana — meio-termo entre Hoje (diário) e Calendário (mensal):
 * os 7 dias como colunas, com os prazos do dia (tarefas/metas/TCC/
 * eventos manuais, mesma fonte do Calendário) e os hábitos do dia
 * empilhados, cada um com check-in direto na grade — sem precisar
 * abrir mais nada. Complementa o Weekly Review, que já fecha essa
 * mesma semana no fim do ciclo.
 */
export function SemanaPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [monday, setMonday] = useState(() => mondayOf(today));

  const weekDays = useMemo(() => buildWeekDays(monday), [monday]);
  const rangeFrom = toISODate(weekDays[0]);
  const rangeTo = toISODate(weekDays[6]);

  const { items, isLoading: eventsLoading } = useEvents(rangeFrom, rangeTo);
  const { habits, checkIn } = useHabits();
  const entriesByHabitId = useHabitEntriesRange(habits, rangeFrom, rangeTo);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const day = item.startsAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return map;
  }, [items]);

  const weekLabel = `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")} – ${weekDays[6]
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .replace(".", "")}`;

  const changeWeek = (deltaWeeks: number) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
    setMonday(d);
  };

  const { isRpg } = useTheme();
  const { data: direction } = useDirection();

  if (isRpg) {
    const now = new Date();
    const todayIso = toISODate(today);
    const tasksDue = items.filter((i) => i.sourceType === "task").length;
    const goalsAndAcademic = items.filter((i) => i.sourceType === "goal" || i.sourceType === "academic_project").length;
    const habitSlots = habits.length * 7;
    const habitDone = habits.reduce((sum, h) => sum + (entriesByHabitId.get(h.id)?.size ?? 0), 0);
    const upcoming = items
      .filter((i) => new Date(i.startsAt.length <= 10 ? `${i.startsAt}T23:59:59` : i.startsAt).getTime() >= now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5);
    // "Semana em foco": metas reais do ciclo atual (mês, senão trimestre), com o progresso calculado na Direção.
    const focusGoals = direction
      ? direction.goals
          .filter((g) => g.status !== "completed" && (g.cycle === direction.cycles.month || g.cycle === direction.cycles.quarter))
          .slice(0, 4)
      : [];

    return (
      <div className="w-full px-3 py-5 sm:px-4 md:px-8 md:py-8 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="rpg-title text-2xl md:text-3xl font-bold capitalize">{weekLabel}</h1>
            <p className="text-sm text-rpg-muted mt-1">Sua semana organizada: eventos, prazos e hábitos num só lugar.</p>
          </div>
          <div className="flex items-center gap-2">
            <RPGButton variant="secondary" onClick={() => changeWeek(-1)} aria-label="Semana anterior" className="!px-3">
              <ChevronLeft size={16} />
            </RPGButton>
            <RPGButton variant="secondary" onClick={() => setMonday(mondayOf(today))}>
              Esta semana
            </RPGButton>
            <RPGButton variant="secondary" onClick={() => changeWeek(1)} aria-label="Próxima semana" className="!px-3">
              <ChevronRight size={16} />
            </RPGButton>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RPGStatCard icon={<CalendarDays size={17} />} label="Itens na agenda" value={String(items.length)} tone="blue" caption="eventos e prazos da semana" />
          <RPGStatCard icon={<CheckSquare size={17} />} label="Tarefas com prazo" value={String(tasksDue)} tone="orange" />
          <RPGStatCard
            icon={<Repeat size={17} />}
            label="Hábitos na semana"
            value={habitSlots > 0 ? `${habitDone} / ${habitSlots}` : "—"}
            tone="green"
            pct={habitSlots > 0 ? (habitDone / habitSlots) * 100 : undefined}
            caption={habitSlots > 0 ? "check-ins feitos / possíveis" : "nenhum hábito ativo"}
          />
          <RPGStatCard icon={<Target size={17} />} label="Metas e acadêmico" value={String(goalsAndAcademic)} tone="gold" caption="prazos na semana" />
        </div>

        {/* Celular: um dia por bloco, em lista. Tablet: rolagem lateral com ~3 dias. Desktop largo: 7 colunas. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:snap-x sm:pb-2 xl:grid xl:grid-cols-7 xl:overflow-visible">
          {weekDays.map((d, i) => {
            const iso = toISODate(d);
            const isToday = iso === todayIso;
            const dayItems = itemsByDay.get(iso) ?? [];
            const dayTasks = dayItems.filter((it) => it.sourceType === "task").length;
            return (
              <section
                key={iso}
                aria-label={`${WEEKDAYS_LONG[i]}, ${d.getUTCDate()}`}
                className={`rpg-panel ${isToday ? "rpg-panel-gold" : ""} p-2.5 sm:min-w-[220px] sm:snap-start lg:min-w-[200px] xl:min-w-0 flex flex-col`}
              >
                <header className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-pixel text-xs text-rpg-muted">{WEEKDAYS_LONG[i].slice(0, 3)}</p>
                    <p className={`font-pixel text-xl font-bold leading-none ${isToday ? "text-rpg-gold-light" : ""}`}>{d.getUTCDate()}</p>
                  </div>
                  <p className="text-[10px] text-rpg-muted text-right leading-tight">
                    {dayItems.length} {dayItems.length === 1 ? "item" : "itens"}
                    {dayTasks > 0 && <span className="block">{dayTasks} tarefa(s)</span>}
                  </p>
                </header>

                <div className="space-y-1 mb-2">
                  {dayItems.length === 0 && !eventsLoading && <p className="text-[11px] text-rpg-muted">Nada previsto</p>}
                  {dayItems.map((item) => {
                    const meta = SOURCE_RPG[item.sourceType];
                    const time = timeOf(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => item.link && navigate(item.link)}
                        disabled={!item.link}
                        className="w-full flex items-center gap-1.5 text-left text-[11px] hover:text-rpg-gold-light disabled:cursor-default"
                        title={`${meta.label}: ${item.title}`}
                      >
                        <span className={`w-2 h-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                        {time && <span className="font-pixel text-rpg-muted shrink-0">{time}</span>}
                        <span className="truncate">{item.title}</span>
                        <span className="sr-only">({meta.label})</span>
                      </button>
                    );
                  })}
                </div>

                {habits.length > 0 && (
                  <div className="pt-2 border-t border-rpg-border/70 space-y-1">
                    {habits.map((h) => {
                      const done = entriesByHabitId.get(h.id)?.has(iso) ?? false;
                      return (
                        <button
                          key={h.id}
                          onClick={() => checkIn({ id: h.id, entryDate: iso, count: done ? 0 : h.target_count })}
                          className="w-full flex items-center gap-1.5 text-left"
                          aria-pressed={done}
                          aria-label={`${h.name} em ${iso}: ${done ? "feito" : "não feito"}`}
                        >
                          <span className={`shrink-0 w-4 h-4 flex items-center justify-center border-2 ${done ? "bg-rpg-green border-rpg-green text-rpg-bg" : "border-rpg-border"}`} style={{ borderRadius: 3 }}>
                            {done && <Check size={10} strokeWidth={3} />}
                          </span>
                          <span className={`text-[11px] truncate ${done ? "text-rpg-muted line-through" : ""}`}>{h.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <Link to="/calendario" className="mt-auto pt-2 inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-rpg-purple hover:underline">
                  <Plus size={12} /> Adicionar
                </Link>
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] text-rpg-muted">
          {Object.values(SOURCE_RPG).map((m) => (
            <span key={m.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} /> {m.label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RPGPanel title="Próximos eventos" icon={<Clock size={14} />} actions={<Link to="/calendario" className="text-xs font-semibold text-rpg-purple hover:underline">Ver todos →</Link>}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nada mais previsto nesta semana.</p>
            ) : (
              <ul className="divide-y divide-rpg-border/50">
                {upcoming.map((item) => {
                  const start = new Date(item.startsAt.length <= 10 ? `${item.startsAt}T00:00:00` : item.startsAt);
                  const meta = SOURCE_RPG[item.sourceType];
                  return (
                    <li key={item.id} className="grid grid-cols-[64px_44px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-sm">
                      <span className="text-rpg-muted text-xs capitalize">{toISODate(start) === todayIso ? "Hoje" : start.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }).replace(".", "")}</span>
                      <span className="font-pixel text-xs text-rpg-muted">{timeOf(item) ?? "dia"}</span>
                      <span className="truncate">
                        {item.title} <span className="text-[10px] text-rpg-muted">· {meta.label}</span>
                      </span>
                      <span className="font-pixel text-[11px] px-1.5 py-0.5 border border-rpg-gold/50 bg-rpg-gold/10 text-rpg-gold-light" style={{ borderRadius: 2 }}>
                        {timeUntil(item, now)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </RPGPanel>

          <RPGPanel title="Semana em foco" icon={<Compass size={14} />} actions={<Link to="/direcao" className="text-xs font-semibold text-rpg-purple hover:underline">Ver direção →</Link>}>
            {focusGoals.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhuma meta ativa para o mês ou trimestre atual. Defina em Direção.</p>
            ) : (
              <ul className="space-y-3">
                {focusGoals.map((g) => (
                  <li key={g.id}>
                    <RPGProgressBar
                      tone="purple"
                      label={g.title}
                      value={g.progressPct ?? 0}
                      valueLabel={g.progressPct == null ? "sem progresso" : `${Math.round(g.progressPct)}%`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </RPGPanel>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-5 sm:px-4 md:px-8 md:py-8 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="font-display font-bold text-xl md:text-2xl tracking-tight capitalize truncate">{weekLabel}</p>
          <p className="text-xs md:text-sm text-slate mt-0.5">Prazos e hábitos da semana, dia a dia, num só lugar.</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button variant="secondary" onClick={() => changeWeek(-1)} aria-label="Semana anterior" className="!px-2.5 sm:!px-3.5">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" onClick={() => setMonday(mondayOf(today))} className="!px-2.5 sm:!px-3.5 text-xs sm:text-sm">
            Esta semana
          </Button>
          <Button variant="secondary" onClick={() => changeWeek(1)} aria-label="Próxima semana" className="!px-2.5 sm:!px-3.5">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 md:gap-3 overflow-x-auto pb-1">
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const isToday = iso === toISODate(today);
          const dayItems = itemsByDay.get(iso) ?? [];

          return (
            <Card key={iso} className={`min-w-[140px] p-2.5 md:p-3 ${isToday ? "border-brand-500 shadow-card" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10px] text-slate">{WEEKDAYS_LONG[i].slice(0, 3)}</p>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mt-0.5 ${
                      isToday ? "bg-gradient-to-r from-brand-500 to-signal text-white font-semibold" : ""
                    }`}
                  >
                    {d.getUTCDate()}
                  </span>
                </div>
              </div>

              <div className="space-y-1 min-h-[24px] mb-2.5">
                {dayItems.length === 0 && !eventsLoading && <p className="text-[10px] text-slate">Nada previsto</p>}
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => item.link && navigate(item.link)}
                    disabled={!item.link}
                    className={`w-full text-left block truncate text-[10px] px-1.5 py-1 rounded-md ${
                      item.sourceType === "task"
                        ? "bg-signal/15 text-signal-deep dark:text-signal"
                        : item.sourceType === "goal"
                          ? "bg-cat-purple/15 text-cat-purple dark:text-cat-purple-dark"
                          : item.sourceType === "academic_project"
                            ? "bg-cat-green/15 text-cat-green dark:text-cat-green-dark"
                            : "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                    }`}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                ))}
              </div>

              {habits.length > 0 && (
                <div className="pt-2 border-t border-paper-border dark:border-ink-border space-y-1">
                  {habits.map((h) => {
                    const done = entriesByHabitId.get(h.id)?.has(iso) ?? false;
                    return (
                      <button
                        key={h.id}
                        onClick={() => checkIn({ id: h.id, entryDate: iso, count: done ? 0 : h.target_count })}
                        className="w-full flex items-center gap-1.5 text-left"
                        title={h.name}
                      >
                        <span
                          className={`shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-colors ${
                            done ? "bg-growth border-growth text-white" : "border-paper-border dark:border-ink-border"
                          }`}
                        >
                          {done && <Check size={9} />}
                        </span>
                        <span className={`text-[10px] truncate ${done ? "text-slate line-through" : ""}`}>{h.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Evento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-signal" /> Tarefa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cat-purple" /> Meta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cat-green" /> Acadêmico
        </span>
      </div>
    </div>
  );
}
