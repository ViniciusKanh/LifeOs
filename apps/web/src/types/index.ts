export type UserRole = "user" | "admin";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  theme: "light" | "dark" | "system";
  onboarding_done: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminIntegration = "gemini" | "turso" | "smtp";

export interface AdminSetting {
  id: string;
  integration: AdminIntegration;
  key_name: string;
  masked_preview: string;
  is_active: number;
  extra_config: string | null;
  updated_at: string;
  /** Só presente para key_name = 'model' — não é secreto, é devolvido em texto puro. */
  value?: string;
}

export type TaskPriority = "Baixa" | "Média" | "Alta";

export interface Task {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
  estimate_minutes: number | null;
  time_spent_minutes: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Priority Score profissional (Área Profissional) — 1-5 cada,
  // opcionais; priority_score é calculado no backend a partir deles.
  impact: number | null;
  urgency: number | null;
  effort: number | null;
  priority_score: number | null;
  recurrence_rule: string | null;
}

/**
 * Item retornado por GET /api/tasks/focus — priorização automática
 * ("Foque nisso agora"). O score é só para ordenar/depurar; a UI
 * mostra as razões (`reasons`), que já vêm prontas em PT-BR.
 */
export interface FocusTask {
  id: string;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  status: string;
  score: number;
  reasons: string[];
}

export type ProjectKind = "personal" | "workspace" | "professional" | "academic";

export interface Project {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  kind: ProjectKind;
  color: string | null;
  archived_at: string | null;
  task_count: number;
  done_count: number;
  created_at: string;
  updated_at: string;
}

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  dependsOn: string[];
}

export interface GanttData {
  project: { id: string; name: string };
  tasks: GanttTask[];
}

/** Previsão matemática (ritmo real de conclusão de tarefas) de quando um projeto deve terminar. */
export interface ProjectForecastData {
  date: string;
  completionsPerWeek: number;
  remainingTasks: number;
}

export interface ProjectForecast {
  forecast: ProjectForecastData | null;
  reason: string | null;
}

