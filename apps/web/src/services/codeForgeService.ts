import { api } from "./api";

/** Forja do Código (/api/code-forge) — tipos espelham codeForgeService.ts da API. */
export type CodeKind = "commit" | "pr_opened" | "pr_merged" | "issue_closed" | "release";
export type CodeRules = Record<CodeKind, boolean>;

export interface ForgeOverview {
  connected: boolean;
  integration: {
    username: string;
    mode: "public" | "token";
    rules: CodeRules;
    lastSyncAt: string | null;
    lastSyncStatus: "ok" | "partial" | "error" | "rate_limited" | null;
    lastSyncError: string | null;
    coverageFrom: string | null;
  } | null;
  xp: { total: number; week: number; level: number; currentLevelXp: number; nextLevelXp: number };
  counts: Record<CodeKind, number> & { openPrs: number | null };
  streak: number;
  unlocks: Array<{ level: number; key: string; title: string; description: string; unlocked: boolean }>;
  rules: Record<CodeKind, { xp: number; dailyCap: number; label: string }>;
  heatmap: { source: "github_calendar" | "imported_activity"; coveredFrom: string | null; range: "90d" | "6m" | "12m"; days: Array<{ day: string; count: number | null }> };
  repos: Array<{ id: number; fullName: string; description: string | null; language: string | null; url: string; private: boolean; pushedAt: string | null; monitored: boolean; favorite: boolean; commits: number; prs: number; issues: number; xp: number; lastActivity: string | null }>;
  recent: Array<{ kind: CodeKind; repo: string; title: string | null; url: string | null; at: string; xp: number }>;
}

export const codeForgeService = {
  overview: (range: "90d" | "6m" | "12m") => api.get<ForgeOverview>(`/code-forge?range=${range}`),
  connect: (body: { username?: string; token?: string | null }) => api.post<{ username: string; mode: string; sync: { ok: boolean; inserted?: number; xp?: number; error?: string } }>("/code-forge/connect", body),
  sync: () => api.post<{ ok: true; inserted: number; xp: number }>("/code-forge/sync"),
  disconnect: () => api.delete<void>("/code-forge/connect"),
  rules: (r: Partial<CodeRules>) => api.put<CodeRules>("/code-forge/rules", r),
  repo: (id: number, p: { monitored?: boolean; favorite?: boolean }) => api.patch<void>(`/code-forge/repos/${id}`, p),
};
