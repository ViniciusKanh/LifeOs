import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createDepositSchema, createLoanSchema, ledgerQuerySchema } from "../validators/bank.schema.js";
import { claimDeposit, createDeposit, getBankSummary, listLedger, repayLoan, requestLoan } from "../services/bankService.js";

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
  active_exists: 409,
  score_too_low: 403,
  already_repaid: 409,
};

/** GET /api/bank — saldo, planos, investimentos ativos/prontos/histórico. */
bankRouter.get("/", async (req, res) => {
  return res.json(await getBankSummary(getDb(), req.user!.id));
});

/** POST /api/bank/deposits — investe uma quantia num plano. */
bankRouter.post("/deposits", async (req, res) => {
  const parsed = createDepositSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const result = await createDeposit(getDb(), req.user!.id, parsed.data.planId, parsed.data.amount);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message, balance: result.balance });
  }
  return res.status(201).json(result);
});

/** POST /api/bank/deposits/:id/claim — resgata um investimento já vencido. */
bankRouter.post("/deposits/:id/claim", async (req, res) => {
  const result = await claimDeposit(getDb(), req.user!.id, req.params.id);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message });
  }
  return res.json(result);
});

/** GET /api/bank/ledger — extrato: todos os ganhos e gastos de moedas do jogador (não só o Banco). */
bankRouter.get("/ledger", async (req, res) => {
  const parsed = ledgerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." });
  }
  const entries = await listLedger(getDb(), req.user!.id, parsed.data.limit);
  return res.json({ entries });
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
  const result = await repayLoan(getDb(), req.user!.id, req.params.id);
  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 400).json({ error: result.message, balance: result.balance });
  }
  return res.json(result);
});
