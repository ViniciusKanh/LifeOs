import { getDb } from "../db/client.js";
import { pickDailyWisdom, type DailyWisdom } from "../config/dailyWisdom.js";

type Db = ReturnType<typeof getDb>;

/** Itens padrão de "Cuidado comigo" — o front pode marcar outros manualmente também. */
const SELF_CARE_HABIT_KEYWORDS: Record<string, string[]> = {
  meditar: ["medita", "respira", "mindful"],
  exercicio: ["exerc", "treino", "corrida", "academia", "caminhada"],
  ler: ["ler", "leitura"],
  evitar_redes: ["rede social", "redes sociais", "tela"],
};

export interface JournalAutoData {
  mood: { mood: number; energy: number; stress: number | null } | null;
  sleep: { qualityScore: number | null; durationMinutes: number | null } | null;
  insightText: string | null;
  suggestedFocusTasks: Array<{ id: string; title: string; priority: string }>;
  currentBook: { id: string; title: string; author: string | null; coverUrl: string | null } | null;
  autoSelfCare: string[];
  tasksToday: { done: number; total: number };
  habitsToday: { done: number; total: number; streak: { habitName: string; streak: number } | null };
  waterMl: number;
  exerciseMinutes: number;
  reading: { pages: number; minutes: number };
  summary: string;
  /** Frase de reflexão do dia (provérbio ou versículo) — conteúdo curado, não é dado do usuário nem gerado por IA (ver config/dailyWisdom.ts). */
  dailyQuote: DailyWisdom;
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/**
 * Frase-resumo do dia, montada só com o que realmente aconteceu — nenhum
 * número aqui é estimado. Cada cláusula só entra na frase se houver dado
 * (tarefa concluída, hábito, foco, água, exercício ou leitura); sem
 * nenhum deles, a função devolve uma frase neutra, nunca inventada.
 */
function buildSummary(parts: {
  tasksToday: { done: number; total: number };
  habitsToday: { done: number; total: number };
  waterMl: number;
  exerciseMinutes: number;
  reading: { pages: number; minutes: number };
  mood: { mood: number; energy: number } | null;
}): string {
  const clauses: string[] = [];
  if (parts.tasksToday.total > 0) clauses.push(`${parts.tasksToday.done} de ${parts.tasksToday.total} tarefas concluídas`);
  if (parts.habitsToday.total > 0) clauses.push(`${parts.habitsToday.done} de ${parts.habitsToday.total} hábitos em dia`);
  if (parts.exerciseMinutes > 0) clauses.push(`${fmtMinutes(parts.exerciseMinutes)} de exercício`);
  if (parts.reading.pages > 0) clauses.push(`${parts.reading.pages} páginas lidas`);
  if (parts.waterMl > 0) clauses.push(`${(parts.waterMl / 1000).toFixed(1)}L de água`);

  if (clauses.length === 0) {
    return "Ainda não há registros de hoje nos outros módulos do LifeOS — comece por uma tarefa, um hábito ou uma sessão de foco.";
  }
  const moodNote = parts.mood ? ` Humor ${parts.mood.mood}/5, energia ${parts.mood.energy}/5.` : "";
  return `Hoje: ${clauses.join(", ")}.${moodNote}`;
}

/**
 * Reúne, ao vivo, tudo que o Diário mostra mas NÃO guarda em journal_entries:
 * humor/energia e sono (Saúde), insight do dia (Copilot), foco sugerido e
 * concluído (Tarefas/Focus), hábitos, água, exercício e leitura de hoje —
 * evita duplicar dado que já existe em outro módulo, e monta a partir
 * disso a frase-resumo automática do dia.
 */
export interface JournalInsights {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  totalWords: number;
}

const WRITTEN_FIELDS = [
  "intention",
  "thoughts",
  "challenges",
  "lighter_plan",
  "feel_good",
  "night_helped",
  "night_takeaway",
] as const;

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function hasWrittenContent(row: Record<string, unknown>): boolean {
  if (WRITTEN_FIELDS.some((f) => typeof row[f] === "string" && (row[f] as string).trim().length > 0)) return true;
  const gratitude = typeof row.gratitude === "string" ? row.gratitude : "[]";
  const selfCare = typeof row.self_care === "string" ? row.self_care : "[]";
  try {
    if ((JSON.parse(gratitude) as unknown[]).length > 0) return true;
  } catch {
    /* ignora JSON inválido */
  }
  try {
    if ((JSON.parse(selfCare) as unknown[]).length > 0) return true;
  } catch {
    /* ignora JSON inválido */
  }
  return false;
}

/**
 * Estatísticas do hábito de escrever no diário — "Insights" real (nunca
 * inventado): quantos dias distintos têm entrada com conteúdo de verdade
 * (não conta um dia em que só os dados automáticos existem, sem nada
 * escrito), sequência atual/recorde de dias seguidos escrevendo, e total
 * de palavras somando os campos de texto de todas as entradas.
 */
export async function getJournalInsights(db: Db, ownerId: string): Promise<JournalInsights> {
  const result = await db.execute({
    sql: `SELECT entry_date, intention, thoughts, challenges, lighter_plan, feel_good, night_helped, night_takeaway, gratitude, self_care
          FROM journal_entries WHERE owner_id = ? ORDER BY entry_date ASC`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<Record<string, unknown>>;
  const writtenRows = rows.filter(hasWrittenContent);

  const totalWords = writtenRows.reduce(
    (sum, row) => sum + WRITTEN_FIELDS.reduce((s, f) => s + countWords(row[f] as string | null), 0),
    0
  );

  const dates = new Set(writtenRows.map((r) => String(r.entry_date)));
  const sorted = [...dates].sort();
  let longestStreak = 0;
  let running = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    if (prev) {
      const gapDays = Math.round((Date.parse(date) - Date.parse(prev)) / 86_400_000);
      running = gapDays === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prev = date;
  }

  let currentStreak = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { totalEntries: writtenRows.length, currentStreak, longestStreak, totalWords };
}

export async function getJournalAutoData(db: Db, ownerId: string, date: string): Promise<JournalAutoData> {
  const [
    moodRes,
    sleepRes,
    insightRes,
    tasksRes,
    bookRes,
    habitsDoneRes,
    tasksTodayRes,
    habitsTodayRes,
    waterRes,
    exerciseRes,
    readingRes,
    bestStreakRes,
  ] = await Promise.all([
    db.execute({
      sql: "SELECT mood, energy, stress FROM mood_entries WHERE owner_id = ? AND date(recorded_at) = date(?) ORDER BY recorded_at DESC LIMIT 1",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT duration_minutes, quality FROM sleep_entries WHERE owner_id = ? AND date(woke_up_at) = date(?) ORDER BY woke_up_at DESC LIMIT 1",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT text FROM daily_insights WHERE owner_id = ? AND insight_date = ? LIMIT 1",
      args: [ownerId, date],
    }),
    db.execute({
      sql: `SELECT id, title, priority FROM tasks
            WHERE owner_id = ? AND status != 'Concluído' AND (due_date IS NULL OR date(due_date) <= date(?))
            ORDER BY CASE priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, COALESCE(due_date, '9999-12-31') ASC
            LIMIT 3`,
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT id, title, author, cover_url FROM books WHERE owner_id = ? AND status = 'Lendo' ORDER BY updated_at DESC LIMIT 1",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT h.name AS name FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date = ? AND he.count >= h.target_count`,
      args: [ownerId, date],
    }),
    // Mesma definição de "tarefas de hoje" usada no Dashboard: due_date = hoje
    // (qualquer status), pra os dois números baterem em qualquer tela.
    db.execute({
      sql: "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END) AS done FROM tasks WHERE owner_id = ? AND date(due_date) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS total FROM habits WHERE owner_id = ? AND archived_at IS NULL",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS total FROM workouts WHERE owner_id = ? AND date(performed_at) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(pages_read), 0) AS pages, COALESCE(SUM(duration_minutes), 0) AS minutes FROM reading_sessions WHERE owner_id = ? AND date(started_at) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: `SELECT h.name AS name, COUNT(*) AS streak FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date <= ? AND he.count >= h.target_count
            GROUP BY he.habit_id ORDER BY streak DESC LIMIT 1`,
      args: [ownerId, date],
    }),
  ]);

  const moodRow = moodRes.rows[0] as unknown as { mood: number; energy: number; stress: number | null } | undefined;
  const sleepRow = sleepRes.rows[0] as unknown as { duration_minutes: number | null; quality: number | null } | undefined;
  const insightRow = insightRes.rows[0] as unknown as { text: string } | undefined;
  const bookRow = bookRes.rows[0] as unknown as { id: string; title: string; author: string | null; cover_url: string | null } | undefined;
  const doneHabitNames = (habitsDoneRes.rows as unknown as Array<{ name: string }>).map((r) => r.name.toLowerCase());

  const autoSelfCare = Object.entries(SELF_CARE_HABIT_KEYWORDS)
    .filter(([, keywords]) => doneHabitNames.some((name) => keywords.some((k) => name.includes(k))))
    .map(([key]) => key);

  const tasksTodayRow = tasksTodayRes.rows[0] as unknown as { total: number; done: number } | undefined;
  const habitsTotal = Number((habitsTodayRes.rows[0] as unknown as { total: number } | undefined)?.total ?? 0);
  const bestStreakRow = bestStreakRes.rows[0] as unknown as { name: string; streak: number } | undefined;

  const tasksToday = { done: Number(tasksTodayRow?.done ?? 0), total: Number(tasksTodayRow?.total ?? 0) };
  const habitsToday = {
    done: doneHabitNames.length,
    total: habitsTotal,
    streak: bestStreakRow && bestStreakRow.streak >= 2 ? { habitName: bestStreakRow.name, streak: bestStreakRow.streak } : null,
  };
  const waterMl = Number((waterRes.rows[0] as unknown as { total: number } | undefined)?.total ?? 0);
  const exerciseMinutes = Number((exerciseRes.rows[0] as unknown as { total: number } | undefined)?.total ?? 0);
  const readingRow = readingRes.rows[0] as unknown as { pages: number; minutes: number } | undefined;
  const reading = { pages: Number(readingRow?.pages ?? 0), minutes: Number(readingRow?.minutes ?? 0) };

  const mood = moodRow ? { mood: moodRow.mood, energy: moodRow.energy } : null;

  return {
    mood: moodRow ? { mood: moodRow.mood, energy: moodRow.energy, stress: moodRow.stress } : null,
    sleep: sleepRow ? { qualityScore: sleepRow.quality, durationMinutes: sleepRow.duration_minutes } : null,
    insightText: insightRow?.text ?? null,
    suggestedFocusTasks: (tasksRes.rows as unknown as Array<{ id: string; title: string; priority: string }>).map((r) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
    })),
    currentBook: bookRow
      ? { id: bookRow.id, title: bookRow.title, author: bookRow.author, coverUrl: bookRow.cover_url }
      : null,
    autoSelfCare,
    tasksToday,
    habitsToday,
    waterMl,
    exerciseMinutes,
    reading,
    summary: buildSummary({ tasksToday, habitsToday, waterMl, exerciseMinutes, reading, mood }),
    dailyQuote: pickDailyWisdom(date),
  };
}
