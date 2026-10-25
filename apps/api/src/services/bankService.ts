import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  BANK_PLANS,
  LOAN_LATE_FEE_BPS,
  LOAN_SCORE_MAX,
  LOAN_SCORE_MIN,
  LOAN_TERM_DAYS,
  LOAN_TIERS,
  computeGain,
  computeLateFee,
  computeLoanTotalDue,
  computeNetPayout,
  getBankPlan,
  loanTierForScore,
  type LoanTier,
} from "../config/bank.js";
import { coinBalance, todayKeyFor } from "./gamificationService.js";
import { groupRowsByLocalDay, localDayRangeUtc, localDaysWhere, shiftDayKey } from "./localDayService.js";

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
  /** true quando o resgate quebrou o prazo fixo antes do vencimento (sem bônus). */
  earlyWithdrawn: boolean;
  /** O que o jogador de fato recebeu no resgate — difere de netPayout quando foi antecipado. null enquanto ainda ativo. */
  actualPayout: number | null;
  /** Imposto de fato cobrado no resgate — difere de payout-netPayout quando o resgate foi antecipado/proporcional. null enquanto ainda ativo. */
  actualTax: number | null;
  /** Apelido opcional do cofrinho ("Viagem de fim de ano"), só apresentação. */
  label: string | null;
  /** Emoji opcional do cofrinho, só apresentação. */
  icon: string | null;
  /** Meta (goals) vinculada opcionalmente -- dá propósito ao depósito em vez de moeda parada sem significado. */
  goalId: string | null;
  /** Título da meta vinculada, já resolvido (LEFT JOIN em listDeposits) para exibir sem round-trip extra. */
  goalTitle: string | null;
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
    earlyWithdrawn: Number(row.early_withdrawn ?? 0) === 1,
    // Resgates de antes da migration 0080 sempre receberam o net_payout cheio (resgate antecipado não existia).
    actualPayout: row.actual_payout == null ? (row.status === "claimed" ? (row.net_payout == null ? payout : Number(row.net_payout)) : null) : Number(row.actual_payout),
    // Resgates de antes da migration 0081 sempre cobraram o imposto cheio (resgate proporcional não existia).
    actualTax: row.actual_tax == null ? (row.status === "claimed" ? payout - (row.net_payout == null ? payout : Number(row.net_payout)) : null) : Number(row.actual_tax),
    label: row.label == null ? null : String(row.label),
    icon: row.icon == null ? null : String(row.icon),
    goalId: row.goal_id == null ? null : String(row.goal_id),
    goalTitle: row.goal_title == null ? null : String(row.goal_title),
  };
}

