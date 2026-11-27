import type { Client } from "@libsql/client";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { getCalendarItems } from "./calendarAggregationService.js";
import { notifyFromAutomation } from "./automationService.js";
import { award } from "./gamificationService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { findConflicts } from "./planningHubService.js";
import { getTavernSummary } from "./tavernService.js";
import { getTodayHub } from "./todayHubService.js";
import { predictionsFor } from "./forgeService.js";
import { insertManualEvent } from "./eventWriteService.js";
import { queueSuggestions } from "./grimoireHubService.js";

/**
 * Taverna 3.0 — ritual de fim do dia (camada derivada).
 *
 * Fontes oficiais: Hoje (XP, moedas, missões, hábitos, foco, Life Score),
 * life_scores (comparação), Saúde (humor via /health/mood), Agenda,
 * Missões e Forja (previsões de modelos ATIVOS). O ritual guarda as notas
 * próprias da Taverna e as etapas. A recompensa de encerramento é idempotente por dia.
 */

export class Tavern3Error extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const STEPS = ["balance", "reflection", "learnings", "gratitude", "tomorrow"] as const;
export type StepKey = (typeof STEPS)[number];
const DEFAULT_REQUIRED: StepKey[] = ["balance", "reflection", "tomorrow"];

type Row = Record<string, unknown>;
const J = <T>(v: unknown, fb: T): T => {
  try {
    return v == null ? fb : (JSON.parse(String(v)) as T);
  } catch {
    return fb;
  }
};
const DIMS = ["productivity", "health", "habits", "goals", "reading", "education", "professional"] as const;

function parseRitual(r: Row | undefined, day: string) {
  return {
    day,
    steps: J<StepKey[]>(r?.steps_json, []).filter((s) => (STEPS as readonly string[]).includes(s)),
    highlights: r?.highlights ? String(r.highlights) : "",
    challenges: r?.challenges ? String(r.challenges) : "",
    decisions: r?.decisions ? String(r.decisions) : "",
    learned: r?.learned ? String(r.learned) : "",
    worked: r?.worked ? String(r.worked) : "",
    improve: r?.improve ? String(r.improve) : "",
    repeatThis: r?.repeat_this ? String(r.repeat_this) : "",
    avoidTomorrow: r?.avoid_tomorrow ? String(r.avoid_tomorrow) : "",
    selfCare: r?.self_care ? String(r.self_care) : "",
    priorities: J<string[]>(r?.priorities_json, []),
    tomorrowTaskId: r?.tomorrow_task_id ? String(r.tomorrow_task_id) : null,
    completedAt: r?.completed_at ? String(r.completed_at) : null,
    reward: { xp: Number(r?.reward_xp ?? 0), coins: Number(r?.reward_coins ?? 0) },
    snapshot: J<Record<string, unknown> | null>(r?.snapshot_json, null),
    updatedAt: r?.updated_at ? String(r.updated_at) : null,
  };
}

async function settingsOf(db: Client, ownerId: string): Promise<StepKey[]> {
  const r = await db.execute({ sql: "SELECT required_steps_json FROM tavern_settings WHERE owner_id = ?", args: [ownerId] });
  const req = J<StepKey[]>(r.rows[0]?.required_steps_json, DEFAULT_REQUIRED).filter((s) => (STEPS as readonly string[]).includes(s));
  return req.length ? req : DEFAULT_REQUIRED;
}

/** Janelas livres de 50 min entre 08:00 e 20:00 num dia, a partir da agenda real. */
export function freeWindows(busy: Array<{ start: number; end: number }>, count = 3, duration = 50) {
  const out: Array<{ start: string; end: string }> = [];
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  let from = 8 * 60;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (const b of [...sorted, { start: 20 * 60, end: 20 * 60 }]) {
    while (b.start - from >= duration && out.length < count) {
      out.push({ start: fmt(from), end: fmt(from + duration) });
      from += duration + 10;
    }
    from = Math.max(from, b.end);
    if (out.length >= count) break;
  }
  return out;
}

const minutesOf = (iso: string) => (iso.length > 10 ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null);

