import { nanoid } from "nanoid";
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
  /** Média de palavras por entrada (arredondada) — 0 quando ainda não há nenhuma entrada. */
  avgWordsPerEntry: number;
  /** Dia da semana com mais entradas escritas (ex.: "domingo") — null sem dados suficientes. */
  bestWeekday: string | null;
  /**
   * Correlação real entre escrever no Diário e o humor registrado em Saúde
   * (mood_entries) no mesmo dia — só é calculada (não inventada) quando há
   * pelo menos 5 dias com humor registrado em cada grupo (dias com entrada
   * e dias sem), pra não tirar conclusão de amostra pequena demais.
   */
  moodCorrelation: {
    onWritingDays: number;
    onOtherDays: number;
    sampleSize: { writingDays: number; otherDays: number };
  } | null;
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

/**
 * Remove marcação HTML do editor de texto rico (Fase 3), devolvendo texto
 * puro pra contar palavras, detectar conteúdo real e montar preview — nunca
 * expõe HTML cru pro usuário. Blocos (</p>, </li>, <br>, etc.) viram espaço
 * pra não colar palavras de parágrafos/itens diferentes.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string | null | undefined): number {
  const plain = stripHtml(text);
  return plain.length === 0 ? 0 : plain.split(/\s+/).length;
}

function hasWrittenContent(row: Record<string, unknown>): boolean {
  if (WRITTEN_FIELDS.some((f) => typeof row[f] === "string" && stripHtml(row[f] as string).length > 0)) return true;
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

  const avgWordsPerEntry = writtenRows.length > 0 ? Math.round(totalWords / writtenRows.length) : 0;

  // Dia da semana com mais entradas — parse com "T00:00:00" pra não sofrer
  // deslocamento de fuso horário na hora de descobrir o dia da semana.
  const WEEKDAY_LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  let bestWeekday: string | null = null;
  if (sorted.length > 0) {
    const weekdayCounts = new Array(7).fill(0);
    for (const date of sorted) {
      weekdayCounts[new Date(`${date}T00:00:00`).getDay()] += 1;
    }
    const maxCount = Math.max(...weekdayCounts);
    if (maxCount > 0) bestWeekday = WEEKDAY_LABELS[weekdayCounts.indexOf(maxCount)];
  }

  // Correlação real com humor (Saúde): agrupa mood_entries por dia (pode
  // haver mais de um registro no mesmo dia) e separa em "dias que escrevi
  // no Diário" vs "dias que não escrevi", comparando a média de humor.
  const moodByDay = await db.execute({
    sql: `SELECT date(recorded_at) AS d, AVG(mood) AS avg_mood FROM mood_entries WHERE owner_id = ? GROUP BY d`,
    args: [ownerId],
  });
  const writingMoods: number[] = [];
  const otherMoods: number[] = [];
  for (const row of moodByDay.rows as unknown as Array<{ d: string; avg_mood: number }>) {
    (dates.has(row.d) ? writingMoods : otherMoods).push(Number(row.avg_mood));
  }
  const MIN_SAMPLE = 5;
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const moodCorrelation =
    writingMoods.length >= MIN_SAMPLE && otherMoods.length >= MIN_SAMPLE
      ? {
          onWritingDays: Math.round(avg(writingMoods) * 10) / 10,
          onOtherDays: Math.round(avg(otherMoods) * 10) / 10,
          sampleSize: { writingDays: writingMoods.length, otherDays: otherMoods.length },
        }
      : null;

  return {
    totalEntries: writtenRows.length,
    currentStreak,
    longestStreak,
    totalWords,
    avgWordsPerEntry,
    bestWeekday,
    moodCorrelation,
  };
}

/** Um item do feed "Entradas" — resumo de um dia com conteúdo real escrito, sem os dados pesados de auto (esses só são buscados na tela do dia). */
export interface JournalDaySummary {
  date: string;
  preview: string;
  wordCount: number;
  gratitudeCount: number;
  selfCareCount: number;
  nightMood: number | null;
  mood: { mood: number; energy: number } | null;
  journalIds: string[];
  photoCount: number;
  coverPhoto: string | null;
  isFavorite: boolean;
}

/** Uma foto anexada à entrada do dia (Fase 4 do Diário — Apple Journal). */
export interface JournalMedia {
  id: string;
  dataUri: string;
  caption: string | null;
  sortOrder: number;
}

