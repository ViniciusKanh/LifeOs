import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { DATA_HEALTH_MODULES, MODULE_PATH, type DataHealthModuleKey } from "../config/dataHealthRegistry.js";
import {
  checkTaskConsistency,
  checkTaskIntegrity,
  checkGoalConsistency,
  checkSleepConsistency,
  checkAcademicIntegrity,
  findPossibleDuplicates,
  type DataHealthIssue,
  type TaskRow,
  type GoalRow,
  type SleepRow,
  type AcademicProjectRow,
} from "./dataQualityRules.js";
import {
  computeDataHealthScore,
  classifyScore,
  DIMENSION_LABEL,
  SCORE_FORMULA_EXPLANATION,
  type DataHealthDimension,
  type DataHealthDimensionScores,
  type DataHealthLabel,
} from "./dataHealthScoreService.js";
import { computeReadiness, type ReadinessResult } from "./dataReadinessService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Data Health — central de qualidade/cobertura/integridade dos dados
 * do usuário. Tudo aqui vem de verificações reais nas tabelas de
 * origem (nunca um número fixo): DETECTAR (esta função) → EXPLICAR
 * (issues/diagnóstico) → PRIORIZAR (recommendations ordenadas) →
 * DIRECIONAR (actionPath de cada item leva ao módulo real).
 */

export type CoverageStatus = "alta" | "média" | "baixa";

export interface ModuleCoverage {
  key: DataHealthModuleKey;
  label: string;
  coveragePct: number;
  status: CoverageStatus;
  mainIssue: string | null;
  openPath: string;
}

export interface IntegrityMetric {
  key: string;
  label: string;
  count: number;
  totalUniverse: number;
  pctOfUniverse: number;
  severity: "baixo" | "atenção" | "médio" | "alto";
}

export interface IssueDistributionItem {
  dimension: DataHealthDimension;
  label: string;
  count: number;
  pct: number;
}

export interface DataHealthRecommendation {
  id: string;
  title: string;
  description: string;
  actionPath: string;
}

export interface DataHealthHistoryPoint {
  date: string;
  score: number;
}

export interface DataHealthSummary {
  score: number;
  label: DataHealthLabel;
  scoreFormula: string;
  dimensions: DataHealthDimensionScores;
  monitoredSourcesCount: number;
  activeAlertsCount: number;
  analyticsCoveragePct: number;
  aiReadyModulesCount: number;
  aiReadyModulesTotal: number;
  modules: ModuleCoverage[];
  issues: DataHealthIssue[];
  readiness: ReadinessResult[];
  integrity: IntegrityMetric[];
  distribution: IssueDistributionItem[];
  recommendations: DataHealthRecommendation[];
  diagnosis: string;
  history: DataHealthHistoryPoint[];
  isNewUser: boolean;
}

interface Row {
  [key: string]: unknown;
}

function coverageStatus(pct: number): CoverageStatus {
  if (pct >= 80) return "alta";
  if (pct >= 55) return "média";
  return "baixa";
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 100;
}

