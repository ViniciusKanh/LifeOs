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

/**
 * Insight de bem-estar — mesmo princípio do Copilot do Dashboard, mas
 * com um contexto muito mais específico (só água, sono, exercício e
 * humor dos últimos 7 dias) para o Gemini conseguir cruzar os
 * próprios números do usuário com mais precisão (ex.: relação entre
 * poucas horas de sono e humor mais baixo) em vez de um resumo geral.
 */
const WATER_GOAL_ML = 2500;

async function buildHealthContext(ownerId: string) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [waterTodayMl, sleepRows, workoutsWeekRows, moodRows] = await Promise.all([
    scalar(db, "SELECT COALESCE(SUM(amount_ml), 0) FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)", [
      ownerId,
      today,
    ]),
    db.execute({
      sql: `SELECT duration_minutes, quality, went_to_bed_at FROM sleep_entries
            WHERE owner_id = ? AND went_to_bed_at >= datetime(?, '-7 days')
            ORDER BY went_to_bed_at DESC`,
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT kind, duration_minutes, performed_at FROM workouts
            WHERE owner_id = ? AND performed_at >= datetime(?, '-7 days')
            ORDER BY performed_at DESC`,
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT mood, energy, stress, recorded_at FROM mood_entries
            WHERE owner_id = ? AND recorded_at >= datetime(?, '-7 days')
            ORDER BY recorded_at DESC`,
      args: [ownerId, today],
    }),
  ]);

  const sleepEntries = sleepRows.rows as unknown as { duration_minutes: number | null; quality: number | null }[];
  const workoutEntries = workoutsWeekRows.rows as unknown as { kind: string; duration_minutes: number | null }[];
  const moodEntries = moodRows.rows as unknown as { mood: number; energy: number; stress: number }[];

  const sleepWithDuration = sleepEntries.filter((s) => s.duration_minutes);
  const avgSleepMinutes =
    sleepWithDuration.length > 0
      ? Math.round(sleepWithDuration.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / sleepWithDuration.length)
      : null;
  const sleepWithQuality = sleepEntries.filter((s) => s.quality);
  const avgSleepQuality =
    sleepWithQuality.length > 0
      ? Number((sleepWithQuality.reduce((sum, s) => sum + (s.quality ?? 0), 0) / sleepWithQuality.length).toFixed(1))
      : null;
  const lastNightMinutes = sleepEntries[0]?.duration_minutes ?? null;

  const workoutsTotalMinutes = workoutEntries.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0);

  const avgMood = moodEntries.length > 0 ? Number((moodEntries.reduce((s, m) => s + m.mood, 0) / moodEntries.length).toFixed(1)) : null;
  const avgEnergy = moodEntries.length > 0 ? Number((moodEntries.reduce((s, m) => s + m.energy, 0) / moodEntries.length).toFixed(1)) : null;
  const avgStress =
    moodEntries.filter((m) => m.stress).length > 0
      ? Number((moodEntries.reduce((s, m) => s + (m.stress ?? 0), 0) / moodEntries.length).toFixed(1))
      : null;
  const lastMood = moodEntries[0] ?? null;

  return {
    waterTodayMl,
    avgSleepMinutes,
    avgSleepQuality,
    lastNightMinutes,
    workoutsCount: workoutEntries.length,
    workoutsTotalMinutes,
    workoutKinds: [...new Set(workoutEntries.map((w) => w.kind))],
    avgMood,
    avgEnergy,
    avgStress,
    lastMood,
  };
}

