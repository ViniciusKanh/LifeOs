import type { Client } from "@libsql/client";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { mondayKey, notifyFromAutomation } from "./automationService.js";
import { nextFreeSlot } from "./planningHubService.js";
import { getCalendarItems } from "./calendarAggregationService.js";

/**
 * Hábitos 3.0 — A Jornada da Disciplina (camada derivada).
 *
 * Fonte única: habits + habit_entries (check-ins idempotentes por dia) e
 * xp_events (recompensas já pagas por awardHabitCheckIn). Esta camada só
 * interpreta frequências, sequências e consistência — nunca concede XP.
 *
 * Regra de agenda: um hábito semanal/mensal não "falha" num dia em que não
 * estava previsto; ele é avaliado por ciclo (semana ou mês). Pausa congela.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export type Frequency = "daily" | "specific_days" | "times_per_week" | "weekly" | "monthly";
export interface HabitDef {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  frequency: Frequency;
  days: number[]; // 0 = domingo … 6 = sábado (só specific_days)
  timesPerCycle: number; // vezes por semana/mês nos hábitos por ciclo
  target: number;
  unit: string | null;
  priority: string | null;
  reminderTime: string | null;
  experimentId: string | null;
  autoSource: string | null;
  createdDay: string;
  pausedDay: string | null;
}

export class HabitsHubError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const isCycleHabit = (h: Pick<HabitDef, "frequency">) => h.frequency === "weekly" || h.frequency === "times_per_week" || h.frequency === "monthly";
export const cycleKey = (h: Pick<HabitDef, "frequency">, day: string) => (h.frequency === "monthly" ? day.slice(0, 7) : mondayKey(day));

/** O hábito existe (criado, não pausado) neste dia? */
export function isActiveOn(h: Pick<HabitDef, "createdDay" | "pausedDay">, day: string) {
  return day >= h.createdDay && (!h.pausedDay || day < h.pausedDay);
}

/** Previsto para o dia (só hábitos diários/dias específicos têm agenda diária). */
export function isScheduledOn(h: HabitDef, day: string): boolean {
  if (!isActiveOn(h, day)) return false;
  if (h.frequency === "daily") return true;
  if (h.frequency === "specific_days") return h.days.length ? h.days.includes(weekday(day)) : true;
  return false;
}

export function parseHabit(r: Row): HabitDef {
  let cfg: { days?: unknown; times?: unknown } = {};
  try {
    cfg = r.frequency_config ? (JSON.parse(String(r.frequency_config)) as typeof cfg) : {};
  } catch {
    cfg = {};
  }
  const freq = String(r.frequency ?? "daily") as Frequency;
  return {
    id: String(r.id),
    name: String(r.name),
    icon: r.icon == null ? null : String(r.icon),
    category: r.category == null ? null : String(r.category),
    frequency: freq,
    days: Array.isArray(cfg.days) ? cfg.days.map(Number).filter((d) => d >= 0 && d <= 6) : [],
    timesPerCycle: Math.max(1, Math.min(7, Number(cfg.times ?? 1) || 1)),
    target: Math.max(1, Number(r.target_count ?? 1)),
    unit: r.unit == null ? null : String(r.unit),
    priority: r.priority == null ? null : String(r.priority),
    reminderTime: r.reminder_time == null ? null : String(r.reminder_time),
    experimentId: r.experiment_id == null ? null : String(r.experiment_id),
    autoSource: r.auto_source == null ? null : String(r.auto_source),
    createdDay: String(r.created_at ?? "").slice(0, 10) || "2000-01-01",
    pausedDay: r.paused_at == null ? null : String(r.paused_at).slice(0, 10),
  };
}

/** Quantas vezes o hábito precisa ser cumprido no ciclo dele. */
const cycleNeed = (h: HabitDef) => (h.frequency === "times_per_week" ? h.timesPerCycle : 1);

/**
 * Sequência ciente da frequência: dias previstos seguidos (diário/dias
 * específicos) ou ciclos seguidos (semanal/mensal). O dia/ciclo atual ainda
 * em aberto não quebra a sequência.
 */
