import type { LimitPeriod, RewardCurrency } from "../config/treasure.js";
import { dayKeyIn } from "./gamificationService.js";

/**
 * Regras puras do Tesouro (sem banco): disponibilidade de uma recompensa
 * e janelas de limite por período no fuso do usuário. Usadas pelo resgate
 * (validação final no servidor) e pela listagem (estado mostrado na UI).
 */

export type AvailabilityCode = "available" | "inactive" | "sold_out" | "cooldown" | "period_limit" | "level" | "xp" | "achievement" | "insufficient";

export interface AvailabilityReward {
  isActive: boolean;
  cost: number;
  currency: RewardCurrency;
  requiredLevel: number | null;
  requiredXp: number | null;
  requiredAchievementId: string | null;
  redemptionLimit: number | null;
  timesRedeemed: number;
  cooldownHours: number;
  lastRedeemedAt: string | null;
  limitPeriod: LimitPeriod;
  redeemedInPeriod: number;
}

export interface AvailabilityWallet {
  coins: number;
  gems: number;
  level: number;
  totalXp: number;
  achievementIds: ReadonlySet<string>;
}

export interface Availability {
  available: boolean;
  code: AvailabilityCode;
  reason: string | null;
  nextAvailableAt: string | null;
  missingCoins: number;
  missingGems: number;
  missingLevel: number;
  missingXp: number;
}

const PERIOD_LABEL: Record<Exclude<LimitPeriod, "none">, string> = { day: "hoje", week: "nesta semana", month: "neste mês" };

/** Ordem das verificações = ordem em que o usuário consegue resolver o bloqueio. */
export function getRewardAvailability(reward: AvailabilityReward, wallet: AvailabilityWallet, now: Date, periodEnd: Date | null): Availability {
  const missingCoins = reward.currency === "coin" ? Math.max(0, reward.cost - wallet.coins) : 0;
  const missingGems = reward.currency === "gem" ? Math.max(0, reward.cost - wallet.gems) : 0;
  const missingLevel = reward.requiredLevel ? Math.max(0, reward.requiredLevel - wallet.level) : 0;
  const missingXp = reward.requiredXp ? Math.max(0, reward.requiredXp - wallet.totalXp) : 0;
  const base = { missingCoins, missingGems, missingLevel, missingXp, nextAvailableAt: null as string | null };
  const blocked = (code: AvailabilityCode, reason: string, nextAvailableAt: string | null = null): Availability => ({ ...base, available: false, code, reason, nextAvailableAt });

  if (!reward.isActive) return blocked("inactive", "Recompensa desativada.");
  if (reward.redemptionLimit != null && reward.timesRedeemed >= reward.redemptionLimit) return blocked("sold_out", "Limite total de resgates atingido.");
  if (missingLevel > 0) return blocked("level", `Requer nível ${reward.requiredLevel}.`);
  if (missingXp > 0) return blocked("xp", `Requer ${reward.requiredXp} XP total.`);
  if (reward.requiredAchievementId && !wallet.achievementIds.has(reward.requiredAchievementId)) return blocked("achievement", "Requer uma conquista ainda não desbloqueada.");
  if (reward.cooldownHours > 0 && reward.lastRedeemedAt) {
    const until = new Date(Date.parse(reward.lastRedeemedAt) + reward.cooldownHours * 3_600_000);
    if (until > now) return blocked("cooldown", "Em recarga.", until.toISOString());
  }
  if (reward.limitPeriod !== "none" && reward.redeemedInPeriod >= 1) {
    return blocked("period_limit", `Já resgatada ${PERIOD_LABEL[reward.limitPeriod]}.`, periodEnd ? periodEnd.toISOString() : null);
  }
  if (missingCoins > 0) return blocked("insufficient", `Faltam ${missingCoins} moedas.`);
  if (missingGems > 0) return blocked("insufficient", `Faltam ${missingGems} gemas.`);
  return { ...base, available: true, code: "available", reason: null };
}

/** Diferença (ms) entre o relógio local do fuso e UTC naquele instante. */
function tzOffsetMs(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at.getTime();
  } catch {
    return 0;
  }
}

/** Instante UTC da meia-noite local de um dia "YYYY-MM-DD" no fuso dado. */
export function zonedMidnight(dayKey: string, timeZone: string): Date {
  const guess = Date.parse(`${dayKey}T00:00:00Z`);
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone));
}

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Janela [início, fim) do período corrente (semana começa na segunda). */
export function periodWindow(period: Exclude<LimitPeriod, "none">, now: Date, timeZone: string): { start: Date; end: Date } {
  const today = dayKeyIn(now, timeZone);
  let startKey = today;
  let endKey = addDaysKey(today, 1);
  if (period === "week") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    startKey = addDaysKey(today, -((dow + 6) % 7));
    endKey = addDaysKey(startKey, 7);
  } else if (period === "month") {
    startKey = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split("-").map(Number);
    endKey = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  return { start: zonedMidnight(startKey, timeZone), end: zonedMidnight(endKey, timeZone) };
}

/** Normaliza nomes para comparar duplicatas ("Café Especial!" ≈ "cafe especial"). */
export function normalizeRewardName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parecida = igual após normalizar, ou uma contém a outra (com pelo menos 5 letras). */
export function isSimilarRewardName(a: string, b: string): boolean {
  const x = normalizeRewardName(a);
  const y = normalizeRewardName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.includes(short);
}

/** "YYYY-MM-DD HH:MM:SS" (UTC do SQLite) para comparar com created_at/redeemed_at. */
export function toSqliteUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
