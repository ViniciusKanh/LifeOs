import { api } from "./api";

/**
 * Espelho de /api/guild — Guilda (parceiro de compromisso). O resumo que o
 * parceiro vê é montado no servidor; a UI nunca recebe dados privados do dono.
 */

export type GuildEntityType = "contract" | "goal";
export type GuildShareStatus = "pending" | "accepted" | "declined" | "revoked";
export type GuildCheerKind = "testemunho" | "incentivo";

export interface GuildCheer {
  id: string;
  kind: GuildCheerKind;
  text: string | null;
  dayKey: string;
  createdAt: string;
}

export interface GuildSummary {
  entityType: GuildEntityType;
  title: string;
  difficulty: string | null;
  progressPct: number;
  obligations: { done: number; total: number } | null;
  dueDate: string | null;
  status: string;
  streakDays: number;
  lastAdvanceDay: string | null;
}

export interface GuildOwnerShare {
  id: string;
  entityType: GuildEntityType;
  entityId: string;
  entityTitle: string | null;
  inviteeEmail: string;
  partnerName: string | null;
  status: GuildShareStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  cheers: GuildCheer[];
  testimonyCount: number;
}

export interface GuildInvite {
  id: string;
  entityType: GuildEntityType;
  entityTitle: string;
  ownerName: string;
  message: string | null;
  createdAt: string;
}

export interface GuildSharedWithMe {
  id: string;
  ownerName: string;
  acceptedAt: string | null;
  summary: GuildSummary | null;
  today: { testimonyGiven: boolean; incentivesLeft: number };
  myCheers: GuildCheer[];
}

export interface GuildLimits {
  invitesPerDay: number;
  partnersPerItem: number;
  incentivesPerDayPerShare: number;
  cheerTextMax: number;
  messageMax: number;
}

export interface GuildOverview {
  emailVerified: boolean;
  invites: GuildInvite[];
  sharedWithMe: GuildSharedWithMe[];
  myShares: GuildOwnerShare[];
  limits: GuildLimits;
}

export interface GuildInviteInput {
  entityType: GuildEntityType;
  entityId: string;
  email: string;
  message?: string | null;
}

export const guildService = {
  overview: () => api.get<GuildOverview>("/guild/overview"),
  pendingCount: () => api.get<{ count: number }>("/guild/pending-count"),
  sharesFor: (entityType: GuildEntityType, entityId: string) =>
    api.get<{ shares: GuildOwnerShare[] }>(`/guild/shares?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`),
  invite: (input: GuildInviteInput) => api.post<{ share: GuildOwnerShare; emailSent: boolean }>("/guild/shares", input),
  revoke: (shareId: string) => api.delete<void>(`/guild/shares/${encodeURIComponent(shareId)}`),
  respond: (shareId: string, accept: boolean) => api.post<{ ok: true }>(`/guild/invites/${encodeURIComponent(shareId)}/respond`, { accept }),
  leave: (shareId: string) => api.post<{ ok: true }>(`/guild/shared/${encodeURIComponent(shareId)}/leave`),
  cheer: (shareId: string, kind: GuildCheerKind, text?: string | null) =>
    api.post<{ id: string; kind: GuildCheerKind; text: string | null; dayKey: string }>(`/guild/shared/${encodeURIComponent(shareId)}/cheers`, { kind, text: text || null }),
};

/** Validação de e-mail no front (o backend valida de novo com zod). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export const GUILD_ENTITY_LABEL: Record<GuildEntityType, string> = { contract: "Contrato", goal: "Meta" };
