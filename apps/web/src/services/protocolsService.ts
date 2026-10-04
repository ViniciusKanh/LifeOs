import { api } from "./api";

/** Espelho de /api/protocols. Executar sempre passa por preview + confirmação. */
export type ActionType =
  | "OPEN_SCREEN"
  | "CREATE_TASK"
  | "CREATE_HABIT"
  | "ADJUST_CAPACITY"
  | "SET_DAILY_PRIORITY"
  | "ACTIVATE_RECOVERY"
  | "ADD_REMINDER"
  | "START_FOCUS"
  | "SHOW_INSTRUCTION"
  | "CHECKLIST"
  | "DEFER_TASK"
  | "CUSTOM";
export type ActionMode = "auto" | "suggested" | "manual";
export type TriggerMetric = "sleep_hours" | "energy" | "overdue_tasks" | "capacity_pct" | "tasks_due_today" | "events_tomorrow";
export type Trigger =
  | { type: "manual" }
  | { type: "data"; metric: TriggerMetric; op: "lt" | "lte" | "gt" | "gte"; value: number }
  | { type: "time"; weekday: number }
  | { type: "event"; metric: "events_tomorrow"; min: number };
export interface ProtocolSettings {
  suggestAuto: boolean;
  showToday: boolean;
  showOracle: boolean;
}

export interface ProtocolStep {
  ref: string;
  position: number;
  title: string;
  description: string | null;
  actionType: ActionType;
  mode: ActionMode;
  config: Record<string, unknown>;
  optional: boolean;
  minutes: number;
}

export interface Protocol {
  ref: string;
  kind: "template" | "mine";
  sourceTemplate: string | null;
  name: string;
  description: string;
  category: string;
  triggerDescription: string;
  trigger: Trigger;
  art: string;
  settings: ProtocolSettings;
  steps: ProtocolStep[];
  totalMinutes: number;
  favorite: boolean;
  uses: number;
  completedRuns: number;
  lastRunAt: string | null;
  triggered: boolean;
  triggerReason: string | null;
  relevance: number;
  createdAt: string | null;
}

export interface ProtocolsData {
  protocols: Protocol[];
  featured: string | null;
  context: Partial<Record<TriggerMetric, number>> & { today: string; weekday: number };
  catalog: {
    categories: Array<{ id: string; label: string }>;
    metrics: Array<{ id: TriggerMetric; label: string; unit: string }>;
    actions: Array<{ id: ActionType; label: string; mode: ActionMode }>;
    screens: string[];
  };
}

export interface StepPreview {
  ref: string;
  title: string;
  description: string | null;
  actionType: ActionType;
  actionLabel: string;
  mode: ActionMode;
  optional: boolean;
  minutes: number;
  defaultSelected: boolean;
  summary: string | null;
  details: Record<string, unknown>;
  noop: boolean;
}

export interface ProtocolRun {
  id: string;
  protocolRef: string;
  protocolName: string;
  status: "started" | "partial" | "completed" | "canceled";
  startedAt: string;
  completedAt: string | null;
  steps: Array<{ ref: string; position: number; title: string; actionType: ActionType; mode: string; status: "pending" | "skipped" | "completed" | "failed"; result: Record<string, unknown>; completedAt: string | null }>;
  replayed?: boolean;
  navigate?: string | null;
}

export interface ProtocolInput {
  name: string;
  description?: string;
  category: string;
  triggerDescription?: string;
  trigger: Trigger;
  art: string;
  settings?: Partial<ProtocolSettings>;
  steps: Array<{ title: string; description?: string | null; actionType: ActionType; config: Record<string, unknown>; optional?: boolean; minutes?: number }>;
}

export const protocolsService = {
  list: () => api.get<ProtocolsData>("/protocols"),
  suggestions: () => api.get<{ suggestions: Array<{ ref: string; name: string; art: string; category: string; reason: string | null }>; daily: { taskId: string | null; title: string | null; recovery: boolean } }>("/protocols/suggestions"),
  runs: () => api.get<ProtocolRun[]>("/protocols/runs"),
  create: (input: ProtocolInput) => api.post<Protocol>("/protocols", input),
  update: (ref: string, input: ProtocolInput) => api.put<Protocol>(`/protocols/${ref}`, input),
  remove: (ref: string) => api.delete<void>(`/protocols/${ref}`),
  clone: (key: string) => api.post<Protocol>(`/protocols/templates/${key}/clone`),
  favorite: (ref: string, favorite: boolean) => api.post<{ ok: true }>(`/protocols/${ref}/favorite`, { favorite }),
  preview: (ref: string) => api.post<{ protocol: Protocol; steps: StepPreview[] }>(`/protocols/${ref}/preview`),
  execute: (ref: string, body: { requestId: string; steps: Array<{ ref: string; selected: boolean; taskId?: string | null }> }) => api.post<ProtocolRun>(`/protocols/${ref}/execute`, body),
  updateRunStep: (runId: string, stepRef: string, status: "completed" | "skipped") => api.patch<ProtocolRun>(`/protocols/runs/${runId}/steps`, { stepRef, status }),
  cancelRun: (runId: string) => api.post<ProtocolRun>(`/protocols/runs/${runId}/cancel`),
};