async function fetchAll(db: Db, ownerId: string) {
  const [
    tasksRes,
    projectsRes,
    goalsRes,
    goalProgressRes,
    habitsRes,
    habitEntriesRes,
    educationsRes,
    academicProjectsRes,
    booksRes,
    waterRes,
    sleepRes,
    sleepLastRes,
    workoutsRecentRes,
    workoutsLastRes,
    experimentsRes,
    experimentLogsRes,
    moodRes,
    contextRes,
  ] = await Promise.all([
    db.execute({
      sql: "SELECT id, title, status, due_date, start_date, estimate_minutes, project_id, created_at, completed_at FROM tasks WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, name, archived_at, created_at FROM projects WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: "SELECT id, title, kind, target_value, current_value, category, due_date, status, created_at FROM goals WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT goal_id, COUNT(*) AS n FROM goal_progress WHERE owner_id = ? GROUP BY goal_id", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, category, archived_at, created_at FROM habits WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: "SELECT habit_id, entry_date FROM habit_entries WHERE owner_id = ? AND entry_date >= date('now', '-30 day')",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, course_name, progress_pct, created_at FROM educations WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: "SELECT id, title, progress_pct, project_id, education_id, created_at FROM academic_projects WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT id, title, status, current_page, total_pages, updated_at, created_at FROM books WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n, MAX(recorded_at) AS last FROM water_entries WHERE owner_id = ? AND recorded_at >= datetime('now', '-3 day')", args: [ownerId] }),
    db.execute({
      sql: "SELECT id, went_to_bed_at, woke_up_at, duration_minutes FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= datetime('now', '-30 day')",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT MAX(went_to_bed_at) AS last FROM sleep_entries WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM workouts WHERE owner_id = ? AND performed_at >= datetime('now', '-30 day')", args: [ownerId] }),
    db.execute({ sql: "SELECT MAX(performed_at) AS last FROM workouts WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT id, status, start_date, end_date FROM personal_experiments WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT experiment_id, COUNT(*) AS n FROM personal_experiment_logs WHERE owner_id = ? GROUP BY experiment_id", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM mood_entries WHERE owner_id = ? AND recorded_at >= datetime('now', '-7 day')", args: [ownerId] }),
    db.execute({ sql: "SELECT context_city FROM user_settings WHERE user_id = ?", args: [ownerId] }),
  ]);

  return {
    tasks: tasksRes.rows as unknown as TaskRow[],
    projects: projectsRes.rows as unknown as Row[],
    goals: goalsRes.rows as unknown as GoalRow[],
    goalProgressByGoal: new Map((goalProgressRes.rows as unknown as Row[]).map((r) => [String(r.goal_id), Number(r.n)])),
    habits: habitsRes.rows as unknown as Row[],
    habitEntries: habitEntriesRes.rows as unknown as Row[],
    educations: educationsRes.rows as unknown as Row[],
    academicProjects: academicProjectsRes.rows as unknown as AcademicProjectRow[],
    books: booksRes.rows as unknown as Row[],
    waterRecentCount: Number(waterRes.rows[0]?.n ?? 0),
    sleepsRecent: sleepRes.rows as unknown as SleepRow[],
    sleepLast: sleepLastRes.rows[0]?.last ? String(sleepLastRes.rows[0].last) : null,
    workoutsRecentCount: Number(workoutsRecentRes.rows[0]?.n ?? 0),
    workoutsLast: workoutsLastRes.rows[0]?.last ? String(workoutsLastRes.rows[0].last) : null,
    experiments: experimentsRes.rows as unknown as Row[],
    experimentLogsByExperiment: new Map((experimentLogsRes.rows as unknown as Row[]).map((r) => [String(r.experiment_id), Number(r.n)])),
    moodRecentCount: Number(moodRes.rows[0]?.n ?? 0),
    contextConfigured: Boolean(contextRes.rows[0]?.context_city),
  };
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

async function computeSummary(db: Db, ownerId: string): Promise<DataHealthSummary> {
  const d = await fetchAll(db, ownerId);

  const projectIds = new Set(d.projects.map((p) => String(p.id)));
  const educationIds = new Set(d.educations.map((e) => String(e.id)));
  const activeProjects = d.projects.filter((p) => !p.archived_at);
  const activeGoals = d.goals.filter((g) => g.status === "active");
  const activeHabits = d.habits.filter((h) => !h.archived_at);
  const activeTasks = d.tasks.filter((t) => t.status !== "Concluído");
  const numericGoals = activeGoals.filter((g) => g.kind === "numeric" || g.kind === "percentage");

  // ---- Nenhum dado ainda: distinguir "construindo histórico" de "dados ruins" ----
  const totalRecords =
    d.tasks.length + d.projects.length + d.goals.length + d.habits.length + d.educations.length + d.academicProjects.length + d.books.length;
  const isNewUser = totalRecords < 5;

  // ---- Cobertura por módulo (sempre a partir de contagens reais) ----
  const modules: ModuleCoverage[] = [];

  // Tarefas: % de tarefas ativas com prazo ou duração estimada — os dois campos que outras
  // ferramentas (Deadline Radar, Capacity Planner) precisam pra funcionar bem.
  {
    const informed = activeTasks.filter((t) => t.due_date || t.estimate_minutes != null).length;
    const covPct = pct(informed, activeTasks.length);
    const missing = activeTasks.length - informed;
    modules.push({
      key: "tasks",
      label: "Tarefas",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} tarefas sem prazo nem duração` : null,
      openPath: MODULE_PATH.tasks,
    });
  }

  // Projetos: % de projetos ativos com pelo menos uma tarefa vinculada.
  {
    const withTasks = activeProjects.filter((p) => d.tasks.some((t) => t.project_id === p.id)).length;
    const covPct = pct(withTasks, activeProjects.length);
    const missing = activeProjects.length - withTasks;
    modules.push({
      key: "projects",
      label: "Projetos",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} projetos sem nenhuma tarefa` : null,
      openPath: MODULE_PATH.projects,
    });
  }

  // Metas: % de metas ativas numéricas/percentuais com pelo menos 2 registros de progresso (mínimo pra regressão).
  const goalsWithEnoughProgress = numericGoals.filter((g) => (d.goalProgressByGoal.get(String(g.id)) ?? 0) >= 2).length;
  {
    const covPct = pct(goalsWithEnoughProgress, numericGoals.length);
    const missing = numericGoals.length - goalsWithEnoughProgress;
    modules.push({
      key: "goals",
      label: "Metas",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} metas sem histórico suficiente` : null,
      openPath: MODULE_PATH.goals,
    });
  }

  // Hábitos: % de hábitos ativos com pelo menos 1 registro nos últimos 14 dias.
  {
    const recentHabitIds = new Set(
      d.habitEntries.filter((e) => (String(e.entry_date) >= new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10))).map((e) => String(e.habit_id))
    );
    const tracked = activeHabits.filter((h) => recentHabitIds.has(String(h.id))).length;
    const covPct = pct(tracked, activeHabits.length);
    const missing = activeHabits.length - tracked;
    modules.push({
      key: "habits",
      label: "Hábitos",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} hábitos sem registro recente` : null,
      openPath: MODULE_PATH.habits,
    });
  }

  // Educação: % de formações + projetos acadêmicos com progresso > 0.
  {
    const items = [...d.educations, ...d.academicProjects];
    const withProgress = items.filter((i) => Number(i.progress_pct ?? 0) > 0).length;
    const covPct = pct(withProgress, items.length);
    const missing = items.length - withProgress;
    modules.push({
      key: "education",
      label: "Educação",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} itens sem progresso registrado` : null,
      openPath: MODULE_PATH.education,
    });
  }

  // Biblioteca: % de livros "Lendo"/"Concluído" com página atual registrada.
  {
    const relevant = d.books.filter((b) => b.status === "Lendo" || b.status === "Concluído");
    const withProgress = relevant.filter((b) => Number(b.current_page ?? 0) > 0).length;
    const covPct = pct(withProgress, relevant.length);
    const missing = relevant.length - withProgress;
    modules.push({
      key: "library",
      label: "Biblioteca",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} livros sem página atual registrada` : null,
      openPath: MODULE_PATH.library,
    });
  }

  // Saúde: das 3 fontes (água, sono, treino), quantas têm registro nos últimos 3 dias.
  const sleepFreshDays = daysSince(d.sleepLast);
  const healthFreshSources = [d.waterRecentCount > 0, sleepFreshDays != null && sleepFreshDays <= 3, daysSince(d.workoutsLast) != null && (daysSince(d.workoutsLast) as number) <= 3].filter(Boolean).length;
  {
    const covPct = pct(healthFreshSources, 3);
    modules.push({
      key: "health",
      label: "Saúde",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: sleepFreshDays != null && sleepFreshDays > 2 ? `Sono sem registro há ${sleepFreshDays} dias` : healthFreshSources < 3 ? "Nem toda fonte tem registro recente" : null,
      openPath: MODULE_PATH.health,
    });
  }

  // Experimentos: % de experimentos ativos/concluídos com pelo menos 3 check-ins registrados.
  {
    const relevant = d.experiments.filter((e) => e.status === "active" || e.status === "completed");
    const withLogs = relevant.filter((e) => (d.experimentLogsByExperiment.get(String(e.id)) ?? 0) >= 3).length;
    const covPct = pct(withLogs, relevant.length);
    const missing = relevant.length - withLogs;
    modules.push({
      key: "experiments",
      label: "Experimentos",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: missing > 0 ? `${missing} experimentos com poucos check-ins` : null,
      openPath: MODULE_PATH.experiments,
    });
  }

  // Signals: quantas das 4 fontes reais (sono, água, treino, humor) têm dado recente.
  // Focus Mode foi removido do produto — focus_sessions nunca mais recebe dado
  // novo, então deixou de contar como fonte de Signals (senão o teto ficava
  // permanentemente em 4/5, mesmo com tudo em dia).
  const signalCategoriesWithRecentData = [
    sleepFreshDays != null && sleepFreshDays <= 7,
    d.waterRecentCount > 0,
    daysSince(d.workoutsLast) != null && (daysSince(d.workoutsLast) as number) <= 7,
    d.moodRecentCount > 0,
  ].filter(Boolean).length;
  {
    const covPct = pct(signalCategoriesWithRecentData, 4);
    modules.push({
      key: "signals",
      label: "Signals",
      coveragePct: covPct,
      status: coverageStatus(covPct),
      mainIssue: signalCategoriesWithRecentData < 3 ? `Só ${signalCategoriesWithRecentData} de 4 fontes com dado recente` : null,
      openPath: MODULE_PATH.signals,
    });
  }

  // ---- Issues (consistência, integridade, duplicados) ----
  const issues: DataHealthIssue[] = [
    ...checkTaskConsistency(d.tasks, MODULE_PATH.tasks),
    ...checkTaskIntegrity(d.tasks, projectIds, MODULE_PATH.tasks),
    ...checkGoalConsistency(d.goals, MODULE_PATH.goals),
    ...checkSleepConsistency(d.sleepsRecent, MODULE_PATH.health),
    ...checkAcademicIntegrity(d.academicProjects, educationIds, projectIds, MODULE_PATH.education),
    ...findPossibleDuplicates(d.tasks.map((t) => ({ id: t.id, title: t.title, created_at: t.created_at })), "tasks", MODULE_PATH.tasks),
    ...findPossibleDuplicates(d.goals.map((g) => ({ id: g.id, title: g.title, created_at: g.created_at })), "goals", MODULE_PATH.goals),
  ];

  // Freshness / módulos com dado parado — vira alerta de "atenção", não de integridade.
  for (const m of modules) {
    if (m.status === "baixa" && m.mainIssue) {
      issues.push({
        id: `${m.key}_low_coverage`,
        severity: isNewUser ? "info" : "attention",
        module: m.key,
        dimension: "completeness",
        title: m.mainIssue,
        description: `Cobertura de ${m.label} está em ${m.coveragePct}%.`,
        affectedCount: 1,
        actionPath: m.openPath,
      });
    }
  }
  if (!d.contextConfigured) {
    issues.push({
      id: "context_not_configured",
      severity: "info",
      module: "signals",
      dimension: "sync",
      title: "Contexto do Dia sem localização configurada",
      description: "Sem localização, o clima não pode ser sincronizado para o dia.",
      affectedCount: 1,
      actionPath: "/contexto-do-dia",
    });
  }

  // ---- Dimensões ----
  const avgModuleCoverage = modules.reduce((sum, m) => sum + m.coveragePct, 0) / modules.length;
  const consistencyIssues = issues.filter((i) => i.dimension === "consistency").reduce((s, i) => s + i.affectedCount, 0);
  const integrityIssues = issues.filter((i) => i.dimension === "integrity").reduce((s, i) => s + i.affectedCount, 0);
  const totalEntities = d.tasks.length + d.goals.length + d.projects.length + d.academicProjects.length || 1;

  const dimensions: DataHealthDimensionScores = {
    completeness: Math.round(avgModuleCoverage),
    consistency: Math.max(0, 100 - Math.round((consistencyIssues / totalEntities) * 500)),
    integrity: Math.max(0, 100 - Math.round((integrityIssues / totalEntities) * 500)),
    freshness: Math.round((healthFreshSources / 3) * 40 + (signalCategoriesWithRecentData / 4) * 60),
    sync: d.contextConfigured ? 100 : 60,
    history: Math.round(
      (pct(goalsWithEnoughProgress, numericGoals.length) +
        Math.min(100, Math.round((d.experiments.filter((e) => (d.experimentLogsByExperiment.get(String(e.id)) ?? 0) >= 3).length / Math.max(1, d.experiments.length)) * 100))) /
        2
    ),
  };

  const { score, label } = computeDataHealthScore(dimensions);

  // ---- Integridade e consistência (linha de indicadores) ----
  const duplicateIssues = issues.filter((i) => i.id.endsWith("_possible_duplicate"));
  const duplicateCount = duplicateIssues.reduce((s, i) => s + i.affectedCount, 0);
  const missingFieldsCount = issues.filter((i) => i.dimension === "completeness").reduce((s, i) => s + i.affectedCount, 0);
  const orphanCount = issues.filter((i) => i.id.includes("orphan")).reduce((s, i) => s + i.affectedCount, 0);
  const invalidTimestampCount = issues
    .filter((i) => ["task_due_before_created", "task_start_after_due", "goal_due_before_created", "sleep_invalid_range"].includes(i.id))
    .reduce((s, i) => s + i.affectedCount, 0);
  const syncFailureCount = d.contextConfigured ? 0 : 1;
  const staleCount = modules.filter((m) => m.status === "baixa").length;

  const integrity: IntegrityMetric[] = [
    { key: "duplicates", label: "Registros duplicados", count: duplicateCount, totalUniverse: totalEntities, pctOfUniverse: pct(duplicateCount, totalEntities), severity: duplicateCount > 5 ? "médio" : "baixo" },
    { key: "missing_fields", label: "Campos ausentes", count: missingFieldsCount, totalUniverse: modules.length, pctOfUniverse: pct(missingFieldsCount, modules.length), severity: missingFieldsCount > modules.length / 2 ? "alto" : "atenção" },
    { key: "orphans", label: "Registros órfãos", count: orphanCount, totalUniverse: totalEntities, pctOfUniverse: pct(orphanCount, totalEntities), severity: orphanCount > 0 ? "atenção" : "baixo" },
    { key: "invalid_timestamps", label: "Timestamps inválidos", count: invalidTimestampCount, totalUniverse: totalEntities, pctOfUniverse: pct(invalidTimestampCount, totalEntities), severity: invalidTimestampCount > 0 ? "atenção" : "baixo" },
    { key: "sync_failures", label: "Falhas de sincronização", count: syncFailureCount, totalUniverse: 1, pctOfUniverse: pct(syncFailureCount, 1), severity: syncFailureCount > 0 ? "atenção" : "baixo" },
    { key: "stale_records", label: "Módulos desatualizados", count: staleCount, totalUniverse: modules.length, pctOfUniverse: pct(staleCount, modules.length), severity: staleCount > modules.length / 2 ? "médio" : "baixo" },
  ];

  // ---- Distribuição dos problemas por dimensão ----
  const dims: DataHealthDimension[] = ["completeness", "consistency", "integrity", "sync", "freshness", "history"];
  const totalIssuesAffected = issues.reduce((s, i) => s + i.affectedCount, 0) || 1;
  const distribution: IssueDistributionItem[] = dims
    .map((dim) => {
      const count = issues.filter((i) => i.dimension === dim).reduce((s, i) => s + i.affectedCount, 0);
      return { dimension: dim, label: DIMENSION_LABEL[dim], count, pct: pct(count, totalIssuesAffected) };
    })
    .filter((d2) => d2.count > 0);

  // ---- Prontidão para previsões ----
  const readiness = computeReadiness({
    activeGoalsCount: numericGoals.length,
    goalsWithEnoughProgressCount: goalsWithEnoughProgress,
    activeTasksCount: activeTasks.length,
    tasksWithEstimateCount: activeTasks.filter((t) => t.estimate_minutes != null).length,
    tasksWithDueDateCount: activeTasks.filter((t) => t.due_date != null).length,
    goalsWithDueDateCount: activeGoals.filter((g) => g.due_date != null).length,
    invalidTimestampCount,
    signalCategoriesWithRecentData,
    totalScore: score,
  });
  const aiReadyModulesCount = readiness.filter((r) => r.status === "ready").length;

  // ---- Ações recomendadas: issues ordenadas por severidade + impacto ----
  const severityRank: Record<string, number> = { critical: 0, warning: 1, attention: 2, info: 3 };
  const sortedIssues = [...issues].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || b.affectedCount - a.affectedCount);
  const recommendations: DataHealthRecommendation[] = sortedIssues.slice(0, 5).map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    actionPath: i.actionPath,
  }));

  // ---- Diagnóstico determinístico (sem IA) ----
  const weakModules = modules.filter((m) => m.status === "baixa").map((m) => m.label);
  let diagnosis: string;
  if (isNewUser) {
    diagnosis = "O LifeOS ainda está construindo sua base de dados. Continue registrando sua rotina para aumentar a cobertura das análises.";
  } else if (label === "Saudável" || label === "Bom") {
    diagnosis =
      weakModules.length > 0
        ? `Sua base de dados está ${label === "Saudável" ? "saudável" : "boa"} e bem estruturada. A qualidade das previsões pode melhorar com histórico mais consistente em ${weakModules.join(" e ")}.`
        : `Sua base de dados está ${label === "Saudável" ? "saudável" : "boa"} e bem estruturada em todos os módulos monitorados.`;
  } else {
    diagnosis = `Sua base de dados precisa de atenção — ${weakModules.length > 0 ? `principalmente em ${weakModules.join(", ")}` : "vários módulos estão com baixa cobertura"}. Resolver os alertas ativos deve melhorar a confiabilidade das previsões.`;
  }

  // ---- Histórico real (snapshots já salvos, sem preencher pontos fictícios) ----
  const historyRes = await db.execute({
    sql: "SELECT date(created_at) AS d, score FROM data_health_snapshots WHERE owner_id = ? ORDER BY created_at DESC LIMIT 8",
    args: [ownerId],
  });
  const history: DataHealthHistoryPoint[] = (historyRes.rows as unknown as Row[])
    .map((r) => ({ date: String(r.d), score: Number(r.score) }))
    .reverse();

  return {
    score,
    label,
    scoreFormula: SCORE_FORMULA_EXPLANATION,
    dimensions,
    monitoredSourcesCount: DATA_HEALTH_MODULES.length,
    activeAlertsCount: issues.filter((i) => i.severity !== "info").length,
    analyticsCoveragePct: Math.round(avgModuleCoverage),
    aiReadyModulesCount,
    aiReadyModulesTotal: readiness.length,
    modules,
    issues,
    readiness,
    integrity,
    distribution,
    recommendations,
    diagnosis,
    history,
    isNewUser,
  };
}

