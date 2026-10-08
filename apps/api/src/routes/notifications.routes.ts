import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createCustomNotificationTrigger,
  deleteCustomNotificationTrigger,
  isNotificationTriggerEvent,
  listCustomNotificationTriggers,
  listNotificationTriggers,
  runTaskDeadlineTriggers,
  updateCustomNotificationTrigger,
  updateNotificationTrigger,
} from "../services/notificationTriggersService.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const triggerPatchSchema = z.object({
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  channelInApp: z.boolean().optional(),
  alertLevel: z.enum(["soft", "medium", "critical"]).optional(),
  active: z.boolean().optional(),
});

const customTriggerBaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  conditionType: z.enum(["task_due_in", "task_overdue_by"]),
  days: z.number().int().min(0).max(365),
  priority: z.enum(["Baixa", "Média", "Alta"]).nullable(),
  channelEmail: z.boolean(),
  channelPush: z.boolean(),
  channelInApp: z.boolean(),
  active: z.boolean(),
});
const customTriggerSchema = customTriggerBaseSchema.refine((rule) => rule.channelEmail || rule.channelPush || rule.channelInApp, {
  message: "Escolha pelo menos um canal de aviso.",
});

notificationsRouter.get("/triggers/custom", async (req, res) => {
  return res.json(await listCustomNotificationTriggers(req.user!.id));
});

notificationsRouter.post("/triggers/custom", async (req, res) => {
  const parsed = customTriggerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Gatilho inválido." });
  return res.status(201).json(await createCustomNotificationTrigger(req.user!.id, parsed.data));
});

notificationsRouter.patch("/triggers/custom/:id", async (req, res) => {
  const parsed = customTriggerBaseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Gatilho inválido." });
  const existing = (await listCustomNotificationTriggers(req.user!.id)).find((rule) => rule.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Gatilho não encontrado." });
  const validMerged = customTriggerSchema.safeParse({ ...existing, ...parsed.data });
  if (!validMerged.success) return res.status(400).json({ error: validMerged.error.issues[0]?.message ?? "Gatilho inválido." });
  const updated = await updateCustomNotificationTrigger(req.user!.id, req.params.id, parsed.data);
  return updated ? res.json(updated) : res.status(404).json({ error: "Gatilho não encontrado." });
});

notificationsRouter.delete("/triggers/custom/:id", async (req, res) => {
  const deleted = await deleteCustomNotificationTrigger(req.user!.id, req.params.id);
  return deleted ? res.status(204).send() : res.status(404).json({ error: "Gatilho não encontrado." });
});

notificationsRouter.get("/triggers", async (req, res) => {
  const triggers = await listNotificationTriggers(req.user!.id);
  return res.json(triggers);
});

notificationsRouter.patch("/triggers/:eventType", async (req, res) => {
  if (!isNotificationTriggerEvent(req.params.eventType)) {
    return res.status(404).json({ error: "Gatilho não encontrado." });
  }
  const parsed = triggerPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const updated = await updateNotificationTrigger(req.user!.id, req.params.eventType, parsed.data);
  return res.json(updated);
});

notificationsRouter.post("/triggers/run", async (req, res) => {
  const result = await runTaskDeadlineTriggers(req.user!.id);
  return res.json(result);
});

