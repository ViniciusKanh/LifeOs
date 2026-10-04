import type { Client } from "@libsql/client";
import { EFFECT_RULES, type TimedEffect } from "../config/items.js";

/**
 * Efeitos temporários de itens. Só mexem em XP concedido pelo motor de
 * gamificação (com limite e duração) — nunca em dados reais. A aplicação
 * fica registrada no ledger de XP (base_xp + multiplier) para auditoria.
 */

/** "YYYY-MM-DD HH:MM:SS" em UTC (mesmo formato de datetime('now')). */
export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
export const sqlToIso = (v: unknown) => (typeof v === "string" && v ? (v.includes("T") ? v : `${v.replace(" ", "T")}Z`) : null);

export function applyPct(xp: number, pct: number): number {
  // Inteiros para não perder XP por arredondamento de ponto flutuante.
  return Math.floor((xp * (100 + pct)) / 100);
}

export interface ActiveEffectView {
  id: string;
  itemKey: string;
  effectType: TimedEffect;
  value: number;
  label: string;
  startedAt: string;
  expiresAt: string;
}

/** Marca como expirados os vencidos e devolve os ativos. */
export async function listActiveEffects(db: Client, ownerId: string, now = new Date()): Promise<ActiveEffectView[]> {
  await db.execute({
    sql: "UPDATE active_item_effects SET status = 'expired' WHERE owner_id = ? AND status = 'active' AND expires_at <= ?",
    args: [ownerId, sqlTime(now)],
  });
  const r = await db.execute({
    sql: "SELECT id, item_key, effect_type, value, started_at, expires_at FROM active_item_effects WHERE owner_id = ? AND status = 'active' ORDER BY expires_at ASC",
    args: [ownerId],
  });
  return r.rows
    .filter((x) => String(x.effect_type) in EFFECT_RULES)
    .map((x) => ({
      id: String(x.id),
      itemKey: String(x.item_key),
      effectType: String(x.effect_type) as TimedEffect,
      value: Number(x.value),
      label: EFFECT_RULES[String(x.effect_type) as TimedEffect].label,
      startedAt: sqlToIso(x.started_at)!,
      expiresAt: sqlToIso(x.expires_at)!,
    }));
}

/** Bônus de foco vigente no instante da sessão (não é consumido: vale pela duração). */
export async function focusBoostAt(db: Client, ownerId: string, at: Date): Promise<{ id: string; pct: number } | null> {
  const t = sqlTime(at);
  const r = await db.execute({
    sql: `SELECT id, value FROM active_item_effects WHERE owner_id = ? AND effect_type = 'XP_MULTIPLIER_FOCUS'
          AND status = 'active' AND started_at <= ? AND expires_at > ? ORDER BY value DESC LIMIT 1`,
    args: [ownerId, t, t],
  });
  const row = r.rows[0];
  return row ? { id: String(row.id), pct: Number(row.value) } : null;
}

/**
 * Reserva o bônus da próxima missão de forma atômica (UPDATE condicional):
 * duas conclusões simultâneas nunca usam o mesmo pergaminho.
 */
export async function claimTaskBoost(db: Client, ownerId: string, sourceId: string): Promise<{ id: string; pct: number } | null> {
  const now = sqlTime(new Date());
  const r = await db.execute({
    sql: `SELECT id, value FROM active_item_effects WHERE owner_id = ? AND effect_type = 'XP_MULTIPLIER_TASK'
          AND status = 'active' AND expires_at > ? ORDER BY expires_at ASC LIMIT 1`,
    args: [ownerId, now],
  });
  const row = r.rows[0];
  if (!row) return null;
  const upd = await db.execute({
    sql: "UPDATE active_item_effects SET status = 'consumed', consumed_source = ? WHERE id = ? AND owner_id = ? AND status = 'active'",
    args: [sourceId, String(row.id), ownerId],
  });
  return upd.rowsAffected === 1 ? { id: String(row.id), pct: Number(row.value) } : null;
}

/** Devolve o bônus quando a concessão não aconteceu (ex.: tarefa reaberta já premiada). */
export async function releaseTaskBoost(db: Client, ownerId: string, id: string): Promise<void> {
  await db.execute({
    sql: "UPDATE active_item_effects SET status = 'active', consumed_source = NULL WHERE id = ? AND owner_id = ? AND status = 'consumed'",
    args: [id, ownerId],
  });
}
