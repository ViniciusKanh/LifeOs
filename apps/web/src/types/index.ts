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
  /** true quando a conta está vinculada a um login com Google (users.google_id preenchido). */
  google_linked: boolean;
  /** false quando a conta só entra pelo Google (nunca definiu senha) — nesse caso não pode desvincular. */
  has_password: boolean;
  /** Verificação em duas etapas (app autenticador) ativa. */
  mfa_enabled: boolean;
  terms_version: string | null;
  terms_current_version: string;
  /** true quando ainda não aceitou a versão vigente do Termo/Política. */
  terms_pending: boolean;
  /** Preferências da conta (já devolvidas por /auth/me). */
  language?: string | null;
  timezone?: string | null;
  /** Arte própria do personagem RPG (data URI) — só o dono altera. */
  rpg_avatar_image?: string | null;
  /** Preferências cosméticas do personagem, persistidas no backend. */
  rpg_prefs?: Partial<RpgPrefsPayload>;
}

/** Espelho de rpgPrefsSchema (API). */
export interface RpgPrefsPayload {
  avatarId: "aventureiro" | "mago" | "arqueiro" | "cavaleiro" | "inventor" | "alquimista";
  avatarMode: "rpg" | "photo" | "initials" | "custom";
  frame: "bronze" | "silver" | "gold" | "rare";
  banner: string;
  title: string | null;
  gamification: boolean;
  showXp: boolean;
  showCoins: boolean;
  animations: "full" | "reduced" | "off";
}

/** Resposta do login quando a conta tem MFA: a sessão só nasce na 2ª etapa. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /** 1 quando a conta está vinculada ao Google (o google_id em si nunca é exposto). */
  google_linked: number;
  email_verified: number;
  password_set: number;
  mfa_enabled: number;
  last_login_at: string | null;
  last_seen_at: string | null;
  terms_version: string | null;
}

/** Visão do admin sobre uma conta: status + contagens de uso (nunca conteúdo). */
export interface AdminUserOverview {
  user: AdminUser & { mfa_enabled_at: string | null; terms_accepted_at: string | null };
  termsCurrentVersion: string;
  recoveryCodesRemaining: number;
  usage: Array<{ key: string; label: string; count: number }>;
  totalRecords: number;
  mediaBytes: number;
  audit: Array<{ action: string; created_at: string; actor_name: string | null }>;
}

export type AdminIntegration = "gemini" | "turso" | "smtp" | "google_oauth";

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
  /** Meta "Etapas" vinculada (opcional) — concluir a tarefa avança o progresso automático dessa meta. */
  goal_id: string | null;
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
  /** Preenchido quando a tarefa foi gerada a partir de um hábito ("Gerar tarefas de hoje" em Hábitos) — concluir a tarefa faz o check-in automático do hábito do dia. */
  habit_id: string | null;
  /** Dificuldade (define XP/moedas pelos valores do usuário) e contrato a que pertence. */
  difficulty?: Difficulty | null;
  contract_id?: string | null;
}

export type Difficulty = "facil" | "medio" | "dificil" | "epico";

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

export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "cancelled";
export type ProjectPriority = "Baixa" | "Média" | "Alta" | "Crítica";

export interface ProjectLink {
  label: string;
  url: string;
}

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
  // Cadastro completo (migration 0043) — tudo opcional.
  status: ProjectStatus;
  priority: ProjectPriority | null;
  start_date: string | null;
  due_date: string | null;
  objective: string | null;
  scope: string | null;
  success_criteria: string | null;
  client: string | null;
  area: string | null;
  budget: number | null;
  repository_url: string | null;
  links: ProjectLink[];
  tags: string[];
  completed_at: string | null;
  /** Meta a que o projeto serve (Direção). */
  goal_id?: string | null;
}