/** Observações estatísticas dos últimos 28 dias (com os dados usados em cada uma). */
async function tavernInsights(db: Client, ownerId: string, today: string, tz: string) {
  const from = shiftDayKey(today, -28);
  const [tasks, habits] = await Promise.all([
    db.execute({ sql: "SELECT completed_at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at >= ? AND habit_id IS NULL", args: [ownerId, from] }),
    db.execute({ sql: "SELECT entry_date FROM habit_entries WHERE owner_id = ? AND entry_date >= ?", args: [ownerId, from] }),
  ]);
  const out: Array<{ kind: "observacao"; title: string; text: string; data: string }> = [];
  const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const byWd = new Array<number>(7).fill(0);
  const byBand = { manhã: 0, tarde: 0, noite: 0 } as Record<string, number>;
  for (const r of tasks.rows) {
    const stored = String(r.completed_at);
    const d = localDayOfStored(stored, tz);
    byWd[new Date(`${d}T12:00:00Z`).getUTCDay()]!++;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(stored.includes("T") ? stored : `${stored.replace(" ", "T")}Z`)));
    byBand[hour < 12 ? "manhã" : hour < 18 ? "tarde" : "noite"]!++;
  }
  if (tasks.rows.length >= 10) {
    const best = byWd.indexOf(Math.max(...byWd));
    out.push({ kind: "observacao", title: "Dia mais produtivo", text: `Nas últimas 4 semanas, ${WD[best]} concentrou mais missões concluídas (${byWd[best]}).`, data: `${tasks.rows.length} missões concluídas entre ${from} e ${today}.` });
    const band = Object.entries(byBand).sort((a, b) => b[1] - a[1])[0]!;
    out.push({ kind: "observacao", title: "Horário de maior execução", text: `${Math.round((band[1] / tasks.rows.length) * 100)}% das missões foram concluídas à ${band[0]}.`, data: `Horário local da conclusão de ${tasks.rows.length} missões.` });
  }
  const hDays = new Set(habits.rows.map((r) => String(r.entry_date)));
  const last14 = Array.from({ length: 14 }, (_, i) => shiftDayKey(today, -i - 1)).filter((d) => hDays.has(d)).length;
  const prev14 = Array.from({ length: 14 }, (_, i) => shiftDayKey(today, -i - 15)).filter((d) => hDays.has(d)).length;
  if (last14 + prev14 >= 6) out.push({ kind: "observacao", title: "Frequência de hábitos", text: `${last14} dia(s) com hábito nos últimos 14 dias × ${prev14} nos 14 anteriores.`, data: "Dias com ao menos um check-in de hábito." });
  return out;
}

