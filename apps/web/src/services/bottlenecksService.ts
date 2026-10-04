import { api } from "./api";

/** Espelho de /api/bottlenecks — a engine roda no servidor; a UI só apresenta. */
export type CandidateType = "TASK" | "PROJECT" | "CAMPAIGN" | "MILESTONE" | "HABIT" | "CAPACITY" | "HEALTH_SIGNAL";
export type BottleneckLevel = "normal" | "attention" | "high" | "critical";
export type ScoreDim = "dependency" | "urgency" | "inactivity" | "strategic" | "capacity" | "downstream";
export type AnalysisPeriod = "today" | "7d" | "30d";

export interface Candidate {
  key: string;
  type: CandidateType;
  entityId: string | null;
  title: string;
  context: string | null;
  link: string;
  score: number;
  level: BottleneckLevel;
  scores: Record<ScoreDim, number> | null;
  urgency: number;
  description: string;
  kpis: { dependentTasks: number; affectedCampaigns: number; inactiveDays: number | null; deadlinesAtRisk: number };
  flags: { noEstimate: boolean; noDueDate: boolean; circular: boolean };
  dueDate: string | null;
  priority: string | null;
}

export interface Cause { type: string; label: string; description: string; evidence: string; confidence: "low" | "medium" | "high" }
export type GraphNodeType = "TASK" | "PROJECT" | "CAMPAIGN" | "GOAL" | "MILESTONE" | "HABIT";
export interface GraphNode { key: string; type: GraphNodeType; label: string; status: string; depth: number; relation: "center" | "blocked" | "blocker" | "belongs" | "affected"; impact: number | null; link: string }
export interface DependencyGraph { nodes: GraphNode[]; edges: Array<{ from: string; to: string; kind: "depends" | "member" }>; cycles: string[][]; truncated: boolean }
export interface RecommendedAction {
  type: string;
  label: string;
  reason: string;
  estimatedMinutes: number | null;
  targetId: string | null;
  link: string | null;
  confidence: "low" | "medium" | "high";
  preview: { date: string; start: string; end: string; durationSource: "estimate" | "default"; timeSource: "focus_history" | "energy" | "free_window" } | null;
  expected: string | null;
}
export interface ImpactItem { key: "campaigns" | "load" | "deadlines" | "missions" | "projects"; value: number | null; unit: "pp" | "%" | "count"; label: string; note: string }
export interface BottleneckDetail {
  candidate: Candidate;
  causes: Cause[];
  graph: DependencyGraph;
  action: RecommendedAction;
  secondaryActions: RecommendedAction[];
  impact: { targetTitle: string | null; items: ImpactItem[]; basis: string };
  related: Array<{ key: string; type: GraphNodeType; label: string; note: string; link: string }>;
  oracleText: string;
  recent?: Array<{ at: string; label: string }>;
}
export interface BottleneckAnalysis {
  today: string;
  status: "ok" | "clear" | "insufficient";
  missing: string[];
  primary: BottleneckDetail | null;
  ranking: Candidate[];
  potential: Candidate[];
  all: Candidate[];
  details: Record<string, BottleneckDetail>;
  cycles: string[][];
  thresholds: { attention: number; high: number; critical: number };
  checks: { deadlines: boolean; capacity: boolean; blocks: boolean };
  generatedAt: string;
  cached: boolean;
  period: AnalysisPeriod;
  questions: Record<OracleQuestion, string>;
}
export type OracleQuestion = "why" | "first" | "postpone" | "unlock" | "schedule";
export interface OracleAnswer { summary: string; whyItMatters: string; recommendedStrategy: string; risks: string[]; alternatives: string[]; confidenceNote: string }
export interface FocusInput { taskId: string; date: string; start: string; minutes: number }
export interface FocusPreview {
  task: { id: string; title: string };
  date: string;
  start: string;
  end: string;
  minutes: number;
  conflicts: Array<{ title: string; start: string; end: string; kind: "event" | "block" }>;
  capacity: { before: number; after: number | null };
  agenda: Array<{ title: string; start: string; end: string }>;
}

export const bottlenecksService = {
  analyze: (period: AnalysisPeriod, refresh = false) => api.get<BottleneckAnalysis>(`/bottlenecks?period=${period}${refresh ? "&refresh=1" : ""}`),
  detail: (key: string, period: AnalysisPeriod) => api.get<BottleneckDetail>(`/bottlenecks/detail/${encodeURIComponent(key)}?period=${period}`),
  graph: (key: string, period: AnalysisPeriod) => api.get<DependencyGraph>(`/bottlenecks/graph/${encodeURIComponent(key)}?period=${period}`),
  focusPreview: (input: FocusInput) => api.post<FocusPreview>("/bottlenecks/focus/preview", input),
  focusSchedule: (input: FocusInput) => api.post<FocusPreview & { id: string; created: boolean }>("/bottlenecks/focus/schedule", input),
  oracle: (body: { key?: string; question: OracleQuestion; period: AnalysisPeriod }) => api.post<{ question: string; answer: OracleAnswer }>("/bottlenecks/oracle", body),
};