export async function getDataHealth(ownerId: string): Promise<DataHealthSummary> {
  const db = getDb();
  return computeSummary(db, ownerId);
}

/**
 * Salva um snapshot do score atual — só quando pedido explicitamente
 * (botão "Verificar novamente") ou uma vez por dia, nunca a cada
 * render, pra não gerar volume desnecessário na tabela.
 */
export async function recheckDataHealth(ownerId: string): Promise<DataHealthSummary> {
  const db = getDb();
  const summary = await computeSummary(db, ownerId);

  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.execute({
    sql: "SELECT id FROM data_health_snapshots WHERE owner_id = ? AND date(created_at) = ?",
    args: [ownerId, today],
  });
  if (existing.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO data_health_snapshots
              (id, owner_id, score, completeness_score, consistency_score, integrity_score, freshness_score, sync_score, history_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nanoid(),
        ownerId,
        summary.score,
        summary.dimensions.completeness,
        summary.dimensions.consistency,
        summary.dimensions.integrity,
        summary.dimensions.freshness,
        summary.dimensions.sync,
        summary.dimensions.history,
      ],
    });
  } else {
    await db.execute({
      sql: `UPDATE data_health_snapshots SET score = ?, completeness_score = ?, consistency_score = ?, integrity_score = ?, freshness_score = ?, sync_score = ?, history_score = ?
            WHERE id = ?`,
      args: [
        summary.score,
        summary.dimensions.completeness,
        summary.dimensions.consistency,
        summary.dimensions.integrity,
        summary.dimensions.freshness,
        summary.dimensions.sync,
        summary.dimensions.history,
        String(existing.rows[0].id),
      ],
    });
  }

  // Recarrega o histórico já com o snapshot de hoje incluído.
  return getDataHealth(ownerId);
}

export { classifyScore };