const PREVIEW_FIELD_ORDER = ["intention", "thoughts", "feel_good", "challenges", "lighter_plan", "night_takeaway"] as const;

function buildPreview(row: Record<string, unknown>): string {
  for (const field of PREVIEW_FIELD_ORDER) {
    const value = row[field];
    const plain = typeof value === "string" ? stripHtml(value) : "";
    if (plain.length > 0) {
      return plain.length > 220 ? `${plain.slice(0, 220)}…` : plain;
    }
  }
  const gratitude = parseJsonArraySafe(row.gratitude as string | undefined);
  if (gratitude.length > 0) return `Grato por: ${gratitude.join(", ")}`;
  return "Entrada sem texto — só itens marcados (cuidado comigo/gratidão).";
}

function parseJsonArraySafe(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Feed cronológico do Diário (aba "Entradas") — só dias com conteúdo
 * real escrito pelo usuário, mais recentes primeiro, com paginação por
 * cursor (before = último `date` da página anterior). O humor do dia
 * (quando existir) vem de mood_entries, mesma fonte usada na tela do dia.
 */
export async function listJournalDays(
  db: Db,
  ownerId: string,
  opts: { before?: string; limit?: number; journalId?: string; favoritesOnly?: boolean } = {}
): Promise<{ items: JournalDaySummary[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const conditions = ["owner_id = ?"];
  const args: Array<string | number> = [ownerId];
  if (opts.before) {
    conditions.push("entry_date < ?");
    args.push(opts.before);
  }
  if (opts.journalId) {
    conditions.push("id IN (SELECT entry_id FROM journal_entry_journals WHERE journal_id = ?)");
    args.push(opts.journalId);
  }
  if (opts.favoritesOnly) {
    conditions.push("is_favorite = 1");
  }

  const result = await db.execute({
    sql: `SELECT * FROM journal_entries WHERE ${conditions.join(" AND ")} ORDER BY entry_date DESC LIMIT ?`,
    args: [...args, limit + 1],
  });
  const rows = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const items = await enrichEntrySummaries(db, ownerId, page);
  return { items, hasMore };
}

/**
 * Enriquece linhas cruas de journal_entries com o mesmo dado real usado no
 * feed "Entradas" (humor do dia, diários vinculados, contagem e capa de
 * fotos) — compartilhado entre listJournalDays e getJournalOnThisDay
 * (Fase 10) pra nunca duplicar essa lógica.
 */
async function enrichEntrySummaries(db: Db, ownerId: string, page: Array<Record<string, unknown>>): Promise<JournalDaySummary[]> {
  const moodByDate = new Map<string, { mood: number; energy: number }>();
  const journalIdsByEntry = new Map<string, string[]>();
  const photoCountByEntry = new Map<string, number>();
  const coverPhotoByEntry = new Map<string, string>();
  if (page.length > 0) {
    const dates = page.map((r) => String(r.entry_date));
    const placeholders = dates.map(() => "?").join(",");
    const moodRes = await db.execute({
      // Um registro de humor por dia (o mais recente) — window function em
      // vez de GROUP BY, pra não depender de comportamento implícito do SQLite.
      sql: `SELECT d, mood, energy FROM (
              SELECT date(recorded_at) AS d, mood, energy,
                     ROW_NUMBER() OVER (PARTITION BY date(recorded_at) ORDER BY recorded_at DESC) AS rn
              FROM mood_entries
              WHERE owner_id = ? AND date(recorded_at) IN (${placeholders})
            ) WHERE rn = 1`,
      args: [ownerId, ...dates],
    });
    for (const r of moodRes.rows as unknown as Array<{ d: string; mood: number; energy: number }>) {
      moodByDate.set(r.d, { mood: r.mood, energy: r.energy });
    }

    const entryIds = page.map((r) => String(r.id));
    const entryPlaceholders = entryIds.map(() => "?").join(",");
    const journalLinksRes = await db.execute({
      sql: `SELECT entry_id, journal_id FROM journal_entry_journals WHERE entry_id IN (${entryPlaceholders})`,
      args: entryIds,
    });
    for (const r of journalLinksRes.rows as unknown as Array<{ entry_id: string; journal_id: string }>) {
      const list = journalIdsByEntry.get(r.entry_id) ?? [];
      list.push(r.journal_id);
      journalIdsByEntry.set(r.entry_id, list);
    }

    const mediaCountRes = await db.execute({
      sql: `SELECT entry_id, COUNT(*) AS total FROM journal_entry_media WHERE entry_id IN (${entryPlaceholders}) GROUP BY entry_id`,
      args: entryIds,
    });
    for (const r of mediaCountRes.rows as unknown as Array<{ entry_id: string; total: number }>) {
      photoCountByEntry.set(r.entry_id, Number(r.total));
    }
    const coverPhotoRes = await db.execute({
      sql: `SELECT entry_id, data_uri FROM (
              SELECT entry_id, data_uri,
                     ROW_NUMBER() OVER (PARTITION BY entry_id ORDER BY sort_order ASC, created_at ASC) AS rn
              FROM journal_entry_media
              WHERE entry_id IN (${entryPlaceholders})
            ) WHERE rn = 1`,
      args: entryIds,
    });
    for (const r of coverPhotoRes.rows as unknown as Array<{ entry_id: string; data_uri: string }>) {
      coverPhotoByEntry.set(r.entry_id, r.data_uri);
    }
  }

  return page.map((row) => ({
    date: String(row.entry_date),
    preview: buildPreview(row),
    wordCount: WRITTEN_FIELDS.reduce((s, f) => s + countWords(row[f] as string | null), 0),
    gratitudeCount: parseJsonArraySafe(row.gratitude as string | undefined).length,
    selfCareCount: parseJsonArraySafe(row.self_care as string | undefined).length,
    nightMood: (row.night_mood as number | null) ?? null,
    mood: moodByDate.get(String(row.entry_date)) ?? null,
    journalIds: journalIdsByEntry.get(String(row.id)) ?? [],
    photoCount: photoCountByEntry.get(String(row.id)) ?? 0,
    coverPhoto: coverPhotoByEntry.get(String(row.id)) ?? null,
    isFavorite: Number(row.is_favorite ?? 0) === 1,
  }));
}

/**
 * Verifica se o usuário já escreveu algo real no diário numa data (Fase 11
 * — lembrete de escrita): reaproveita a mesma regra de "conteúdo real"
 * usada no feed, pra nunca cobrar quem já escreveu.
 */
export async function hasJournalEntryForDate(db: Db, ownerId: string, date: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT * FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
    args: [ownerId, date],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  return !!row && hasWrittenContent(row);
}

/**
 * "Lembranças" (Fase 10 — On This Day do Apple Journal): entradas reais de
 * anos anteriores no mesmo dia e mês de `date` (padrão: hoje). Nunca mistura
 * com o ano atual, nunca inventa nada — só existe quando o usuário
 * realmente escreveu algo naquele dia em um ano passado.
 */
export async function getJournalOnThisDay(db: Db, ownerId: string, date: string): Promise<JournalDaySummary[]> {
  const result = await db.execute({
    sql: `SELECT * FROM journal_entries
          WHERE owner_id = ? AND entry_date != ? AND strftime('%m-%d', entry_date) = strftime('%m-%d', ?)
          ORDER BY entry_date DESC`,
    args: [ownerId, date, date],
  });
  const page = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  return enrichEntrySummaries(db, ownerId, page);
}

/**
 * Datas do mês (YYYY-MM) que possuem entrada com conteúdo real escrito —
 * usado só pra marcar os pontinhos da aba "Calendário", nunca inventa
 * presença de entrada.
 */
export async function getJournalCalendarMonth(db: Db, ownerId: string, month: string, journalId?: string): Promise<string[]> {
  const journalClause = journalId ? "AND id IN (SELECT entry_id FROM journal_entry_journals WHERE journal_id = ?)" : "";
  const args = journalId ? [ownerId, `${month}%`, journalId] : [ownerId, `${month}%`];
  const result = await db.execute({
    sql: `SELECT * FROM journal_entries WHERE owner_id = ? AND entry_date LIKE ? ${journalClause} ORDER BY entry_date ASC`,
    args,
  });
  const rows = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  return rows.map((r) => String(r.entry_date));
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

/**
 * Garante que exista uma linha em journal_entries pra esse dia (mesmo
 * sem nenhum campo de texto preenchido ainda) e devolve o id — usado
 * ao anexar a primeira foto do dia antes de qualquer texto ser salvo.
 */
export async function ensureJournalEntryId(db: Db, ownerId: string, date: string): Promise<string> {
  const existing = await db.execute({
    sql: "SELECT id FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
    args: [ownerId, date],
  });
  const row = existing.rows[0] as unknown as { id: string } | undefined;
  if (row) return row.id;

  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO journal_entries (id, owner_id, entry_date) VALUES (?, ?, ?)",
    args: [id, ownerId, date],
  });
  return id;
}

/** Fotos da entrada do dia, na ordem em que aparecem na tela. */
export async function getJournalMedia(db: Db, entryId: string): Promise<JournalMedia[]> {
  const result = await db.execute({
    sql: "SELECT id, data_uri, caption, sort_order FROM journal_entry_media WHERE entry_id = ? ORDER BY sort_order ASC, created_at ASC",
    args: [entryId],
  });
  return (result.rows as unknown as Array<{ id: string; data_uri: string; caption: string | null; sort_order: number }>).map((r) => ({
    id: r.id,
    dataUri: r.data_uri,
    caption: r.caption,
    sortOrder: r.sort_order,
  }));
}

/** Limite conservador de fotos por dia — suficiente pra um registro visual do dia sem deixar o banco inchar. */
export const MAX_JOURNAL_PHOTOS_PER_DAY = 12;

/** Adiciona uma foto à entrada do dia (criando a entrada se ainda não existir). Devolve null se o limite por dia já foi atingido. */
export async function addJournalMedia(
  db: Db,
  ownerId: string,
  entryId: string,
  dataUri: string,
  caption: string | null
): Promise<JournalMedia | null> {
  const countRes = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM journal_entry_media WHERE entry_id = ?",
    args: [entryId],
  });
  const total = Number((countRes.rows[0] as unknown as { total: number }).total);
  if (total >= MAX_JOURNAL_PHOTOS_PER_DAY) return null;

  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO journal_entry_media (id, entry_id, owner_id, data_uri, caption, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, entryId, ownerId, dataUri, caption, total],
  });
  return { id, dataUri, caption, sortOrder: total };
}