/** Indicadores do projeto — sempre derivados das tarefas, anexos e Diário. */
export interface ProjectOverview {
  totals: {
    tasks: number;
    done: number;
    open: number;
    overdue: number;
    dueThisWeek: number;
    progressPct: number;
    estimateMinutes: number;
    timeSpentMinutes: number;
    attachments: number;
    journalEntries: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  upcoming: Array<{ id: string; title: string; dueDate: string; status: string; priority: string }>;
  recentlyCompleted: Array<{ id: string; title: string; completedAt: string }>;
  journalEntries: Array<{ date: string; preview: string | null }>;
  daysToDeadline: number | null;
}

/** Anexo de tarefa (imagem ou PDF). */
export interface TaskAttachment {
  id: string;
  taskId: string;
  kind: "image" | "document";
  dataUri: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  createdAt: string;
}

/** Documento do projeto = anexo de uma tarefa vinculada, com o contexto da tarefa. */
export interface ProjectDocument extends TaskAttachment {
  taskTitle: string;
  taskStatus: string;
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
  /** true quando a meta está ativa, tem prazo e o prazo já passou — deixa de contar no Life Score. */
  is_overdue?: boolean;
  /** Tarefas vinculadas (tasks.goal_id) a esta meta "task_based" — presente/derivado pela API; current_value já vem calculado a partir dele quando houver. */
  linked_tasks?: { total: number; done: number } | null;
  /** Direção: área da roda da vida e ciclo ("2026", "2026-Q4" ou "2026-10"). */
  life_area?: LifeArea | null;
  cycle?: string | null;
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
  leitura: number;
  exercicio: number;
}

export interface AnalyticsChangePct {
  tasksCompleted: number | null;
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
  bestWeekday: { label: string; avgCompleted: number } | null;
  weekdayBreakdown: Array<{ weekday: number; label: string; avgCompleted: number }>;
}

export interface DailyWisdom {
  text: string;
  source: string;
  kind: "versiculo" | "proverbio";
}

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
  dailyQuote: DailyWisdom;
}

/** Assistente de escrita do Diário — só sugestão; nada é salvo sem o usuário inserir. */
export interface JournalWritingAssist {
  questions: string[];
  draft: string | null;
  takeaways: string[];
  /** Fatos reais (montados no backend) que a IA recebeu. */
  dataUsed: string[];
}

export interface JournalEntry {
  date: string;
  /** "Como foi meu dia" — texto corrido (HTML do editor rico). */
  thoughts: string | null;
  gratitude: string[];
  selfCare: string[];
  selfCareOther: string | null;
  /** Humor anotado no próprio diário antes de vir de Saúde — só leitura, registros antigos. */
  nightMood: number | null;
  /** "O que levo para amanhã". */
  nightTakeaway: string | null;
  focusTaskIds: string[];
  /** Ids dos diários (coleções) a que a entrada deste dia pertence — ver JournalCollection. */
  journalIds: string[];
  /** Fotos anexadas à entrada do dia (Fase 4 do Diário — Apple Journal). */
  media: JournalMedia[];
  /** Dia marcado como favorito (Fase 6 do Diário — Apple Journal). */
  isFavorite: boolean;
  /** Localização real do dia (busca via /api/context/geocode) — null quando não informada. */
  locationLabel: string | null;
  locationLat: number | null;
  locationLng: number | null;
  /** Etiquetas reais do dia (Fase 17 — protótipo Apple Journal). */
  tags: string[];
  /** Projetos/metas reais vinculados a este dia (Fase 17). */
  links: JournalEntryLink[];
  /** Organização por IA confirmada (null quando nunca foi salva). */
  ai: JournalAiOrganization | null;
  auto: JournalAutoData;
}

/** Vínculo real de uma entrada do Diário a um projeto ou meta do usuário (Fase 17). */
export interface JournalEntryLink {
  id: string;
  targetType: "project" | "goal";
  targetId: string;
}

/** Uma foto ou nota de voz anexada à entrada do dia do Diário. */
export type JournalMediaKind = "photo" | "audio" | "video" | "document";

/** Mídia do Diário (foto, vídeo, PDF ou nota de voz) com a história contada pelo usuário. */
export interface JournalMedia {
  id: string;
  kind: JournalMediaKind;
  dataUri: string;
  caption: string | null;
  story: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** Categoria sugerida pela IA e confirmada pelo usuário. */
  aiCategory: string | null;
  durationSeconds: number | null;
  sortOrder: number;
}

/** Organização por temas feita pelo Gemini (salva só após confirmação do usuário). */
export interface JournalAiCategory {
  name: string;
  points: string[];
}

export interface JournalAiOrganization {
  title: string | null;
  summary: string | null;
  categories: JournalAiCategory[];
  organizedAt: string;
}

/** Sugestão devolvida pela IA — ainda NÃO salva. */
export interface JournalAiSuggestion {
  title: string | null;
  summary: string | null;
  categories: JournalAiCategory[];
  mediaCategories: Array<{ id: string; category: string }>;
  suggestedTags: string[];
}

/** Um "diário" — coleção nomeada (Pessoal, Viagens, Estudos...) pra organizar entradas do Diário. */
export interface JournalCollection {
  id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  color: "pink" | "blue" | "purple" | "green" | "teal" | null;
  description: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** Total real de entradas neste diário — vem só da listagem (GET /api/journals). */
  entry_count?: number;
}

