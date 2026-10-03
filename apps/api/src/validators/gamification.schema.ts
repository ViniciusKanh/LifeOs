import { z } from "zod";

export const REWARD_CATEGORIES = ["lazer", "descanso", "comida", "compras", "social", "experiencia", "outro"] as const;

const rewardShape = {
  name: z.string().trim().min(1, "Informe o nome da recompensa.").max(80),
  description: z.string().trim().max(300).optional().nullable(),
  icon: z.string().trim().max(16).optional().nullable(),
  category: z.enum(REWARD_CATEGORIES).optional(),
  cost: z.number().int("Custo deve ser inteiro.").min(1, "Custo mínimo de 1 moeda.").max(100_000),
  redemptionLimit: z.number().int().min(1).max(10_000).optional().nullable(),
  cooldownHours: z.number().int().min(0).max(24 * 365).optional(),
  isActive: z.boolean().optional(),
};

export const createRewardSchema = z.object(rewardShape);
export const updateRewardSchema = z.object(rewardShape).partial();

export const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(30),
});
