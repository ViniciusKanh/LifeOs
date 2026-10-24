import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { BANK_PLANS, computeGain, computeNetPayout, getBankPlan } from "../config/bank.js";
import { coinBalance } from "./gamificationService.js";

/**
 * Banco: depósitos de moedas em planos de investimento com prazo, bônus e
 * imposto fixos (config/bank.ts). Mesmo princípio de atomicidade do Tesouro
 * (rewardsService.redeemReward): o INSERT só acontece se, no momento da
 * escrita, o saldo ainda cobrir a quantia — duas requisições simultâneas
 * nunca deixam saldo negativo. O resgate (claim) só libera depois que
 * `matures_at` já passou, credita o LÍQUIDO (já descontado o imposto) no
 * ledger, na mesma transação que marca o depósito como `claimed`.
 */

export interface BankDepositRow {
  id: string;
  planId: string;
  planLabel: string;
  amount: number;
  rateBps: number;
  termDays: number;
  taxBps: number;
  payout: number;
  netPayout: number;
  status: "active" | "claimed";
  createdAt: string;
  maturesAt: string;
  claimedAt: string | null;
}

function mapRow(row: Record<string, unknown>): BankDepositRow {
  const payout = Number(row.payout);
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    planLabel: String(row.plan_label),
    amount: Number(row.amount),
    rateBps: Number(row.rate_bps),
    termDays: Number(row.term_days),
    taxBps: Number(row.tax_bps ?? 0),
    payout,
    // Depósitos de antes da migration 0076 não têm imposto (net_payout = payout).
    netPayout: row.net_payout == null ? payout : Number(row.net_payout),
    status: row.status === "claimed" ? "claimed" : "active",
    createdAt: String(row.created_at),
    maturesAt: String(row.matures_at),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
  };
}

export async function listDeposits(db: Client, ownerId: string): Promise<BankDepositRow[]> {
  const r = await db.execute({
    sql: `SELECT * FROM bank_deposits WHERE owner_id = ? ORDER BY created_at DESC`,
    args: [ownerId],
  });
  return (r.rows as unknown as Array<Record<string, unknown>>).map(mapRow);
}

export interface LedgerEntry {
  id: string;
  amount: number;
  sourceType: string;
  eventType: string;
  label: string | null;
  createdAt: string;
}