export function habitStreak(h: HabitDef, done: Set<string>, today: string): number {
  if (isCycleHabit(h)) {
    const perCycle = new Map<string, number>();
    for (const d of done) perCycle.set(cycleKey(h, d), (perCycle.get(cycleKey(h, d)) ?? 0) + 1);
    const step = (k: string) => (h.frequency === "monthly" ? shiftMonth(k, -1) : shiftDayKey(k, -7));
    let k = cycleKey(h, today);
    if ((perCycle.get(k) ?? 0) < cycleNeed(h)) k = step(k);
    let n = 0;
    while ((perCycle.get(k) ?? 0) >= cycleNeed(h)) {
      n++;
      k = step(k);
    }
    return n;
  }
  let d = today;
  if (!done.has(d)) d = shiftDayKey(d, -1);
  let n = 0;
  for (let guard = 0; guard < 800; guard++) {
    if (!isActiveOn(h, d) && d < h.createdDay) break;
    if (isScheduledOn(h, d)) {
      if (!done.has(d)) break;
      n++;
    }
    d = shiftDayKey(d, -1);
  }
  return n;
}

const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

/** Melhor sequência de dias previstos já registrada (hábitos com agenda diária). */
export function bestDailyStreak(h: HabitDef, done: Set<string>, today: string): number {
  if (isCycleHabit(h)) return habitStreak(h, done, today);
  let best = 0;
  let cur = 0;
  for (let d = h.createdDay; d <= today; d = shiftDayKey(d, 1)) {
    if (!isScheduledOn(h, d)) continue;
    if (done.has(d)) best = Math.max(best, ++cur);
    else if (d !== today) cur = 0;
  }
  return best;
}

/**
 * Consistência numa janela: ocorrências cumpridas ÷ ocorrências previstas.
 * Diários contam por dia previsto; semanais/mensais contam por ciclo encerrado
 * (o ciclo atual só entra se já foi cumprido — não pune o que ainda está em aberto).
 */
export function consistency(habits: HabitDef[], doneBy: Map<string, Set<string>>, from: string, today: string) {
  let expected = 0;
  let fulfilled = 0;
  for (const h of habits) {
    const done = doneBy.get(h.id) ?? new Set<string>();
    if (!isCycleHabit(h)) {
      for (let d = from; d <= today; d = shiftDayKey(d, 1)) {
        if (!isScheduledOn(h, d)) continue;
        if (d === today && !done.has(d)) continue;
        expected++;
        if (done.has(d)) fulfilled++;
      }
      continue;
    }
    const cycles = new Map<string, { n: number; open: boolean }>();
    for (let d = from; d <= today; d = shiftDayKey(d, 1)) {
      if (!isActiveOn(h, d)) continue;
      const k = cycleKey(h, d);
      const c = cycles.get(k) ?? { n: 0, open: k === cycleKey(h, today) };
      if (done.has(d)) c.n++;
      cycles.set(k, c);
    }
    for (const c of cycles.values()) {
      const need = cycleNeed(h);
      if (c.open && c.n < need) continue;
      expected += need;
      fulfilled += Math.min(c.n, need);
    }
  }
  return { expected, fulfilled, pct: expected ? Math.round((fulfilled / expected) * 100) : null };
}

async function loadHabits(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const [habits, entries] = await Promise.all([
    db.execute({ sql: "SELECT * FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT habit_id, entry_date, count, created_at FROM habit_entries WHERE owner_id = ? AND entry_date >= date(?, '-400 days')", args: [ownerId, today] }),
  ]);
  const defs = habits.rows.map((r) => parseHabit(r as Row));
  const target = new Map(defs.map((h) => [h.id, h.target]));
  const doneBy = new Map<string, Set<string>>();
  const countBy = new Map<string, Map<string, number>>();
  for (const e of entries.rows) {
    const id = String(e.habit_id);
    const day = String(e.entry_date);
    const c = Number(e.count);
    if (!countBy.has(id)) countBy.set(id, new Map());
    countBy.get(id)!.set(day, c);
    if (c >= (target.get(id) ?? 1)) {
      if (!doneBy.has(id)) doneBy.set(id, new Set());
      doneBy.get(id)!.add(day);
    }
  }
  return { tz, today, defs, doneBy, countBy, entries: entries.rows };
}

