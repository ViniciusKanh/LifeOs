import { z } from "zod";

export const createDepositSchema = z.object({
  planId: z.string().trim().min(1, "Escolha um plano de investimento."),
  amount: z.number().int("A quantia deve ser um número inteiro de moedas.").positive("Informe uma quantia maior que zero."),
});

export type CreateDepositInput = z.infer<typeof createDepositSchema>;
