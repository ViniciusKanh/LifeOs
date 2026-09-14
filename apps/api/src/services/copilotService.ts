import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { computeLifeScore, computeRangeMetrics, computeInsights, changePct } from "./metricsService.js";
import { getGeminiConfig, generateText } from "./geminiService.js";
import { sendPushToUser } from "./pushService.js";

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

/**
 * Insight de hábitos — mesmo princípio, contexto restrito a sequências,
 * consistência dos últimos 30 dias, categorias e horários reais de
 * check-in, para o Gemini apontar um padrão concreto (ex.: hábito em
 * risco de quebrar a sequência, ou horário do dia mais consistente)
 * em vez de um resumo genérico de "continue assim".
 */
async function buildHabitsContext(ownerId: string) {
  const db = getDb();

  const habitsResult = await db.execute({
    sql: "SELECT id, name, category, target_count FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC",
    args: [ownerId],
  });
  const habits = habitsResult.rows as unknown as Array<{ id: string; name: string; category: string | null; target_count: number }>;
  if (habits.length === 0) return null;

  const allEntriesResult = await db.execute({
    sql: `SELECT he.habit_id, he.entry_date, he.count, he.created_at FROM habit_entries he
          WHERE he.owner_id = ? ORDER BY he.entry_date ASC`,
    args: [ownerId],
  });
  const allEntries = allEntriesResult.rows as unknown as Array<{ habit_id: string; entry_date: string; count: number; created_at: string }>;

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const perHabit = habits.map((h) => {
    const dates = allEntries.filter((e) => e.habit_id === h.id && e.count >= h.target_count).map((e) => e.entry_date);
    const set = new Set(dates);
    const { current, best } = computeStreaksLocal(dates);
    const checkedToday = set.has(todayIso);
    const atRisk = !checkedToday && current > 0;
    return { name: h.name, category: h.category?.trim() || "Geral", currentStreak: current, bestStreak: best, checkedToday, atRisk };
  });

  const completedToday = perHabit.filter((h) => h.checkedToday).length;
  const completedYesterday = allEntries.filter((e) => e.entry_date === yesterdayIso).length > 0
    ? new Set(allEntries.filter((e) => e.entry_date === yesterdayIso).map((e) => e.habit_id)).size
    : 0;
  const habitsAtRisk = perHabit.filter((h) => h.atRisk);
  const bestStreakOverall = Math.max(0, ...perHabit.map((h) => h.bestStreak));
  const currentStreakOverall = Math.max(0, ...perHabit.map((h) => h.currentStreak));

  const last30Entries = allEntries.filter((e) => e.entry_date >= new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const hourCounts = new Array(24).fill(0);
  for (const e of last30Entries) {
    const hour = new Date(e.created_at.replace(" ", "T") + "Z").getUTCHours();
    hourCounts[hour] += 1;
  }
  const peakHour = hourCounts.reduce((best, count, hour) => (count > hourCounts[best] ? hour : best), 0);
  const hasTimeData = hourCounts.some((c) => c > 0);

  const totalPossible30d = habits.length * 30;
  const completed30d = last30Entries.length;
  const ratePct30d = totalPossible30d > 0 ? Math.round((completed30d / totalPossible30d) * 100) : 0;

  return {
    totalHabits: habits.length,
    completedToday,
    completedYesterday,
    currentStreakOverall,
    bestStreakOverall,
    ratePct30d,
    habitsAtRisk: habitsAtRisk.map((h) => ({ name: h.name, currentStreak: h.currentStreak })),
    peakHour: hasTimeData ? peakHour : null,
  };
}

function computeStreaksLocal(entryDates: string[]): { current: number; best: number } {
  const dates = new Set(entryDates);
  let best = 0;
  let running = 0;
  const sorted = [...dates].sort();
  let prev: string | null = null;
  for (const date of sorted) {
    if (prev) {
      const gapDays = Math.round((Date.parse(date) - Date.parse(prev)) / 86_400_000);
      running = gapDays === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    best = Math.max(best, running);
    prev = date;
  }
  let current = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, best };
}

function buildHabitsPrompt(ctx: NonNullable<Awaited<ReturnType<typeof buildHabitsContext>>>): string {
  const lines = [
    `Hábitos ativos: ${ctx.totalHabits}.`,
    `Concluídos hoje: ${ctx.completedToday} de ${ctx.totalHabits} (ontem: ${ctx.completedYesterday}).`,
    `Melhor sequência ativa entre os hábitos: ${ctx.currentStreakOverall} dia(s). Recorde histórico: ${ctx.bestStreakOverall} dia(s).`,
    `Consistência nos últimos 30 dias: ${ctx.ratePct30d}%.`,
    ctx.habitsAtRisk.length > 0
      ? `Hábitos em risco de perder a sequência hoje (ainda não concluídos, com sequência ativa): ${ctx.habitsAtRisk.map((h) => `"${h.name}" (${h.currentStreak}d)`).join(", ")}.`
      : "Nenhum hábito com sequência ativa em risco hoje.",
    ctx.peakHour !== null
      ? `Horário do dia com mais check-ins registrados: por volta das ${ctx.peakHour}h.`
      : "Ainda sem dados suficientes de horário dos check-ins.",
  ];

  return [
    "Você é o LifeOS Copilot, especializado em hábitos e consistência. Com base SOMENTE nos dados reais abaixo (nunca invente hábitos, sequências ou horários que não estejam listados), escreva um insight curto em português do Brasil.",
    "",
    "Dados de hábitos do usuário:",
    ...lines.map((l) => `- ${l}`),
    "",
    "Regras: no máximo 3 frases (até ~65 palavras); se houver hábito em risco, priorize alertar sobre ele citando o nome e a sequência; senão, destaque a consistência de 30 dias ou o horário de pico; cite pelo menos um número real; termine com UMA sugestão prática para hoje; nunca invente conquistas ou prometa resultados.",
  ].join("\n");
}

/**
 * Insight de Analytics — mesmo princípio, mas com o período selecionado
 * (7/30/90 dias): totais, variação contra o período anterior, correlações
 * (sono x produtividade, humor x foco) e melhor dia/horário — para o
 * Gemini apontar UM padrão de verdade cruzando métricas, em vez de um
 * resumo genérico "continue assim".
 */
async function buildAnalyticsContext(ownerId: string, days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  const toBoundary = new Date(to);
  toBoundary.setUTCDate(toBoundary.getUTCDate() + 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toBoundaryStr = toBoundary.toISOString().slice(0, 10);

  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = fromStr;

  const [metrics, previous, insights] = await Promise.all([
    computeRangeMetrics(ownerId, fromStr, toBoundaryStr),
    computeRangeMetrics(ownerId, prevFromStr, prevToStr),
    computeInsights(ownerId, fromStr, to.toISOString().slice(0, 10)),
  ]);

  return { days, metrics, previous, insights };
}

function buildAnalyticsPrompt(ctx: Awaited<ReturnType<typeof buildAnalyticsContext>>): string {
  const { days, metrics, previous, insights } = ctx;
  const tasksDelta = changePct(metrics.tasksCompleted, previous.tasksCompleted);
  const focusDelta = changePct(metrics.focusMinutes, previous.focusMinutes);

  const lines = [
    `Período analisado: últimos ${days} dias.`,
    `Tarefas concluídas: ${metrics.tasksCompleted}${tasksDelta !== null ? ` (${tasksDelta >= 0 ? "+" : ""}${tasksDelta}% vs. período anterior)` : ""}.`,
    `Minutos de foco: ${metrics.focusMinutes}${focusDelta !== null ? ` (${focusDelta >= 0 ? "+" : ""}${focusDelta}% vs. período anterior)` : ""}.`,
    `Páginas lidas: ${metrics.pagesRead}. Exercícios: ${metrics.workouts}. Consistência de hábitos: ${metrics.habitsCompletionPct}%.`,
    insights.bestWeekday ? `Dia mais produtivo: ${insights.bestWeekday.label} (média de ${insights.bestWeekday.avgCompleted} tarefas concluídas).` : "",
    insights.bestFocusHour ? `Horário de foco mais produtivo: por volta das ${insights.bestFocusHour.hour}h.` : "",
    insights.sleepVsNextDayProductivity.r !== null
      ? `Correlação entre sono e produtividade do dia seguinte: r = ${insights.sleepVsNextDayProductivity.r} (${insights.sleepVsNextDayProductivity.pairs} noites comparadas).`
      : "",
    insights.moodVsFocusMinutes.r !== null
      ? `Correlação entre humor e minutos de foco: r = ${insights.moodVsFocusMinutes.r} (${insights.moodVsFocusMinutes.pairs} dias comparados).`
      : "",
  ].filter(Boolean);

  return [
    "Você é o LifeOS Copilot, especializado em analisar padrões de produtividade e rotina. Com base SOMENTE nos dados reais abaixo (nunca invente números, correlações ou tendências que os dados não sustentem), escreva um insight curto em português do Brasil.",
    "",
    "Dados do período:",
    ...lines.map((l) => `- ${l}`),
    "",
    "Regras: no máximo 3 frases (até ~65 palavras); priorize citar uma correlação real se houver uma com |r| >= 0.3, senão destaque a maior variação percentual do período; cite pelo menos um número real; termine com UMA sugestão prática e específica; nunca prometa resultados nem dê conselho médico ou financeiro.",
  ].join("\n");
}

export async function generateAnalyticsInsight(ownerId: string, days = 30): Promise<{ ok: boolean; text?: string; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildAnalyticsContext(ownerId, days);
  const prompt = buildAnalyticsPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, text: result.text };
}

/**
 * Copilot proativo: guarda o insight do Dashboard já gerado para o
 * dia (tabela `daily_insights`), pra próxima leitura ser instantânea
 * — usado tanto pelo cache automático (getOrGenerateDailyInsight)
 * quanto por uma regeneração manual, que sobrescreve o mesmo dia.
 */
async function saveDailyInsight(ownerId: string, text: string): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.execute({
    sql: `INSERT INTO daily_insights (id, owner_id, insight_date, text) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id, insight_date) DO UPDATE SET text = excluded.text, created_at = datetime('now')`,
    args: [nanoid(), ownerId, today, text],
  });
}

