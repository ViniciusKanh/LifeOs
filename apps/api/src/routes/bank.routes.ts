import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createDepositSchema } from "../validators/bank.schema.js";
import { claimDeposit, createDeposit, getBankSummary } from "../services/bankService.js";

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
