import { api } from "./api";

/** Espelho de /api/skill-tree (Árvore de Habilidades). Custos, requisitos e saldo vêm sempre do servidor. */

export type SkillBranch = "produtividade" | "saude" | "aprendizado" | "foco" | "gestao" | "bemestar" | "avancada";
export type SkillState = "bloqueada" | "disponivel" | "indisponivel" | "desbloqueada" | "em_evolucao" | "maximizada";
export interface SkillCheck {
  kind: "points" | "hero" | "evidence" | "prereq" | "order" | "max";
  label: string;
  current: number | null;
  target: number | null;
  met: boolean;
  module?: string;
  route?: string;
  options?: Array<{ skill: string; name: string; level: number; current: number; met: boolean }>;
}
export interface SkillEffectRef { key: string; type: string; label: string; description: string }
export interface SkillLevel {
  level: number;
  cost: number;
  heroLevel: number;
  evidence: { metric: string; min: number; label: string; current: number; module: string; route: string } | null;
  effects: SkillEffectRef[];
}
export interface SkillNode {
  key: string;
  name: string;
  description: string;
  branch: SkillBranch;
  tier: number;
  icon: string;
  rarity: string;
  maxLevel: number;
  level: number;
  state: SkillState;
  pos: { x: number; y: number };
  requires: Array<Array<{ skill: string; level: number }>>;
  levels: SkillLevel[];
  next: { ok: boolean; cost: number; checks: SkillCheck[] } | null;
}
export interface Target { key: string; level: number }
export interface SkillPreset { id: string; name: string; description: string; icon: string; builtin: boolean; targets: Target[]; updatedAt: string | null }
export interface SkillTreeView {
  version: number;
  hero: { level: number; totalXp: number; xpIntoLevel: number; xpForNextLevel: number; progressPct: number };
  points: { total: number; spent: number; refunded: number; available: number; invested: number; rule: string };
  epoch: number;
  settings: { cooldownDays: number; refundPct: number };
  skills: SkillNode[];
  branches: Array<{ key: SkillBranch; label: string; tone: string; theme: string; skills: number; unlocked: number; levels: number; max: number; pct: number; avgLevel: number }>;
  stats: { total: number; unlocked: number; maxed: number; available: number; levels: number; maxLevels: number };
  title: { title: string; next: { title: string; min: number } | null; pct: number; rule: string };
  effects: Array<SkillEffectRef & { skill: string; skillName: string; level: number }>;
  history: Array<{ id: string; kind: "upgrade" | "reset"; epoch: number; skill: string | null; name: string | null; from: number | null; to: number | null; points: number; origin: string; at: string }>;
  grants: Array<{ key: string; amount: number; source: string; label: string; at: string }>;
  presets: SkillPreset[];
  desired: Target[];
  desiredPlan: { totalCost: number; readyCost: number; blocked: number; steps: number; done: number; targets: number } | null;
  nearest: Array<{ key: string; name: string; level: number; missing: string[]; progress: number }>;
}
export interface PlanStep { key: string; name: string; level: number; cost: number; ok: boolean; reasons: string[]; checks?: SkillCheck[] }
export interface Simulation {
  targets: Target[];
  available: number;
  steps: PlanStep[];
  executable: Target[];
  totalCost: number;
  readyCost: number;
  missingPoints: number;
  blocked: number;
  pending: string[];
  current: Array<{ branch: SkillBranch; levels: number; max: number; pct: number }>;
  branchDistribution: Array<{ branch: SkillBranch; levels: number; max: number; pct: number }>;
}
export interface MissionTemplateFx { key: string; label: string; skill: string; title: string; description: string; priority: "Baixa" | "Média" | "Alta"; difficulty: "facil" | "medio" | "dificil" | "epico"; estimateMinutes: number; steps: string[] }
export interface SkillEffects {
  focusPresets: Array<{ key: string; label: string; skill: string; mode: "pomodoro" | "block" | "free"; minutes: number; hint: string }>;
  missionTemplates: MissionTemplateFx[];
  habitTemplates: Array<{ key: string; label: string; skill: string; name: string; category: string; frequency: "daily" }>;
  goalTemplates: Array<{ key: string; label: string; skill: string; title: string; description: string }>;
  projectTemplates: Array<{ key: string; label: string; skill: string; name: string; description: string; tasks: string[] }>;
  diaryPrompts: Array<{ key: string; label: string; skill: string; prompts: string[] }>;
  grimoireSessions: Array<{ key: string; label: string; skill: string; minutes: number; hint: string }>;
  agendaBlocks: Array<{ key: string; label: string; skill: string; minutes: number; count: number; category: string }>;
  analyses: Array<{ key: string; label: string; skill: string; panel: string }>;
  titles: Array<{ key: string; label: string; skill: string; titleId: string; name: string }>;
  count: number;
}
export interface AnalysisResult {
  kind: "bars" | "pairs" | "triples" | "table";
  title: string;
  unit: string;
  max?: number;
  items?: Array<{ label: string; value: number | null; value2?: number | null; value3?: number | null; detail?: string }>;
  columns?: string[];
  rows?: Array<{ label: string; values: number[] }>;
  legend?: string[];
  list?: Array<{ label: string; detail: string }>;
  sample: number | null;
  note?: string;
}
export interface OracleResult {
  available: number;
  heroLevel: number;
  summary: string;
  ai: { used: boolean; status: string; detail: string };
  recommendations: Array<{ key: string; name: string; branch: SkillBranch; level: number; state: SkillState; why: string[] }>;
  plan: { targets: Target[]; steps: PlanStep[]; executable: Target[]; totalCost: number; readyCost: number } | null;
  missionSeeds: Array<{ request: string; why: string; skill: string }>;
  idlePoints: string | null;
  preset: { name: string; targets: Target[] } | null;
}
export interface ResetPreview { epoch: number; skills: Array<{ key: string; name: string; level: number }>; effects: Array<{ key: string; label: string }>; spent: number; refund: number; refundPct: number; cooldownDays: number; blockedUntil: string | null; keeps: string }

