import { api } from "./api";

/** Espelho de /api/journey-reviews (Revisões da Jornada 3.0). */

export type ReviewKind = "weekly" | "monthly" | "quarterly" | "annual";
export type ReviewAdvisorMode = "analyze" | "reflection" | "bottlenecks" | "plan" | "missions" | "compare";
export interface FocusRef {
  type: "campaign" | "project" | "goal";
  id: string;
}
export interface Indicator {
  key: string;
  label: string;
  unit: string;
  kind: "sum" | "avg";
  value: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  note: string | null;
}
export interface ReviewAction {
  id: string;
  text: string;
  convertedTo: "missao" | "habito" | "meta" | "experimento" | "protocolo" | null;
  refId: string | null;
}
export interface ReviewPlan {
  objective: string;
  priorities: string[];
  focus: FocusRef[];
  goalIds: string[];
  missionIds: string[];
  habitIds: string[];
  notes: string;
}
export type SeriesPoint = { label: string; from: string; to: string; future: boolean; lifeScore: number | null; tasksDone: number; habitsDone: number } & Record<string, number | null | string | boolean>;
export interface JourneyReview {
  kind: ReviewKind;
  key: string;
  label: string;
  range: { from: string; to: string; until: string; inProgress: boolean; elapsedDays: number; totalDays: number };
  previous: { key: string; label: string; from: string; to: string; partial: boolean };
  nav: { prevKey: string; nextKey: string | null; currentKey: string };
  indicators: Indicator[];
  lifeScoreDays: number;
  series: SeriesPoint[];
  previousSeries: SeriesPoint[] | null;
  radar: Array<{ key: string; label: string; value: number | null; previous: number | null }>;
  goals: Array<{ id: string; title: string; status: string; progressPct: number | null; cycle: string | null; lifeArea: string | null; openTasks: number; doneTasks: number }>;
  timeline: Array<{ kind: string; title: string; at: string; detail: string | null }>;
  questions: Array<{ key: string; label: string; hint: string }>;
  steps: string[];
  review: {
    id: string | null;
    steps: string[];
    answers: Record<string, string>;
    reflection: string;
    actions: ReviewAction[];
    plan: ReviewPlan;
    status: "draft" | "sealed";
    sealedAt: string | null;
    planAppliedAt: string | null;
    revision: number;
    updatedAt: string | null;
    legacy: boolean;
  };
  seal: { canSeal: boolean; required: number; filled: number; sealed: boolean; sealedAt: string | null; reason: string | null };
  chest: { xp: number; coins: number; awarded: boolean; awardedAt: string | null; eligible: boolean; sealed: boolean; rule: string };
  seals: Array<{ code: string; name: string; criterion: string; done: boolean; at: string | null; reward: string | null }>;
  revisor: { level: number; title: string; points: number; next: { title: string; min: number } | null; pct: number; counts: Record<ReviewKind, number>; plans: number; streakWeeks: number; rule: string };
  history: Array<{ kind: ReviewKind; key: string; label: string; status: "sealed" | "draft" | "legacy"; sealedAt: string | null; planApplied: boolean; lifeScore: number | null; tasksDone: number | null; at: string }>;
  insights: Array<{ kind: "alta" | "queda" | "meta"; title: string; text: string; indicator: string | null }>;
  missionsPending: Array<{ id: string; title: string; status: string; dueDate: string | null }> | null;
  settings: Record<ReviewKind, number>;
}
export interface ReviewPatch {
  steps?: string[];
  answers?: Record<string, string>;
  reflection?: string;
  actions?: ReviewAction[];
  plan?: Partial<ReviewPlan>;
  baseUpdatedAt?: string | null;
}
export interface ReviewAdvice {
  ai: { used: boolean; status: string; detail: string };
  items: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string }>;
  draft: Record<string, string> | null;
  missionSeeds: Array<{ request: string; why: string }>;
  priorities: string[];
  comparison: Indicator[] | null;
}

export const journeyReviewService = {
  get: (kind: ReviewKind, key?: string | null) => api.get<JourneyReview>(`/journey-reviews/${kind}${key ? `?key=${encodeURIComponent(key)}` : ""}`),
  save: (kind: ReviewKind, key: string, patch: ReviewPatch) => api.put<{ updatedAt: string | null; revision: number; status: string }>(`/journey-reviews/${kind}/${key}`, patch),
  seal: (kind: ReviewKind, key: string) => api.post<{ alreadySealed: boolean; sealedAt: string | null; warCouncil: { weekStart: string; focus: number; priorities: number } | null }>(`/journey-reviews/${kind}/${key}/seal`, {}),
  claim: (kind: ReviewKind, key: string) => api.post<{ granted: boolean; alreadyClaimed: boolean; xp: number; coins: number; reason?: string }>(`/journey-reviews/${kind}/${key}/claim`, {}),
  applyPlan: (kind: ReviewKind, key: string) => api.post<{ applied: boolean; warCouncil: { weekStart: string; focus: number; priorities: number } | null }>(`/journey-reviews/${kind}/${key}/apply-plan`, {}),
  blocks: (kind: ReviewKind, key: string) => api.get<{ enabled: boolean; blocks: Array<{ title: string; date: string; start: string; minutes: number }> }>(`/journey-reviews/${kind}/${key}/blocks`),
  advisor: (kind: ReviewKind, key: string, mode: ReviewAdvisorMode, question?: string | null) => api.post<ReviewAdvice>(`/journey-reviews/${kind}/${key}/advisor`, { mode, question }),
  settings: (input: Partial<Record<ReviewKind, number>>) => api.put<Record<ReviewKind, number>>("/journey-reviews/settings", input),
};

export const KIND_TAB: Record<ReviewKind, string> = { weekly: "Semanal", monthly: "Mensal", quarterly: "Trimestral", annual: "Anual" };
export const KIND_TITLE: Record<ReviewKind, { eyebrow: string; title: string; seal: string }> = {
  weekly: { eyebrow: "Ritual semanal", title: "Revisões da Jornada", seal: "Selar semana" },
  monthly: { eyebrow: "Revisão mensal", title: "Crônica da Evolução", seal: "Selar mês" },
  quarterly: { eyebrow: "Conselho estratégico", title: "Revisão do Trimestre", seal: "Selar trimestre" },
  annual: { eyebrow: "Capítulo do ano", title: "Crônica do Ano", seal: "Selar o ano" },
};
export const STEP_LABEL: Record<string, string> = { retrato: "Retrato da Semana", funcionou: "O Que Funcionou?", nao_funcionou: "O Que Não Funcionou?", melhorar: "O Que Vou Melhorar?", proxima: "Próxima Semana" };