/**
 * Copilot proativo: devolve o insight do dia já pronto sem o usuário
 * precisar clicar em nada — se ainda não existe um pra hoje, gera na
 * hora (mesmo caminho do botão manual) e guarda em cache. Chamado ao
 * abrir o Dashboard; troca de dia = novo insight automaticamente.
 */
export async function getOrGenerateDailyInsight(
  ownerId: string
): Promise<{ ok: boolean; text?: string; message?: string; generatedAt?: string }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const cached = await db.execute({
    sql: "SELECT text, created_at FROM daily_insights WHERE owner_id = ? AND insight_date = ?",
    args: [ownerId, today],
  });
  const row = cached.rows[0] as { text?: string; created_at?: string } | undefined;
  if (row?.text) {
    return { ok: true, text: row.text, generatedAt: row.created_at };
  }

  const result = await generateDashboardInsight(ownerId);
  if (!result.ok) return result;
  await saveDailyInsight(ownerId, result.text!);

  // Só neste caminho (primeira geração do dia) faz sentido notificar —
  // uma releitura do cache não deve gerar push de novo no mesmo dia.
  sendPushToUser(ownerId, {
    title: "Seu insight do dia está pronto ✨",
    body: result.text!.length > 120 ? `${result.text!.slice(0, 117)}...` : result.text!,
    url: "/dashboard",
  }).catch((err) => console.error("[push] falha ao notificar insight diário:", err));

  return { ok: true, text: result.text, generatedAt: new Date().toISOString() };
}

