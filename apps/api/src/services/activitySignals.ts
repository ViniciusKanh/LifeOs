import type { Client } from "@libsql/client";
import { localDayOfStored, localDaysWhere } from "./localDayService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Atividades reais do usuário num intervalo de dias locais, lidas direto das
 * fontes originais (sem cópia). Base da Raid (dano) e do Companheiro (rotina).
 * Cada atividade tem um id estável: a mesma linha sempre gera o mesmo "golpe".
 */

export type ActivityKind =
  | "tarefa"
  | "habito"
  | "leitura"
  | "treino"
  | "estudo"
  | "commit"
  | "pr"
  | "release"
  | "artigo_lido"
  | "artigo_fichado"
  | "exploracao"
  | "programacao";

export interface ActivityHit {
  kind: ActivityKind;
  /** Id estável da origem (ex.: "tarefa:abc"). */
  id: string;
  /** Timestamp UTC (ou dia local às 12h para fontes só com data). */
  at: string;
  day: string;
  label: string;
  /** Duração em minutos quando a fonte informa. */
  minutes: number | null;
  /** Extra que influencia o dano (ex.: prioridade Alta). */
  boost: number;
}

/** Família da atividade: usada nas categorias da Raid e nos traços do Companheiro. */
export const ACTIVITY_FAMILY: Record<ActivityKind, "tarefas" | "habitos" | "leitura" | "treinos" | "estudo" | "codigo" | "exploracao"> = {
  tarefa: "tarefas",
  habito: "habitos",
  leitura: "leitura",
  treino: "treinos",
  estudo: "estudo",
  commit: "codigo",
  pr: "codigo",
  release: "codigo",
  artigo_lido: "leitura",
  artigo_fichado: "estudo",
  exploracao: "exploracao",
  programacao: "codigo",
};

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/** Fontes só com data viram meio-dia local para ordenar junto dos timestamps. */
function dateOnlyAt(day: string) {
  return `${day}T12:00:00.000Z`;
}

