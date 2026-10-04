import { z } from "zod";
import { LIMIT_PERIODS, REWARD_ARTS, REWARD_CURRENCIES, REWARD_RARITIES } from "../config/treasure.js";

// Categorias do Tesouro (descanso…personalizado) + as antigas da Loja, mantidas para dados existentes.
export const REWARD_CATEGORIES = ["descanso", "diversao", "autocuidado", "social", "premium", "personalizado", "lazer", "comida", "compras", "experiencia", "outro"] as const;

const rewardShape = {
  name: z.string().trim().min(1, "Informe o nome da recompensa.").max(80),
  description: z.string().trim().max(300).optional().nullable(),
  icon: z.string().trim().max(16).optional().nullable(),
  category: z.enum(REWARD_CATEGORIES).optional(),
  rarity: z.enum(REWARD_RARITIES).optional(),
  currency: z.enum(REWARD_CURRENCIES).optional(),
  cost: z.number().int("Custo deve ser inteiro.").min(1, "Custo mínimo de 1.").max(100_000),
  requiredLevel: z.number().int().min(1).max(500).optional().nullable(),
  requiredXp: z.number().int().min(0).max(10_000_000).optional().nullable(),
  requiredAchievementId: z.string().trim().min(1).max(64).optional().nullable(),
  redemptionLimit: z.number().int().min(1).max(10_000).optional().nullable(),
  cooldownHours: z.number().int().min(0).max(24 * 365).optional(),
  limitPeriod: z.enum(LIMIT_PERIODS).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  art: z.enum(REWARD_ARTS).optional().nullable(),
  isFavorite: z.boolean().optional(),
  isAiGenerated: z.boolean().optional(),
  isActive: z.boolean().optional(),
};

export const createRewardSchema = z.object(rewardShape);
export const updateRewardSchema = z.object(rewardShape).partial();
export const batchRewardsSchema = z.object({ rewards: z.array(z.object(rewardShape)).min(1).max(12) });
export const redeemSchema = z.object({ requestId: z.string().trim().min(8).max(64).optional() });
export const redemptionsQuerySchema = z.object({
  status: z.enum(["available", "used", "canceled", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

export const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(30),
});
