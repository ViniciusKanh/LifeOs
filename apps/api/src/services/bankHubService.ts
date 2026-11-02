import type { Client } from "@libsql/client";
import { BANK_PLANS, getBankPlan } from "../config/bank.js";
import { getBankSummary, listLoans, repayLoan, createDeposit, type BankSummary } from "./bankService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { automationConfig, notifyFromAutomation } from "./automationService.js";

/**
 * Economia da Guilda — camada de "jogo" sobre o Banco existente.
 *
 * Nada aqui cria moedas: tudo é DERIVADO dos registros reais do Banco
 * (bank_deposits, bank_loans, bank_credit_score_history, coin_ledger) e das
 * fórmulas de config/bank.ts. As moedas são virtuais do LifeOS — não
 * representam dinheiro real nem recomendação financeira.
 */

type Row = Record<string, unknown>;

/** Raridade de jogo de cada cofre (só classificação visual, ligada ao prazo/risco do plano). */
export const VAULT_RARITY: Record<string, "comum" | "raro" | "epico" | "lendario"> = {
  "cofre-livre": "comum",
  "cofre-aventureiro": "raro",
  "rota-mercador": "epico",
  "fundo-dragao": "lendario",
};

/** Ranks do Guardião do Tesouro — limiares de XP financeiro (regra mostrada na UI). */
export const TREASURY_RANKS = [
  { min: 0, title: "Aprendiz de Tesoureiro" },
  { min: 200, title: "Cambista" },
  { min: 600, title: "Mercador" },
  { min: 1500, title: "Tesoureiro da Guilda" },
  { min: 4000, title: "Guardião do Tesouro" },
  { min: 10000, title: "Lorde das Moedas" },
] as const;

/** XP financeiro: 1 por moeda de rendimento líquido recebida, 25 por resgate, 50 por empréstimo quitado em dia. */
export function treasuryXp(earned: number, claims: number, loansOnTime: number): number {
  return Math.max(0, Math.floor(earned)) + claims * 25 + loansOnTime * 50;
}

export function treasuryRank(xp: number) {
  let idx = 0;
  for (let i = 0; i < TREASURY_RANKS.length; i++) if (xp >= TREASURY_RANKS[i]!.min) idx = i;
  const cur = TREASURY_RANKS[idx]!;
  const next = TREASURY_RANKS[idx + 1] ?? null;
  const pct = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100;
  return { level: idx + 1, title: cur.title, xp, currentMin: cur.min, next: next ? { title: next.title, min: next.min } : null, pct };
}

/** Dias seguidos (terminando hoje ou ontem) com pelo menos um depósito. */
export function investStreak(depositDays: Set<string>, today: string): number {
  let day = depositDays.has(today) ? today : shiftDayKey(today, -1);
  let n = 0;
  while (depositDays.has(day)) {
    n++;
    day = shiftDayKey(day, -1);
  }
  return n;
}

export interface BankMission {
  key: string;
  title: string;
  description: string;
  current: number;
  target: number;
  done: boolean;
  achievementCode: string | null;
}

export interface BankHub {
  summary: BankSummary;
  rank: ReturnType<typeof treasuryRank>;
  indicators: {
    balance: number;
    creditScore: number;
    dailyYieldEstimate: number;
    investStreakDays: number;
    activeInvestments: number;
    activeInvested: number;
    taxesPaid: number;
    transactions: number;
  };
  rarity: typeof VAULT_RARITY;
  missions: BankMission[];
  split: { enabled: boolean; config: Record<string, number> };
}

