import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import { HabitsHubError, getHabitsHub, habitMissions, habitsOnDay, suggestHabitSlots, updateHabitMeta } from "../services/habitsHubService.js";
import { LibraryHubError, deleteSession, deleteTrail, getLibraryHub, learningToCard, recordSession, saveTrail, setBookFavorite, updateSession } from "../services/libraryHubService.js";
import { AdminHubError, claimChest, getAdminHub, reopenItem, updateAdminMeta } from "../services/lifeAdminHubService.js";

/**
 * Hábitos, Biblioteca e Administração 3.0 — rotas derivadas por usuário.
 * Check-ins, cadastro de livros e itens administrativos seguem nas rotas de
 * origem; aqui ficam leituras agregadas, sessões corrigíveis, trilhas e metadados.
 */
export const habitsHubRouter = Router();
export const libraryHubRouter = Router();
export const adminHubRouter = Router();
for (const r of [habitsHubRouter, libraryHubRouter, adminHubRouter]) r.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.enum(["Baixa", "Média", "Alta"]).nullable();

function fail(res: Response, err: unknown) {
  if (err instanceof HabitsHubError || err instanceof LibraryHubError || err instanceof AdminHubError) return res.status(err.status).json({ error: err.message });
  throw err;
}

/* ─────────── Hábitos ─────────── */
habitsHubRouter.get("/", async (req, res) => {
  const hub = await getHabitsHub(getDb(), req.user!.id);
  return res.json({ ...hub, missions: habitMissions(hub) });
});
habitsHubRouter.get("/day/:day", async (req, res) => {
  const d = day.safeParse(req.params.day);
  if (!d.success) return res.status(400).json({ error: "Data inválida." });
  return res.json(await habitsOnDay(getDb(), req.user!.id, d.data));
});
habitsHubRouter.get("/plan", async (req, res) => res.json(await suggestHabitSlots(getDb(), req.user!.id)));
habitsHubRouter.patch("/:id/meta", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = z
    .object({
      frequency: z.enum(["daily", "specific_days", "times_per_week", "weekly", "monthly"]).optional(),
      days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      timesPerCycle: z.number().int().min(1).max(7).optional(),
      unit: z.string().max(20).nullable().optional(),
      priority: priority.optional(),
      reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      experimentId: id.nullable().optional(),
      paused: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await updateHabitMeta(getDb(), req.user!.id, p.data, body.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

/* ─────────── Biblioteca ─────────── */
const sessionBody = z.object({
  date: day,
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  startPage: z.number().int().min(0).max(100000).nullable().optional(),
  endPage: z.number().int().min(0).max(100000).nullable().optional(),
  pages: z.number().int().min(0).max(2000).nullable().optional(),
  note: z.string().max(600).nullable().optional(),
  learning: z.string().max(600).nullable().optional(),
});
libraryHubRouter.get("/", async (req, res) => res.json(await getLibraryHub(getDb(), req.user!.id)));
libraryHubRouter.post("/sessions", async (req, res) => {
  const body = sessionBody.extend({ bookId: id }).safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.status(201).json(await recordSession(getDb(), req.user!.id, body.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.patch("/sessions/:id", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = sessionBody.safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    return res.json(await updateSession(getDb(), req.user!.id, p.data, body.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.delete("/sessions/:id", async (req, res) => {
  const p = id.safeParse(req.params.id);
  if (!p.success) return res.status(400).json({ error: "Sessão inválida." });
  try {
    return res.json(await deleteSession(getDb(), req.user!.id, p.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.post("/sessions/:id/card", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = z.object({ front: z.string().trim().min(2).max(500), back: z.string().trim().min(1).max(1000) }).safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Preencha frente e verso do cartão." });
  try {
    return res.status(201).json(await learningToCard(getDb(), req.user!.id, p.data, body.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.put("/books/:id/favorite", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = z.object({ favorite: z.boolean() }).safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await setBookFavorite(getDb(), req.user!.id, p.data, body.data.favorite);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
const trailBody = z.object({ name: z.string().trim().min(2).max(80), theme: z.string().max(40).nullable().optional(), objective: z.string().max(240).nullable().optional(), goalId: id.nullable().optional(), bookIds: z.array(id).max(30) });
libraryHubRouter.post("/trails", async (req, res) => {
  const body = trailBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Trilha inválida." });
  try {
    return res.status(201).json(await saveTrail(getDb(), req.user!.id, body.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.put("/trails/:id", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = trailBody.safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Trilha inválida." });
  try {
    return res.json(await saveTrail(getDb(), req.user!.id, body.data, p.data));
  } catch (e) {
    return fail(res, e);
  }
});
libraryHubRouter.delete("/trails/:id", async (req, res) => {
  const p = id.safeParse(req.params.id);
  if (!p.success) return res.status(400).json({ error: "Trilha inválida." });
  try {
    await deleteTrail(getDb(), req.user!.id, p.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

/* ─────────── Administração ─────────── */
adminHubRouter.get("/", async (req, res) => {
  const m = z.string().regex(/^\d{4}-\d{2}$/).safeParse(req.query.month);
  return res.json(await getAdminHub(getDb(), req.user!.id, m.success ? m.data : undefined));
});
adminHubRouter.patch("/items/:id/meta", async (req, res) => {
  const p = id.safeParse(req.params.id);
  const body = z.object({ priority: priority.optional(), currency: z.string().regex(/^[A-Za-z]{3}$/).optional() }).safeParse(req.body ?? {});
  if (!p.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await updateAdminMeta(getDb(), req.user!.id, p.data, body.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
adminHubRouter.post("/items/:id/reopen", async (req, res) => {
  const p = id.safeParse(req.params.id);
  if (!p.success) return res.status(400).json({ error: "Item inválido." });
  try {
    await reopenItem(getDb(), req.user!.id, p.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
adminHubRouter.post("/chest/claim", async (req, res) => {
  try {
    return res.json(await claimChest(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});
