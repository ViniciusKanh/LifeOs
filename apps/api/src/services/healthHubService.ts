import type { Client } from "@libsql/client";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { automationConfig, mondayKey, notifyFromAutomation, readAutomationState, writeAutomationState } from "./automationService.js";

/**
 * Atributos do Personagem — camada RPG da Saúde.
 *
 * Gamificação de CONSISTÊNCIA de autocuidado, não diagnóstico: as regras
 * contam dias com registro e faixas prudentes (ex.: sono entre 6h e 10h,
 * água até a meta). Não há bônus por exagero — passar da meta vale 100%,
 * nunca mais que isso. Nenhuma condição de saúde é inferida.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

/** Uma "noite" com mais que isso é tratada como registro inconsistente (data errada, duplicado...). */
export const MAX_SLEEP_MINUTES = 16 * 60;
export const BALANCED_SLEEP = { min: 6 * 60, max: 10 * 60 };
export const MOVE_REFERENCE_MINUTES = 30;

export interface SleepEntryLike {
  id: string;
  bed: string;
  wake: string;
  quality: number | null;
}

export interface SleepNight {
  /** Dia local em que a pessoa ACORDOU — a noite de 22h→06h pertence ao dia do despertar. */
  day: string;
  minutes: number;
  quality: number | null;
  entryIds: string[];
  /** true quando havia registros sobrepostos no mesmo dia (contados uma vez só). */
  merged: boolean;
}

