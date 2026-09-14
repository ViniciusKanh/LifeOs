import { z } from "zod";
import { CUSTOM_ACHIEVEMENT_METRICS } from "../services/achievementsService.js";

const metricValues = CUSTOM_ACHIEVEMENT_METRICS.map((m) => m.value) as [string, ...string[]];

export const createCustomAchievementSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome para o troféu").max(80),
  description: z.string().trim().max(240).optional().nullable(),
  icon: z.string().trim().min(1).max(8).optional(),
  metric: z.enum(metricValues),
  threshold: z.number().int().positive("O limite precisa ser maior que zero"),
});
