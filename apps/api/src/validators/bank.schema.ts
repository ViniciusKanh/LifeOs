import { z } from "zod";

export const createDepositSchema = z.object({
  planId: z.string().trim().min(1, "Escolha um plano de investimento."),
  amount: z.number().int("A quantia deve ser um número inteiro de moedas.").positive("Informe uma quantia maior que zero."),
});

export type CreateDepositInput = z.infer<typeof createDepositSchema>;

/** GET /api/bank/ledger?limit= — quantas linhas do extrato trazer de uma vez. */
export const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(40),
});

export const createLoanSchema = z.object({
  amount: z.number().int("A quantia deve ser um número inteiro de moedas.").positive("Informe uma quantia maior que zero."),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;

/** PUT /api/bank/auto-invest — regra opcional: investir X% de toda moeda ganha num plano escolhido. */
export const autoInvestSchema = z.object({
  enabled: z.boolean(),
  // Limite de 50% de propósito: nunca deixar a regra comprometer toda a renda do jogador sem controle manual.
  pctBps: z.number().int().min(100, "Mínimo de 1% das moedas ganhas.").max(5000, "Máximo de 50% das moedas ganhas."),
  planId: z.string().trim().min(1, "Escolha um plano de investimento."),
});

export type AutoInvestInput = z.infer<typeof autoInvestSchema>;