export interface TimelineEvent {
  type:
    | "task" | "habit" | "workout" | "reading" | "education" | "sleep" | "mood" | "water" | "work_note" | "experiment" | "journal"
    | "life_admin" | "review" | "focus" | "project" | "contract" | "campaign" | "achievement" | "reward" | "level_up";
  icon: string;
  id: string;
  label: string;
  at: string;
  /** XP/moedas realmente concedidos por este evento (ausente quando não rende XP). */
  xp?: number;
  coins?: number;
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
  pagesRead: number | null;
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
export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  metric: string | null;
  threshold: number | null;
  tier: AchievementTier;
  progress: number;
  unlockedAt: string | null;
  /** Valor real atual da métrica (ex.: 27 de 365). */
  currentValue?: number;
  /** Categoria derivada da métrica no backend. */
  category?: AchievementCategory;
  /** Recompensa por raridade (paga uma única vez ao desbloquear). */
  reward?: { xp: number; coins: number };
}

export type AchievementCategory = "missoes" | "habitos" | "leitura" | "saude" | "foco" | "revisoes" | "metas" | "educacao" | "experimentos" | "outros";

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

export type NotificationTriggerEvent = "task_overdue" | "task_due_today" | "achievement_unlocked" | "weekly_summary" | "daily_insight" | "journal_reminder";

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
  kind: "hub" | "goal_project" | "goal_habit" | "project_task" | "academic_education" | "academic_project" | "habit_health" | "manual";
  linkId?: string;
  relationshipType?: LifeMapRelationshipType;
}

export interface LifeMapOrphans {
  tasksWithoutProject: number;
  goalsWithoutHabit: number;
  projectsWithoutDeadline: number;
  habitsUnlinked: number;
}

/** Alerta estrutural acionável do Life Map — itens reais (até 5) e para onde ir para resolver. */
export interface LifeMapAlert {
  id: "tasks_without_project" | "goals_without_habit" | "projects_without_deadline" | "habits_without_goal";
  severity: "warning" | "info";
  title: string;
  description: string;
  count: number;
  items: Array<{ id: string; label: string; openPath: string; nodeId: string | null }>;
  cta: { label: string; path: string } | null;
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
  /** Pode faltar se o backend ainda não foi atualizado — a UI cai nas contagens de `orphans`. */
  alerts?: LifeMapAlert[];
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
  /** Rota real do módulo onde esse dado é registrado (ex.: /saude, /foco) — usada para orientar o check-in diário. */
  sourcePath: string;
  sourceLabel: string;
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
  /** Emoji escolhido (nulo = emoji padrão da categoria). */
  emoji: string | null;
}

