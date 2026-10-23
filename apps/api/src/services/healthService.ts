import type { Client, InStatement } from "@libsql/client";
import { nanoid } from "nanoid";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";

/* ============================================================
 * Saúde — regras de data local e de exercícios.
 *
 * Por que existe: o banco guarda instantes em UTC, mas em DOIS formatos
 * convivendo (histórico):
 *   - "YYYY-MM-DD HH:MM:SS"      → default `datetime('now')` do SQLite;
 *   - "YYYY-MM-DDTHH:MM:SS.sssZ" → ISO enviado pelo front.
 * Comparar texto entre os dois formatos quebra: ' ' (0x20) < 'T' (0x54),
 * então "2026-10-22 15:00:00" (meio-dia em São Paulo) ficava ANTES do início
 * do dia local "2026-10-22T03:00:00.000Z" e o registro de hoje caía no dia
 * anterior. Aqui ficam as funções únicas para "dia local" no servidor.
 * ============================================================ */

const DAY_MS = 86_400_000;

/** Instante atual em ISO UTC — formato único para novos registros de Saúde. */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Offset (convenção de `Date.prototype.getTimezoneOffset()`: positivo atrás
 * de UTC, ex.: +180 em São Paulo) de um fuso IANA num instante.
 */
export function offsetForTimeZone(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((at.getTime() - asUtc) / 60_000);
  } catch {
    return 0;
  }
}

/** Valida o `tz` vindo da query (minutos, faixa real de fusos: -14h..+12h). */
export function parseTzOffset(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < -840 || value > 720) return null;
  return value;
}

/**
 * Offset a usar na requisição: o `tz` enviado pelo navegador tem prioridade
 * (reflete onde a pessoa está agora); sem ele, cai no fuso salvo no perfil
 * (users.timezone, default America/Sao_Paulo) — nunca no fuso do servidor.
 */
export async function resolveTzOffset(db: Client, ownerId: string, rawTz: unknown): Promise<number> {
  const fromQuery = parseTzOffset(rawTz);
  if (fromQuery !== null) return fromQuery;
  const r = await db.execute({ sql: "SELECT timezone FROM users WHERE id = ?", args: [ownerId] });
  const tz = r.rows[0]?.timezone;
  return typeof tz === "string" && tz ? offsetForTimeZone(tz) : 0;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Limites [início, fim) em UTC ISO do dia local "YYYY-MM-DD". */
export function localDayBoundsUtc(dateKey: string, tzOffsetMinutes: number) {
  const startMs = Date.parse(`${dateKey}T00:00:00.000Z`) + tzOffsetMinutes * 60_000;
  return { start: new Date(startMs).toISOString(), end: new Date(startMs + DAY_MS).toISOString() };
}

/** "Hoje" (YYYY-MM-DD) no fuso informado, sem depender do fuso do servidor. */
export function todayInTz(tzOffsetMinutes: number, now: Date = new Date()) {
  return new Date(now.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Dia local (YYYY-MM-DD) de um instante salvo no banco (aceita os dois formatos). */
export function localDateKeyOf(stored: string, tzOffsetMinutes: number) {
  return todayInTz(tzOffsetMinutes, new Date(normalizeStoredUtc(stored)));
}

/** "YYYY-MM-DD HH:MM:SS" (UTC sem zona) → ISO com Z; ISO passa direto. */
export function normalizeStoredUtc(stored: string) {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(stored)) return stored;
  return `${stored.replace(" ", "T")}Z`;
}

/**
 * Filtro "coluna dentro de [start, end)" que funciona para os dois formatos.
 * O par de comparações de texto com só a data (YYYY-MM-DD) é um pré-filtro
 * sargável (usa o índice owner_id + coluna e lê só ~2 dias UTC de linhas);
 * o `datetime()` normaliza ambos os formatos para a comparação exata.
 */
export function utcRangeFilter(column: string, start: string, end: string) {
  const coarseStart = start.slice(0, 10);
  const coarseEnd = new Date(Date.parse(end) + DAY_MS).toISOString().slice(0, 10);
  return {
    sql: `${column} >= ? AND ${column} < ? AND datetime(${column}) >= datetime(?) AND datetime(${column}) < datetime(?)`,
    args: [coarseStart, coarseEnd, start, end],
  };
}

/* ---------------------------- Exercícios ---------------------------- */

export const WORKOUT_CATEGORIES = [
  "musculacao",
  "luta",
  "corrida",
  "caminhada",
  "bike",
  "natacao",
  "crossfit",
  "funcional",
  "hiit",
  "pilates",
  "yoga",
  "alongamento",
  "esporte_coletivo",
  "outro",
] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];

/** Rótulo gravado em `kind` (mantido para Timeline/Analytics/Diário/Contexto que leem essa coluna). */
export const WORKOUT_CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  musculacao: "Musculação",
  luta: "Luta",
  corrida: "Corrida",
  caminhada: "Caminhada",
  bike: "Bike",
  natacao: "Natação",
  crossfit: "Crossfit",
  funcional: "Funcional",
  hiit: "HIIT",
  pilates: "Pilates",
  yoga: "Yoga",
  alongamento: "Alongamento",
  esporte_coletivo: "Esporte coletivo",
  outro: "Outro",
};