export async function getHabitsHub(db: Client, ownerId: string) {
  const { today, defs, doneBy, countBy, entries } = await loadHabits(db, ownerId);
  const [xp, claimed] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(xp), 0) AS total, COALESCE(SUM(CASE WHEN day_key = ? THEN xp ELSE 0 END), 0) AS today,
                   COALESCE(SUM(CASE WHEN day_key >= date(?, '-29 days') THEN xp ELSE 0 END), 0) AS d30
            FROM xp_events WHERE owner_id = ? AND source_type IN ('habit_entry', 'habit_streak')`,
      args: [today, today, ownerId],
    }),
    db.execute({ sql: "SELECT source_id FROM xp_events WHERE owner_id = ? AND source_type = 'habit_streak'", args: [ownerId] }),
  ]);
  const claimedSet = new Set(claimed.rows.map((r) => String(r.source_id)));
  const active = defs.filter((h) => !h.pausedDay || h.pausedDay > today);
  const empty = new Set<string>();

  const cards = defs.map((h) => {
    const done = doneBy.get(h.id) ?? empty;
    const cycleDone = isCycleHabit(h) ? [...done].filter((d) => cycleKey(h, d) === cycleKey(h, today)).length : 0;
    const scheduledToday = isCycleHabit(h) ? isActiveOn(h, today) && cycleDone < cycleNeed(h) : isScheduledOn(h, today);
    return {
      ...h,
      paused: !!h.pausedDay && h.pausedDay <= today,
      todayCount: countBy.get(h.id)?.get(today) ?? 0,
      doneToday: done.has(today),
      scheduledToday,
      cycle: isCycleHabit(h) ? { done: cycleDone, need: cycleNeed(h), label: h.frequency === "monthly" ? "neste mês" : "nesta semana" } : null,
      streak: habitStreak(h, done, today),
      bestStreak: bestDailyStreak(h, done, today),
      consistency30: consistency([h], doneBy, shiftDayKey(today, -29), today),
    };
  });

  // Ritual de hoje: tudo que está previsto hoje (diários do dia + ciclos ainda em aberto) e o que já foi cumprido.
  const ritualItems = cards.filter((c) => !c.paused && (c.scheduledToday || c.doneToday));
  const ritualDone = ritualItems.filter((c) => c.doneToday).length;

  // Próxima recompensa de sequência elegível (catálogo oficial; resgate único por hábito/marco).
  const daily = cards.filter((c) => !isCycleHabit(c) && !c.paused);
  const nextReward = daily
    .map((c) => {
      const m = GAMIFICATION_RULES.habitStreakMilestones.find((x) => !claimedSet.has(`${c.id}:${x.days}`) && x.days > c.streak);
      return m ? { habitId: c.id, habitName: c.name, days: m.days, missing: m.days - c.streak, xp: m.xp, coins: m.coins } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.missing - b.missing)[0] ?? null;

  const bestCurrent = [...daily].sort((a, b) => b.streak - a.streak)[0] ?? null;
  const milestones = GAMIFICATION_RULES.habitStreakMilestones.map((m) => ({
    ...m,
    reached: !!bestCurrent && bestCurrent.streak >= m.days,
    claimedCount: daily.filter((c) => claimedSet.has(`${c.id}:${m.days}`)).length,
  }));

  // Calendário de consistência: 42 dias (6 semanas), dia a dia.
  const start = shiftDayKey(mondayKey(today), -35);
  const calendar: Array<{ day: string; scheduled: number; done: number; paused: number; doneIds: string[]; future: boolean }> = [];
  for (let d = start; d <= shiftDayKey(mondayKey(today), 6); d = shiftDayKey(d, 1)) {
    const scheduled = defs.filter((h) => isScheduledOn(h, d)).length;
    const doneIds = defs.filter((h) => (doneBy.get(h.id) ?? empty).has(d)).map((h) => h.id);
    const paused = defs.filter((h) => h.pausedDay && d >= h.pausedDay && d >= h.createdDay).length;
    calendar.push({ day: d, scheduled, done: doneIds.length, paused, doneIds, future: d > today });
  }

  const c30 = consistency(active, doneBy, shiftDayKey(today, -29), today);
  const cPrev = consistency(active, doneBy, shiftDayKey(today, -59), shiftDayKey(today, -30));
  const cWeek = consistency(active, doneBy, mondayKey(today), today);

  // Horários de realização (check-ins manuais com hora gravada) — base da análise de sequência.
  const hours = new Array(24).fill(0) as number[];
  for (const e of entries) {
    const at = String(e.created_at ?? "");
    if (at.length >= 13) hours[Number(at.slice(11, 13))]!++;
  }

  return {
    today,
    indicators: {
      currentStreak: Math.max(0, ...daily.map((c) => c.streak)),
      bestStreak: Math.max(0, ...cards.map((c) => c.bestStreak)),
      doneToday: ritualDone,
      scheduledToday: ritualItems.length,
      active: active.length,
      paused: defs.length - active.length,
      consistency30: c30.pct,
      consistencyDeltaPts: c30.pct != null && cPrev.pct != null ? c30.pct - cPrev.pct : null,
      week: cWeek,
      xpToday: Number(xp.rows[0]?.today ?? 0),
      xp30: Number(xp.rows[0]?.d30 ?? 0),
      xpTotal: Number(xp.rows[0]?.total ?? 0),
    },
    ritual: { items: ritualItems.map((c) => ({ id: c.id, name: c.name, icon: c.icon, done: c.doneToday, count: c.todayCount, target: c.target, unit: c.unit })), done: ritualDone, total: ritualItems.length, nextReward },
    milestones,
    habits: cards,
    calendar,
    hoursUtc: hours,
  };
}

/** Missões dos hábitos: progresso real; a recompensa vem do Quadro de Avisos (quests). */
export function habitMissions(hub: Awaited<ReturnType<typeof getHabitsHub>>) {
  const week = hub.calendar.filter((c) => c.day >= mondayKey(hub.today) && c.day <= hub.today);
  const perfect = week.filter((c) => c.scheduled > 0 && c.done >= c.scheduled).length;
  return [
    { key: "h_ritual", title: "Concluir o ritual de hoje", current: hub.ritual.done, target: Math.max(1, hub.ritual.total), done: hub.ritual.total > 0 && hub.ritual.done >= hub.ritual.total },
    { key: "h_week_80", title: "Manter 80% de consistência nesta semana", current: hub.indicators.week.pct ?? 0, target: 80, done: (hub.indicators.week.pct ?? 0) >= 80 },
    { key: "h_perfect_days", title: "Dias perfeitos nesta semana", current: perfect, target: 5, done: perfect >= 5 },
  ];
}

export interface HabitMetaInput {
  frequency?: Frequency;
  days?: number[];
  timesPerCycle?: number;
  unit?: string | null;
  priority?: "Baixa" | "Média" | "Alta" | null;
  reminderTime?: string | null;
  experimentId?: string | null;
  paused?: boolean;
}

/** Atualiza frequência e metadados (nunca mexe em check-ins nem em XP já concedido). */
export async function updateHabitMeta(db: Client, ownerId: string, habitId: string, input: HabitMetaInput) {
  const r = await db.execute({ sql: "SELECT frequency_config, paused_at FROM habits WHERE id = ? AND owner_id = ?", args: [habitId, ownerId] });
  if (!r.rows.length) throw new HabitsHubError("Hábito não encontrado.", 404);
  if (input.experimentId) {
    const e = await db.execute({ sql: "SELECT 1 FROM personal_experiments WHERE id = ? AND owner_id = ?", args: [input.experimentId, ownerId] });
    if (!e.rows.length) throw new HabitsHubError("Experimento não encontrado.", 404);
  }
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  const put = (col: string, v: string | number | null) => (sets.push(`${col} = ?`), args.push(v));
  if (input.frequency) put("frequency", input.frequency);
  if (input.days !== undefined || input.timesPerCycle !== undefined) {
    put("frequency_config", JSON.stringify({ days: (input.days ?? []).filter((d) => d >= 0 && d <= 6), times: input.timesPerCycle ?? 1 }));
  }
  if (input.unit !== undefined) put("unit", input.unit?.slice(0, 20) || null);
  if (input.priority !== undefined) put("priority", input.priority);
  if (input.reminderTime !== undefined) put("reminder_time", input.reminderTime);
  if (input.experimentId !== undefined) put("experiment_id", input.experimentId);
  if (input.paused !== undefined) {
    const { today } = await userDayContext(db, ownerId);
    put("paused_at", input.paused ? (r.rows[0]!.paused_at ? String(r.rows[0]!.paused_at) : today) : null);
  }
  if (!sets.length) return;
  await db.execute({ sql: `UPDATE habits SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, habitId, ownerId] });
}

