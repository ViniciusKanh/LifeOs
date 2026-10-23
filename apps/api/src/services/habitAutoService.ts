import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { awardHabitCheckIn, dayKeyIn, todayKeyFor, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Hábitos automáticos e encadeados.
 *
 * Um hábito com `auto_source` é marcado sozinho quando o registro real do
 * outro módulo existe no dia (fuso do usuário). A marcação reaproveita o
 * mesmo caminho do check-in manual (habit_entries + awardHabitCheckIn), então
 * XP e sequência continuam corretos — e como o XP é idempotente por
 * hábito/dia, sincronizar várias vezes (ou desfazer e refazer) nunca paga
 * duas vezes. Check-ins manuais nunca são alterados pela sincronização.
 */

export const AUTO_SOURCES = ["workout", "reading", "water", "journal", "tasks", "flashcards"] as const;
export type AutoSource = (typeof AUTO_SOURCES)[number];

export interface AutoSourceInfo {
  key: AutoSource;
  label: string;
  /** Unidade do limite mínimo (null = a fonte não usa limite). */
  unit: string | null;
  thresholdLabel: string | null;
  available: boolean;
}

const SOURCE_META: Record<AutoSource, Omit<AutoSourceInfo, "key" | "available">> = {
  workout: { label: "Registrar um treino", unit: "min", thresholdLabel: "Minutos mínimos de treino no dia" },
  reading: { label: "Registrar uma sessão de leitura", unit: "pág.", thresholdLabel: "Páginas mínimas lidas no dia" },
  water: { label: "Registrar água", unit: "ml", thresholdLabel: "Total mínimo de água no dia (ml)" },
  journal: { label: "Escrever no diário", unit: null, thresholdLabel: null },
  tasks: { label: "Concluir tarefas", unit: "tarefas", thresholdLabel: "Nº mínimo de tarefas concluídas no dia" },
  flashcards: { label: "Revisar flashcards", unit: "cartões", thresholdLabel: "Nº mínimo de cartões revisados no dia" },
};

export function isAutoSource(v: unknown): v is AutoSource {
  return typeof v === "string" && (AUTO_SOURCES as readonly string[]).includes(v);
}

/** A tabela de flashcards é de outro módulo: só oferece a fonte quando ela existe neste banco. */
async function hasTable(db: Client, name: string): Promise<boolean> {
  const r = await db.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", args: [name] });
  return r.rows.length > 0;
}

export async function listAutoSources(db: Client): Promise<AutoSourceInfo[]> {
  const flashcards = await hasTable(db, "flashcard_reviews");
  return AUTO_SOURCES.map((key) => ({ key, ...SOURCE_META[key], available: key !== "flashcards" || flashcards }));
}

function shiftKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Soma timestamps guardados em UTC que caem no dia local `dayKey`. O filtro
 * no SQL é largo (dia anterior até o seguinte, em texto) e a conversão
 * exata para o fuso do usuário é feita aqui.
 */
async function sumLocalDay(
  db: Client,
  sql: string,
  ownerId: string,
  dayKey: string,
  tz: string,
): Promise<number> {
  const r = await db.execute({ sql, args: [ownerId, shiftKey(dayKey, -1), shiftKey(dayKey, 2)] });
  let total = 0;
  for (const row of r.rows) {
    if (!row.t) continue;
    if (dayKeyIn(new Date(normalizeStoredUtc(String(row.t))), tz) === dayKey) total += Number(row.v ?? 0);
  }
  return total;
}

/** Valor real da fonte no dia (minutos, páginas, ml, nº de registros). */
export async function measureSource(db: Client, ownerId: string, source: AutoSource, dayKey: string, tz: string): Promise<number> {
  switch (source) {
    case "workout":
      // Treino sem duração ainda conta como registro: soma no mínimo 1 por treino
      // (só influencia o limite quando o usuário não informou minutos).
      return sumLocalDay(db, "SELECT performed_at AS t, MAX(COALESCE(duration_minutes, 0), 1) AS v FROM workouts WHERE owner_id = ? AND performed_at >= ? AND performed_at < ?", ownerId, dayKey, tz);
    case "reading":
      return sumLocalDay(db, "SELECT started_at AS t, MAX(COALESCE(pages_read, 0), 1) AS v FROM reading_sessions WHERE owner_id = ? AND started_at >= ? AND started_at < ?", ownerId, dayKey, tz);
    case "water":
      return sumLocalDay(db, "SELECT recorded_at AS t, COALESCE(amount_ml, 0) AS v FROM water_entries WHERE owner_id = ? AND recorded_at >= ? AND recorded_at < ?", ownerId, dayKey, tz);
    case "tasks":
      return sumLocalDay(db, "SELECT completed_at AS t, 1 AS v FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at >= ? AND completed_at < ?", ownerId, dayKey, tz);
    case "journal": {
      // entry_date já é o dia local; só conta entrada com texto de verdade.
      const r = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM journal_entries WHERE owner_id = ? AND entry_date = ? AND COALESCE(thoughts, '') != ''",
        args: [ownerId, dayKey],
      });
      return Number(r.rows[0]?.n ?? 0);
    }
    case "flashcards": {
      if (!(await hasTable(db, "flashcard_reviews"))) return 0;
      const r = await db.execute({ sql: "SELECT COUNT(*) AS n FROM flashcard_reviews WHERE owner_id = ? AND day_key = ?", args: [ownerId, dayKey] });
      return Number(r.rows[0]?.n ?? 0);
    }
  }
}