export interface TimeEntry {
  id: string;
  task_id: string | null;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

export interface Habit {
  id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  category: string | null;
  frequency: "daily" | "specific_days" | "times_per_week" | "weekly" | "monthly";
  target_count: number;
}

export type BookStatus = "Quero Ler" | "Lendo" | "Pausado" | "Concluído" | "Abandonado";
export type BookSource = "manual" | "isbn" | "google_books" | "open_library";

export interface Book {
  id: string;
  owner_id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  cover_url: string | null;
  published_year: number | null;
  total_pages: number | null;
  current_page: number;
  categories: string | null;
  description: string | null;
  status: BookStatus;
  rating: number | null;
  personal_note: string | null;
  started_at: string | null;
  finished_at: string | null;
  source: BookSource;
  created_at: string;
  updated_at: string;
}

export interface BookNote {
  id: string;
  book_id: string;
  kind: "note" | "quote" | "insight" | "summary" | "idea";
  content: string;
  page: number | null;
  created_at: string;
}

export interface ReadingSession {
  id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  pages_read: number;
  created_at: string;
}

/** Preview retornado pela busca por ISBN — nada é gravado até o usuário confirmar. */
export interface BookLookupResult {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
  totalPages: number | null;
  categories: string[];
  description: string | null;
  source: "google_books" | "open_library";
}

export type EducationKind =
  | "graduacao"
  | "pos_graduacao"
  | "mestrado"
  | "doutorado"
  | "curso_online"
  | "certificacao"
  | "curso_livre";

// Fase acadêmica atual, calculada pelo servidor a partir de dados reais
// (disciplinas em andamento, projetos acadêmicos em aberto, progresso):
// nunca é escolhida manualmente pelo usuário.
export type EducationPhase = "cursando_disciplinas" | "fase_projeto" | "concluida" | "sem_atividade";

export interface Education {
  id: string;
  owner_id: string;
  kind: EducationKind;
  institution: string | null;
  course_name: string;
  started_at: string | null;
  expected_end_at: string | null;
  progress_pct: number;
  notes: string | null;
  created_at: string;
  phase: EducationPhase;
  weekly_study_goal_minutes: number;
}

export interface EducationDetail extends Education {
  academicProjects: AcademicProject[];
}

export interface Course {
  id: string;
  education_id: string;
  name: string;
  semester: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  course_id: string;
  name: string;
  professor: string | null;
  workload_hours: number | null;
  status: "Planejada" | "Em andamento" | "Concluída" | "Trancada";
  progress_pct: number;
  grades: Record<string, unknown> | null;
  files: string[] | null;
  notes: string | null;
  created_at: string;
  course_name?: string;
  course_semester?: string | null;
}

export interface AcademicDeadline {
  id: string;
  education_id: string;
  subject_id: string | null;
  subject_name?: string | null;
  title: string;
  due_date: string;
  done: number;
  created_at: string;
}

export interface StudySession {
  id: string;
  education_id: string;
  subject_id: string | null;
  occurred_at: string;
  duration_minutes: number;
  created_at: string;
}

export interface SemesterChecklistItem {
  id: string;
  education_id: string;
  title: string;
  done: number;
  due_date: string | null;
  position: number;
  created_at: string;
}

export interface EducationStats {
  totalSubjects: number;
  activeSubjects: number;
  upcomingDeadlines: number;
  activeAcademicProjects: number;
  studyMinutesThisWeek: number;
  studyMinutesLastWeek: number;
  studyChangePct: number | null;
  weeklyGoalMinutes: number;
  dailyStudyMinutes: Array<{ weekday: string; minutes: number }>;
}

export type AcademicProjectKind = "tcc" | "dissertacao" | "tese" | "artigo" | "projeto_cientifico" | "trabalho_final";

export interface AcademicProject {
  id: string;
  owner_id: string;
  project_id: string | null;
  education_id: string | null;
  kind: AcademicProjectKind;
  title: string;
  advisor: string | null;
  progress_pct: number;
  defense_date: string | null;
  created_at: string;
}

/* ------------------------- Saúde e Bem-estar ------------------------- */

export interface WaterEntry {
  id: string;
  amount_ml: number;
  recorded_at: string;
}

export interface SleepEntry {
  id: string;
  went_to_bed_at: string;
  woke_up_at: string;
  duration_minutes: number | null;
  quality: number | null;
  notes: string | null;
}

export interface Workout {
  id: string;
  kind: string;
  duration_minutes: number | null;
  distance_km: number | null;
  calories: number | null;
  intensity: "leve" | "moderada" | "intensa" | null;
  notes: string | null;
  performed_at: string;
}

export interface MoodEntry {
  id: string;
  mood: number;
  energy: number;
  stress: number | null;
  note: string | null;
  recorded_at: string;
}

export interface HealthSummary {
  date: string;
  waterMl: number;
  lastSleepMinutes: number | null;
  lastSleepQuality: number | null;
  workoutsToday: number;
  workoutMinutesToday: number;
  mood: { mood: number; energy: number; stress: number | null } | null;
}

/** Correlações automáticas entre séries de saúde (ver correlationService.ts no backend) — observação estatística, não diagnóstico. */
export interface HealthCorrelation {
  pair: string;
  label: string;
  r: number;
  n: number;
  strength: "fraca" | "moderada" | "forte" | "muito forte";
  direction: "positiva" | "negativa";
  description: string;
}

/* ------------------------------ Hábitos ------------------------------ */

export interface HabitSummary {
  habitId: string;
  currentStreak: number;
  bestStreak: number;
  completionPct30d: number;
  checkedInToday: boolean;
}

export interface HabitConsistencyDay {
  date: string;
  completed: number;
  total: number;
  ratio: number;
}

export interface HabitCategoryStat {
  category: string;
  habitCount: number;
  avgCompletionPct: number;
}

export interface HabitStats {
  currentStreakMax: number;
  bestStreakMax: number;
  categories: HabitCategoryStat[];
  consistency: {
    days: HabitConsistencyDay[];
    daysWithAnyHabit: number;
    ratePct: number;
    changePct: number | null;
  };
  completedToday: number;
  completedYesterday: number;
  totalHabits: number;
  bestTimes: Array<{ hour: number; count: number }>;
}

/* ------------------------------- Metas ------------------------------- */

export type GoalKind = "numeric" | "percentage" | "binary" | "task_based";
export type GoalStatus = "active" | "done" | "abandoned";
export type GoalPeriod = "semanal" | "mensal" | "semestral" | "anual";

export interface Goal {
  id: string;
  owner_id: string;
  parent_goal_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  kind: GoalKind;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  status: GoalStatus;
  period: GoalPeriod | null;
  next_action: string | null;
  next_action_due: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Presente só quando a API substitui current_value pela leitura de hoje (meta de páginas lidas). */
  progress_source?: "reading_today";
}

export interface GoalPeriodStat {
  period: GoalPeriod;
  label: string;
  doneCount: number;
  totalCount: number;
  pct: number;
}

export interface GoalCategoryStat {
  category: string;
  count: number;
}

export interface GoalMilestone {
  goalId: string;
  goalTitle: string;
  category: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
}

export interface GoalAchievement {
  type: "goal_done" | "habit_streak";
  title: string;
  subtitle: string;
  at: string;
}

export interface GoalStats {
  totalGoals: number;
  completedThisYear: number;
  daysInFocus: number;
  periods: GoalPeriodStat[];
  categories: GoalCategoryStat[];
  upcomingMilestones: GoalMilestone[];
  recentAchievements: GoalAchievement[];
}

export interface GoalProgressEntry {
  id: string;
  goal_id: string;
  value: number;
  recorded_at: string;
  note: string | null;
}

export interface GoalDetail extends Goal {
  children: Goal[];
  progress: GoalProgressEntry[];
}

/** Previsão matemática (tendência linear) de conclusão de uma meta numérica/percentual. */
export interface GoalForecastData {
  date: string;
  ratePerDay: number;
  daysRemaining: number;
  aheadOrBehindDays: number | null;
}

export interface GoalForecast {
  forecast: GoalForecastData | null;
  reason: string | null;
}

/* ---------------------------- Focus Mode ---------------------------- */

export interface FocusSession {
  id: string;
  task_id: string | null;
  project_id: string | null;
  mode: "pomodoro" | "free_timer";
  planned_minutes: number | null;
  actual_minutes: number | null;
  perceived_productivity: number | null;
  distractions: number;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface FocusSummary {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  bestHour: { hour: string; avg_productivity: number; total: number } | null;
}

/* -------------------------- Analytics / Reviews -------------------------- */

export interface LifeScoreBreakdown {
  date: string;
  overall: number;
  productivity: number;
  health: number;
  education: number;
  reading: number;
  habits: number;
  professional: number;
  goals: number;
}

export interface RangeMetrics {
  from: string;
  to: string;
  tasksCompleted: number;
  tasksPlanned: number;
  focusMinutes: number;
  studyMinutes: number;
  pagesRead: number;
  workouts: number;
  readingMinutes: number;
  workoutMinutes: number;
  habitsCompletionPct: number;
  habitsDoneCount: number;
  habitsPossibleCount: number;
}

export interface DailySeriesPoint {
  day: string;
  total: number;
}

export interface AnalyticsTimeDistribution {
  trabalho: number;
  estudo: number;
  leitura: number;
  exercicio: number;
}

export interface AnalyticsChangePct {
  tasksCompleted: number | null;
  focusMinutes: number | null;
  studyMinutes: number | null;
  pagesRead: number | null;
  workouts: number | null;
  habitsCompletionPct: number | null;
  avgSleepMinutes: number | null;
  avgWaterMl: number | null;
}

export interface AnalyticsOverview extends RangeMetrics {
  avgSleepMinutes: number;
  avgWaterMl: number;
  tasksCompletedByDay: Array<{ day: string; total: number }>;
  dailySeries: {
    tasks: DailySeriesPoint[];
    focus: DailySeriesPoint[];
    study: DailySeriesPoint[];
    pages: DailySeriesPoint[];
    workouts: DailySeriesPoint[];
    habits: DailySeriesPoint[];
    sleep: DailySeriesPoint[];
    water: DailySeriesPoint[];
  };
  timeDistribution: AnalyticsTimeDistribution;
  changePct: AnalyticsChangePct;
}

export interface LifeInsights {
  from: string;
  to: string;
  sleepVsNextDayProductivity: { r: number | null; pairs: number };
  moodVsFocusMinutes: { r: number | null; pairs: number };
  bestWeekday: { label: string; avgCompleted: number } | null;
  bestFocusHour: { hour: number; totalMinutes: number } | null;
  weekdayBreakdown: Array<{ weekday: number; label: string; avgCompleted: number }>;
}

export interface TimelineEvent {
  type: "task" | "habit" | "workout" | "reading" | "focus" | "education" | "sleep" | "mood" | "water" | "work_note" | "experiment";
  icon: string;
  id: string;
  label: string;
  at: string;
  [key: string]: unknown;
}

export interface DailyReview {
  id: string;
  review_date: string;
  completion_pct: number | null;
  highlights: string | null;
  notes: string | null;
}

export interface WeeklyReview {
  id: string;
  week_start_date: string;
  productivity_pct: number | null;
  health_pct: number | null;
  education_pct: number | null;
  reading_pct: number | null;
  habits_pct: number | null;
  tasks_completed: number | null;
  study_minutes: number | null;
  pages_read: number | null;
  focus_minutes: number | null;
  what_worked: string | null;
  what_didnt_work: string | null;
  what_to_improve: string | null;
  next_priorities: string | null;
  created_at: string;
}

export interface WeeklyChangePct {
  tasksCompleted: number | null;
  studyMinutes: number | null;
  pagesRead: number | null;
  focusMinutes: number | null;
  productivity: number;
  health: number;
  education: number;
  reading: number;
  habits: number;
}

export interface WeeklyComputedMetrics extends RangeMetrics {
  lifeScore: LifeScoreBreakdown;
  changePct: WeeklyChangePct;
}

/** Item unificado do Calendário — evento manual ou prazo real de outro módulo (tarefa, meta, TCC). */
export interface CalendarItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  sourceType: "manual" | "task" | "goal" | "academic_project";
  sourceId: string | null;
  link: string | null;
}

/** Uma conquista do catálogo (`achievements`) — se `unlockedAt` existir, o usuário já destravou. */
export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  metric: string | null;
  threshold: number | null;
  progress: number;
  unlockedAt: string | null;
}

