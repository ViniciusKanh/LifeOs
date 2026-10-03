import type { TimelineEvent } from "@/types";

/**
 * Métricas derivadas da Timeline — sempre dos eventos reais carregados,
 * compartilhadas entre a visão clássica e a visão RPG.
 */

export function eventDay(e: TimelineEvent): string {
  return String(e.at).slice(0, 10);
}

/** Converte o "at" do SQLite (UTC sem fuso) ou ISO em Date. */
export function parseEventDate(at: string): Date {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
}

export function groupByDay(events: TimelineEvent[], asc: boolean) {
  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const day = eventDay(e);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  const days = [...byDay.keys()].sort((a, b) => (asc ? a.localeCompare(b) : b.localeCompare(a)));
  return { byDay, days };
}

export function categoryCounts(events: TimelineEvent[]) {
  const counts = new Map<TimelineEvent["type"], number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

/** Dia mais ativo, horário mais frequente, maior sequência de hábito e último estudo. */
export function timelineHighlights(events: TimelineEvent[]) {
  if (events.length === 0) return null;
  const perDay = new Map<string, number>();
  const perHour = new Map<number, number>();
  for (const e of events) {
    const day = eventDay(e);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    const d = parseEventDate(String(e.at));
    if (!Number.isNaN(d.getTime())) perHour.set(d.getUTCHours(), (perHour.get(d.getUTCHours()) ?? 0) + 1);
  }
  let mostActiveDay: string | null = null;
  for (const [day, count] of perDay.entries()) if (!mostActiveDay || count > perDay.get(mostActiveDay)!) mostActiveDay = day;
  let bestHour: number | null = null;
  for (const [hour, count] of perHour.entries()) if (bestHour === null || count > perHour.get(bestHour)!) bestHour = hour;

  // Maior sequência: dias consecutivos com check-in do mesmo hábito, dentro do período.
  const habitDates = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "habit") continue;
    const set = habitDates.get(e.label) ?? new Set<string>();
    set.add(eventDay(e));
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
  return {
    mostActiveDay,
    mostActiveCount: mostActiveDay ? perDay.get(mostActiveDay)! : 0,
    bestHour,
    bestStreakHabit,
    lastStudyDay: studyEvents[0] ? eventDay(studyEvents[0]) : null,
    tasksDone: events.filter((e) => e.type === "task").length,
    habitsDone: events.filter((e) => e.type === "habit").length,
  };
}