export const skillTreeService = {
  get: () => api.get<SkillTreeView>("/skill-tree"),
  effects: () => api.get<SkillEffects>("/skill-tree/effects"),
  upgrade: (key: string, expectedLevel: number) => api.post<{ applied: Array<{ key: string; name: string; level: number; cost: number }>; spent: number; available: number }>("/skill-tree/upgrade", { key, expectedLevel }),
  simulate: (targets: Target[]) => api.post<Simulation>("/skill-tree/simulate", { targets }),
  apply: (targets: Target[], confirmed: Target[], origin: "build" | "preset" | "oracle") =>
    api.post<{ applied: Array<{ key: string; name: string; level: number; cost: number }>; spent: number; available: number; skipped: Array<{ key: string; name: string; level: number; reasons: string[] }> }>("/skill-tree/apply", { targets, confirmed, origin }),
  resetPreview: () => api.get<ResetPreview>("/skill-tree/reset"),
  reset: (expectedEpoch: number) => api.post<{ refunded: number; skills: number; epoch: number }>("/skill-tree/reset", { confirm: true, expectedEpoch }),
  settings: (input: { cooldownDays?: number; refundPct?: 50 | 75 | 100 }) => api.put<{ cooldownDays: number; refundPct: number }>("/skill-tree/settings", input),
  createPreset: (input: { name: string; description?: string | null; targets: Target[] }) => api.post<{ id: string }>("/skill-tree/presets", input),
  updatePreset: (id: string, input: { name: string; description?: string | null; targets: Target[] }) => api.put<{ id: string }>(`/skill-tree/presets/${id}`, input),
  duplicatePreset: (id: string) => api.post<{ id: string }>(`/skill-tree/presets/${id}/duplicate`),
  deletePreset: (id: string) => api.delete<{ deleted: boolean }>(`/skill-tree/presets/${id}`),
  desired: (targets: Target[]) => api.put<{ targets: Target[] }>("/skill-tree/desired", { targets }),
  analysis: (panel: string) => api.get<AnalysisResult>(`/skill-tree/analysis/${panel}`),
  agendaPreview: (effectKey: string) => api.post<{ effect: string; label: string; blocks: Array<{ title: string; date: string; start: string; minutes: number; category: string }>; note: string | null }>("/skill-tree/agenda-preview", { effectKey }),
  oracle: (message: string) => api.post<OracleResult>("/skill-tree/oracle", { message }),
};

export const BRANCH_TONE: Record<SkillBranch, string> = { produtividade: "blue", saude: "pink", aprendizado: "purple", foco: "red", gestao: "green", bemestar: "cyan", avancada: "gold" };
export const STATE_LABEL: Record<SkillState, string> = {
  bloqueada: "Bloqueada",
  disponivel: "Disponível",
  indisponivel: "Indisponível por requisito",
  desbloqueada: "Desbloqueada",
  em_evolucao: "Pronta para evoluir",
  maximizada: "Maximizada",
};