export const FIGHT_MODALITIES = ["muay_thai", "jiu_jitsu", "boxe", "mma", "judo", "kickboxing", "karate", "wrestling", "outra"] as const;

/**
 * Intensidade legada (leve/moderada/intensa) derivada do esforço percebido
 * (RPE 1–10). Mantém a coluna `intensity` coerente para quem já a consome.
 */
export function intensityFromRpe(rpe: number): "leve" | "moderada" | "intensa" {
  if (rpe <= 4) return "leve";
  if (rpe <= 7) return "moderada";
  return "intensa";
}

export interface WorkoutSetInput {
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  loadKg?: number | null;
}

export interface WorkoutSetRow {
  id: string;
  workout_id: string;
  position: number;
  exercise: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
}

/** Statements que substituem a lista de séries de um treino (sempre isolados por owner_id). */
export function replaceWorkoutSetsStatements(ownerId: string, workoutId: string, sets: WorkoutSetInput[]): InStatement[] {
  const statements: InStatement[] = [
    { sql: "DELETE FROM workout_sets WHERE workout_id = ? AND owner_id = ?", args: [workoutId, ownerId] },
  ];
  sets.forEach((set, index) => {
    statements.push({
      sql: `INSERT INTO workout_sets (id, owner_id, workout_id, position, exercise, sets, reps, load_kg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), ownerId, workoutId, index, set.exercise, set.sets ?? null, set.reps ?? null, set.loadKg ?? null],
    });
  });
  return statements;
}

/** Anexa `sets` a cada treino com uma única consulta (sem N+1). */
export async function attachWorkoutSets<T extends { id: unknown }>(db: Client, ownerId: string, workouts: T[]) {
  if (workouts.length === 0) return [] as Array<T & { sets: WorkoutSetRow[] }>;
  const ids = workouts.map((w) => String(w.id));
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT id, workout_id, position, exercise, sets, reps, load_kg FROM workout_sets
          WHERE owner_id = ? AND workout_id IN (${placeholders}) ORDER BY workout_id, position`,
    args: [ownerId, ...ids],
  });
  const byWorkout = new Map<string, WorkoutSetRow[]>();
  for (const row of result.rows as unknown as WorkoutSetRow[]) {
    const list = byWorkout.get(row.workout_id) ?? [];
    list.push({ ...row });
    byWorkout.set(row.workout_id, list);
  }
  return workouts.map((w) => ({ ...w, sets: byWorkout.get(String(w.id)) ?? [] }));
}

/** Remove acentos/caixa para comparar rótulos livres de tipo. */
function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Tipo estável a partir de um `kind` livre (registros antigos ou clientes que
 * só mandam o rótulo). Sem correspondência → "outro".
 */
export function inferWorkoutCategory(kind: string): WorkoutCategory {
  const k = normalizeLabel(kind);
  const rules: Array<[WorkoutCategory, RegExp]> = [
    ["musculacao", /muscula|academia|gym|peso|forca/],
    ["luta", /luta|muay|jiu|boxe|box|mma|judo|karate|kick|wrestling/],
    ["corrida", /corrid|run/],
    ["caminhada", /caminhad|walk/],
    ["bike", /bike|cicl|pedal|bicicleta|spinning/],
    ["natacao", /nata|swim/],
    ["crossfit", /crossfit/],
    ["funcional", /funcional/],
    ["hiit", /hiit/],
    ["pilates", /pilates/],
    ["yoga", /yoga|ioga/],
    ["alongamento", /along|stretch/],
    ["esporte_coletivo", /futebol|volei|basquete|handebol|esporte|futsal/],
  ];
  return rules.find(([, re]) => re.test(k))?.[0] ?? "outro";
}

/* ---------------------- Escrita (rotas + Copilot) ----------------------
 * Inserções extraídas de health.routes.ts para que o Copilot e as rotas
 * gravem exatamente do mesmo jeito (Timeline/Analytics/Conquistas leem
 * essas tabelas direto). Recebem dados JÁ validados pelos schemas zod de
 * validators/health.schema.ts e sempre gravam com o owner_id informado.
 * ---------------------------------------------------------------------- */

/** Minutos entre dois instantes ISO; null se o fim não for depois do início. */
export function minutesBetween(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return diff > 0 ? Math.round(diff / 60000) : null;
}

export type WorkoutPayload = {
  kind?: string;
  category?: WorkoutCategory;
  modality?: string | null;
  intensity?: "leve" | "moderada" | "intensa" | null;
  rpe?: number | null;
  muscleGroups?: string | null;
  rounds?: number | null;
  roundMinutes?: number | null;
};

/**
 * Regras de coerência entre tipo e campos: `kind` sempre recebe o rótulo do
 * tipo (compatibilidade com quem lê essa coluna), campos de luta só valem
 * para luta e o RPE alimenta a intensidade legada.
 */
export function normalizeWorkoutPayload(d: WorkoutPayload) {
  const category = d.category ?? (d.kind ? inferWorkoutCategory(d.kind) : undefined);
  const kind = d.category ? WORKOUT_CATEGORY_LABELS[d.category] : d.kind;
  // Tipo conhecido e diferente de luta/musculação → zera os campos que não se aplicam.
  const notFight = category !== undefined && category !== "luta";
  const notStrength = category !== undefined && category !== "musculacao";
  const intensity = d.rpe ? intensityFromRpe(d.rpe) : d.intensity;
  return {
    category,
    kind,
    intensity,
    modality: notFight ? null : d.modality,
    rounds: notFight ? null : d.rounds,
    roundMinutes: notFight ? null : d.roundMinutes,
    muscleGroups: notStrength ? null : d.muscleGroups,
  };
}

export async function insertWaterEntry(db: Client, ownerId: string, d: { amountMl: number; recordedAt?: string }) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at)
          VALUES (?, ?, ?, ?)`,
    args: [id, ownerId, d.amountMl, d.recordedAt ?? nowIso()],
  });
  await syncAutoHabitsAfterWrite(db, ownerId, d.recordedAt ?? null);
  const created = await db.execute({ sql: "SELECT * FROM water_entries WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}

/** Devolve null quando o horário de acordar não é depois do de dormir. */
export async function insertSleepEntry(
  db: Client,
  ownerId: string,
  d: { wentToBedAt: string; wokeUpAt: string; quality?: number; notes?: string }
) {
  const duration = minutesBetween(d.wentToBedAt, d.wokeUpAt);
  if (duration === null) return null;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes, quality, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, d.wentToBedAt, d.wokeUpAt, duration, d.quality ?? null, d.notes ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM sleep_entries WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}

export async function insertMoodEntry(
  db: Client,
  ownerId: string,
  d: { mood: number; energy: number; stress?: number; note?: string; recordedAt?: string }
) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO mood_entries (id, owner_id, mood, energy, stress, note, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, d.mood, d.energy, d.stress ?? null, d.note ?? null, d.recordedAt ?? nowIso()],
  });
  const created = await db.execute({ sql: "SELECT * FROM mood_entries WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}

export type WorkoutInsert = WorkoutPayload & {
  durationMinutes: number;
  distanceKm?: number | null;
  calories?: number | null;
  notes?: string | null;
  performedAt?: string;
  sets?: WorkoutSetInput[];
};

/** Grava o treino (e as séries, só em musculação) e devolve o id criado. */
export async function insertWorkout(db: Client, ownerId: string, d: WorkoutInsert): Promise<string> {
  const n = normalizeWorkoutPayload(d);
  const id = nanoid();
  await db.batch(
    [
      {
        sql: `INSERT INTO workouts (id, owner_id, kind, category, modality, duration_minutes, distance_km, calories, intensity, rpe,
                                    muscle_groups, rounds, round_minutes, notes, performed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          ownerId,
          n.kind ?? "Outro",
          n.category ?? null,
          n.modality ?? null,
          d.durationMinutes,
          d.distanceKm ?? null,
          d.calories ?? null,
          n.intensity ?? null,
          d.rpe ?? null,
          n.muscleGroups ?? null,
          n.rounds ?? null,
          n.roundMinutes ?? null,
          d.notes ?? null,
          d.performedAt ?? nowIso(),
        ],
      },
      // Séries só fazem sentido em musculação; nos demais tipos são ignoradas.
      ...(d.sets && n.category === "musculacao" ? replaceWorkoutSetsStatements(ownerId, id, d.sets).slice(1) : []),
    ],
    "write"
  );
  await syncAutoHabitsAfterWrite(db, ownerId, d.performedAt ?? null);
  return id;
}