export async function listDeposits(db: Client, ownerId: string): Promise<BankDepositRow[]> {
  const r = await db.execute({
    sql: `SELECT d.*, g.title AS goal_title FROM bank_deposits d
          LEFT JOIN goals g ON g.id = d.goal_id AND g.owner_id = d.owner_id
          WHERE d.owner_id = ? ORDER BY d.created_at DESC`,
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

export interface LedgerFilter {
  limit: number;
  /** Lista de source_type (ex.: ["task","habit"]) -- o frontend agrupa em categorias, o backend só filtra pelos valores reais. */
  sourceTypes?: string[];
  /** Período local (dia a dia, inclusive nas duas pontas) -- só aplica o filtro quando os três vêm juntos. */
  from?: string;
  to?: string;
  tz?: string;
  /** Busca por texto no rótulo da movimentação. */
  q?: string;
}

/** Extrato (todos os movimentos de moedas do jogador, não só do Banco) — mostra de onde vêm e para onde vão as moedas. */
export async function listLedger(db: Client, ownerId: string, filter: LedgerFilter): Promise<LedgerEntry[]> {
  const conditions = ["owner_id = ?"];
  const args: Array<string | number> = [ownerId];
  if (filter.sourceTypes && filter.sourceTypes.length > 0) {
    conditions.push(`source_type IN (${filter.sourceTypes.map(() => "?").join(", ")})`);
    args.push(...filter.sourceTypes);
  }
  if (filter.from && filter.to && filter.tz) {
    const range = localDaysWhere("created_at", filter.from, filter.to, filter.tz);
    conditions.push(range.sql);
    args.push(...range.args);
  }
  if (filter.q) {
    conditions.push("label LIKE ?");
    args.push(`%${filter.q}%`);
  }
  args.push(filter.limit);
  const r = await db.execute({
    sql: `SELECT id, amount, source_type, event_type, label, created_at
          FROM coin_ledger WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    args,
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

export interface LedgerEntryDetail extends LedgerEntry {
  /** Saldo total de moedas logo depois desta movimentação (soma de tudo até ela, inclusive). */
  balanceAfter: number;
  /** Saldo imediatamente antes -- balanceAfter menos o valor desta própria linha. */
  balanceBefore: number;
}

/** Detalhe de uma linha do extrato ("comprovante"): a movimentação + o saldo real antes/depois dela, derivado do próprio ledger. */
export async function getLedgerEntryDetail(db: Client, ownerId: string, entryId: string): Promise<LedgerEntryDetail | null> {
  const row = await db.execute({
    sql: "SELECT id, amount, source_type, event_type, label, created_at, rowid AS rid FROM coin_ledger WHERE id = ? AND owner_id = ?",
    args: [entryId, ownerId],
  });
  const r = row.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!r) return null;
  const totalRow = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS total FROM coin_ledger
          WHERE owner_id = ? AND (created_at < ? OR (created_at = ? AND rowid <= ?))`,
    args: [ownerId, String(r.created_at), String(r.created_at), Number(r.rid)],
  });
  const amount = Number(r.amount);
  const balanceAfter = Number(totalRow.rows[0]?.total ?? 0);
  return {
    id: String(r.id),
    amount,
    sourceType: String(r.source_type),
    eventType: String(r.event_type),
    label: r.label == null ? null : String(r.label),
    createdAt: String(r.created_at),
    balanceAfter,
    balanceBefore: balanceAfter - amount,
  };
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
  /** Tabela completa de níveis de crédito (score mínimo, limite, juros) -- alimenta o Simulador de empréstimo no frontend. */
  tiers: LoanTier[];
}

export interface AutoInvestRule {
  enabled: boolean;
  pctBps: number;
  planId: string;
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
  autoInvest: AutoInvestRule;
}

export async function getBankSummary(db: Client, ownerId: string): Promise<BankSummary> {
  const [balance, deposits, loans, score, autoInvest] = await Promise.all([
    coinBalance(db, ownerId),
    listDeposits(db, ownerId),
    listLoans(db, ownerId),
    getCreditScore(db, ownerId),
    getAutoInvestRule(db, ownerId),
  ]);
  const now = new Date().toISOString();
  const active = deposits.filter((d) => d.status === "active" && d.maturesAt > now);
  const claimable = deposits.filter((d) => d.status === "active" && d.maturesAt <= now);
  const history = deposits.filter((d) => d.status === "claimed");
  const totals = {
    invested: deposits.reduce((sum, d) => sum + d.amount, 0),
    // Ganho líquido REAL de tudo que já foi resgatado -- usa actualPayout (o que de fato
    // caiu na conta), não netPayout (a projeção no prazo): um resgate antecipado recebeu
    // só o principal, então não soma ganho nem imposto aqui, mesmo com netPayout > amount.
    earned: history.reduce((sum, d) => sum + ((d.actualPayout ?? d.netPayout) - d.amount), 0),
    taxPaid: history.reduce((sum, d) => sum + (d.actualTax ?? (d.payout - d.netPayout)), 0),
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
    tiers: LOAN_TIERS,
  };
  const loan = {
    active: loans.find((l) => l.status === "active") ?? null,
    history: loans.filter((l) => l.status === "repaid"),
  };
  return { balance, plans: BANK_PLANS, active, claimable, history, totals, credit, loan, autoInvest };
}

/** Regra de investimento automático do usuário (desligada por padrão). */
export async function getAutoInvestRule(db: Client, ownerId: string): Promise<AutoInvestRule> {
  const r = await db.execute({ sql: "SELECT enabled, pct_bps, plan_id FROM bank_auto_invest_rules WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return { enabled: false, pctBps: 1000, planId: "cofre-aventureiro" };
  return { enabled: Number(row.enabled) === 1, pctBps: Number(row.pct_bps), planId: String(row.plan_id) };
}

export type SetAutoInvestResult = { ok: true } | { ok: false; code: "invalid_plan"; message: string };

/** Configura (ou desliga) o investimento automático -- valida que o plano escolhido existe antes de salvar. */
export async function setAutoInvestRule(db: Client, ownerId: string, input: AutoInvestRule): Promise<SetAutoInvestResult> {
  const plan = getBankPlan(input.planId);
  if (!plan) return { ok: false, code: "invalid_plan", message: "Plano de investimento não encontrado." };
  await db.execute({
    sql: `INSERT INTO bank_auto_invest_rules (owner_id, enabled, pct_bps, plan_id, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET enabled = excluded.enabled, pct_bps = excluded.pct_bps, plan_id = excluded.plan_id, updated_at = datetime('now')`,
    args: [ownerId, input.enabled ? 1 : 0, input.pctBps, plan.id],
  });
  return { ok: true };
}

/**
 * Investe automaticamente parte de uma moeda recém-ganha, se o usuário tiver
 * a regra ligada. Chamado de dentro de gamificationService.award() -- único
 * cofre central de moedas de missão/contrato/hábito/etc. O próprio Banco
 * (resgate, empréstimo) credita moedas direto no ledger sem passar por
 * award(), então nunca reinveste a si mesmo (sem recursão). Nunca força um
 * depósito abaixo do mínimo do plano, e createDeposit já recusa sozinho se
 * faltar saldo ou o limite de ativos do plano já estiver cheio -- falha aqui
 * é só "não investiu desta vez", nunca um erro pro jogador.
 */
export async function maybeAutoInvest(db: Client, ownerId: string, coinsEarned: number): Promise<void> {
  if (coinsEarned <= 0) return;
  const rule = await getAutoInvestRule(db, ownerId);
  if (!rule.enabled) return;
  const plan = getBankPlan(rule.planId);
  if (!plan) return;
  const amount = Math.min(plan.maxAmount, Math.floor((coinsEarned * rule.pctBps) / 10_000));
  if (amount < plan.minAmount) return;
  await createDeposit(db, ownerId, plan.id, amount, { auto: true });
}

/**
 * Snapshot diário do score de crédito — o score em si é sempre DERIVADO
 * (getCreditScore nunca grava nada), mas um "pico histórico" não é
 * reconstruível a partir do estado atual sozinho. Mesmo padrão de
 * life_scores: só existe a partir dos dias em que o usuário de fato abriu
 * o Banco (upsert por dia local, nunca duplica).
 */
export async function recordCreditScoreSnapshot(db: Client, ownerId: string, score: number): Promise<void> {
  const dayKey = await todayKeyFor(db, ownerId);
  await db.execute({
    sql: `INSERT INTO bank_credit_score_history (id, owner_id, day_key, score)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id, day_key) DO UPDATE SET score = excluded.score`,
    args: [nanoid(), ownerId, dayKey, score],
  });
}

export interface BankHistoryPoint {
  date: string;
  score: number | null;
  balance: number | null;
}

/**
 * Evolução do Banco (card no Analytics): saldo de moedas dia a dia (derivado
 * do coin_ledger — saldo de abertura do período + variação diária real,
 * nunca um número guardado à parte) e o score de crédito (snapshots reais
 * de bank_credit_score_history, só nos dias em que o usuário abriu o Banco
 * -- esparso de propósito, nunca interpolado).
 */
export async function getBankHistory(db: Client, ownerId: string, days: number, tz: string, today: string): Promise<BankHistoryPoint[]> {
  const fromStr = shiftDayKey(today, -(days - 1));
  const periodStart = localDayRangeUtc(fromStr, tz).start;

  const [openingRow, changeRows, scoreRows] = await Promise.all([
    db.execute({ sql: `SELECT COALESCE(SUM(amount), 0) AS v FROM coin_ledger WHERE owner_id = ? AND created_at < ?`, args: [ownerId, periodStart] }),
    db.execute({ sql: `SELECT created_at AS at, amount AS v FROM coin_ledger WHERE owner_id = ? AND created_at >= ?`, args: [ownerId, periodStart] }),
    db.execute({ sql: `SELECT day_key, score FROM bank_credit_score_history WHERE owner_id = ? AND day_key >= ? ORDER BY day_key ASC`, args: [ownerId, fromStr] }),
  ]);

  const changeByDay = groupRowsByLocalDay(changeRows.rows, tz, "sum");
  const scoreByDay = new Map<string, number>(
    (scoreRows.rows as unknown as Array<{ day_key: string; score: number }>).map((r) => [String(r.day_key), Number(r.score)]),
  );

  const points: BankHistoryPoint[] = [];
  let running = Number(openingRow.rows[0]?.v ?? 0);
  let day = fromStr;
  while (day <= today) {
    running += changeByDay.get(day) ?? 0;
    points.push({ date: day, balance: running, score: scoreByDay.get(day) ?? null });
    day = shiftDayKey(day, 1);
  }
  return points;
}

export interface BankStatementMonth {
  month: string;
  earned: number;
  taxPaid: number;
  interestPaid: number;
  lateFeePaid: number;
}

/**
 * Extrato de rendimentos (mensal): quanto o Banco de fato rendeu, de imposto
 * sobre investimentos e de juros/multa de empréstimos, agregado por mês --
 * tudo a partir de bank_deposits/bank_loans já existentes, nunca uma cópia
 * redundante. Resgate antecipado nunca soma ganho/imposto (não houve nenhum
 * dos dois de verdade), mesmo regra de getBankSummary.
 */
export async function getBankStatement(db: Client, ownerId: string, months: number): Promise<BankStatementMonth[]> {
  const [depositRows, loanRows] = await Promise.all([
    db.execute({
      sql: `SELECT strftime('%Y-%m', claimed_at) AS month,
              SUM(COALESCE(actual_payout, net_payout) - amount) AS earned,
              SUM(COALESCE(actual_tax, payout - net_payout)) AS tax_paid
            FROM bank_deposits
            WHERE owner_id = ? AND status = 'claimed' AND claimed_at >= date('now', ?)
            GROUP BY month`,
      args: [ownerId, `-${months} months`],
    }),
    db.execute({
      sql: `SELECT strftime('%Y-%m', repaid_at) AS month,
              SUM(total_due - amount) AS interest_paid,
              SUM(MAX(repaid_amount - total_due, 0)) AS late_fee_paid
            FROM bank_loans
            WHERE owner_id = ? AND status = 'repaid' AND repaid_at >= date('now', ?)
            GROUP BY month`,
      args: [ownerId, `-${months} months`],
    }),
  ]);

  const byMonth = new Map<string, BankStatementMonth>();
  const get = (month: string) => {
    let m = byMonth.get(month);
    if (!m) {
      m = { month, earned: 0, taxPaid: 0, interestPaid: 0, lateFeePaid: 0 };
      byMonth.set(month, m);
    }
    return m;
  };
  for (const r of depositRows.rows as unknown as Array<Record<string, unknown>>) {
    if (!r.month) continue;
    const m = get(String(r.month));
    m.earned += Number(r.earned ?? 0);
    m.taxPaid += Number(r.tax_paid ?? 0);
  }
  for (const r of loanRows.rows as unknown as Array<Record<string, unknown>>) {
    if (!r.month) continue;
    const m = get(String(r.month));
    m.interestPaid += Number(r.interest_paid ?? 0);
    m.lateFeePaid += Number(r.late_fee_paid ?? 0);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type DepositResult =
  | { ok: true; deposit: BankDepositRow; balance: number }
  | { ok: false; code: "not_found" | "invalid_amount" | "limit" | "insufficient"; message: string; balance?: number };

export async function createDeposit(
  db: Client,
  ownerId: string,
  planId: string,
  amount: number,
  opts: { auto?: boolean; label?: string | null; icon?: string | null; goalId?: string | null } = {},
): Promise<DepositResult> {
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

  // O cofrinho pode ser vinculado a uma Meta existente -- ignora silenciosamente um goalId
  // que não existe ou não é do dono, em vez de travar o investimento por causa disso.
  let goalId: string | null = null;
  if (opts.goalId) {
    const goalRow = await db.execute({ sql: "SELECT id FROM goals WHERE id = ? AND owner_id = ?", args: [opts.goalId, ownerId] });
    if (goalRow.rows[0]) goalId = opts.goalId;
  }
  const label = opts.label?.trim() || null;
  const icon = opts.icon?.trim() || null;

  const depositId = nanoid();
  // payout bruto (principal + bônus) e líquido (já com o imposto sobre o ganho descontado) ficam
  // ambos congelados agora — mudar o plano depois nunca afeta este depósito.
  const grossPayout = amount + computeGain(amount, plan.rateBps);
  const netPayout = computeNetPayout(amount, plan.rateBps, plan.taxBps);
  const maturesAt = new Date(Date.now() + plan.termDays * 86_400_000).toISOString();

  const results = await db.batch(
    [
      {
        sql: `INSERT INTO bank_deposits (id, owner_id, plan_id, plan_label, amount, rate_bps, term_days, tax_bps, payout, net_payout, matures_at, label, icon, goal_id)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE owner_id = ?) >= ?`,
        args: [depositId, ownerId, plan.id, plan.label, amount, plan.rateBps, plan.termDays, plan.taxBps, grossPayout, netPayout, maturesAt, label, icon, goalId, ownerId, amount],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_deposit', ?, 'deposit', ?
              WHERE EXISTS (SELECT 1 FROM bank_deposits WHERE id = ?)`,
        args: [nanoid(), ownerId, -amount, depositId, `${opts.auto ? "Investimento automático" : "Investido"}: ${plan.label}`, depositId],
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
        sql: `UPDATE bank_deposits SET status = 'claimed', claimed_at = datetime('now'), actual_payout = ?, actual_tax = ?
              WHERE id = ? AND owner_id = ? AND status = 'active' AND matures_at <= datetime('now')`,
        args: [current.netPayout, current.payout - current.netPayout, depositId, ownerId],
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

export type EarlyClaimResult =
  | { ok: true; deposit: BankDepositRow; payout: number; balance: number }
  | { ok: false; code: "not_found" | "already_claimed" | "already_matured"; message: string };

/**
 * Resgate ANTECIPADO: quebra o prazo fixo antes do vencimento. Devolve só o
 * principal investido (sem bônus — não há ganho a tributar, então sem
 * imposto também). Igual a sair antes do prazo de um CDB de verdade: custa
 * o rendimento todo, nunca o dinheiro aplicado. Mantém o incentivo de
 * esperar (quem aguarda ganha o bônus líquido) sem deixar o jogador preso.
 * Não concede XP do Códex (awardBankDepositClaimed fica só para o resgate
 * no prazo certo — ver bank.routes.ts) nem conta para a conquista de
 * investimentos concluídos.
 */
export async function claimDepositEarly(db: Client, ownerId: string, depositId: string): Promise<EarlyClaimResult> {
  const existing = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ? AND owner_id = ?", args: [depositId, ownerId] });
  const row = existing.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return { ok: false, code: "not_found", message: "Investimento não encontrado." };
  const current = mapRow(row);
  if (current.status === "claimed") return { ok: false, code: "already_claimed", message: "Este investimento já foi resgatado." };
  if (current.maturesAt <= new Date().toISOString()) {
    return { ok: false, code: "already_matured", message: "Este investimento já venceu — resgate sem penalidade na lista de prontos para resgatar." };
  }

  // Planos de prazo fixo perdem o bônus inteiro ao sair antes do prazo (penalidade real).
  // O Cofre Livre (earlyWithdrawalPenalty: false) é o único feito pra sacar a qualquer
  // momento: paga o bônus PRORATADO pelo tempo decorrido, nunca zero -- plano desconhecido
  // (removido do catálogo) mantém a penalidade por segurança.
  const plan = getBankPlan(current.planId);
  const noPenalty = plan?.earlyWithdrawalPenalty === false;
  let payout = current.amount;
  let taxCharged = 0;
  if (noPenalty) {
    const totalMs = new Date(current.maturesAt).getTime() - new Date(current.createdAt).getTime();
    const elapsedMs = Date.now() - new Date(current.createdAt).getTime();
    const fraction = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 1;
    const proratedGain = Math.floor(computeGain(current.amount, current.rateBps) * fraction);
    taxCharged = Math.floor((proratedGain * current.taxBps) / 10_000);
    payout = current.amount + proratedGain - taxCharged;
  }

  const results = await db.batch(
    [
      {
        sql: `UPDATE bank_deposits SET status = 'claimed', claimed_at = datetime('now'), early_withdrawn = 1, actual_payout = ?, actual_tax = ?
              WHERE id = ? AND owner_id = ? AND status = 'active' AND matures_at > datetime('now')`,
        args: [payout, taxCharged, depositId, ownerId],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'bank_deposit', ?, 'early_payout', ?
              WHERE EXISTS (SELECT 1 FROM bank_deposits WHERE id = ? AND status = 'claimed' AND early_withdrawn = 1)
              ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
        args: [
          nanoid(),
          ownerId,
          payout,
          depositId,
          noPenalty ? `Resgate antecipado: ${current.planLabel} (proporcional ao tempo)` : `Resgate antecipado: ${current.planLabel} (sem rendimento)`,
          depositId,
        ],
      },
    ],
    "write",
  );

  if (results[0].rowsAffected === 0) {
    const recheck = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ?", args: [depositId] });
    const nowRow = mapRow(recheck.rows[0] as unknown as Record<string, unknown>);
    if (nowRow.status === "claimed") return { ok: false, code: "already_claimed", message: "Este investimento já foi resgatado." };
    return { ok: false, code: "already_matured", message: "Este investimento já venceu — resgate sem penalidade na lista de prontos para resgatar." };
  }

  const balance = await coinBalance(db, ownerId);
  const updated = await db.execute({ sql: "SELECT * FROM bank_deposits WHERE id = ?", args: [depositId] });
  return { ok: true, deposit: mapRow(updated.rows[0] as unknown as Record<string, unknown>), payout, balance };
}
