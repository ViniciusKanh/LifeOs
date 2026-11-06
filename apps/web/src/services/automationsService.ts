import { api } from "./api";

/** Espelho de /api/automations — automações por módulo (estado por usuário). */
export type AutomationModule = "grimoire" | "goals" | "bank" | "education" | "health" | "agenda" | "missions" | "quests" | "diary" | "lab" | "hero" | "journey" | "habits" | "library" | "admin" | "today" | "contracts" | "tavern" | "forge" | "reviews";
export type AutomationRunStatus = "ok" | "skipped" | "error";

export interface Automation {
  module: AutomationModule;
  key: string;
  label: string;
  description: string;
  trigger: "daily" | "weekly" | "event" | "manual";
  triggerLabel: string;
  usesAi: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastStatus: AutomationRunStatus | null;
  lastMessage: string | null;
  nextRunAt: string | null;
}

export interface AutomationRun {
  trigger: string;
  status: AutomationRunStatus;
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export const automationsService = {
  list: (module: AutomationModule) => api.get<Automation[]>(`/automations/${module}`),
  update: (module: AutomationModule, key: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) =>
    api.patch<Automation>(`/automations/${module}/${key}`, patch),
  run: (module: AutomationModule, key: string) => api.post<{ status: AutomationRunStatus; summary: string }>(`/automations/${module}/${key}/run`),
  runs: (module: AutomationModule, key: string) => api.get<AutomationRun[]>(`/automations/${module}/${key}/runs`),
};
