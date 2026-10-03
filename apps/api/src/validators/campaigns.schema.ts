import { z } from "zod";
import { LIFE_AREAS } from "./direction.schema.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const id = z.string().min(1).max(64);
/** Banners/ícones só da biblioteca interna (nunca URL remota). */
const assetKey = z.string().regex(/^[a-z0-9-]{2,30}$/, "Item visual inválido.");

export const milestoneSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome ao marco.").max(160),
  description: z.string().trim().max(600).optional().nullable(),
  dueDate: dateOnly.optional().nullable(),
  isMajor: z.boolean().optional(),
  xpReward: z.number().int().min(0).max(100_000).optional(),
  coinReward: z.number().int().min(0).max(100_000).optional(),
  dependsOnIndex: z.number().int().min(0).max(29).optional().nullable(),
});

export const createCampaignSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome à campanha.").max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  goalId: id.optional().nullable(),
  lifeArea: z.enum(LIFE_AREAS).optional().nullable(),
  term: z.enum(["curto", "medio", "longo"]).optional(),
  status: z.enum(["planned", "active"]).optional(),
  startDate: dateOnly.optional().nullable(),
  endDate: dateOnly.optional().nullable(),
  banner: assetKey.optional().nullable(),
  icon: assetKey.optional().nullable(),
  themeColor: z.enum(["gold", "purple", "blue", "green", "orange", "red", "cyan", "pink"]).optional().nullable(),
  priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
  streakEnabled: z.boolean().optional(),
  completionXp: z.number().int().min(0).max(100_000).optional(),
  completionCoins: z.number().int().min(0).max(100_000).optional(),
  projectIds: z.array(id).max(30).optional(),
  taskIds: z.array(id).max(200).optional(),
  habitIds: z.array(id).max(30).optional(),
  newTasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional().nullable(),
        priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
        difficulty: z.enum(["facil", "medio", "dificil", "epico"]).optional().nullable(),
        dueDate: dateOnly.optional().nullable(),
        projectId: id.optional().nullable(),
      }),
    )
    .max(40)
    .optional(),
  milestones: z.array(milestoneSchema).max(30).optional(),
}).refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, { message: "A data final precisa ser depois do início." });

export const updateCampaignSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  goalId: id.optional().nullable(),
  lifeArea: z.enum(LIFE_AREAS).optional().nullable(),
  term: z.enum(["curto", "medio", "longo"]).optional(),
  startDate: dateOnly.optional().nullable(),
  endDate: dateOnly.optional().nullable(),
  banner: assetKey.optional().nullable(),
  icon: assetKey.optional().nullable(),
  themeColor: z.enum(["gold", "purple", "blue", "green", "orange", "red", "cyan", "pink"]).optional().nullable(),
  priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
  streakEnabled: z.boolean().optional(),
  completionXp: z.number().int().min(0).max(100_000).optional(),
  completionCoins: z.number().int().min(0).max(100_000).optional(),
});

export const statusSchema = z.object({ status: z.enum(["planned", "active", "paused", "archived"]) });
export const linksSchema = z.object({ kind: z.enum(["projects", "tasks", "habits"]), ids: z.array(id).min(1).max(100), linked: z.boolean() });
export const milestoneUpdateSchema = milestoneSchema.partial().extend({ dependencyId: id.optional().nullable() });
export const milestoneCreateSchema = milestoneSchema.extend({ dependencyId: id.optional().nullable() });
export const reorderSchema = z.object({ ids: z.array(id).min(1).max(30) });
export const milestoneDoneSchema = z.object({ done: z.boolean() });
export const suggestMissionsSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  existing: z.array(z.string().max(200)).max(80).optional(),
});