const ms = (v: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}Z`);

/**
 * Agrega registros de sono em noites. Corrige o bug de "32h de sono":
 * antes a semana SOMAVA todos os registros do dia (duplicados, cochilos
 * sobrepostos e registros com data errada). Agora:
 *  - registros com duração ≤ 0 ou > 16h ficam de fora e são sinalizados;
 *  - por dia do despertar, os intervalos são UNIDOS (sobreposição não conta duas vezes);
 *  - meia-noite e fuso: o dia vem do despertar no fuso do usuário.
 */
export function aggregateSleep(entries: SleepEntryLike[], tz: string): { nights: SleepNight[]; inconsistent: Array<{ id: string; minutes: number; reason: string }> } {
  const inconsistent: Array<{ id: string; minutes: number; reason: string }> = [];
  const byDay = new Map<string, Array<{ s: number; e: number; id: string; q: number | null }>>();
  for (const en of entries) {
    const s = ms(en.bed);
    const e = ms(en.wake);
    const minutes = Math.round((e - s) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      inconsistent.push({ id: en.id, minutes: Number.isFinite(minutes) ? minutes : 0, reason: "acordar antes de dormir" });
      continue;
    }
    if (minutes > MAX_SLEEP_MINUTES) {
      inconsistent.push({ id: en.id, minutes, reason: "mais de 16h — confira as datas" });
      continue;
    }
    const day = localDayOfStored(new Date(e).toISOString(), tz);
    byDay.set(day, [...(byDay.get(day) ?? []), { s, e, id: en.id, q: en.quality }]);
  }
  const nights: SleepNight[] = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.s - b.s);
    let total = 0;
    let curS = list[0]!.s;
    let curE = list[0]!.e;
    let merged = false;
    for (const it of list.slice(1)) {
      if (it.s < curE) {
        merged = true;
        curE = Math.max(curE, it.e);
      } else {
        total += curE - curS;
        curS = it.s;
        curE = it.e;
      }
    }
    total += curE - curS;
    const qs = list.map((x) => x.q).filter((q): q is number => q != null);
    nights.push({
      day,
      minutes: Math.min(MAX_SLEEP_MINUTES, Math.round(total / 60000)),
      quality: qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 10) / 10 : null,
      entryIds: list.map((x) => x.id),
      merged,
    });
  }
  nights.sort((a, b) => b.day.localeCompare(a.day));
  return { nights, inconsistent };
}

/** Valida uma noite antes de gravar (rota POST/PATCH). Devolve a mensagem de erro ou null. */
export async function sleepWriteProblem(db: Client, ownerId: string, bed: string, wake: string, excludeId?: string): Promise<string | null> {
  const s = ms(bed);
  const e = ms(wake);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "O horário de acordar precisa ser depois do horário em que você dormiu.";
  if ((e - s) / 60000 > MAX_SLEEP_MINUTES) return "Uma noite de sono não pode passar de 16 horas — confira as datas de dormir e acordar.";
  const r = await db.execute({ sql: "SELECT id, went_to_bed_at, woke_up_at FROM sleep_entries WHERE owner_id = ? ORDER BY went_to_bed_at DESC LIMIT 120", args: [ownerId] });
  for (const row of r.rows as unknown as Row[]) {
    if (excludeId && String(row.id) === excludeId) continue;
    const os = ms(String(row.went_to_bed_at));
    const oe = ms(String(row.woke_up_at));
    if (Number.isFinite(os) && Number.isFinite(oe) && s < oe && e > os) return "Já existe uma noite registrada que se sobrepõe a esse horário. Edite o registro existente em vez de criar outro.";
  }
  return null;
}

export const HEALTH_RANKS = [
  { min: 0, title: "Iniciante" },
  { min: 150, title: "Aprendiz da Vitalidade" },
  { min: 350, title: "Guardião do Equilíbrio" },
  { min: 600, title: "Campeão da Vitalidade" },
  { min: 850, title: "Lenda da Vitalidade" },
] as const;

export function healthRank(points: number) {
  let idx = 0;
  for (let i = 0; i < HEALTH_RANKS.length; i++) if (points >= HEALTH_RANKS[i]!.min) idx = i;
  const cur = HEALTH_RANKS[idx]!;
  const next = HEALTH_RANKS[idx + 1] ?? null;
  return { level: idx + 1, title: cur.title, points, currentMin: cur.min, next: next ? { title: next.title, min: next.min } : null, pct: next ? Math.round(((points - cur.min) / (next.min - cur.min)) * 100) : 100 };
}

const pct = (v: number, goal: number) => (goal > 0 ? Math.max(0, Math.min(100, Math.round((v / goal) * 100))) : 0);

export interface HealthGoals {
  waterGoalMl: number;
  sleepGoalMinutes: number;
  weeklyWorkouts: number;
}

export async function healthGoals(db: Client, ownerId: string): Promise<HealthGoals> {
  const c = (await automationConfig(db, ownerId, "health", "health_goals")).config;
  return { waterGoalMl: Number(c.waterGoalMl ?? 2500), sleepGoalMinutes: Number(c.sleepGoalMinutes ?? 480), weeklyWorkouts: Number(c.weeklyWorkouts ?? 3) };
}

interface DayData {
  water: Map<string, number>;
  nights: Map<string, SleepNight>;
  moveMin: Map<string, number>;
  moveCount: Map<string, number>;
  mood: Map<string, { mood: number; energy: number; stress: number | null; n: number }>;
  inconsistent: Array<{ id: string; minutes: number; reason: string }>;
  allNights: SleepNight[];
}

async function loadDays(db: Client, ownerId: string, tz: string, fromDay: string): Promise<DayData> {
  // Margem de 1 dia antes do período: o fuso pode deslocar registros perto da meia-noite.
  const since = `${shiftDayKey(fromDay, -1)}`;
  const [w, s, wo, m] = await Promise.all([
    db.execute({ sql: "SELECT recorded_at, amount_ml FROM water_entries WHERE owner_id = ? AND recorded_at >= ?", args: [ownerId, since] }),
    db.execute({ sql: "SELECT id, went_to_bed_at, woke_up_at, quality FROM sleep_entries WHERE owner_id = ? AND woke_up_at >= ?", args: [ownerId, since] }),
    db.execute({ sql: "SELECT performed_at, duration_minutes FROM workouts WHERE owner_id = ? AND performed_at >= ?", args: [ownerId, since] }),
    db.execute({ sql: "SELECT recorded_at, mood, energy, stress FROM mood_entries WHERE owner_id = ? AND recorded_at >= ?", args: [ownerId, since] }),
  ]);
  const water = new Map<string, number>();
  for (const r of w.rows as unknown as Row[]) {
    const d = localDayOfStored(String(r.recorded_at), tz);
    water.set(d, (water.get(d) ?? 0) + Number(r.amount_ml ?? 0));
  }
  const { nights, inconsistent } = aggregateSleep(
    (s.rows as unknown as Row[]).map((r) => ({ id: String(r.id), bed: String(r.went_to_bed_at), wake: String(r.woke_up_at), quality: r.quality == null ? null : Number(r.quality) })),
    tz,
  );
  const moveMin = new Map<string, number>();
  const moveCount = new Map<string, number>();
  for (const r of wo.rows as unknown as Row[]) {
    const d = localDayOfStored(String(r.performed_at), tz);
    moveMin.set(d, (moveMin.get(d) ?? 0) + Number(r.duration_minutes ?? 0));
    moveCount.set(d, (moveCount.get(d) ?? 0) + 1);
  }
  const mood = new Map<string, { mood: number; energy: number; stress: number | null; n: number }>();
  for (const r of m.rows as unknown as Row[]) {
    const d = localDayOfStored(String(r.recorded_at), tz);
    const cur = mood.get(d) ?? { mood: 0, energy: 0, stress: null, n: 0 };
    cur.mood += Number(r.mood);
    cur.energy += Number(r.energy);
    if (r.stress != null) cur.stress = (cur.stress ?? 0) + Number(r.stress);
    cur.n++;
    mood.set(d, cur);
  }
  return { water, nights: new Map(nights.map((n) => [n.day, n])), moveMin, moveCount, mood, inconsistent, allNights: nights };
}

function pillarsFor(day: string, d: DayData, g: HealthGoals) {
  const water = d.water.get(day) ?? null;
  const night = d.nights.get(day) ?? null;
  const move = d.moveMin.get(day) ?? null;
  const mood = d.mood.get(day) ?? null;
  return {
    water: { value: water, score: water == null ? null : pct(water, g.waterGoalMl) },
    sleep: { value: night?.minutes ?? null, quality: night?.quality ?? null, score: night ? pct(night.minutes, g.sleepGoalMinutes) : null },
    move: { value: move, sessions: d.moveCount.get(day) ?? 0, score: move == null ? null : pct(move, MOVE_REFERENCE_MINUTES) },
    mood: {
      value: mood ? Math.round((mood.mood / mood.n) * 10) / 10 : null,
      energy: mood ? Math.round((mood.energy / mood.n) * 10) / 10 : null,
      stress: mood && mood.stress != null ? Math.round((mood.stress / mood.n) * 10) / 10 : null,
      // Conta o check-in, não o humor: um dia difícil registrado vale tanto quanto um bom.
      score: mood ? 100 : null,
    },
  };
}

export async function getHealthHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -27);
  const [g, d, hist] = await Promise.all([healthGoals(db, ownerId), loadDays(db, ownerId, tz, from), readAutomationState(db, ownerId, "health", "consistency_history")]);

  const todayP = pillarsFor(today, d, g);
  const scores = [todayP.water.score, todayP.sleep.score, todayP.move.score, todayP.mood.score].map((x) => x ?? 0);
  const vitality = Math.round(scores.reduce((a, b) => a + b, 0) / 4);

  const pulse = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDayKey(today, i - 6);
    const p = pillarsFor(day, d, g);
    return { day, water: p.water.score, sleep: p.sleep.score, move: p.move.score, mood: p.mood.score };
  });

  // Rank: pontos de consistência nos últimos 28 dias (regras exibidas na UI).
  let waterDays = 0;
  let balancedNights = 0;
  let moodDays = 0;
  const workoutDaysByWeek = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const day = shiftDayKey(from, i);
    if ((d.water.get(day) ?? 0) >= g.waterGoalMl * 0.5) waterDays++;
    const n = d.nights.get(day);
    if (n && n.minutes >= BALANCED_SLEEP.min && n.minutes <= BALANCED_SLEEP.max) balancedNights++;
    if (d.mood.has(day)) moodDays++;
    if (d.moveCount.has(day)) workoutDaysByWeek.set(mondayKey(day), (workoutDaysByWeek.get(mondayKey(day)) ?? 0) + 1);
  }
  // Até 6 dias de treino por semana contam — descanso também faz parte.
  const workoutDays = [...workoutDaysByWeek.values()].reduce((a, n) => a + Math.min(6, n), 0);
  const points = waterDays * 10 + balancedNights * 10 + workoutDays * 15 + moodDays * 5;

  const week = Array.from({ length: 7 }, (_, i) => shiftDayKey(today, i - 6));
  const weekNights = week.map((day) => d.nights.get(day)).filter((n): n is SleepNight => !!n);
  const weekSleepTotal = weekNights.reduce((a, n) => a + n.minutes, 0);
  const lastNight = d.allNights[0] ?? null;
  const weekWorkouts = week.reduce((a, day) => a + (d.moveCount.get(day) ?? 0), 0);
  const weekMoveMinutes = week.reduce((a, day) => a + (d.moveMin.get(day) ?? 0), 0);
  const weekWaterDays = week.filter((day) => (d.water.get(day) ?? 0) >= g.waterGoalMl).length;

  const missions = [
    { key: "water", title: "Hidratação do dia", description: `Chegar a ${g.waterGoalMl} ml (passar da meta não vale mais).`, current: Math.min(todayP.water.value ?? 0, g.waterGoalMl), target: g.waterGoalMl, done: (todayP.water.value ?? 0) >= g.waterGoalMl },
    { key: "sleep", title: "Registrar a noite", description: "Registrar como foi o sono de hoje.", current: todayP.sleep.value != null ? 1 : 0, target: 1, done: todayP.sleep.value != null },
    { key: "move", title: "Mover o corpo", description: `${MOVE_REFERENCE_MINUTES} min de movimento — qualquer modalidade.`, current: Math.min(todayP.move.value ?? 0, MOVE_REFERENCE_MINUTES), target: MOVE_REFERENCE_MINUTES, done: (todayP.move.value ?? 0) >= MOVE_REFERENCE_MINUTES },
    { key: "mood", title: "Check-in de humor", description: "Registrar humor e energia (sem certo ou errado).", current: todayP.mood.score ? 1 : 0, target: 1, done: !!todayP.mood.score },
    { key: "weekly", title: "Ritmo da semana", description: `${g.weeklyWorkouts} treino(s) nos últimos 7 dias.`, current: Math.min(weekWorkouts, g.weeklyWorkouts), target: g.weeklyWorkouts, done: weekWorkouts >= g.weeklyWorkouts },
  ];

  return {
    today,
    goals: g,
    vitality: { score: vitality, pillars: todayP },
    pulse,
    rank: healthRank(points),
    rankBreakdown: { waterDays, balancedNights, workoutDays, moodDays },
    sleep: {
      lastNight,
      weekTotalMinutes: weekSleepTotal,
      weekNights: weekNights.length,
      weekAvgMinutes: weekNights.length ? Math.round(weekSleepTotal / weekNights.length) : null,
      inconsistent: d.inconsistent,
      nights: d.allNights.slice(0, 14),
    },
    week: { workouts: weekWorkouts, moveMinutes: weekMoveMinutes, waterDaysAtGoal: weekWaterDays },
    missions,
    consistencyHistory: (Array.isArray(hist.history) ? hist.history : []) as Array<{ week: string; water: number; sleep: number; move: number; mood: number }>,
  };
}

// ------------------------------------------------------------
// Automações
// ------------------------------------------------------------

async function yesterdayPillars(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const y = shiftDayKey(today, -1);
  const [g, d] = await Promise.all([healthGoals(db, ownerId), loadDays(db, ownerId, tz, y)]);
  return { y, g, p: pillarsFor(y, d, g), d };
}

const hm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

export async function runHydration(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { g, p } = await yesterdayPillars(db, ownerId);
  const body = p.water.value ? `Ontem: ${p.water.value} ml (${p.water.score}% da meta). Meta de hoje: ${g.waterGoalMl} ml, aos poucos ao longo do dia.` : `Ontem ficou sem registro de água. Meta de hoje: ${g.waterGoalMl} ml.`;
  await notifyFromAutomation(db, ownerId, { eventType: "health_water", title: "Hidratação", body, url: "/saude", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export async function runSleepRoutine(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { d } = await yesterdayPillars(db, ownerId);
  const last = d.allNights[0];
  const body = `Seu ritual noturno começa às ${Number(config.bedtimeHour ?? 23)}h.${last ? ` Última noite registrada: ${hm(last.minutes)}.` : ""}`;
  await notifyFromAutomation(db, ownerId, { eventType: "health_sleep", title: "Rotina de sono", body, url: "/saude", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export async function runMoodCheckin(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { p } = await yesterdayPillars(db, ownerId);
  if (p.mood.score) return { status: "skipped", summary: "Check-in de ontem já registrado." };
  await notifyFromAutomation(db, ownerId, { eventType: "health_mood", title: "Check-in de humor", body: "Como estão seu humor e sua energia hoje? Leva 10 segundos.", url: "/saude", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: "Convite de check-in enviado (ontem ficou sem registro)." };
}

export async function runDailySummary(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { p } = await yesterdayPillars(db, ownerId);
  const parts = [
    p.water.value ? `água ${p.water.value} ml` : "água sem registro",
    p.sleep.value ? `sono ${hm(p.sleep.value)}` : "sono sem registro",
    p.move.value ? `movimento ${p.move.value} min` : "sem treino",
    p.mood.value ? `humor ${p.mood.value}/5 · energia ${p.mood.energy}/5` : "humor sem registro",
  ];
  const body = `Ontem: ${parts.join(" · ")}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "health_summary", title: "Resumo de vitalidade", body, url: "/saude", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** F: grava a consistência da última semana completa (idempotente: a semana é a chave). */
export async function runConsistencyHistory(db: Client, ownerId: string): Promise<Outcome> {
  const { tz, today } = await userDayContext(db, ownerId);
  const week = shiftDayKey(mondayKey(today), -7);
  const [g, d, state] = await Promise.all([healthGoals(db, ownerId), loadDays(db, ownerId, tz, week), readAutomationState(db, ownerId, "health", "consistency_history")]);
  const days = Array.from({ length: 7 }, (_, i) => shiftDayKey(week, i));
  const entry = {
    week,
    water: days.filter((x) => (d.water.get(x) ?? 0) >= g.waterGoalMl * 0.5).length,
    sleep: days.filter((x) => d.nights.has(x)).length,
    move: days.filter((x) => d.moveCount.has(x)).length,
    mood: days.filter((x) => d.mood.has(x)).length,
  };
  const prev = (Array.isArray(state.history) ? state.history : []) as Array<typeof entry>;
  const history = [entry, ...prev.filter((h) => h.week !== week)].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 12);
  await writeAutomationState(db, ownerId, "health", "consistency_history", { history });
  return { status: "ok", summary: `Semana de ${week}: água ${entry.water}/7, sono ${entry.sleep}/7, movimento ${entry.move}/7, humor ${entry.mood}/7.` };
}