/** Atualiza a legenda de uma foto — sempre validando que ela pertence ao dono autenticado. */
export async function updateJournalMediaCaption(db: Db, ownerId: string, mediaId: string, caption: string | null): Promise<boolean> {
  const result = await db.execute({
    sql: "UPDATE journal_entry_media SET caption = ? WHERE id = ? AND owner_id = ?",
    args: [caption, mediaId, ownerId],
  });
  return result.rowsAffected > 0;
}

/** Remove uma foto — sempre validando que ela pertence ao dono autenticado. */
export async function deleteJournalMedia(db: Db, ownerId: string, mediaId: string): Promise<boolean> {
  const result = await db.execute({
    sql: "DELETE FROM journal_entry_media WHERE id = ? AND owner_id = ?",
    args: [mediaId, ownerId],
  });
  return result.rowsAffected > 0;
}

/**
 * Marca/desmarca o dia como favorito (Fase 6) — cria a entrada vazia se
 * ainda não existir (favoritar sozinho já conta como registro do dia,
 * igual a uma foto).
 */
export async function setJournalFavorite(db: Db, ownerId: string, date: string, isFavorite: boolean): Promise<void> {
  const entryId = await ensureJournalEntryId(db, ownerId, date);
  await db.execute({
    sql: "UPDATE journal_entries SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?",
    args: [isFavorite ? 1 : 0, entryId],
  });
}

/**
 * Exclui a entrada do dia inteira (Fase 8 — privacidade/exclusão): fotos,
 * vínculos com diários (coleções) e o registro em si. Apaga explicitamente
 * as tabelas filhas em vez de confiar em ON DELETE CASCADE — o Turso/libSQL
 * não garante `PRAGMA foreign_keys` ligado por conexão. Não faz nada (e
 * devolve false) se o dia nunca teve entrada criada.
 */
export async function deleteJournalEntry(db: Db, ownerId: string, date: string): Promise<boolean> {
  const existing = await db.execute({
    sql: "SELECT id FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
    args: [ownerId, date],
  });
  const row = existing.rows[0] as unknown as { id: string } | undefined;
  if (!row) return false;

  await db.execute({ sql: "DELETE FROM journal_entry_media WHERE entry_id = ? AND owner_id = ?", args: [row.id, ownerId] });
  await db.execute({ sql: "DELETE FROM journal_entry_journals WHERE entry_id = ?", args: [row.id] });
  await db.execute({ sql: "DELETE FROM journal_entries WHERE id = ? AND owner_id = ?", args: [row.id, ownerId] });
  return true;
}