export async function collectActivity(db: Client, ownerId: string, tz: string, fromDay: string, toDay: string): Promise<ActivityHit[]> {
  const range = (col: string) => localDaysWhere(col, fromDay, toDay, tz);
  const q = async (sql: string, args: unknown[]) => (await db.execute({ sql, args: args as never })).rows;
  const t = range("completed_at");
  const r = range("started_at");
  const w = range("performed_at");
  const c = range("occurred_at");
  const pr = range("read_at");
  const pv = range("reviewed_at");
  const ck = range("visited_at");

  const [tasks, habits, reading, workouts, studies, code, papersRead, papersRev, checkins, waka] = await Promise.all([
    q(`SELECT id, title, priority, completed_at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL AND ${t.sql}`, [ownerId, ...t.args]),
    q(`SELECT e.id, e.entry_date, h.name FROM habit_entries e LEFT JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
        WHERE e.owner_id = ? AND e.entry_date >= ? AND e.entry_date <= ?`, [ownerId, fromDay, toDay]),
    q(`SELECT s.id, s.started_at, s.duration_minutes, s.pages_read, b.title FROM reading_sessions s LEFT JOIN books b ON b.id = s.book_id
        WHERE s.owner_id = ? AND ${r.sql.replace(/started_at/g, "s.started_at")}`, [ownerId, ...r.args]),
    q(`SELECT id, kind, duration_minutes, performed_at FROM workouts WHERE owner_id = ? AND ${w.sql}`, [ownerId, ...w.args]),
    q(`SELECT id, occurred_at, duration_minutes FROM study_sessions WHERE owner_id = ? AND occurred_at >= ? AND occurred_at <= ?`, [ownerId, fromDay, toDay + "T23:59:59"]),
    // Commits triviais/merge não pagam XP na Forja (xp = 0) e também não dão dano.
    q(`SELECT id, kind, title, repo_full_name, occurred_at FROM code_events WHERE owner_id = ? AND (kind <> 'commit' OR xp > 0)
        AND kind IN ('commit', 'pr_merged', 'release') AND ${c.sql}`, [ownerId, ...c.args]),
    q(`SELECT up.id, up.read_at, COALESCE(json_extract(up.overrides_json, '$.title'), p.title) AS title FROM user_papers up JOIN research_papers p ON p.id = up.paper_id
        WHERE up.owner_id = ? AND up.read_at IS NOT NULL AND ${pr.sql.replace(/read_at/g, "up.read_at")}`, [ownerId, ...pr.args]),
    q(`SELECT up.id, up.reviewed_at, COALESCE(json_extract(up.overrides_json, '$.title'), p.title) AS title FROM user_papers up JOIN research_papers p ON p.id = up.paper_id
        WHERE up.owner_id = ? AND up.reviewed_at IS NOT NULL AND ${pv.sql.replace(/reviewed_at/g, "up.reviewed_at")}`, [ownerId, ...pv.args]),
    q(`SELECT c.id, c.visited_at, p.name FROM atlas_checkins c JOIN atlas_places p ON p.id = c.place_id
        WHERE c.owner_id = ? AND ${ck.sql.replace(/visited_at/g, "c.visited_at")}`, [ownerId, ...ck.args]),
    // Tempo programando (WakaTime): um golpe por dia com pelo menos 15 min reais.
    q(`SELECT day_key, total_seconds FROM wakatime_days WHERE owner_id = ? AND day_key >= ? AND day_key <= ? AND total_seconds >= 900`, [ownerId, fromDay, toDay]),
  ]);

  const hits: ActivityHit[] = [];
  const push = (h: Omit<ActivityHit, "day"> & { day?: string }) => hits.push({ ...h, day: h.day ?? localDayOfStored(h.at, tz) });

  for (const x of tasks) push({ kind: "tarefa", id: `tarefa:${s(x.id)}`, at: s(x.completed_at), label: s(x.title), minutes: null, boost: s(x.priority) === "Alta" ? 1.3 : 1 });
  for (const x of habits) push({ kind: "habito", id: `habito:${s(x.id)}`, at: dateOnlyAt(s(x.entry_date)), day: s(x.entry_date), label: s(x.name) || "Hábito", minutes: null, boost: 1 });
  for (const x of reading) push({ kind: "leitura", id: `leitura:${s(x.id)}`, at: s(x.started_at), label: s(x.title) || "Sessão de leitura", minutes: n(x.duration_minutes), boost: 1 });
  for (const x of workouts) push({ kind: "treino", id: `treino:${s(x.id)}`, at: s(x.performed_at), label: s(x.kind) || "Treino", minutes: n(x.duration_minutes), boost: 1 });
  for (const x of studies) {
    const day = s(x.occurred_at).slice(0, 10);
    push({ kind: "estudo", id: `estudo:${s(x.id)}`, at: dateOnlyAt(day), day, label: "Sessão de estudo", minutes: n(x.duration_minutes), boost: 1 });
  }
  for (const x of code) {
    const kind: ActivityKind = s(x.kind) === "commit" ? "commit" : s(x.kind) === "release" ? "release" : "pr";
    push({ kind, id: `codigo:${s(x.id)}`, at: s(x.occurred_at), label: `${s(x.repo_full_name)}${x.title ? ` · ${s(x.title)}` : ""}`, minutes: null, boost: 1 });
  }
  for (const x of papersRead) push({ kind: "artigo_lido", id: `artigo-lido:${s(x.id)}`, at: s(x.read_at), label: s(x.title) || "Artigo", minutes: null, boost: 1 });
  for (const x of papersRev) push({ kind: "artigo_fichado", id: `artigo-fichado:${s(x.id)}`, at: s(x.reviewed_at), label: s(x.title) || "Artigo", minutes: null, boost: 1 });
  for (const x of waka) {
    const day = s(x.day_key);
    push({ kind: "programacao", id: `programacao:${day}`, at: dateOnlyAt(day), day, label: "Tempo programando (WakaTime)", minutes: Math.round(Number(x.total_seconds) / 60), boost: 1 });
  }
  for (const x of checkins) push({ kind: "exploracao", id: `exploracao:${s(x.id)}`, at: s(x.visited_at), label: s(x.name) || "Exploração", minutes: null, boost: 1 });

  // Filtra pelo dia local (as fontes só com data já vêm no intervalo).
  return hits.filter((h) => h.day >= fromDay && h.day <= toDay).sort((a, b) => atMs(a.at) - atMs(b.at));
}

/** Milissegundos de um timestamp gravado (aceita "YYYY-MM-DD HH:MM:SS" do SQLite e ISO). */
export function atMs(at: string): number {
  const ms = Date.parse(normalizeStoredUtc(at));
  return Number.isNaN(ms) ? 0 : ms;
}

/** Dias locais (YYYY-MM-DD) com pelo menos uma atividade. */
export function activeDays(hits: ActivityHit[]): Set<string> {
  return new Set(hits.map((h) => h.day));
}
