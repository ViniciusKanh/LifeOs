import { api } from "./api";

/** Espelho de /api/codex (Códex da Jornada). Tudo derivado de dados reais do usuário. */
export type AttributeKey = "focus" | "health" | "knowledge" | "discipline" | "creativity" | "wellbeing";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface CodexAttribute {
  key: AttributeKey;
  label: string;
  description: string;
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressPct: number;
  last30: number;
  prev30: number;
  trendPct: number | null;
  topSources: Array<{ source: string; label: string; xp: number }>;
}

export interface CodexDiscovery {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  source: string;
  sourceId: string | null;
  evidence: Record<string, unknown> & { sample?: number; from?: string; to?: string; metric?: string };
  confidence: "low" | "medium" | "high";
  discoveredAt: string;
  seen: boolean;
}

export interface CodexRelic { id: string; name: string; description: string; rarity: Rarity; obtainedBy: string; unlocked: boolean; unlockedAt: string | null; seen: boolean; progress: number }
export interface CodexTitle { id: string; name: string; description: string; rarity: Rarity; unlocked: boolean; unlockedAt: string | null; seen: boolean; equipped: boolean; progress: number }
export interface CodexKnowledge {
  id: string;
  title: string;
  category: string;
  attribute: AttributeKey;
  summary: string;
  unlock: { type: "attribute_xp"; min: number } | { type: "coins"; cost: number };
  unlocked: boolean;
  unlockedAt: string | null;
  seen: boolean;
  progress: number;
  content: string[] | null;
}
export interface CodexClass { id: string; name: string; description: string; attributes: [AttributeKey, AttributeKey]; score: number }

export interface Codex {
  global: { level: number; totalXp: number; xpIntoLevel: number; xpForNextLevel: number; progressPct: number; coins: number };
  attributes: CodexAttribute[];
  synergy: { synergy: number; mean: number; balance: number; scores: number[] };
  suggestedClass: (CodexClass & { basedOn: AttributeKey[] }) | null;
  classes: CodexClass[];
  discoveries: CodexDiscovery[];
  relics: CodexRelic[];
  titles: CodexTitle[];
  knowledge: CodexKnowledge[];
  areaAttribute: Record<string, AttributeKey>;
  completion: { unlocked: number; total: number; pct: number };
  hasData: boolean;
}

export interface AttributeDetail extends CodexAttribute {
  series: Array<{ date: string; xp: number }>;
  recent: Array<{ label: string | null; xp: number; dayKey: string }>;
  relatedRelics: string[];
  relatedTitles: string[];
  relatedKnowledge: string[];
  classes: string[];
}

export interface CodexMilestone { kind: string; title: string; detail: string | null; at: string; link: string | null }

export const codexService = {
  get: () => api.get<Codex>("/codex"),
  attribute: (key: AttributeKey) => api.get<AttributeDetail>(`/codex/attributes/${key}`),
  titles: () => api.get<Array<{ id: string; name: string; rarity: Rarity; description: string; unlocked: boolean }>>("/codex/titles"),
  milestones: () => api.get<CodexMilestone[]>("/codex/milestones"),
  seen: (kind: "relic" | "title" | "knowledge" | "discovery", ids: string[]) => api.post<void>("/codex/seen", { kind, ids }),
  buyKnowledge: (id: string) => api.post<{ ok: true; already: boolean }>(`/codex/knowledge/${id}/unlock`),
};
