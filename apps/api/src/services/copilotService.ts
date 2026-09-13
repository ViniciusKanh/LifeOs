import { getDb } from "../db/client.js";
import { computeLifeScore } from "./metricsService.js";
import { getGeminiConfig, generateText } from "./geminiService.js";

/**
 * LifeOS Copilot — insight gerado por IA no Dashboard. O prompt é
 * montado só com números reais do próprio usuário (Life Score,
 * tarefas, hábitos, água/sono, leitura, metas); o Gemini nunca recebe
 * autorização para inventar dado — só para comentar o que já existe.
 */

type Db = ReturnType<typeof getDb>;

async function scalar(db: Db, sql: string, args: Array<string | number>): Promise<number> {
  const result = await db.execute({ sql, args });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return 0;
  return Number(Object.values(row)[0] ?? 0);
}

async function buildContext(ownerId: string) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const score = await computeLifeScore(ownerId, today);

  const [tasksOpen, tasksOverdue, habitsTotal, habitsDoneToday, waterMl, currentBook, nextMilestone] = await Promise.all([
    scalar(db, "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status != 'Concluído'", [ownerId]),
    scalar(
      db,
      "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND date(due_date) < date(?)",
      [ownerId, today]
    ),
    scalar(db, "SELECT COUNT(*) FROM habits WHERE owner_id = ? AND archived_at IS NULL", [ownerId]),
    scalar(
      db,
      `SELECT COUNT(*) FROM habit_entries he JOIN habits h ON h.id = he.habit_id
       WHERE he.owner_id = ? AND he.entry_date = ? AND h.archived_at IS NULL AND he.count >= h.target_count`,
      [ownerId, today]
    ),
    scalar(db, "SELECT COALESCE(SUM(amount_ml), 0) FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)", [
      ownerId,
      today,
    ]),
    db.execute({
      sql: "SELECT title, current_page, total_pages FROM books WHERE owner_id = ? AND status = 'Lendo' ORDER BY updated_at DESC LIMIT 1",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT title, next_action, next_action_due FROM goals WHERE owner_id = ? AND status = 'active' AND next_action IS NOT NULL ORDER BY next_action_due ASC LIMIT 1",
      args: [ownerId],
    }),
  ]);

  const book = currentBook.rows[0] as { title?: string; current_page?: number; total_pages?: number } | undefined;
  const milestone = nextMilestone.rows[0] as { title?: string; next_action?: string; next_action_due?: string } | undefined;

  return { score, tasksOpen, tasksOverdue, habitsTotal, habitsDoneToday, waterMl, book, milestone };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof buildContext>>): string {
  const { score, tasksOpen, tasksOverdue, habitsTotal, habitsDoneToday, waterMl, book, milestone } = ctx;

  const lines = [
    `Life Score geral: ${score.overall}/100.`,
    `Dimensões: produtividade ${score.productivity}, profissional ${score.professional}, saúde ${score.health}, educação ${score.education}, leitura ${score.reading}, hábitos ${score.habits}, metas ${score.goals} (todas 0-100).`,
    `Tarefas em aberto: ${tasksOpen} (${tasksOverdue} atrasadas).`,
    `Hábitos cumpridos hoje: ${habitsDoneToday} de ${habitsTotal}.`,
    `Água registrada hoje: ${(waterMl / 1000).toFixed(1)} L.`,
    book?.title
      ? `Lendo agora: "${book.title}"${book.total_pages ? ` (página ${book.current_page} de ${book.total_pages})` : ""}.`
      : "Nenhum livro em andamento.",
    milestone?.title ? `Próxima meta com ação definida: "${milestone.title}" — próximo passo: ${milestone.next_action}.` : "",
  ].filter(Boolean);

  return [
    "Você é o LifeOS Copilot, um assistente de produtividade pessoal. Com base SOMENTE nos dados reais abaixo (nunca invente números, tarefas, hábitos ou livros que não estejam listados), escreva um insight curto e específico em português do Brasil.",
    "",
    "Dados do usuário hoje:",
    ...lines.map((l) => `- ${l}`),
    "",
    "Regras: no máximo 3 frases (até ~60 palavras); cite pelo menos um número real dos dados acima; tom direto e encorajador, sem ser genérico ou piegas; termine com UMA sugestão prática e específica para hoje; nunca dê conselho médico, financeiro ou sobre assuntos fora de produtividade/rotina pessoal.",
  ].join("\n");
}

export async function generateDashboardInsight(ownerId: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildContext(ownerId);
  const prompt = buildPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, text: result.text };
}
