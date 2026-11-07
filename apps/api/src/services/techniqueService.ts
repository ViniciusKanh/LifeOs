import type { Client } from "@libsql/client";
import { DANCE_MODALITIES, FIGHT_MODALITIES, inferWorkoutCategory, localDateKeyOf, todayInTz } from "./healthService.js";
import { FIGHT_WEEKS, weekStartOf } from "./strengthService.js";

/* ============================================================
 * Treino técnico — lutas e danças.
 *
 * Diferente da musculação (séries × reps × carga → Força), arte marcial e
 * dança evoluem por tempo de prática deliberada. Tudo é derivado de
 * `workouts` a cada consulta:
 * - minutos e sessões por modalidade;
 * - rounds (luta);
 * - carga interna = minutos × PSE (session-RPE de Foster), só quando o PSE foi
 *   registrado — sessões sem PSE não entram na carga, nada é estimado;
 * - consistência = semanas com pelo menos um treino nas últimas 8.
 * ============================================================ */

const DAY_MS = 86_400_000;
const addDays = (dateKey: string, days: number) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export interface TechniqueRow {
  performedAt: string;
  category: "luta" | "danca";
  modality: string | null;
  minutes: number;
  rounds: number | null;
  rpe: number | null;
}

export interface TechniqueModalitySummary {
  modality: string;
  category: "luta" | "danca";
  sessions: number;
  minutes: number;
  rounds: number;
  load: number;
  avgRpe: number | null;
  lastDate: string | null;
  /** Totais de sempre (todo o histórico), para a evolução de longo prazo. */
  allTimeMinutes: number;
  allTimeSessions: number;
}

export interface TechniqueWeek {
  weekStart: string;
  sessions: number;
  minutes: number;
  rounds: number;
  load: number;
}

export interface TechniqueReport {
  weeks: TechniqueWeek[];
  modalities: TechniqueModalitySummary[];
  totals: { sessions: number; minutes: number; rounds: number; load: number; activeWeeks: number };
  skills: Array<{ id: string; name: string; level: number; maxLevel: number; modality: string }>;
}

const modalityKey = (r: TechniqueRow) => r.modality ?? (r.category === "luta" ? "outra" : "danca_outra");

/** Função pura (testável): agrega as linhas em semanas (seg–dom, dia local) e modalidades. */
export function buildTechniqueReport(rows: TechniqueRow[], tzOffsetMinutes: number, today: string): Omit<TechniqueReport, "skills"> {
  const currentWeek = weekStartOf(today);
  const firstWeek = addDays(currentWeek, -7 * (FIGHT_WEEKS - 1));
  const weeks: TechniqueWeek[] = Array.from({ length: FIGHT_WEEKS }, (_, i) => ({ weekStart: addDays(firstWeek, 7 * i), sessions: 0, minutes: 0, rounds: 0, load: 0 }));
  const byWeek = new Map(weeks.map((w) => [w.weekStart, w]));
  const mods = new Map<string, TechniqueModalitySummary & { rpeSum: number; rpeN: number }>();

  for (const r of rows) {
    const key = modalityKey(r);
    const m =
      mods.get(key) ??
      { modality: key, category: r.category, sessions: 0, minutes: 0, rounds: 0, load: 0, avgRpe: null, lastDate: null, allTimeMinutes: 0, allTimeSessions: 0, rpeSum: 0, rpeN: 0 };
    mods.set(key, m);
    const date = localDateKeyOf(r.performedAt, tzOffsetMinutes);
    m.allTimeMinutes += r.minutes;
    m.allTimeSessions += 1;
    if (!m.lastDate || date > m.lastDate) m.lastDate = date;
    const week = byWeek.get(weekStartOf(date));
    if (!week) continue;
    const load = r.rpe ? r.minutes * r.rpe : 0;
    week.sessions += 1;
    week.minutes += r.minutes;
    week.rounds += r.rounds ?? 0;
    week.load += load;
    m.sessions += 1;
    m.minutes += r.minutes;
    m.rounds += r.rounds ?? 0;
    m.load += load;
    if (r.rpe) {
      m.rpeSum += r.rpe;
      m.rpeN += 1;
    }
  }

  const modalities = [...mods.values()]
    .map(({ rpeSum, rpeN, ...m }) => ({ ...m, avgRpe: rpeN ? Math.round((rpeSum / rpeN) * 10) / 10 : null }))
    .sort((a, b) => b.allTimeMinutes - a.allTimeMinutes);
  return {
    weeks,
    modalities,
    totals: {
      sessions: weeks.reduce((s, w) => s + w.sessions, 0),
      minutes: weeks.reduce((s, w) => s + w.minutes, 0),
      rounds: weeks.reduce((s, w) => s + w.rounds, 0),
      load: weeks.reduce((s, w) => s + w.load, 0),
      activeWeeks: weeks.filter((w) => w.sessions > 0).length,
    },
  };
}

export async function getTechniqueReport(db: Client, ownerId: string, tzOffsetMinutes: number): Promise<TechniqueReport> {
  const today = todayInTz(tzOffsetMinutes);
  // Histórico completo (para "de sempre"); só treinos técnicos. Registros antigos sem categoria são inferidos pelo rótulo.
  const [res, skills] = await Promise.all([
    db.execute({
      sql: `SELECT kind, category, modality, performed_at, duration_minutes, rounds, rpe
              FROM workouts
             WHERE owner_id = ? AND (category IN ('luta', 'danca') OR category IS NULL)`,
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT id, name, level, max_level, link_ref FROM personal_skills WHERE owner_id = ? AND link_kind = 'modalidade' ORDER BY level DESC",
      args: [ownerId],
    }),
  ]);
  const known = new Set<string>([...FIGHT_MODALITIES, ...DANCE_MODALITIES]);
  const rows: TechniqueRow[] = [];
  for (const r of res.rows) {
    const category = typeof r.category === "string" && r.category ? r.category : inferWorkoutCategory(String(r.kind ?? ""));
    if (category !== "luta" && category !== "danca") continue;
    const modality = typeof r.modality === "string" && known.has(r.modality) ? r.modality : null;
    rows.push({ performedAt: String(r.performed_at), category, modality, minutes: Number(r.duration_minutes ?? 0), rounds: r.rounds == null ? null : Number(r.rounds), rpe: r.rpe == null ? null : Number(r.rpe) });
  }
  return {
    ...buildTechniqueReport(rows, tzOffsetMinutes, today),
    skills: skills.rows.map((s) => ({ id: String(s.id), name: String(s.name), level: Number(s.level), maxLevel: Number(s.max_level), modality: String(s.link_ref ?? "") })),
  };
}
