import { getDb } from "../db/client.js";

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
}

/**
 * Reúne, ao vivo, tudo que o Diário mostra mas NÃO guarda em journal_entries:
 * humor/energia (Saúde), sono (Saúde), insight do dia (Copilot), foco
 * sugerido (Tarefas) e livro atual (Biblioteca) — evita duplicar dado
 * que já existe em outro módulo.
 */
export async function getJournalAutoData(db: Db, ownerId: string, date: string): Promise<JournalAutoData> {
  const [moodRes, sleepRes, insightRes, tasksRes, bookRes, habitsRes] = await Promise.all([
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
  ]);

  const moodRow = moodRes.rows[0] as unknown as { mood: number; energy: number; stress: number | null } | undefined;
  const sleepRow = sleepRes.rows[0] as unknown as { duration_minutes: number | null; quality: number | null } | undefined;
  const insightRow = insightRes.rows[0] as unknown as { text: string } | undefined;
  const bookRow = bookRes.rows[0] as unknown as { id: string; title: string; author: string | null; cover_url: string | null } | undefined;
  const doneHabitNames = (habitsRes.rows as unknown as Array<{ name: string }>).map((r) => r.name.toLowerCase());

  const autoSelfCare = Object.entries(SELF_CARE_HABIT_KEYWORDS)
    .filter(([, keywords]) => doneHabitNames.some((name) => keywords.some((k) => name.includes(k))))
    .map(([key]) => key);

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
  };
}