function buildHealthPrompt(ctx: Awaited<ReturnType<typeof buildHealthContext>>): string {
  const lines = [
    `Água hoje: ${(ctx.waterTodayMl / 1000).toFixed(1)} L de uma meta de ${(WATER_GOAL_ML / 1000).toFixed(1)} L (${Math.round((ctx.waterTodayMl / WATER_GOAL_ML) * 100)}%).`,
    ctx.lastNightMinutes
      ? `Sono da última noite: ${Math.floor(ctx.lastNightMinutes / 60)}h${(ctx.lastNightMinutes % 60).toString().padStart(2, "0")}.`
      : "Sem registro de sono na última noite.",
    ctx.avgSleepMinutes
      ? `Média de sono nos últimos 7 dias: ${Math.floor(ctx.avgSleepMinutes / 60)}h${(ctx.avgSleepMinutes % 60).toString().padStart(2, "0")}${ctx.avgSleepQuality ? `, qualidade média ${ctx.avgSleepQuality}/5` : ""}.`
      : "Sem registros de sono suficientes nos últimos 7 dias para calcular média.",
    ctx.workoutsCount > 0
      ? `Exercícios nos últimos 7 dias: ${ctx.workoutsCount} (${ctx.workoutsTotalMinutes} min no total) — tipos: ${ctx.workoutKinds.join(", ")}.`
      : "Nenhum exercício registrado nos últimos 7 dias.",
    ctx.avgMood
      ? `Humor médio (7 dias): ${ctx.avgMood}/5, energia média ${ctx.avgEnergy}/5${ctx.avgStress ? `, estresse médio ${ctx.avgStress}/5` : ""}.`
      : "Sem registros de humor/energia nos últimos 7 dias.",
  ];

  return [
    "Você é o LifeOS Copilot, especializado em analisar dados de bem-estar (água, sono, exercício e humor). Com base SOMENTE nos dados reais abaixo (nunca invente números, tendências ou correlações que os dados não sustentem), escreva um insight curto em português do Brasil.",
    "",
    "Dados de bem-estar do usuário (últimos 7 dias, salvo indicação contrária):",
    ...lines.map((l) => `- ${l}`),
    "",
    "Regras: no máximo 3 frases (até ~65 palavras); se houver dados suficientes, aponte UMA relação concreta entre duas métricas (ex.: sono baixo e energia baixa) — só se os números realmente sugerirem isso, senão comente a métrica mais relevante isoladamente; cite pelo menos um número real; termine com UMA sugestão prática para hoje ou amanhã; nunca dê diagnóstico, conselho médico ou nutricional — fale só de hábitos e rotina.",
  ].join("\n");
}

export async function generateHealthInsight(ownerId: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildHealthContext(ownerId);
  const prompt = buildHealthPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, text: result.text };
}

/**
 * Insight de estudos — mesmo princípio, contexto restrito a uma única
 * formação (disciplinas, prazos, horas de estudo x meta semanal,
 * projetos acadêmicos), para o Gemini conseguir cruzar ritmo de
 * estudo com prazos reais em vez de um resumo genérico.
 */
