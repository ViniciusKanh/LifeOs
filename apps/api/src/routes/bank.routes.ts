import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { autoInvestSchema, createDepositSchema, createLoanSchema, ledgerQuerySchema } from "../validators/bank.schema.js";
import {
  claimDeposit,
  claimDepositEarly,
  createDeposit,
  getBankHistory,
  getBankStatement,
  getBankSummary,
  getLedgerEntryDetail,
  listLedger,
  recordCreditScoreSnapshot,
  repayLoan,
  requestLoan,
  setAutoInvestRule,
} from "../services/bankService.js";
import { userDayContext } from "../services/localDayService.js";
import { awardBankDepositClaimed, awardBankLoanRepaid } from "../services/gamificationService.js";

/**
 * Banco: investir moedas ganhas em missões em planos com prazo e bônus
 * fixos (config/bank.ts). Moeda do jogo, nunca dinheiro real.
 */
export const bankRouter = Router();
bankRouter.use(requireAuth);

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  invalid_amount: 400,
  limit: 409,
  insufficient: 402,
  not_matured: 409,
  already_claimed: 409,
  already_matured: 409,
  active_exists: 409,
  score_too_low: 403,
  already_repaid: 409,
};

/** GET /api/bank — saldo, planos, investimentos ativos/prontos/histórico. */
bankRouter.get("/", async (req, res) => {
  const db = getDb();
  const summary = await getBankSummary(db, req.user!.id);
  // Pico histórico do score de crédito (conquistas): snapshot diário, best-effort.
  await recordCreditScoreSnapshot(db, req.user!.id, summary.credit.score).catch((err) => console.error("[banco] falha ao salvar snapshot do score:", err));
  return res.json(summary);
});

/** POST /api/bank/deposits — investe uma quantia num plano. */
bankRouter.post("/deposits", async (req, res) => {
  const parsed = createDepositSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const result = await createDeposit(getDb(), req.user!.id, parsed.data.planId, parsed.data.amount, {
    label: parsed.data.label ?? null,
    icon: parsed.data.icon ?? null,
    goalId: parsed.data.goalId ?? null,
  });
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message, balance: result.balance });
  }
  return res.status(201).json(result);
});

/** POST /api/bank/deposits/:id/claim — resgata um investimento já vencido. */
bankRouter.post("/deposits/:id/claim", async (req, res) => {
  const db = getDb();
  const result = await claimDeposit(db, req.user!.id, req.params.id);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message });
  }
  // Códex/Timeline: resgate de investimento rende XP (moedas já creditadas acima).
  await awardBankDepositClaimed(db, req.user!.id, result.deposit.id, result.deposit.planLabel);
  return res.json(result);
});

/** POST /api/bank/deposits/:id/claim-early — resgate ANTECIPADO: quebra o prazo antes do vencimento (sem bônus nos planos de prazo fixo; proporcional no Cofre Livre). */
bankRouter.post("/deposits/:id/claim-early", async (req, res) => {
  const db = getDb();
  const result = await claimDepositEarly(db, req.user!.id, req.params.id);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message });
  }
  // Só rende XP do Códex quando houve ganho de verdade (Cofre Livre proporcional) -- um
  // resgate sem nenhum rendimento (planos de prazo fixo) não tem ganho a celebrar, mantém
  // o incentivo real de esperar o prazo.
  if (result.deposit.actualPayout != null && result.deposit.actualPayout > result.deposit.amount) {
    await awardBankDepositClaimed(db, req.user!.id, result.deposit.id, result.deposit.planLabel);
  }
  return res.json(result);
});

/** PUT /api/bank/auto-invest — configura (ou desliga) o investimento automático de um % das moedas ganhas em missões. */
bankRouter.put("/auto-invest", async (req, res) => {
  const parsed = autoInvestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const result = await setAutoInvestRule(getDb(), req.user!.id, parsed.data);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ ok: true, autoInvest: parsed.data });
});

/** GET /api/bank/history?days=60 — evolução do saldo e do score de crédito (card no Analytics do Banco). */
bankRouter.get("/history", async (req, res) => {
  const db = getDb();
  const days = Math.min(Math.max(Number(req.query.days) || 60, 7), 180);
  const { tz, today } = await userDayContext(db, req.user!.id);
  const points = await getBankHistory(db, req.user!.id, days, tz, today);
  return res.json({ days, points });
});

/** GET /api/bank/statement?months=12 — extrato de rendimentos: ganho, imposto, juros e multa por mês. */
bankRouter.get("/statement", async (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 24);
  const result = await getBankStatement(getDb(), req.user!.id, months);
  return res.json({ months: result });
});

/** GET /api/bank/ledger — extrato: todos os ganhos e gastos de moedas do jogador (não só o Banco), com filtro por categoria/período/texto. */
bankRouter.get("/ledger", async (req, res) => {
  const parsed = ledgerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." });
  }
  const db = getDb();
  const { tz } = await userDayContext(db, req.user!.id);
  const entries = await listLedger(db, req.user!.id, {
    limit: parsed.data.limit,
    sourceTypes: parsed.data.sourceTypes,
    from: parsed.data.from,
    to: parsed.data.to,
    tz,
    q: parsed.data.q,
  });
  return res.json({ entries });
});

/** GET /api/bank/ledger/:id — detalhe de uma movimentação ("comprovante"): saldo antes/depois, origem completa. */
bankRouter.get("/ledger/:id", async (req, res) => {
  const detail = await getLedgerEntryDetail(getDb(), req.user!.id, req.params.id);
  if (!detail) {
    return res.status(404).json({ error: "Movimentação não encontrada." });
  }
  return res.json(detail);
});

/** POST /api/bank/loans — pede um empréstimo dentro do limite liberado pelo score de crédito. */
bankRouter.post("/loans", async (req, res) => {
  const parsed = createLoanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const result = await requestLoan(getDb(), req.user!.id, parsed.data.amount);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message });
  }
  return res.status(201).json(result);
});

/** POST /api/bank/loans/:id/repay — quita um empréstimo (com multa se estiver atrasado). */
bankRouter.post("/loans/:id/repay", async (req, res) => {
  const db = getDb();
  const result = await repayLoan(db, req.user!.id, req.params.id);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message, balance: result.balance });
  }
  // Códex/Timeline: quitar rende XP sempre, mas menos se pago com multa por atraso.
  await awardBankLoanRepaid(db, req.user!.id, result.loan.id, result.paid === result.loan.totalDue);
  return res.json(result);
});