/** Chamado pelo botão manual "gerar outro insight" — regenera e atualiza o cache do dia junto. */
export async function regenerateDailyInsight(ownerId: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const result = await generateDashboardInsight(ownerId);
  if (result.ok && result.text) {
    await saveDailyInsight(ownerId, result.text);
  }
  return result;
}

export async function generateHabitsInsight(ownerId: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildHabitsContext(ownerId);
  if (!ctx) {
    return { ok: false, message: "Cadastre pelo menos um hábito para gerar uma análise." };
  }
  const prompt = buildHabitsPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, text: result.text };
}

/**
 * Rascunho de Weekly Review — mesmo princípio dos outros insights,
 * mas em vez de um texto único, pede ao Gemini 3 reflexões curtas
 * (o que foi bem / o que pode melhorar / foco da próxima semana)
 * baseadas SOMENTE nas métricas reais da semana já calculadas por
 * `/api/reviews/weekly/compute` (mesmas funções de metricsService).
 * O usuário sempre revisa/edita antes de salvar — isto só preenche
 * o rascunho, nunca salva a review sozinho.
 */
const WEEKLY_DRAFT_FIELD_MAX_CHARS = 350; // deixa folga para o limite de 500 do front (MAX_CHARS em WeeklyReviewPage)
const WEEKLY_DRAFT_SAFETY_MAX_CHARS = 500; // nunca envia um rascunho acima do limite real do front, mesmo que o Gemini ignore a instrução

