import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  BANK_PLANS,
  LOAN_LATE_FEE_BPS,
  LOAN_SCORE_MAX,
  LOAN_SCORE_MIN,
  LOAN_TERM_DAYS,
  computeGain,
  computeLateFee,
  computeLoanTotalDue,
  computeNetPayout,
  getBankPlan,
  loanTierForScore,
} from "../config/bank.js";
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

export interface BankLoanRow {
  id: string;
  amount: number;
  rateBps: number;
  termDays: number;
  totalDue: number;
  lateFeeBps: number;
  status: "active" | "repaid";
  createdAt: string;
  dueAt: string;
  repaidAt: string | null;
  repaidAmount: number | null;
  overdue: boolean;
}

function mapLoanRow(row: Record<string, unknown>): BankLoanRow {
  const dueAt = String(row.due_at);
  const status = row.status === "repaid" ? "repaid" : "active";
  return {
    id: String(row.id),
    amount: Number(row.amount),
    rateBps: Number(row.rate_bps),
    termDays: Number(row.term_days),
    totalDue: Number(row.total_due),
    lateFeeBps: Number(row.late_fee_bps ?? 0),
    status,
    createdAt: String(row.created_at),
    dueAt,
    repaidAt: row.repaid_at ? String(row.repaid_at) : null,
    repaidAmount: row.repaid_amount == null ? null : Number(row.repaid_amount),
    overdue: status === "active" && dueAt < new Date().toISOString(),
  };
}

export async function listLoans(db: Client, ownerId: string): Promise<BankLoanRow[]> {
  const r = await db.execute({ sql: `SELECT * FROM bank_loans WHERE owner_id = ? ORDER BY created_at DESC`, args: [ownerId] });
  return (r.rows as unknown as Array<Record<string, unknown>>).map(mapLoanRow);
}

/**
 * Score de crédito (300–850, como um score real) — SEMPRE derivado do
 * histórico, nunca armazenado: investimento concluído soma pontos
 * (hábito de poupar), empréstimo pago em dia soma mais, pago atrasado
 * derruba, e ter um empréstimo vencido sem pagar pune enquanto durar.
 */
export async function getCreditScore(db: Client, ownerId: string): Promise<number> {
  const [loanStats, depositCount] = await Promise.all([
    db.execute({
      sql: `SELECT
              COALESCE(SUM(CASE WHEN status = 'repaid' AND repaid_at <= due_at THEN 1 ELSE 0 END), 0) AS on_time,
              COALESCE(SUM(CASE WHEN status = 'repaid' AND repaid_at > due_at THEN 1 ELSE 0 END), 0) AS late,
              COALESCE(SUM(CASE WHEN status = 'active' AND due_at < datetime('now') THEN 1 ELSE 0 END), 0) AS overdue_now
            FROM bank_loans WHERE owner_id = ?`,
      args: [ownerId],
    }),
    db.execute({ sql: `SELECT COUNT(*) AS n FROM bank_deposits WHERE owner_id = ? AND status = 'claimed'`, args: [ownerId] }),
  ]);
  const row = loanStats.rows[0] ?? {};
  const onTime = Number(row.on_time ?? 0);
  const late = Number(row.late ?? 0);
  const overdueNow = Number(row.overdue_now ?? 0);
  const claimedDeposits = Number(depositCount.rows[0]?.n ?? 0);

  const score = 500 + onTime * 40 - late * 60 - overdueNow * 100 + Math.min(claimedDeposits * 10, 100);
  return Math.max(LOAN_SCORE_MIN, Math.min(LOAN_SCORE_MAX, score));
}

export type LoanResult =
  | { ok: true; loan: BankLoanRow; balance: number }
  | { ok: false; code: "invalid_amount" | "active_exists" | "score_too_low"; message: string };