/** Regra única de cumprimento: sem limite basta um registro; com limite, o valor do dia precisa alcançá-lo. */
export function meetsThreshold(source: AutoSource, value: number, threshold: number | null): boolean {
  if (value <= 0) return false;
  if (source === "journal" || threshold == null) return true;
  return value >= threshold;
}

interface AutoHabitRow {
  id: string;
  auto_source: AutoSource;
  auto_threshold: number | null;
  target_count: number;
}

export interface SyncResult {
  dayKey: string;
  marked: string[];
  cleared: string[];
}

/**
 * Sincroniza os hábitos automáticos do usuário em um dia (YYYY-MM-DD local).
 * Cumpriu a fonte → garante o check-in (count = meta) e concede XP pelo
 * caminho normal. Deixou de cumprir (ex.: treino excluído) → remove apenas
 * o check-in que a própria sincronização criou. XP já concedido não é
 * removido (ledger imutável) e não volta a ser pago se o dia for refeito.
 */
export async function syncAutoHabits(db: Client, ownerId: string, dayKey: string): Promise<SyncResult> {
  const result: SyncResult = { dayKey, marked: [], cleared: [] };
  const habitsRes = await db.execute({
    sql: "SELECT id, auto_source, auto_threshold, target_count FROM habits WHERE owner_id = ? AND archived_at IS NULL AND auto_source IS NOT NULL",
    args: [ownerId],
  });
  const habits = (habitsRes.rows as unknown as AutoHabitRow[]).filter((h) => isAutoSource(h.auto_source));
  if (habits.length === 0) return result;

  const tz = await userTimezone(db, ownerId);
  const cache = new Map<AutoSource, number>();
  for (const h of habits) {
    if (!cache.has(h.auto_source)) cache.set(h.auto_source, await measureSource(db, ownerId, h.auto_source, dayKey, tz));
    const met = meetsThreshold(h.auto_source, cache.get(h.auto_source) ?? 0, h.auto_threshold == null ? null : Number(h.auto_threshold));
    const target = Math.max(1, Number(h.target_count));
    if (met) {
      const up = await db.execute({
        sql: `INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count, source)
              VALUES (?, ?, ?, ?, ?, 'auto')
              ON CONFLICT (habit_id, entry_date) DO UPDATE SET count = MAX(habit_entries.count, excluded.count)
              WHERE habit_entries.count < excluded.count`,
        args: [nanoid(), h.id, ownerId, dayKey, target],
      });
      if (up.rowsAffected > 0) result.marked.push(h.id);
      // Idempotente: só paga se ainda não pagou este hábito neste dia.
      await awardHabitCheckIn(db, ownerId, h.id, dayKey);
    } else {
      const del = await db.execute({
        sql: "DELETE FROM habit_entries WHERE habit_id = ? AND owner_id = ? AND entry_date = ? AND source = 'auto'",
        args: [h.id, ownerId, dayKey],
      });
      if (del.rowsAffected > 0) result.cleared.push(h.id);
    }
  }
  return result;
}

/**
 * Gancho pós-registro (treino, leitura, água, diário, tarefa): sincroniza
 * hoje e, quando informado, o dia do registro. Nunca derruba a ação
 * principal — falha vira só um aviso no log.
 */
export async function syncAutoHabitsAfterWrite(db: Client, ownerId: string, storedAt?: string | null): Promise<void> {
  try {
    const today = await todayKeyFor(db, ownerId);
    const days = new Set([today]);
    if (storedAt) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(storedAt)
        ? storedAt
        : dayKeyIn(new Date(normalizeStoredUtc(storedAt)), await userTimezone(db, ownerId));
      // O XP de hábito só vale para hoje/ontem; dias antigos ainda refletem o check-in.
      if (day <= today) days.add(day);
    }
    for (const d of days) await syncAutoHabits(db, ownerId, d);
  } catch (err) {
    console.warn("[hábitos automáticos] falha ao sincronizar:", err instanceof Error ? err.message : "erro desconhecido");
  }
}

export class HabitChainError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Valida o encadeamento "depois de X": X precisa ser do mesmo usuário,
 * ativo, diferente do próprio hábito e sem formar ciclo (A → B → A).
 */
export async function validateHabitChain(db: Client, ownerId: string, habitId: string | null, afterHabitId: string | null): Promise<void> {
  if (!afterHabitId) return;
  if (habitId && afterHabitId === habitId) throw new HabitChainError("Um hábito não pode vir depois dele mesmo.");
  let cursor: string | null = afterHabitId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor) || seen.size > 50) throw new HabitChainError("Esse encadeamento formaria um ciclo.");
    seen.add(cursor);
    const r = await db.execute({ sql: "SELECT id, after_habit_id FROM habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL", args: [cursor, ownerId] });
    const row = r.rows[0] as unknown as { id: string; after_habit_id: string | null } | undefined;
    if (!row) {
      if (cursor === afterHabitId) throw new HabitChainError("Hábito anterior não encontrado.");
      break;
    }
    if (habitId && row.after_habit_id === habitId) throw new HabitChainError("Esse encadeamento formaria um ciclo.");
    cursor = row.after_habit_id;
  }
}