async function buildWeeklyReviewContext(ownerId: string, weekStartDate: string) {
  const weekEndExclusive = addDaysLocal(weekStartDate, 7);
  const prevWeekStartDate = addDaysLocal(weekStartDate, -7);

  const [metrics, lifeScore, prevMetrics, prevLifeScore] = await Promise.all([
    computeRangeMetrics(ownerId, weekStartDate, weekEndExclusive),
    computeLifeScore(ownerId, addDaysLocal(weekEndExclusive, -1)),
    computeRangeMetrics(ownerId, prevWeekStartDate, weekStartDate),
    computeLifeScore(ownerId, addDaysLocal(weekStartDate, -1)),
  ]);

  const db = getDb();
  const overdueTasks = await scalar(
    db,
    "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND date(due_date) < date(?)",
    [ownerId, weekEndExclusive]
  );

  return {
    weekStartDate,
    metrics,
    lifeScore,
    overdueTasks,
    changePct: {
      tasksCompleted: changePct(metrics.tasksCompleted, prevMetrics.tasksCompleted),
      studyMinutes: changePct(metrics.studyMinutes, prevMetrics.studyMinutes),
      pagesRead: changePct(metrics.pagesRead, prevMetrics.pagesRead),
      focusMinutes: changePct(metrics.focusMinutes, prevMetrics.focusMinutes),
      productivity: lifeScore.productivity - prevLifeScore.productivity,
      health: lifeScore.health - prevLifeScore.health,
      education: lifeScore.education - prevLifeScore.education,
      reading: lifeScore.reading - prevLifeScore.reading,
      habits: lifeScore.habits - prevLifeScore.habits,
    },
  };
}