export async function requestLoan(db: Client, ownerId: string, amount: number): Promise<LoanResult> {
  const score = await getCreditScore(db, ownerId);
  const tier = loanTierForScore(score);
  if (tier.maxAmount <= 0) {
    return { ok: false, code: "score_too_low", message: "Seu score de crédito ainda não libera empréstimos. Conclua investimentos no Banco para construir histórico." };
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > tier.maxAmount) {
    return { ok: false, code: "invalid_amount", message: `Seu limite atual é de ${tier.maxAmount} moedas (${tier.label}).` };
  }

  const loanId = nanoid();
  const totalDue = computeLoanTotalDue(amount, tier.rateBps);
  const dueAt = new Date(Date.now() + LOAN_TERM_DAYS * 86_400_000).toISOString();

  const results = await db.batch(
    [
      {
        sql: `INSERT INTO bank_loans (id, owner_id, amount, rate_bps, term_days, total_due, late_fee_bps, due_at)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?
              WHERE NOT EXISTS (SELECT 1 FROM bank_loans WHERE owner_id = ? AND status = 'active')`,
        args: [loanId, ownerId, amount, tier.rateBps, LOAN_TERM_DAYS, totalDue, LOAN_LATE_FEE_BPS, dueAt, ownerId],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_loan', ?, 'disbursement', ?
              WHERE EXISTS (SELECT 1 FROM bank_loans WHERE id = ?)`,
        args: [nanoid(), ownerId, amount, loanId, `Empréstimo: ${tier.label}`, loanId],
      },
    ],
    "write",
  );

  if (results[0].rowsAffected === 0) {
    return { ok: false, code: "active_exists", message: "Você já tem um empréstimo ativo. Quite-o antes de pedir outro." };
  }

  const balance = await coinBalance(db, ownerId);
  const row = await db.execute({ sql: "SELECT * FROM bank_loans WHERE id = ?", args: [loanId] });
  return { ok: true, loan: mapLoanRow(row.rows[0] as unknown as Record<string, unknown>), balance };
}

export type RepayLoanResult =
  | { ok: true; loan: BankLoanRow; paid: number; balance: number }
  | { ok: false; code: "not_found" | "already_repaid" | "insufficient"; message: string; balance?: number };

export async function repayLoan(db: Client, ownerId: string, loanId: string): Promise<RepayLoanResult> {
  const existing = await db.execute({ sql: "SELECT * FROM bank_loans WHERE id = ? AND owner_id = ?", args: [loanId, ownerId] });
  const row = existing.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return { ok: false, code: "not_found", message: "Empréstimo não encontrado." };
  const current = mapLoanRow(row);
  if (current.status === "repaid") return { ok: false, code: "already_repaid", message: "Este empréstimo já foi quitado." };

  const lateFee = current.overdue ? computeLateFee(current.totalDue, current.lateFeeBps) : 0;
  const amountToPay = current.totalDue + lateFee;

  const results = await db.batch(
    [
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_loan', ?, 'repayment', ?
              WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE owner_id = ?) >= ?
                AND EXISTS (SELECT 1 FROM bank_loans WHERE id = ? AND owner_id = ? AND status = 'active')`,
        args: [
          nanoid(),
          ownerId,
          -amountToPay,
          loanId,
          lateFee > 0 ? "Quitação do empréstimo (com multa por atraso)" : "Quitação do empréstimo",
          ownerId,
          amountToPay,
          loanId,
          ownerId,
        ],
      },
      {
        sql: `UPDATE bank_loans SET status = 'repaid', repaid_at = datetime('now'), repaid_amount = ?
              WHERE id = ? AND owner_id = ? AND status = 'active'
              AND EXISTS (SELECT 1 FROM coin_ledger WHERE owner_id = ? AND source_type = 'bank_loan' AND source_id = ? AND event_type = 'repayment')`,
        args: [amountToPay, loanId, ownerId, ownerId, loanId],
      },
    ],
    "write",
  );

  if (results[0].rowsAffected === 0) {
    const recheck = await db.execute({ sql: "SELECT * FROM bank_loans WHERE id = ?", args: [loanId] });
    const nowStatus = mapLoanRow(recheck.rows[0] as unknown as Record<string, unknown>);
    if (nowStatus.status === "repaid") return { ok: false, code: "already_repaid", message: "Este empréstimo já foi quitado." };
    const balance = await coinBalance(db, ownerId);
    return { ok: false, code: "insufficient", message: "Moedas insuficientes para quitar este empréstimo.", balance };
  }

  const balance = await coinBalance(db, ownerId);
  const updated = await db.execute({ sql: "SELECT * FROM bank_loans WHERE id = ?", args: [loanId] });
  return { ok: true, loan: mapLoanRow(updated.rows[0] as unknown as Record<string, unknown>), paid: amountToPay, balance };
}

export interface CreditInfo {
  score: number;
  scoreMin: number;
  scoreMax: number;
  tier: { label: string; maxAmount: number; rateBps: number };
  termDays: number;
  lateFeeBps: number;
}

export interface BankSummary {
  balance: number;
  plans: typeof BANK_PLANS;
  active: BankDepositRow[];
  claimable: BankDepositRow[];
  history: BankDepositRow[];
  totals: { invested: number; earned: number; taxPaid: number; activeCount: number };
  credit: CreditInfo;
  loan: { active: BankLoanRow | null; history: BankLoanRow[] };
}

export async function getBankSummary(db: Client, ownerId: string): Promise<BankSummary> {
  const [balance, deposits, loans, score] = await Promise.all([
    coinBalance(db, ownerId),
    listDeposits(db, ownerId),
    listLoans(db, ownerId),
    getCreditScore(db, ownerId),
  ]);
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
  const tier = loanTierForScore(score);
  const credit: CreditInfo = {
    score,
    scoreMin: LOAN_SCORE_MIN,
    scoreMax: LOAN_SCORE_MAX,
    tier: { label: tier.label, maxAmount: tier.maxAmount, rateBps: tier.rateBps },
    termDays: LOAN_TERM_DAYS,
    lateFeeBps: LOAN_LATE_FEE_BPS,
  };
  const loan = {
    active: loans.find((l) => l.status === "active") ?? null,
    history: loans.filter((l) => l.status === "repaid"),
  };
  return { balance, plans: BANK_PLANS, active, claimable, history, totals, credit, loan };
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