/** Um troféu que o próprio usuário cadastrou (estilo PlayStation/Xbox) — desbloqueia sozinho ao atingir a métrica. */
export interface CustomAchievement {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  metric: string;
  threshold: number;
  progress: number;
  unlockedAt: string | null;
  createdAt: string;
}

export interface CustomAchievementMetricOption {
  value: string;
  label: string;
}

/* -------------------------- Notificações / Gatilhos -------------------------- */

export type NotificationTriggerEvent = "task_overdue" | "task_due_today" | "achievement_unlocked" | "weekly_summary" | "daily_insight";

export type NotificationAlertLevel = "soft" | "medium" | "critical";

export interface NotificationTriggerRule {
  id: string;
  eventType: NotificationTriggerEvent;
  label: string;
  description: string;
  channelEmail: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  alertLevel: NotificationAlertLevel;
  active: boolean;
  updatedAt: string;
}

export interface CustomNotificationTrigger {
  id: string;
  name: string;
  conditionType: "task_due_in" | "task_overdue_by";
  days: number;
  priority: "Baixa" | "Média" | "Alta" | null;
  channelEmail: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  active: boolean;
}

/* ------------------------------ Life Map ------------------------------ */

export type LifeMapAreaId = "metas" | "projetos" | "habitos" | "educacao" | "leitura" | "saude" | "profissional";