export async function getTavern3(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const tomorrow = shiftDayKey(today, 1);
  const [hub, legacy, ritualR, required, lifeR, achR, agenda, insights, forecasts, historyR] = await Promise.all([
    getTodayHub(db, ownerId),
    getTavernSummary(db, ownerId),
    db.execute({ sql: "SELECT * FROM tavern_rituals WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] }),
    settingsOf(db, ownerId),
    db.execute({ sql: "SELECT score_date, overall_score, productivity, health, habits, goals, reading, education, professional FROM life_scores WHERE owner_id = ? AND score_date >= ? AND score_date < ?", args: [ownerId, shiftDayKey(today, -7), today] }),
    db.execute({
      sql: `SELECT a.id, a.code, a.title, a.description, a.icon, a.tier, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND ua.unlocked_at >= ?`,
      args: [ownerId, shiftDayKey(today, -1)],
    }),
    getCalendarItems(db, ownerId, tomorrow, tomorrow),
    tavernInsights(db, ownerId, today, tz),
    predictionsFor(db, ownerId, tomorrow),
    db.execute({ sql: "SELECT * FROM tavern_rituals WHERE owner_id = ? AND day_key < ? ORDER BY day_key DESC LIMIT 60", args: [ownerId, today] }),
  ]);
  const ritual = parseRitual(ritualR.rows[0] as unknown as Row | undefined, today);
  const avg = Object.fromEntries(
    DIMS.map((d) => {
      const vals = (lifeR.rows as unknown as Row[]).map((r) => r[d]).filter((v) => v != null).map(Number);
      return [d, vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null];
    }),
  ) as Record<(typeof DIMS)[number], number | null>;
  const overallAvg = lifeR.rows.length ? Math.round((lifeR.rows as unknown as Row[]).reduce((a, r) => a + Number(r.overall_score), 0) / lifeR.rows.length) : null;
  const timed = agenda.filter((a) => !a.allDay && a.startsAt.length > 10).map((a) => ({ id: a.id, title: a.title, day: tomorrow, start: minutesOf(a.startsAt)!, end: a.endsAt && a.endsAt.length > 10 ? minutesOf(a.endsAt)! : minutesOf(a.startsAt)! + 60 }));
  const R = GAMIFICATION_RULES.achievementByTier;
  const done = (s: StepKey) => ritual.steps.includes(s);
  return {
    today,
    tomorrow,
    required,
    ritual,
    stepsState: STEPS.map((s) => ({ key: s, done: done(s), required: required.includes(s) })),
    canClose: required.every(done) && !ritual.completedAt,
    reward: GAMIFICATION_RULES.tavern.close,
    indicators: {
      xpToday: hub.profile.xpToday,
      coinsToday: hub.profile.coinsToday,
      missionsDone: hub.indicators.missionsDone,
      habits: { done: hub.habits.done, total: hub.habits.total },
      focusMinutes: hub.indicators.focusMinutes,
      streakDays: hub.profile.streakDays,
      lifeScore: hub.lifeScore.overall,
      lifeScoreAvg7: overallAvg,
      achievementsToday: hub.rewards.achievementsToday.length,
    },
    balance: {
      dims: DIMS.map((d) => ({ key: d, today: Math.round(hub.lifeScore.dims[d]), avg7: avg[d] })),
      days: lifeR.rows.length,
      method: "Mesma metodologia oficial do Life Score (Hoje, Painel do Herói e Analytics). A média usa os snapshots dos 7 dias anteriores que existem.",
      details: legacy.balance,
      signals: hub.signals,
    },
    mood: hub.signals.mood,
    achievements: (achR.rows as unknown as Row[])
      .filter((a) => localDayOfStored(String(a.unlocked_at), tz) === today)
      .map((a) => ({ id: String(a.id), code: String(a.code), title: String(a.title), description: a.description ? String(a.description) : null, icon: a.icon ? String(a.icon) : null, tier: String(a.tier ?? "bronze"), unlockedAt: String(a.unlocked_at), reward: R[String(a.tier ?? "bronze")] ?? R.bronze })),
    tomorrowPlan: {
      agenda: agenda.map((a) => ({ id: a.id, title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, allDay: a.allDay, sourceType: a.sourceType })),
      conflicts: findConflicts(timed).map((c) => ({ a: c.a.title, b: c.b.title, minutes: c.overlapMinutes })),
      freeWindows: freeWindows(timed),
      mission: legacy.mission,
    },
    forecasts,
    legacyProphecies: forecasts.length ? [] : legacy.prophecy.prophecies,
    insights,
    history: (historyR.rows as unknown as Row[]).map((r) => {
      const x = parseRitual(r, String(r.day_key));
      return { day: x.day, steps: x.steps, completedAt: x.completedAt, reward: x.reward, learned: x.learned.slice(0, 200), highlights: x.highlights.slice(0, 200), lifeScore: (x.snapshot?.lifeScore as number | undefined) ?? null, tomorrowTask: (x.snapshot?.tomorrowTaskTitle as string | undefined) ?? null };
    }),
  };
}

export type Tavern3 = Awaited<ReturnType<typeof getTavern3>>;

/** Salva campos e etapas do ritual de HOJE (rituais passados são só leitura). */
export async function saveRitual(db: Client, ownerId: string, patch: Partial<Record<"highlights" | "challenges" | "decisions" | "learned" | "worked" | "improve" | "repeatThis" | "avoidTomorrow" | "selfCare", string>> & { steps?: StepKey[]; priorities?: string[] }) {
  const { today } = await userDayContext(db, ownerId);
  const cols: Record<string, string> = { highlights: "highlights", challenges: "challenges", decisions: "decisions", learned: "learned", worked: "worked", improve: "improve", repeatThis: "repeat_this", avoidTomorrow: "avoid_tomorrow", selfCare: "self_care" };
  await db.execute({ sql: "INSERT OR IGNORE INTO tavern_rituals (owner_id, day_key) VALUES (?, ?)", args: [ownerId, today] });
  const sets: string[] = [];
  const args: Array<string | null> = [];
  for (const [k, c] of Object.entries(cols)) {
    const v = (patch as Record<string, string | undefined>)[k];
    if (v !== undefined) (sets.push(`${c} = ?`), args.push(v.slice(0, 4000)));
  }
  if (patch.steps) (sets.push("steps_json = ?"), args.push(JSON.stringify([...new Set(patch.steps)].filter((s) => (STEPS as readonly string[]).includes(s)))));
  if (patch.priorities) (sets.push("priorities_json = ?"), args.push(JSON.stringify(patch.priorities.slice(0, 5))));
  if (sets.length) await db.execute({ sql: `UPDATE tavern_rituals SET ${sets.join(", ")}, updated_at = datetime('now') WHERE owner_id = ? AND day_key = ?`, args: [...args, ownerId, today] });
  return parseRitual((await db.execute({ sql: "SELECT * FROM tavern_rituals WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] })).rows[0] as unknown as Row, today);
}

export async function setRequiredSteps(db: Client, ownerId: string, steps: StepKey[]) {
  const clean = [...new Set(steps)].filter((s) => (STEPS as readonly string[]).includes(s));
  if (!clean.length) throw new Tavern3Error(400, "Escolha pelo menos uma etapa obrigatória.");
  await db.execute({ sql: "INSERT INTO tavern_settings (owner_id, required_steps_json) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET required_steps_json = excluded.required_steps_json, updated_at = datetime('now')", args: [ownerId, JSON.stringify(clean)] });
}

/** Reserva um bloco de foco na Agenda de amanhã — só com confirmação do usuário. */
export async function reserveFocusBlock(db: Client, ownerId: string, input: { start: string; end: string; title: string; taskId?: string | null }) {
  const { today } = await userDayContext(db, ownerId);
  const tomorrow = shiftDayKey(today, 1);
  if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end) || input.end <= input.start) throw new Tavern3Error(400, "Horário inválido.");
  if (input.taskId) {
    const t = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [input.taskId, ownerId] });
    if (!t.rows[0]) throw new Tavern3Error(404, "Missão não encontrada.");
  }
  const ev = await insertManualEvent(db, ownerId, { title: input.title.slice(0, 200), description: "Bloco de foco reservado na Taverna.", startsAt: `${tomorrow}T${input.start}:00`, endsAt: `${tomorrow}T${input.end}:00`, allDay: false });
  if (input.taskId) await db.execute({ sql: "UPDATE events SET source_type = 'task', source_id = ? WHERE id = ? AND owner_id = ?", args: [input.taskId, String(ev?.id), ownerId] }).catch(() => undefined);
  return { id: String(ev?.id ?? ""), date: tomorrow };
}

/**
 * Encerrar o ritual: valida as etapas obrigatórias, registra o encerramento e
 * paga a recompensa oficial UMA vez por dia (ledger idempotente). Reabrir ou
 * editar depois nunca paga de novo.
 */
export async function closeRitual(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const required = await settingsOf(db, ownerId);
  await db.execute({ sql: "INSERT OR IGNORE INTO tavern_rituals (owner_id, day_key) VALUES (?, ?)", args: [ownerId, today] });
  const cur = parseRitual((await db.execute({ sql: "SELECT * FROM tavern_rituals WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] })).rows[0] as unknown as Row, today);
  if (cur.completedAt) return { alreadyClosed: true, granted: false, reward: cur.reward };
  const missing = required.filter((s) => !cur.steps.includes(s));
  if (missing.length) throw new Tavern3Error(422, `Conclua as etapas obrigatórias antes de encerrar (${missing.length} pendente(s)).`);
  const hub = await getTodayHub(db, ownerId);
  let taskTitle: string | null = null;
  if (cur.tomorrowTaskId) taskTitle = String((await db.execute({ sql: "SELECT title FROM tasks WHERE id = ? AND owner_id = ?", args: [cur.tomorrowTaskId, ownerId] })).rows[0]?.title ?? "") || null;
  const snapshot = { lifeScore: hub.lifeScore.overall, xpToday: hub.profile.xpToday, missionsDone: hub.indicators.missionsDone, habits: `${hub.habits.done}/${hub.habits.total}`, focusMinutes: hub.indicators.focusMinutes, tomorrowTaskTitle: taskTitle };
  const R = GAMIFICATION_RULES.tavern.close;
  const granted = await award(db, ownerId, { sourceType: "tavern", sourceId: today, eventType: "ritual_closed", xp: R.xp, coins: R.coins, label: "Ritual da Taverna concluído" }, today);
  await db.execute({
    sql: "UPDATE tavern_rituals SET completed_at = datetime('now'), snapshot_json = ?, reward_xp = ?, reward_coins = ?, updated_at = datetime('now') WHERE owner_id = ? AND day_key = ? AND completed_at IS NULL",
    args: [JSON.stringify(snapshot), granted ? R.xp : 0, granted ? R.coins : 0, ownerId, today],
  });
  return { alreadyClosed: false, granted, reward: granted ? R : { xp: 0, coins: 0 } };
}

/** Marca a missão principal escolhida no ritual (o pin oficial continua em /tavern/pin-tomorrow). */
export async function rememberTomorrowTask(db: Client, ownerId: string, taskId: string) {
  const { today } = await userDayContext(db, ownerId);
  await db.execute({ sql: "INSERT OR IGNORE INTO tavern_rituals (owner_id, day_key) VALUES (?, ?)", args: [ownerId, today] });
  await db.execute({ sql: "UPDATE tavern_rituals SET tomorrow_task_id = ?, updated_at = datetime('now') WHERE owner_id = ? AND day_key = ?", args: [taskId, ownerId, today] });
}

/* ───────────────────────────── automações ───────────────────────────── */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

/** A · Lembrete de encerramento (a hora vem da configuração da automação). */
export async function runTavernReminder(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const r = await db.execute({ sql: "SELECT completed_at FROM tavern_rituals WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  if (r.rows[0]?.completed_at) return { status: "skipped", summary: "Ritual de hoje já concluído." };
  await notifyFromAutomation(db, ownerId, { eventType: "tavern_reminder", title: "🍻 A Taverna está aberta", body: "Hora de fechar o ciclo: balanço, reflexão e o plano de amanhã.", url: "/taverna", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: "Lembrete enviado." };
}

/** D · Preparação de amanhã: avisa conflitos na agenda de amanhã e a missão sugerida. */
export async function runTomorrowPrep(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const t = await getTavern3(db, ownerId);
  const parts = [t.tomorrowPlan.conflicts.length ? `${t.tomorrowPlan.conflicts.length} conflito(s) na agenda de amanhã` : "", t.tomorrowPlan.mission.primary ? `missão sugerida: ${t.tomorrowPlan.mission.primary.title}` : ""].filter(Boolean);
  if (!parts.length) return { status: "skipped", summary: "Nada a preparar para amanhã." };
  await notifyFromAutomation(db, ownerId, { eventType: "tavern_prep", title: "🗓️ Preparar amanhã", body: parts.join(" · "), url: "/taverna?aba=amanha", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: parts.join(" · ") };
}

/**
 * Aprendizado do ritual → sugestão de cartão na fila de aprovação do Grimório
 * (nada entra no baralho sem o usuário aprovar). Antes passava pelo Diário.
 */
export async function learningToGrimoire(db: Client, ownerId: string, text: string) {
  const clean = text.trim().slice(0, 2000);
  if (clean.length < 5) throw new Tavern3Error(400, "Escreva o aprendizado antes de enviar.");
  const { today } = await userDayContext(db, ownerId);
  const br = `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`;
  const added = await queueSuggestions(db, ownerId, {
    deckId: null,
    sourceKind: "text",
    sourceRef: `taverna:${today}`,
    sourceLabel: `Taverna ${br}`,
    cards: [{ front: `Aprendizado de ${br}: ${clean.split(/\s+/).slice(0, 6).join(" ")}…`, back: clean }],
  });
  return { added };
}