/** Igual à `addDays` de reviews.routes.ts — duplicada aqui de propósito (não vale importar de uma rota). */
function addDaysLocal(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyReviewPrompt(ctx: Awaited<ReturnType<typeof buildWeeklyReviewContext>>): string {
  const { metrics, lifeScore, overdueTasks, changePct: delta } = ctx;

  const fmtPct = (v: number | null) => (v === null ? "sem base de comparação" : `${v >= 0 ? "+" : ""}${v}%`);
  const fmtPts = (v: number) => `${v >= 0 ? "+" : ""}${v} pontos`;

  const lines = [
    `Tarefas concluídas na semana: ${metrics.tasksCompleted} de ${metrics.tasksPlanned} planejadas (variação vs. semana anterior: ${fmtPct(delta.tasksCompleted)}).`,
    `Tarefas atrasadas (em aberto, com prazo já vencido): ${overdueTasks}.`,
    `Minutos de estudo: ${metrics.studyMinutes} (${fmtPct(delta.studyMinutes)}).`,
    `Páginas lidas: ${metrics.pagesRead} (${fmtPct(delta.pagesRead)}).`,
    `Minutos de foco (Pomodoro/timer): ${metrics.focusMinutes} (${fmtPct(delta.focusMinutes)}).`,
    `Consistência de hábitos na semana: ${metrics.habitsCompletionPct}% (${metrics.habitsDoneCount} de ${metrics.habitsPossibleCount} check-ins possíveis).`,
    `Life Score ao final da semana — produtividade ${lifeScore.productivity} (${fmtPts(delta.productivity)}), saúde ${lifeScore.health} (${fmtPts(delta.health)}), educação ${lifeScore.education} (${fmtPts(delta.education)}), leitura ${lifeScore.reading} (${fmtPts(delta.reading)}), hábitos ${lifeScore.habits} (${fmtPts(delta.habits)}) — todas 0-100.`,
  ];

  return [
    "Você é o LifeOS Copilot, ajudando o usuário a preencher a Revisão Semanal. Com base SOMENTE nos dados reais abaixo (nunca invente números, tarefas ou hábitos que não estejam listados), escreva um RASCUNHO em português do Brasil com três reflexões curtas para o usuário revisar e editar antes de salvar.",
    "",
    "Dados reais da semana:",
    ...lines.map((l) => `- ${l}`),
    "",
    "Responda ESTRITAMENTE neste formato, uma linha por campo, sem markdown, sem numeração, sem texto antes ou depois:",
    "O_QUE_FOI_BEM: <texto>",
    "O_QUE_PODE_MELHORAR: <texto>",
    "FOCO_PROXIMA_SEMANA: <texto>",
    "",
    `Regras: cada campo com 1-2 frases curtas, no máximo ~${WEEKLY_DRAFT_FIELD_MAX_CHARS} caracteres; "O_QUE_FOI_BEM" deve citar um número/variação real positiva (conclusões, minutos, % de hábitos etc.); "O_QUE_PODE_MELHORAR" deve citar uma lacuna real (tarefas atrasadas, variação negativa, hábito com baixa consistência) — se não houver lacuna clara nos dados, comente honestamente que a semana teve poucos pontos de atenção; "FOCO_PROXIMA_SEMANA" deve ser uma sugestão concreta e específica (não genérica) ligada aos próprios dados; se os números da semana forem todos muito baixos ou zerados, reconheça isso com honestidade em vez de fingir uma conquista; nunca invente um número que não esteja nos dados acima; tom direto e encorajador, sem ser piegas.`,
  ].join("\n");
}

/** Extrai os três campos da resposta do Gemini no formato `CHAVE: texto`, tolerando variação de espaço/quebra de linha. */
function parseWeeklyReviewDraft(text: string): { wentWell: string; toImprove: string; nextWeekFocus: string } | null {
  const extract = (key: string): string | null => {
    const re = new RegExp(`${key}\\s*:\\s*(.+)`, "i");
    const match = text.match(re);
    return match ? match[1].trim() : null;
  };
  const wentWell = extract("O_QUE_FOI_BEM");
  const toImprove = extract("O_QUE_PODE_MELHORAR");
  const nextWeekFocus = extract("FOCO_PROXIMA_SEMANA");
  if (!wentWell || !toImprove || !nextWeekFocus) return null;

  const truncate = (s: string) => (s.length > WEEKLY_DRAFT_SAFETY_MAX_CHARS ? s.slice(0, WEEKLY_DRAFT_SAFETY_MAX_CHARS) : s);
  return { wentWell: truncate(wentWell), toImprove: truncate(toImprove), nextWeekFocus: truncate(nextWeekFocus) };
}

export async function generateWeeklyReviewDraft(
  ownerId: string,
  weekStartDate: string
): Promise<{ ok: boolean; draft?: { wentWell: string; toImprove: string; nextWeekFocus: string }; message?: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const ctx = await buildWeeklyReviewContext(ownerId, weekStartDate);
  const prompt = buildWeeklyReviewPrompt(ctx);
  const result = await generateText(prompt, config);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const draft = parseWeeklyReviewDraft(result.text ?? "");
  if (!draft) {
    return { ok: false, message: "Não foi possível interpretar a resposta da IA. Tente novamente." };
  }
  return { ok: true, draft };
}