export type LifeMapNodeKind = "center" | "area" | "goal" | "project" | "habit" | "education" | "academic_project" | "book" | "health";

/** Tipos de entidade que podem ser origem/destino de um vínculo manual criado no Life Map. */
export type LifeMapLinkableType = "goal" | "project" | "habit" | "education" | "academic_project" | "book";

export type LifeMapRelationshipType = "supports" | "belongs_to" | "related_to" | "contributes_to";

export interface LifeMapNode {
  id: string;
  kind: LifeMapNodeKind;
  area: LifeMapAreaId | null;
  label: string;
  sublabel: string | null;
  progressPct: number | null;
  lastActivityAt: string | null;
  linkedCount: number;
  openPath: string | null;
}

export interface LifeMapEdge {
  from: string;
  to: string;
  kind: "goal_project" | "goal_habit" | "project_task" | "academic_education" | "academic_project" | "habit_health" | "manual";
  linkId?: string;
  relationshipType?: LifeMapRelationshipType;
}

export interface LifeMapOrphans {
  tasksWithoutProject: number;
  goalsWithoutHabit: number;
  projectsWithoutDeadline: number;
  habitsUnlinked: number;
}

export interface LifeMapSuggestion {
  text: string;
}

export interface LifeMapSummary {
  areasCount: number;
  areasActiveCount: number;
  goalsConnectedCount: number;
  orphanItemsCount: number;
  structuralScorePct: number;
}