export async function getBankHub(db: Client, ownerId: string): Promise<BankHub> {
  const { tz, today } = await userDayContext(db, ownerId);
  const [summary, deposits, counts, scorePeak, tx] = await Promise.all([
    getBankSummary(db, ownerId),
    db.execute({ sql: "SELECT created_at FROM bank_deposits WHERE owner_id = ? ORDER BY created_at DESC LIMIT 400", args: [ownerId] }),
    db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM bank_deposits WHERE owner_id = ?) AS total,
              (SELECT COUNT(*) FROM bank_deposits WHERE owner_id = ? AND status = 'claimed' AND COALESCE(early_withdrawn, 0) = 0) AS claimed_on_time,
              (SELECT COUNT(*) FROM bank_loans WHERE owner_id = ? AND status = 'repaid' AND repaid_at <= due_at) AS loans_on_time,
              (SELECT COUNT(DISTINCT plan_id) FROM bank_deposits WHERE owner_id = ? AND status = 'active') AS plans_active`,
      args: [ownerId, ownerId, ownerId, ownerId],
    }),
    db.execute({ sql: "SELECT COALESCE(MAX(score), 0) AS v FROM bank_credit_score_history WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS v FROM coin_ledger WHERE owner_id = ?", args: [ownerId] }),
  ]);
  const c = (counts.rows[0] ?? {}) as Row;
  const total = Number(c.total ?? 0);
  const claimedOnTime = Number(c.claimed_on_time ?? 0);
  const loansOnTime = Number(c.loans_on_time ?? 0);
  const plansActive = Number(c.plans_active ?? 0);
  const peak = Math.max(Number(scorePeak.rows[0]?.v ?? 0), summary.credit.score);

  const depositDays = new Set((deposits.rows as unknown as Row[]).map((r) => localDayOfStored(String(r.created_at), tz)));
  const streak = investStreak(depositDays, today);
  // Rendimento diário ESTIMADO: bônus líquido contratado de cada cofre ativo ÷ prazo (fórmulas reais do plano).
  const dailyYield = summary.active.reduce((acc, d) => acc + Math.max(0, d.netPayout - d.amount) / Math.max(1, d.termDays), 0);
  const activeInvested = summary.active.reduce((a, d) => a + d.amount, 0);

  const xp = treasuryXp(summary.totals.earned, Number(summary.history.filter((d) => d.status === "claimed").length), loansOnTime);
  const split = await automationConfig(db, ownerId, "bank", "vault_split");

  const missions: BankMission[] = [
    { key: "first", title: "Primeiro Cofre", description: "Faça seu primeiro investimento.", current: Math.min(total, 1), target: 1, done: total >= 1, achievementCode: "bank_first_deposit" },
    { key: "diversify", title: "Diversificar a guilda", description: "Tenha cofres ativos em 3 planos diferentes.", current: Math.min(plansActive, 3), target: 3, done: plansActive >= 3, achievementCode: null },
    { key: "patience", title: "Paciência do Mercador", description: "Resgate 5 cofres no prazo.", current: Math.min(claimedOnTime, 5), target: 5, done: claimedOnTime >= 5, achievementCode: "bank_claimed_10" },
    { key: "good_payer", title: "Bom Pagador", description: "Quite um empréstimo em dia.", current: Math.min(loansOnTime, 1), target: 1, done: loansOnTime >= 1, achievementCode: null },
    { key: "streak", title: "Ritual do Poupador", description: "Invista em 7 dias seguidos.", current: Math.min(streak, 7), target: 7, done: streak >= 7, achievementCode: null },
    { key: "score", title: "Crédito de Guardião", description: "Alcance score de crédito 800.", current: Math.min(peak, 800), target: 800, done: peak >= 800, achievementCode: "bank_score_800" },
  ];

  return {
    summary,
    rank: treasuryRank(xp),
    indicators: {
      balance: summary.balance,
      creditScore: summary.credit.score,
      dailyYieldEstimate: Math.round(dailyYield * 10) / 10,
      investStreakDays: streak,
      activeInvestments: summary.active.length,
      activeInvested,
      taxesPaid: summary.totals.taxPaid,
      transactions: Number(tx.rows[0]?.v ?? 0),
    },
    rarity: VAULT_RARITY,
    missions,
    split: { enabled: split.enabled, config: Object.fromEntries(Object.entries(split.config).map(([k, v]) => [k, Number(v)])) },
  };
}

const SPLIT_KEY = (planId: string) => `split_${planId.replace(/-/g, "_")}`;

/**
 * Automação B: divide a quantia da reserva automática entre cofres. Cada parte
 * abaixo do mínimo do plano é pulada (não investida) — nunca força depósito.
 * Devolve false quando a divisão está desligada (o chamador usa o plano único).
 */
export async function maybeSplitAutoInvest(db: Client, ownerId: string, amount: number): Promise<boolean> {
  const split = await automationConfig(db, ownerId, "bank", "vault_split");
  if (!split.enabled) return false;
  for (const plan of BANK_PLANS) {
    const pct = Number(split.config[SPLIT_KEY(plan.id)] ?? 0);
    if (pct <= 0) continue;
    const part = Math.min(plan.maxAmount, Math.floor((amount * pct) / 100));
    if (part < plan.minAmount) continue;
    await createDeposit(db, ownerId, plan.id, part, { auto: true });
  }
  return true;
}

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

/** Automação C: alerta de vencimento e (com consentimento) pagamento automático. */
export async function runLoanAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const loans = await listLoans(db, ownerId);
  const active = loans.find((l) => l.status === "active");
  if (!active) return { status: "skipped", summary: "Nenhum empréstimo ativo." };
  const daysLeft = Math.ceil((Date.parse(active.dueAt) - Date.now()) / 86_400_000);
  const window = Number(config.daysBefore ?? 2);
  if (!active.overdue && daysLeft > window) return { status: "skipped", summary: `Empréstimo em dia — vence em ${daysLeft} dia(s).` };
  if (config.autoPay === true) {
    const paid = await repayLoan(db, ownerId, active.id);
    if (paid.ok) {
      await notifyFromAutomation(db, ownerId, { eventType: "bank_loan_autopay", title: "Empréstimo quitado automaticamente", body: `Pagamos ${paid.paid} moedas da fatura, como você autorizou.`, url: "/banco?aba=credito", inApp: true, push: config.push === true });
      return { status: "ok", summary: `Pagamento automático: ${paid.paid} moedas.` };
    }
    // Sem saldo: cai no alerta normal (não paga parcialmente).
  }
  const body = active.overdue ? "Seu empréstimo está atrasado — a multa já está correndo." : `Seu empréstimo de ${active.totalDue} moedas vence em ${Math.max(0, daysLeft)} dia(s).`;
  await notifyFromAutomation(db, ownerId, { eventType: "bank_loan_alert", title: "Fatura da guilda", body, url: "/banco?aba=credito", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** Automação D: cofres ligados a metas que já venceram e podem ser resgatados. */
export async function runVaultGoals(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const r = await db.execute({
    sql: `SELECT d.id, d.net_payout, d.payout, d.matures_at, g.title AS goal_title FROM bank_deposits d JOIN goals g ON g.id = d.goal_id AND g.owner_id = d.owner_id
          WHERE d.owner_id = ? AND d.status = 'active'`,
    args: [ownerId],
  });
  const rows = r.rows as unknown as Row[];
  if (rows.length === 0) return { status: "skipped", summary: "Nenhum cofre vinculado a meta. Vincule ao criar um investimento." };
  // matures_at é ISO (createDeposit grava toISOString()).
  const now = new Date().toISOString();
  const ready = rows.filter((x) => String(x.matures_at) <= now);
  if (ready.length > 0) {
    await notifyFromAutomation(db, ownerId, {
      eventType: "bank_vault_goal",
      title: "Cofre de meta pronto",
      body: `${ready.length} cofre(s) ligado(s) a metas já venceram (${String(ready[0]!.goal_title)}). Resgate no Banco.`,
      url: "/banco?aba=cofres",
      inApp: config.inApp !== false,
      push: config.push === true,
    });
  }
  return { status: "ok", summary: `${rows.length} cofre(s) ligado(s) a metas, ${ready.length} pronto(s) para resgate.` };
}

/** Automação E: relatório semanal com números reais do extrato. */
export async function runGuildReport(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  // coin_ledger.created_at usa datetime('now') ("YYYY-MM-DD HH:MM:SS"); bank_deposits usa ISO.
  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since = sinceIso.replace("T", " ").slice(0, 19);
  const inWeekIso = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [ledger, claimed, maturing] = await Promise.all([
    db.execute({ sql: "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS inn, COALESCE(SUM(CASE WHEN amount < 0 THEN -amount END), 0) AS out FROM coin_ledger WHERE owner_id = ? AND created_at >= ?", args: [ownerId, since] }),
    db.execute({
      sql: "SELECT COALESCE(SUM(COALESCE(actual_payout, net_payout) - amount), 0) AS gain, COALESCE(SUM(COALESCE(actual_tax, payout - net_payout)), 0) AS tax FROM bank_deposits WHERE owner_id = ? AND status = 'claimed' AND claimed_at >= ?",
      args: [ownerId, sinceIso.slice(0, 10)],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM bank_deposits WHERE owner_id = ? AND status = 'active' AND matures_at <= ?", args: [ownerId, inWeekIso] }),
  ]);
  const l = (ledger.rows[0] ?? {}) as Row;
  const c = (claimed.rows[0] ?? {}) as Row;
  const body = `Últimos 7 dias: +${Number(l.inn ?? 0)} / −${Number(l.out ?? 0)} moedas. Rendimentos resgatados: ${Math.max(0, Number(c.gain ?? 0))} (imposto ${Number(c.tax ?? 0)}). Cofres vencendo na próxima semana: ${Number(maturing.rows[0]?.n ?? 0)}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "bank_report", title: "Relatório da guilda", body, url: "/banco?aba=extrato", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export { getBankPlan };
