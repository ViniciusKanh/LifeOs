import { api } from "./api";
import type { AttributeKey } from "./codexService";

/** Espelho de /api/build — leitura do XP real por atributo (motor do Códex). */
export type Scores = Record<AttributeKey, number>;

export type PlanItem =
  | { kind: "habit"; name: string; category: string; frequency: string; targetCount: number }
  | { kind: "task"; title: string; priority: string; dueInDays: number }
  | { kind: "open"; path: string };
export interface PlanAction {
  id: string;
  label: string;
  item: PlanItem;
}

export interface BuildOverview {
  today: string;
  windowDays: number;
  sufficiency: { enough: boolean; windowXp: number; minWindowXp: number; totalXp: number; missing: Array<{ key: AttributeKey; label: string; sources: string }> };
  attributes: Array<{ key: AttributeKey; label: string; description: string; score: number; xp: number; referenceXp: number }>;
  archetype: {
    id: string;
    name: string;
    avatar: string;
    description: string;
    tags: string[];
    affinity: number;
    secondary: { id: string; name: string; affinity: number } | null;
    ranking: Array<{ id: string; name: string; affinity: number }>;
  } | null;
  desired: { presetId: string | null; name: string; targets: Scores; isDefault: boolean };
  presets: Array<{ id: string; name: string; targets: Scores }>;
  gaps: Array<{ key: AttributeKey; label: string; current: number; target: number; gap: number; status: "above" | "near" | "below" }>;
  insights: Array<{ tone: "up" | "down" | "neutral"; text: string }>;
  recommendations: Array<{ key: AttributeKey; label: string; gap: number; text: string; actions: PlanAction[] }>;
  plan: Array<{ title: string; kind: "improve" | "maintain"; bullets: string[]; actions: PlanAction[] }>;
  comparisons: { now: Scores; d30: Scores; d90: Scores };
}

export type EvolutionPeriod = "30d" | "90d" | "180d" | "365d";
export interface BuildEvolution {
  period: EvolutionPeriod;
  points: Array<{ day: string; scores: Scores; archetype: string | null }>;
  gains: Array<{ key: AttributeKey; label: string; from: number; to: number; delta: number }>;
  drops: Array<{ key: AttributeKey; label: string; from: number; to: number; delta: number }>;
  stagnant: Array<{ key: AttributeKey; label: string; from: number; to: number; delta: number }>;
  archetypeChanges: Array<{ day: string; from: string | null; to: string | null }>;
}

export const buildService = {
  overview: () => api.get<BuildOverview>("/build"),
  evolution: (period: EvolutionPeriod) => api.get<BuildEvolution>(`/build/evolution?period=${period}`),
  saveDesired: (input: { presetId?: string | null; name: string; targets: Partial<Scores> }) => api.put<BuildOverview["desired"] & { warning: string | null }>("/build/desired", input),
  resetDesired: () => api.delete<BuildOverview["desired"]>("/build/desired"),
  applyPlan: (itemIds: string[]) => api.post<{ created: Array<{ id: string; label: string; kind: string }>; skipped: Array<{ id: string; reason: string }> }>("/build/plan/apply", { itemIds }),
};