export interface LifeMapDistributionItem {
  area: LifeMapAreaId;
  label: string;
  count: number;
  pct: number;
}

export interface LifeMapData {
  summary: LifeMapSummary;
  nodes: LifeMapNode[];
  edges: LifeMapEdge[];
  orphans: LifeMapOrphans;
  suggestions: LifeMapSuggestion[];
  distribution: LifeMapDistributionItem[];
}

export interface CreateLifeMapLinkInput {
  sourceType: LifeMapLinkableType;
  sourceId: string;
  targetType: LifeMapLinkableType;
  targetId: string;
  relationshipType?: LifeMapRelationshipType;
}

/* -------------------------- Experimentos Pessoais -------------------------- */

export type ExperimentStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export type ExperimentCategory =
  | "saude"
  | "sono"
  | "exercicio"
  | "hidratacao"
  | "produtividade"
  | "focus"
  | "educacao"
  | "leitura"
  | "habitos"
  | "bem_estar"
  | "personalizado";

/** Chave do catálogo central de métricas — ver experimentMetricsService no backend para a definição de cada uma. */
export type ExperimentMetricKey =
  | "sleep_duration"
  | "sleep_quality"
  | "energy"
  | "mood"
  | "stress"
  | "water_ml"
  | "focus_minutes"
  | "focus_sessions"
  | "exercise_minutes"
  | "exercise_sessions"
  | "reading_pages"
  | "reading_minutes"
  | "study_minutes"
  | "tasks_completed"
  | "habit_consistency";

export type ExperimentVerificationType = "automatic" | "manual";

/** Chave da regra de verificação automática — ver experimentVerificationService no backend. */
export type ExperimentVerificationRule =
  | "sleep_before"
  | "water_target"
  | "focus_minimum"
  | "reading_pages_minimum"
  | "exercise_minimum"
  | "study_minimum"
  | "habit_completion";

export type ExperimentSuccessCriteriaType = "consistency" | "metric_change" | "none";
export type ExperimentWorthContinuing = "yes" | "maybe" | "no";
export type ExperimentPerceivedResult = "improved" | "no_change" | "worsened";
export type ExperimentPerception = "muito_ruim" | "ruim" | "neutro" | "bom" | "muito_bom";
export type ExperimentCheckinStatus = "done" | "missed";

export interface ExperimentMetricInfo {
  key: ExperimentMetricKey;
  label: string;
  unit: string | null;
  /** Métrica onde "menor é melhor" (ex.: estresse) — usado para interpretar a comparação corretamente. */
  inverse: boolean;
  requiresHabit: boolean;
  hasHistory: boolean;
  historyDays: number;
}

export interface Experiment {
  id: string;
  title: string;
  description: string | null;
  category: ExperimentCategory;
  hypothesis: string | null;
  motivation: string | null;
  status: ExperimentStatus;
  start_date: string;
  end_date: string;
  primary_metric: ExperimentMetricKey;
  secondary_metrics: ExperimentMetricKey[];
  linked_habit_id: string | null;
  verification_type: ExperimentVerificationType;
  verification_rule: ExperimentVerificationRule | null;
  verification_config: Record<string, unknown> | null;
  success_criteria_type: ExperimentSuccessCriteriaType;
  success_criteria_value: number | null;
  personal_conclusion: string | null;
  worth_continuing: ExperimentWorthContinuing | null;
  perceived_result: ExperimentPerceivedResult | null;
  created_at: string;
  updated_at: string;
}

