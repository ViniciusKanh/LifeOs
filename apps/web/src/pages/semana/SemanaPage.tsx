import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
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