async function buildEducationContext(ownerId: string, educationId: string) {
  const db = getDb();

  const eduRes = await db.execute({
    sql: "SELECT course_name, progress_pct, weekly_study_goal_minutes FROM educations WHERE id = ? AND owner_id = ?",
    args: [educationId, ownerId],
  });
  const education = eduRes.rows[0] as unknown as { course_name: string; progress_pct: number; weekly_study_goal_minutes: number } | undefined;
  if (!education) return null;

  const now = new Date();
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);
  const weekStart = monday.toISOString().slice(0, 10);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const weekEnd = nextMonday.toISOString().slice(0, 10);

  const [subjectsByStatus, pendingDeadlines, urgentDeadlines, studyMinutesThisWeek, academicProjects] = await Promise.all([
    db.execute({
      sql: `SELECT s.status, COUNT(*) as n FROM subjects s JOIN courses c ON c.id = s.course_id
            WHERE c.education_id = ? AND s.owner_id = ? GROUP BY s.status`,
      args: [educationId, ownerId],
    }),
    scalar(db, "SELECT COUNT(*) FROM academic_deadlines WHERE education_id = ? AND owner_id = ? AND done = 0", [educationId, ownerId]),
    scalar(
      db,
      "SELECT COUNT(*) FROM academic_deadlines WHERE education_id = ? AND owner_id = ? AND done = 0 AND due_date <= date('now', '+7 days')",
      [educationId, ownerId]
    ),
    scalar(
      db,
      "SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE education_id = ? AND owner_id = ? AND occurred_at >= ? AND occurred_at < ?",
      [educationId, ownerId, weekStart, weekEnd]
    ),
    db.execute({
      sql: "SELECT COUNT(*) as n, COALESCE(AVG(progress_pct), 0) as avg_pct FROM academic_projects WHERE education_id = ? AND owner_id = ? AND progress_pct < 100",
      args: [educationId, ownerId],
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of subjectsByStatus.rows as unknown as { status: string; n: number }[]) {
    statusCounts[row.status] = Number(row.n);
  }
  const projectsRow = academicProjects.rows[0] as unknown as { n: number; avg_pct: number } | undefined;

  return {
    courseName: education.course_name,
    progressPct: education.progress_pct,
    weeklyGoalMinutes: education.weekly_study_goal_minutes,
    subjectsInProgress: statusCounts["Em andamento"] ?? 0,
    subjectsDone: statusCounts["Concluída"] ?? 0,
    subjectsPlanned: statusCounts["Planejada"] ?? 0,
    pendingDeadlines,
    urgentDeadlines,
    studyMinutesThisWeek,
    activeProjectsCount: projectsRow ? Number(projectsRow.n) : 0,
    activeProjectsAvgPct: projectsRow ? Math.round(Number(projectsRow.avg_pct)) : 0,
  };
}

function buildEducationPrompt(ctx: NonNullable<Awaited<ReturnType<typeof buildEducationContext>>>): string {
  const weeklyGoalPct = ctx.weeklyGoalMinutes > 0 ? Math.round((ctx.studyMinutesThisWeek / ctx.weeklyGoalMinutes) * 100) : 0;
  const lines = [
    `Formação: "${ctx.courseName}", progresso geral ${ctx.progressPct}%.`,
    `Disciplinas: ${ctx.subjectsInProgress} em andamento, ${ctx.subjectsDone} concluídas, ${ctx.subjectsPlanned} planejadas.`,
    `Prazos pendentes: ${ctx.pendingDeadlines} (${ctx.urgentDeadlines} vencem nos próximos 7 dias).`,
    `Horas de estudo nesta semana: ${Math.floor(ctx.studyMinutesThisWeek / 60)}h${(ctx.studyMinutesThisWeek % 60).toString().padStart(2, "0")} de uma meta de ${Math.floor(ctx.weeklyGoalMinutes / 60)}h${(ctx.weeklyGoalMinutes % 60).toString().padStart(2, "0")} (${weeklyGoalPct}%).`,
    ctx.activeProjectsCount > 0
      ? `Projetos acadêmicos em andamento: ${ctx.activeProjectsCount}, progresso médio ${ctx.activeProjectsAvgPct}%.`
      : "Nenhum projeto acadêmico em andamento.",
  ];

  return [
    "Você é o LifeOS Copilot, especializado em rotina de estudos. Com base SOMENTE nos dados reais abaixo (nunca invente números, disciplinas ou prazos que não estejam listados), escreva um insight curto em português do Brasil.",
    "",
    "Dados da formação do usuário:",
    ...lines.map((l) => `- ${l}`),
    "",
    "Regras: no máximo 3 frases (até ~65 palavras); se fizer sentido, relacione o ritmo de estudo da semana com os prazos pendentes (ex.: poucas horas estudadas e prazo urgente próximo) — só se os números sustentarem isso; cite pelo menos um número real; termine com UMA sugestão prática para esta semana; nunca prometa nota, aprovação ou resultado acadêmico — fale só de ritmo e organização.",
  ].join("\n");
}

export async function generateEducationInsight(
  ownerId: string,
  educationId: string
): Promise<{ ok: boolean; text?: string; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildEducationContext(ownerId, educationId);
  if (!ctx) {
    return { ok: false, message: "Formação não encontrada." };
  }
  const prompt = buildEducationPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, text: result.text };
}