/** Detalhe de um dia do calendário: hábitos previstos e cumpridos. */
export async function habitsOnDay(db: Client, ownerId: string, day: string) {
  const { defs, doneBy, countBy } = await loadHabits(db, ownerId);
  return defs
    .filter((h) => isScheduledOn(h, day) || (doneBy.get(h.id)?.has(day) ?? false) || (isCycleHabit(h) && isActiveOn(h, day)))
    .map((h) => ({ id: h.id, name: h.name, icon: h.icon, scheduled: isScheduledOn(h, day), cycle: isCycleHabit(h), done: doneBy.get(h.id)?.has(day) ?? false, count: countBy.get(h.id)?.get(day) ?? 0, target: h.target, unit: h.unit }));
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

/** A · Lembrete do dia: hábitos previstos ainda pendentes (respeita pausa e frequência). */
export async function runHabitReminders(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getHabitsHub(db, ownerId);
  const pending = hub.ritual.items.filter((i) => !i.done);
  if (!pending.length) return { status: "skipped", summary: "Nenhum hábito pendente hoje." };
  const withTime = hub.habits.filter((h) => pending.some((p) => p.id === h.id) && h.reminderTime).map((h) => `${h.name} às ${h.reminderTime}`);
  await notifyFromAutomation(db, ownerId, {
    eventType: "habits_reminder",
    title: "🔥 Ritual de hoje",
    body: `${pending.length} hábito(s) previsto(s): ${(withTime.length ? withTime : pending.map((p) => p.name)).slice(0, 4).join(", ")}.`,
    url: "/habitos",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: `${pending.length} hábito(s) lembrado(s).` };
}

/** D · Análise de sequência (semanal): tendência de consistência e horário mais frequente. */
export async function runStreakAnalysis(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getHabitsHub(db, ownerId);
  const i = hub.indicators;
  if (i.consistency30 == null) return { status: "skipped", summary: "Sem hábitos previstos no período." };
  const peak = hub.hoursUtc.indexOf(Math.max(...hub.hoursUtc));
  const trend = i.consistencyDeltaPts == null ? "" : i.consistencyDeltaPts >= 0 ? ` (+${i.consistencyDeltaPts} pts vs. 30 dias anteriores)` : ` (${i.consistencyDeltaPts} pts vs. 30 dias anteriores)`;
  const body = `Consistência de 30 dias: ${i.consistency30}%${trend}. Maior sequência ativa: ${i.currentStreak} dia(s).${Math.max(...hub.hoursUtc) > 0 ? ` Horário mais comum dos registros: ~${peak}h UTC.` : ""}`;
  await notifyFromAutomation(db, ownerId, { eventType: "habits_analysis", title: "📈 Análise da disciplina", body, url: "/habitos?aba=analise", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** F · Revisão semanal: semana anterior, interrupções e evolução. */
export async function runHabitWeeklyReview(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today, defs, doneBy } = await loadHabits(db, ownerId);
  const lastMon = shiftDayKey(mondayKey(today), -7);
  const c = consistency(defs, doneBy, lastMon, shiftDayKey(lastMon, 6));
  if (!c.expected) return { status: "skipped", summary: "Nenhum hábito previsto na semana passada." };
  const body = `Semana passada: ${c.fulfilled} de ${c.expected} ocorrências cumpridas (${c.pct}%).`;
  await notifyFromAutomation(db, ownerId, { eventType: "habits_weekly", title: "🗓️ Revisão semanal dos hábitos", body, url: "/habitos", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** E · Planejamento: sugere horários livres de hoje na Agenda (só sugestão, nada é agendado). */
export async function suggestHabitSlots(db: Client, ownerId: string) {
  const hub = await getHabitsHub(db, ownerId);
  const pending = hub.ritual.items.filter((i) => !i.done);
  const items = await getCalendarItems(db, ownerId, hub.today, hub.today);
  const busy = items
    .filter((i) => !i.allDay && i.startsAt.length > 10)
    .map((i) => {
      const s = Number(i.startsAt.slice(11, 13)) * 60 + Number(i.startsAt.slice(14, 16));
      const e = i.endsAt && i.endsAt.length > 10 ? Number(i.endsAt.slice(11, 13)) * 60 + Number(i.endsAt.slice(14, 16)) : s + 60;
      return { start: s, end: e };
    });
  const now = new Date();
  let from = Math.max(7 * 60, now.getHours() * 60 + now.getMinutes());
  const out: Array<{ habitId: string; name: string; at: string | null }> = [];
  for (const p of pending.slice(0, 6)) {
    const slot = nextFreeSlot(busy, 20, from);
    out.push({ habitId: p.id, name: p.name, at: slot == null ? null : `${String(Math.floor(slot / 60)).padStart(2, "0")}:${String(slot % 60).padStart(2, "0")}` });
    if (slot != null) {
      busy.push({ start: slot, end: slot + 20 });
      from = slot + 20;
    }
  }
  return { day: hub.today, suggestions: out, basis: `${busy.length} compromisso(s) com horário considerados na Agenda de hoje.` };
}