/** Extrato (todos os movimentos de moedas do jogador, não só do Banco) — mostra de onde vêm e para onde vão as moedas. */
export async function listLedger(db: Client, ownerId: string, limit: number): Promise<LedgerEntry[]> {
  const r = await db.execute({
    sql: `SELECT id, amount, source_type, event_type, label, created_at
          FROM coin_ledger WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    args: [ownerId, limit],
  });
  return (r.rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    sourceType: String(row.source_type),
    eventType: String(row.event_type),
    label: row.label == null ? null : String(row.label),
    createdAt: String(row.created_at),
  }));
}

export interface BankSummary {
  balance: number;
  plans: typeof BANK_PLANS;
  active: BankDepositRow[];
  claimable: BankDepositRow[];
  history: BankDepositRow[];
  totals: { invested: number; earned: number; taxPaid: number; activeCount: number };
}

export async function getBankSummary(db: Client, ownerId: string): Promise<BankSummary> {
  const [balance, deposits] = await Promise.all([coinBalance(db, ownerId), listDeposits(db, ownerId)]);
  const now = new Date().toISOString();
  const active = deposits.filter((d) => d.status === "active" && d.maturesAt > now);
  const claimable = deposits.filter((d) => d.status === "active" && d.maturesAt <= now);
  const history = deposits.filter((d) => d.status === "claimed");
  const totals = {
    invested: deposits.reduce((sum, d) => sum + d.amount, 0),
    // Ganho líquido real (já descontado o imposto) de tudo que já foi resgatado.
    earned: history.reduce((sum, d) => sum + (d.netPayout - d.amount), 0),
    taxPaid: history.reduce((sum, d) => sum + (d.payout - d.netPayout), 0),
    activeCount: active.length + claimable.length,
  };
  return { balance, plans: BANK_PLANS, active, claimable, history, totals };
}

export type DepositResult =
  | { ok: true; deposit: BankDepositRow; balance: number }
  | { ok: false; code: "not_found" | "invalid_amount" | "limit" | "insufficient"; message: string; balance?: number };

export async function createDeposit(db: Client, ownerId: string, planId: string, amount: number): Promise<DepositResult> {
  const plan = getBankPlan(planId);
  if (!plan) return { ok: false, code: "not_found", message: "Plano de investimento não encontrado." };
  if (!Number.isInteger(amount) || amount < plan.minAmount || amount > plan.maxAmount) {
    return { ok: false, code: "invalid_amount", message: `Este plano aceita de ${plan.minAmount} a ${plan.maxAmount} moedas.` };
  }

  const activeCount = await db.execute({
    sql: `SELECT COUNT(*) AS total FROM bank_deposits WHERE owner_id = ? AND plan_id = ? AND status = 'active'`,
    args: [ownerId, planId],
  });
  if (Number(activeCount.rows[0]?.total ?? 0) >= plan.maxActive) {
    return { ok: false, code: "limit", message: `Você já tem o máximo de ${plan.maxActive} investimento(s) ativo(s) neste plano.` };
  }

  const depositId = nanoid();
  // payout bruto (principal + bônus) e líquido (já com o imposto sobre o ganho descontado) ficam
  // ambos congelados agora — mudar o plano depois nunca afeta este depósito.
  const grossPayout = amount + computeGain(amount, plan.rateBps);
  const netPayout = computeNetPayout(amount, plan.rateBps, plan.taxBps);
  const maturesAt = new Date(Date.now() + plan.termDays * 86_400_000).toISOString();

  const results = await db.batch(
    [
      {
        sql: `INSERT INTO bank_deposits (id, owner_id, plan_id, plan_label, amount, rate_bps, term_days, tax_bps, payout, net_payout, matures_at)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE owner_id = ?) >= ?`,
        args: [depositId, ownerId, plan.id, plan.label, amount, plan.rateBps, plan.termDays, plan.taxBps, grossPayout, netPayout, maturesAt, ownerId, amount],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_deposit', ?, 'deposit', ?
              WHERE EXISTS (SELECT 1 FROM bank_deposits WHERE id = ?)`,
        args: [nanoid(), ownerId, -amount, depositId, `Investido: ${plan.label}`, depositId],
      },
    ],
    "write",
  );

  if (results[0].rowsAffected === 0) {
    const balance = await coinBalance(db, ownerId);
    return { ok: false, code: "insufficient", message: "Moedas insuficientes para este investimento.", balance };
  }

  const balance = await coinBalance(db, ownerId);
  const row = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ?", args: [depositId] });
  return { ok: true, deposit: mapRow(row.rows[0] as unknown as Record<string, unknown>), balance };
}

export type ClaimResult =
  | { ok: true; deposit: BankDepositRow; payout: number; balance: number }
  | { ok: false; code: "not_found" | "not_matured" | "already_claimed"; message: string };

export async function claimDeposit(db: Client, ownerId: string, depositId: string): Promise<ClaimResult> {
  const existing = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ? AND owner_id = ?", args: [depositId, ownerId] });
  const row = existing.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return { ok: false, code: "not_found", message: "Investimento não encontrado." };
  const current = mapRow(row);
  if (current.status === "claimed") return { ok: false, code: "already_claimed", message: "Este investimento já foi resgatado." };
  if (current.maturesAt > new Date().toISOString()) {
    return { ok: false, code: "not_matured", message: "Este investimento ainda não venceu." };
  }

  const results = await db.batch(
    [
      {
        sql: `UPDATE bank_deposits SET status = 'claimed', claimed_at = datetime('now')
              WHERE id = ? AND owner_id = ? AND status = 'active' AND matures_at <= datetime('now')`,
        args: [depositId, ownerId],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_deposit', ?, 'payout', ?
              WHERE EXISTS (SELECT 1 FROM bank_deposits WHERE id = ? AND status = 'claimed')
              ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
        args: [nanoid(), ownerId, current.netPayout, depositId, `Resgate: ${current.planLabel}${current.taxBps > 0 ? ` (imposto ${(current.taxBps / 100).toLocaleString("pt-BR")}%)` : ""}`, depositId],
      },
    ],
    "write",
  );

  if (results[0].rowsAffected === 0) {
    // Outra requisição venceu a corrida (clique duplo) — devolve o estado atual.
    return { ok: false, code: "already_claimed", message: "Este investimento já foi resgatado." };
  }

  const balance = await coinBalance(db, ownerId);
  const updated = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ?", args: [depositId] });
  return { ok: true, deposit: mapRow(updated.rows[0] as unknown as Record<string, unknown>), payout: current.netPayout, balance };
}