/** Linha da listagem — já vem com os campos derivados prontos (progresso, resultado), calculados no backend. */
export interface ExperimentListItem extends Experiment {
  progressPct: number;
  daysElapsed: number;
  durationDays: number;
  resultLabel: string | null;
  /** Últimos 7 dias (ou menos, no começo) de check-in — painel com vários experimentos. */
  recent?: Array<{ date: string; status: ExperimentCheckinStatus | "pending" }>;
  recentConsistencyPct?: number | null;
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
  emoji?: string | null;
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

export type TrendSignalKey = "sleep" | "mood" | "energy" | "exercise" | "reading";

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

/* ============================================================
   Contexto do Dia — fonte ambiental (clima, qualidade do ar, luz do
   dia) que alimenta o Signals via provider interno. Nunca duplica
   Signals; Signals só consome o sinal já pronto daqui.
   ============================================================ */

export type ContextPeriod = "today" | "7d" | "30d";

export interface ContextLocation {
  configured: boolean;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  autoLocation: boolean;
  tempUnit: "celsius" | "fahrenheit";
  windUnit: "kmh" | "mph";
  showAirQuality: boolean;
  showUv: boolean;
  weatherAlerts: boolean;
}

export interface UpdateContextLocationInput {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  autoLocation?: boolean;
  tempUnit?: "celsius" | "fahrenheit";
  windUnit?: "kmh" | "mph";
  showAirQuality?: boolean;
  showUv?: boolean;
  weatherAlerts?: boolean;
}

export interface GeocodeResult {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface RoutineImpact {
  key: string;
  label: string;
  groupLabel: string;
  value: number;
  unit: string;
  comparisonPct: number | null;
  favorable: "positive" | "negative" | "neutral";
  sampleSize: number;
}

export interface ContextInsight {
  text: string;
}

export interface ContextTodayDashboard {
  configured: true;
  location: { city: string | null; region: string | null; country: string | null };
  lastUpdated: string;
  kpis: {
    temperature: { value: number; apparentTemperature: number };
    rainChance: { value: number; note: string };
    airQuality: { aqi: number; level: string } | null;
    daylight: { durationMinutes: number; sunrise: string; sunset: string };
  };
  todayPeriods: Array<{ key: string; label: string; temperature: number; condition: string; icon: string; rainProbability: number | null }>;
  tomorrow: { temperature: number; condition: string; icon: string } | null;
  hourlyChart: Array<{ time: string; temperature: number; apparentTemperature: number; rainProbability: number | null }>;
  summary: { humidity: number | null; windSpeedKmh: number | null; uv: { value: number; level: string; description: string } | null };
  resumoAmbiental: { condition: string; airQuality: string | null; uv: string | null; thermalComfort: string | null };
  dicaDoDia: string;
  agendaRecomendada: Array<{ period: string; label: string; text: string }>;
  impacts: RoutineImpact[];
  insights: ContextInsight[];
  comparativo: Array<{ label: string; unit: string; current: number | null; previous: number | null }>;
  disclaimer: string;
  attribution: string;
}

export type ContextDashboardResponse = ContextTodayDashboard | { configured: false };

/* ===================== Capacity Planner ===================== */

export type EffortType = "deep_work" | "normal" | "light";
export type WorkloadLevel = "leve" | "equilibrada" | "alta" | "sobrecarga";

export interface CapacitySummary {
  date: string;
  windowLabel: string;
  totalMinutes: number;
  busyMinutes: number;
  freeMinutes: number;
  plannedMinutes: number;
  overloadMinutes: number;
  occupancyRate: number;
  workloadLevel: WorkloadLevel;
}

export interface CapacityFreeWindow {
  start: string;
  end: string;
}

export interface CapacityConflict {
  blockId: string | null;
  reason: string;
}

export interface CapacityArea {
  label: string;
  minutes: number;
  pct: number;
}

export interface CapacityDayTask {
  id: string;
  title: string;
  priority: "Baixa" | "Média" | "Alta";
  estimateMinutes: number | null;
  projectName: string | null;
  projectColor: string | null;
  dueDate: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  done: boolean;
  effortType: EffortType;
  isOverdue: boolean;
}

export interface CapacityPlannedBlock {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  entityType: "task" | "free_block" | "event";
  entityId: string | null;
  title: string;
  blockType: EffortType;
  projectColor: string | null;
}

export interface CapacityEnergyForecast {
  level: "Baixa" | "Média" | "Alta" | null;
  bestPeriod: string | null;
  changePct: number | null;
}

export interface CapacityContextSummary {
  temperature: number | null;
  condition: string | null;
  rainChance: number | null;
  favorable: boolean | null;
}

export interface CapacityDayDashboard {
  summary: CapacitySummary;
  overloadMessage: string | null;
  tasks: CapacityDayTask[];
  blocks: CapacityPlannedBlock[];
  freeWindows: CapacityFreeWindow[];
  conflicts: CapacityConflict[];
  areas: CapacityArea[];
  energy: CapacityEnergyForecast;
  context: CapacityContextSummary;
}

export interface CapacityProposedBlock {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
  blockType: EffortType;
}

export interface CapacityPlanningSuggestion {
  proposed: CapacityProposedBlock[];
  deferred: Array<{ taskId: string; title: string; reason: string }>;
  skippedNoEstimate: Array<{ taskId: string; title: string }>;
  overloadBeforeMinutes: number;
  overloadAfterMinutes: number;
}

/* ===================== Deadline Radar ===================== */

export type DeadlineStatus = "atrasado" | "vence_hoje" | "vence_7d" | "vence_30d" | "no_prazo" | "concluido";
export type DeadlineArea = "Educação" | "Projetos" | "Profissional" | "Pessoal" | "Outros";
export type DeadlineEntityType = "task" | "goal" | "academic_deadline" | "academic_project" | "experiment" | "campaign" | "campaign_milestone";
export type DeadlineRisk = "low" | "medium" | "high" | "critical";
export type DeadlinePeriodFilter = "today" | "7d" | "30d" | "all";

export interface DeadlineItem {
  id: string;
  entityType: DeadlineEntityType;
  entityId: string;
  title: string;
  dueDate: string;
  status: DeadlineStatus;
  priority: "Baixa" | "Média" | "Alta" | null;
  progress: number | null;
  area: DeadlineArea;
  projectId: string | null;
  projectName: string | null;
  sourceModule: string;
  daysRemaining: number;
  done: boolean;
}

export interface DeadlineSummary {
  overdue: number;
  dueToday: number;
  due7d: number;
  due8to30: number;
  onTrack: number;
  onTimeRate: { pct: number; completedOnTime: number; completedWithDeadline: number } | null;
}

export interface DeadlineAreaBucket {
  area: DeadlineArea;
  count: number;
  pct: number;
}

export interface DeadlineTrendPoint {
  month: string;
  label: string;
  count: number;
}

export interface ProjectRiskItem {
  projectId: string;
  projectName: string;
  progressPct: number;
  daysRemaining: number | null;
  dueDate: string | null;
  riskScore: number;
  risk: DeadlineRisk;
  kind: "project" | "academic";
  sourceModule: string;
}

export interface DeadlineStatusBars {
  atrasados: number;
  vence7d: number;
  em8a30: number;
  noPrazo: number;
}

export type DeadlineDayStatus = "critico" | "atencao" | "tranquilo";

export interface DeadlineRadarDashboard {
  summary: DeadlineSummary;
  dayStatus: DeadlineDayStatus;
  focusItem: DeadlineItem | null;
  items: DeadlineItem[];
  critical: DeadlineItem[];
  areas: DeadlineAreaBucket[];
  upcomingMilestones: DeadlineItem[];
  statusBars: DeadlineStatusBars;
  risks: ProjectRiskItem[];
  trend: DeadlineTrendPoint[];
  suggestions: string[];
  insights: string[];
}

/* ===================== Goal Forecast ===================== */

export type GoalForecastStatus = "ahead" | "on_track" | "attention" | "at_risk" | "overdue" | "completed" | "insufficient_data";
export type GoalArea = "Educação" | "Saúde" | "Profissional" | "Pessoal" | "Financeira" | "Outros";
export type GoalRisk = "low" | "medium" | "high" | "critical";
export type GoalForecastPeriodFilter = "all" | "this_year" | "next_year" | "custom";

export interface GoalForecastLinkedTasks {
  total: number;
  done: number;
  projectIds: string[];
}

export interface GoalForecastItem {
  id: string;
  title: string;
  category: string | null;
  area: GoalArea;
  kind: GoalKind;
  unit: string | null;
  currentValue: number;
  targetValue: number | null;
  progressPct: number | null;
  dueDate: string | null;
  createdAt: string;
  forecastDate: string | null;
  forecastReason: string | null;
  currentPace: number | null;
  requiredPace: number | null;
  status: GoalForecastStatus;
  statusLabel: string;
  risk: GoalRisk | null;
  linkedTasks: GoalForecastLinkedTasks | null;
}

export interface GoalForecastSummary {
  activeGoals: number;
  completedGoals: number;
  avgProgress: number | null;
  projectedCompletions3Months: number;
  paceMultiplier: number | null;
}

export interface GoalAreaBucket {
  area: GoalArea;
  count: number;
  pct: number;
  avgProgress: number | null;
}

export interface GoalMonthlyProjectionPoint {
  month: string;
  label: string;
  count: number;
}

export interface GoalTimelineEntry {
  id: string;
  title: string;
  start: string;
  end: string | null;
  status: GoalForecastStatus;
}

export interface GoalForecastDashboard {
  summary: GoalForecastSummary;
  goals: GoalForecastItem[];
  timeline: GoalTimelineEntry[];
  areas: GoalAreaBucket[];
  monthlyProjection: GoalMonthlyProjectionPoint[];
  risks: GoalForecastItem[];
  suggestions: string[];
  insights: string[];
  today: string;
}

/* -------------------------------- Data Health -------------------------------- */

export type DataHealthModuleKey = "tasks" | "projects" | "goals" | "habits" | "education" | "library" | "health" | "focus" | "experiments" | "signals";

export type DataHealthDimension = "completeness" | "consistency" | "integrity" | "freshness" | "sync" | "history";

export type DataHealthDimensionScores = Record<DataHealthDimension, number>;

export type DataHealthLabel = "Crítico" | "Atenção" | "Bom" | "Saudável";

export type DataHealthSeverity = "info" | "attention" | "warning" | "critical";

export type CoverageStatus = "alta" | "média" | "baixa";

export type ReadinessStatus = "ready" | "partial" | "insufficient" | "unavailable";

export interface ModuleCoverage {
  key: DataHealthModuleKey;
  label: string;
  coveragePct: number;
  status: CoverageStatus;
  mainIssue: string | null;
  openPath: string;
}

export interface DataHealthIssue {
  id: string;
  severity: DataHealthSeverity;
  module: string;
  dimension: DataHealthDimension;
  title: string;
  description: string;
  affectedCount: number;
  actionPath: string;
}

export interface ReadinessResult {
  tool: string;
  status: ReadinessStatus;
  reason: string;
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

/* ============================================================
   Carga por projeto e visão Profissional — espelham
   apps/api/src/services/workloadService.ts e professionalService.ts.
   ============================================================ */

export type LoadPressure = "critical" | "attention" | "ok" | "idle";

export interface ProjectLoad {
  id: string | null;
  name: string;
  color: string | null;
  kind: string | null;
  status: string | null;
  dueDate: string | null;
  total: number;
  done: number;
  open: number;
  doing: number;
  todo: number;
  overdue: number;
  dueThisWeek: number;
  unestimatedOpen: number;
  openEstimateMinutes: number;
  remainingMinutes: number;
  spentMinutes: number;
  loggedMinutesPeriod: number;
  completedPeriod: number;
  createdPeriod: number;
  progressPct: number;
  nextDue: { taskId: string; title: string; date: string } | null;
  daysToDeadline: number | null;
  hoursPerDayNeeded: number | null;
  pressure: LoadPressure;
}

export interface WorkloadSummary {
  periodDays: number;
  today: string;
  projects: ProjectLoad[];
  totals: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    remainingMinutes: number;
    loggedMinutesPeriod: number;
    completedPeriod: number;
    createdPeriod: number;
    unestimatedOpen: number;
    weeksToClear: number | null;
  };
}

export interface ProfessionalComparison {
  key: "sleep" | "energy" | "workout" | "habits" | "meetings";
  label: string;
  withLabel: string;
  withoutLabel: string;
  withDays: number;
  withoutDays: number;
  withAvgDone: number | null;
  withoutAvgDone: number | null;
  withAvgMinutes: number | null;
  withoutAvgMinutes: number | null;
  deltaPct: number | null;
  reason: string | null;
}

export interface ProfessionalOverview {
  today: string;
  windowDays: number;
  kpis: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    done7: number;
    donePrev7: number;
    logged7: number;
    loggedPrev7: number;
    meetings30: number;
    remainingMinutes: number;
    unestimatedOpen: number;
  };
  daily: Array<{ day: string; done: number; loggedMinutes: number; meetings: number; sleepHours: number | null; energy: number | null }>;
  weekday: Array<{ weekday: number; label: string; done: number }>;
  bestWeekday: { label: string; done: number } | null;
  comparisons: ProfessionalComparison[];
  workload: WorkloadSummary;
  upcoming: Array<{ id: string; title: string; projectName: string; projectColor: string | null; dueDate: string; priorityScore: number | null; status: string }>;
  careerGoals: Array<{ id: string; title: string; pct: number; dueDate: string | null }>;
  journal: { linkedEntries30: number; recent: Array<{ date: string; projectName: string; preview: string | null }> };
}

/** Parâmetros do gerador de tarefas a partir de hábitos (POST /habits/generate-tasks). */
export interface HabitTaskGenerationInput {
  from: string;
  to: string;
  habitIds?: string[];
  estimateMinutes: number;
  priority: TaskPriority;
  status: "Backlog" | "A Fazer";
  projectId?: string | null;
  respectFrequency: boolean;
}

export interface HabitTaskGenerationResult {
  created: Array<{ id: string; title: string; habit_id: string; start_date: string; due_date: string }>;
  skippedDone: number;
  skippedExisting: number;
  from: string;
  to: string;
}

/* ---------- Experimentos: análise aprofundada e prévia de base (experimentAnalysisService.ts) ---------- */

export type ExperimentEvidence = "strong" | "moderate" | "weak" | "none" | "insufficient";

export interface ExperimentDescribe {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface ExperimentMetricAnalysis {
  metric: ExperimentMetricKey;
  label: string;
  unit: string | null;
  inverse: boolean;
  isPrimary: boolean;
  before: ExperimentDescribe;
  during: ExperimentDescribe;
  effect: {
    diff: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    effectSize: number | null;
    evidence: ExperimentEvidence;
    outsideNaturalRange: boolean | null;
  };
  coveragePct: number;
  adherence: { doneMean: number | null; doneDays: number; missedMean: number | null; missedDays: number; favorableDiff: number | null } | null;
}

export type ExperimentSuccessStatus = "met" | "not_met" | "on_track" | "at_risk" | "unreachable" | "pending" | "none";

export interface ExperimentAnalysis {
  verdict: { tone: "positive" | "negative" | "neutral" | "collecting" | "warning"; title: string; text: string; nextStep: string };
  metrics: ExperimentMetricAnalysis[];
  weekly: Array<{ week: number; from: string; to: string; primaryMean: number | null; consistencyPct: number | null; daysWithData: number }>;
  success: { type: ExperimentSuccessCriteriaType; target: number | null; current: number | null; status: ExperimentSuccessStatus; message: string; doneDaysNeeded: number | null };
  perception: { avg: number | null; firstHalfAvg: number | null; secondHalfAvg: number | null; counts: Record<ExperimentPerception, number>; total: number };
  streak: { current: number; best: number };
  overlaps: Array<{ id: string; title: string; status: ExperimentStatus; sharesMetric: boolean }>;
  daysRemaining: number;
  pulse: {
    beforeMean: number | null;
    points: Array<{ date: string; value: number | null; cumulativeMean: number | null; status: string }>;
    latest: { date: string; value: number | null; vsBeforePct: number | null } | null;
  };
}

export interface ExperimentBaselinePreview {
  metric: ExperimentMetricKey;
  label: string;
  unit: string | null;
  days: number;
  daysWithData: number;
  mean: number | null;
  sd: number | null;
  cvPct: number | null;
  recommendedDurationDays: number | null;
  sourcePath: string;
  sourceLabel: string;
  message: string;
  sparkline: Array<number | null>;
}

/* ---------- Experimentos: LifeOS Copilot (experimentCoachService.ts) ---------- */

export interface ExperimentProposal {
  title: string;
  category: ExperimentCategory;
  hypothesis: string;
  rationale: string;
  dailyAction: string;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics: ExperimentMetricKey[];
  durationDays: number;
  linkedHabitId: string | null;
  verificationType: ExperimentVerificationType;
  verificationRule: ExperimentVerificationRule | null;
  verificationConfig: Record<string, unknown> | null;
  successCriteriaType: ExperimentSuccessCriteriaType;
  successCriteriaValue: number | null;
  /** Calculado pelo servidor a partir dos registros reais — não vem da IA. */
  baseline: { mean: number | null; daysWithData: number; unit: string | null; recommendedDurationDays: number | null };
}

export type ExperimentInsightKind = "dado" | "inferencia" | "sugestao";

export interface ExperimentInsightReport {
  id: string;
  kind: "insight" | "final";
  createdAt: string;
  logsCount: number;
  content: {
    headline: string;
    summary: string;
    items: Array<{ kind: ExperimentInsightKind; text: string }>;
    todayFocus: string | null;
    question: string | null;
  };
}

export interface ExperimentLogProposal {
  logDate: string;
  checkinStatus: ExperimentCheckinStatus | null;
  perception: ExperimentPerception | null;
  notes: string;
  reasoning: string | null;
}

export type ExperimentTailorField = "title" | "hypothesis" | "verificationConfig" | "durationDays" | "successCriteriaValue" | "secondaryMetrics";

/** Personalização de um rascunho pela IA (POST /experiments/ai/tailor). */
export interface ExperimentTailoring {
  changes: Array<{ field: ExperimentTailorField; value: unknown; reason: string }>;
  trackingTips: string[];
  pitfalls: string[];
  reminderTime: string | null;
  emoji: string | null;
  baseline: { mean: number | null; daysWithData: number; unit: string | null };
}

export interface ExperimentTailorDraft {
  title: string;
  category: ExperimentCategory;
  hypothesis?: string | null;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics?: ExperimentMetricKey[];
  durationDays: number;
  verificationType: ExperimentVerificationType;
  verificationRule?: ExperimentVerificationRule | null;
  verificationConfig?: Record<string, unknown> | null;
  successCriteriaType?: ExperimentSuccessCriteriaType;
  successCriteriaValue?: number | null;
}


/* -------------------------- Administração da vida -------------------------- */

export type LifeAdminKind = "vencimento" | "manutencao" | "documento" | "conta";
export type LifeAdminCategory = "veiculo" | "casa" | "documentos" | "saude" | "seguros" | "impostos" | "assinaturas" | "pets" | "outro";
export type LifeAdminUrgency = "overdue" | "today" | "soon" | "ok" | "no_date";

export interface LifeAdminItem {
  id: string;
  kind: LifeAdminKind;
  title: string;
  category: LifeAdminCategory;
  dueDate: string | null;
  recurrenceMonths: number | null;
  remindDaysBefore: number;
  amount: number | null;
  reference: string | null;
  location: string | null;
  notes: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  status: "active" | "archived";
  lastDoneAt: string | null;
  createdAt: string;
  updatedAt: string;
  daysLeft: number | null;
  urgency: LifeAdminUrgency;
}

export interface LifeAdminDetail extends LifeAdminItem {
  history: Array<{ id: string; doneAt: string; dueDate: string | null; amount: number | null; note: string | null }>;
}

export interface LifeAdminSummary {
  overdue: number;
  dueSoon: number;
  next: Array<Pick<LifeAdminItem, "id" | "title" | "kind" | "category" | "dueDate" | "daysLeft" | "urgency">>;
}

/* -------------------------- Direção -------------------------- */

export type LifeArea = "saude" | "carreira" | "financas" | "relacionamentos" | "familia" | "desenvolvimento" | "lazer" | "espiritualidade";

export interface VisionValue {
  name: string;
  description: string | null;
}

export interface LifeVision {
  vision: string | null;
  purpose: string | null;
  values: VisionValue[];
  updatedAt: string | null;
}

export interface WheelAreaScore {
  area: LifeArea;
  score: number | null;
  note: string | null;
  assessedOn: string | null;
  previousScore: number | null;
}

export interface WheelData {
  latest: WheelAreaScore[];
  history: Array<{ assessedOn: string; average: number; scores: Partial<Record<LifeArea, number>> }>;
}

export interface DirectionGoal {
  id: string;
  title: string;
  status: string;
  lifeArea: LifeArea | null;
  cycle: string | null;
  parentGoalId: string | null;
  dueDate: string | null;
  progressPct: number | null;
  progressSource: "tasks" | "value" | null;
  openTasks: number;
  doneTasks: number;
  projects: Array<{ id: string; name: string; doneCount: number; taskCount: number }>;
  /** Campanhas da Forja ligadas a esta meta. */
  campaigns?: Array<{ id: string; title: string; status: string }>;
}

export interface DirectionOverview {
  vision: LifeVision;
  wheel: WheelData;
  cycles: { year: string; quarter: string; month: string };
  goals: DirectionGoal[];
  alignment: {
    openTasks: number;
    alignedOpenTasks: number;
    alignedPct: number | null;
    activeGoalsWithoutArea: number;
    activeGoalsWithoutWork: number;
  };
  balance: Array<{ area: LifeArea; score: number | null; activeGoals: number; doneLast30: number }>;
}

export interface WhyStep {
  type: "task" | "project" | "goal" | "value" | "vision";
  id: string | null;
  label: string;
  detail: string | null;
}

export type PeriodicKind = "monthly" | "quarterly" | "annual";

export interface PeriodMetrics {
  from: string;
  to: string;
  label: string;
  tasksCompleted: number;
  goalsCompleted: number;
  habitCheckins: number;
  journalEntries: number;
  pagesRead: number;
  workouts: number;
  workoutMinutes: number;
  avgMood: number | null;
  avgSleepMinutes: number | null;
  lifeAdminDone: number;
  wheelAverage: number | null;
  goals: Array<Pick<DirectionGoal, "id" | "title" | "status" | "cycle" | "lifeArea" | "progressPct">>;
}

export interface PeriodicReview {
  id: string | null;
  kind: PeriodicKind;
  periodKey: string;
  wins: string | null;
  lessons: string | null;
  focusNext: string | null;
  energyScore: number | null;
  savedAt: string | null;
  metrics: PeriodMetrics;
  /** Retrato do período anterior (base real das variações). */
  previousMetrics: PeriodMetrics | null;
  /** Recompensa de fechamento de ciclo: regra do backend e se já foi concedida. */
  reward: { xp: number; coins: number; awarded: boolean; awardedAt: string | null; eligible: boolean };
}

/** Resposta do Copilot da revisão (rotulada por proveniência na UI). */
export interface PeriodicReviewAnalysis {
  achievements: string[];
  patterns: string[];
  attention: string[];
  suggestions: string[];
  basedOn: { label: string; from: string; to: string };
}

/* -------------------------- Notas e conhecimento -------------------------- */

export type NoteKind = "nota" | "ideia" | "referencia";
export type NoteLinkType = "note" | "task" | "project" | "goal" | "book" | "journal" | "education";

export interface NoteSummary {
  id: string;
  title: string;
  kind: NoteKind;
  tags: string[];
  pinned: boolean;
  preview: string;
  sourceUrl: string | null;
  linkCount: number;
  backlinkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDetail extends NoteSummary {
  content: string;
  archived: boolean;
  links: Array<{ linkId: string; targetType: NoteLinkType; targetId: string; label: string; path: string; origin: "manual" | "wiki" }>;
  backlinks: Array<{ id: string; title: string; preview: string }>;
  unresolvedWikiLinks: string[];
}