/** Linha da listagem — já vem com os campos derivados prontos (progresso, resultado), calculados no backend. */
export interface ExperimentListItem extends Experiment {
  progressPct: number;
  daysElapsed: number;
  durationDays: number;
  resultLabel: string | null;
}

export interface ExperimentMetricComparison {
  metric: ExperimentMetricKey;
  label: string;
  unit: string | null;
  inverse: boolean;
  beforeAvg: number | null;
  duringAvg: number | null;
  beforeDays: number;
  duringDays: number;
  diffAbs: number | null;
  diffPct: number | null;
  trend: "positive" | "negative" | "neutral" | "insufficient_data";
  insufficientDataReason: string | null;
}

export interface ExperimentCheckinDay {
  date: string;
  status: ExperimentCheckinStatus | "pending";
  source: "automatic" | "manual" | "none";
}

export interface ExperimentSeriesPoint {
  date: string;
  value: number | null;
  phase: "before" | "during";
}

export interface ExperimentLog {
  id: string;
  experiment_id: string;
  log_date: string;
  checkin_status: ExperimentCheckinStatus | null;
  perception: ExperimentPerception | null;
  notes: string | null;
  created_at: string;
}

export interface ExperimentDetail {
  experiment: Experiment;
  progressPct: number;
  daysElapsed: number;
  durationDays: number;
  comparison: ExperimentMetricComparison[];
  checkins: ExperimentCheckinDay[];
  consistencyPct: number | null;
  logs: ExperimentLog[];
  interpretation: string;
}

export interface ExperimentSummary {
  activeCount: number;
  totalCount: number;
  completedCount: number;
  completionRatePct: number | null;
  bestImpact: { label: string; diffPct: number } | null;
  weeksExperimenting: number;
  experimentingSinceDate: string | null;
}

export interface ExperimentInsightStat {
  label: string;
  value: string;
}

export interface ExperimentAISuggestion {
  title: string;
  hypothesis: string;
  durationDays: number;
  primaryMetric: ExperimentMetricKey;
  motivation: string;
}

export interface CreateExperimentInput {
  title: string;
  description?: string;
  category: ExperimentCategory;
  hypothesis?: string;
  motivation?: string;
  startDate: string;
  endDate: string;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics?: ExperimentMetricKey[];
  linkedHabitId?: string | null;
  verificationType: ExperimentVerificationType;
  verificationRule?: ExperimentVerificationRule | null;
  verificationConfig?: Record<string, unknown> | null;
  successCriteriaType?: ExperimentSuccessCriteriaType;
  successCriteriaValue?: number | null;
}

export type UpdateExperimentInput = Partial<CreateExperimentInput>;

/* ============================================================
   Signals — camada agregadora/analítica de sinais pessoais.
   Nunca duplica dado de outro módulo; só consolida e compara.
   ============================================================ */

export type SignalPeriod = "today" | "7d" | "30d";

export type SignalStatus = "ok" | "attention" | "insufficient_data" | "not_connected";

export interface SignalCard {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  status: SignalStatus;
  description: string;
  comparisonPct: number | null;
  comparisonLabel: string | null;
}

export type SignalScoreKey = "sleep" | "energy" | "mood" | "productivity" | "health" | "balance";

export interface RadarDimension {
  key: SignalScoreKey;
  label: string;
  value: number | null;
}

export interface DayClassification {
  label: string;
  description: string;
}

export type PatternType = "trend" | "attention" | "positive_association" | "negative_association" | "change" | "consistency";

export interface DetectedPattern {
  type: PatternType;
  signal: string;
  title: string;
  description: string;
  sampleSize: number;
}

export interface SignalsRecommendation {
  source: "rule" | "ai";
  title: string;
  message: string;
}

export interface SignalsDashboard {
  period: SignalPeriod;
  from: string;
  to: string;
  signals: SignalCard[];
  radar: RadarDimension[];
  dayClassification: DayClassification | null;
  patterns: DetectedPattern[];
  recommendation: SignalsRecommendation;
}

export type TrendSignalKey = "sleep" | "mood" | "energy" | "focus" | "exercise" | "reading";

export interface SignalTrendPoint {
  date: string;
  value: number;
}

export interface SignalTrendSeries {
  signal: TrendSignalKey;
  from: string;
  to: string;
  series: SignalTrendPoint[];
}
