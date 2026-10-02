import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createLifeAdminSchema, markLifeAdminDoneSchema, updateLifeAdminSchema } from "../validators/lifeAdmin.schema.js";
import {
  createLifeAdminItem,
  deleteLifeAdminHistory,
  deleteLifeAdminItem,
  getLifeAdminFile,
  getLifeAdminItem,
  getLifeAdminSummary,
  listLifeAdminItems,
  markLifeAdminDone,
  updateLifeAdminItem,
} from "../services/lifeAdminService.js";

/** Administração da vida — vencimentos, manutenções, documentos e contas (ver lifeAdminService.ts). */
export const lifeAdminRouter = Router();
lifeAdminRouter.use(requireAuth);

const bad = (issues: { message: string }[]) => ({ error: issues[0]?.message ?? "Dados inválidos." });

lifeAdminRouter.get("/", async (req, res) => {
  res.json(await listLifeAdminItems(getDb(), req.user!.id, req.query.includeArchived === "true"));
});

lifeAdminRouter.get("/summary", async (req, res) => {
  res.json(await getLifeAdminSummary(getDb(), req.user!.id));
});

lifeAdminRouter.get("/:id", async (req, res) => {
  const item = await getLifeAdminItem(getDb(), req.user!.id, req.params.id);
  if (!item) return res.status(404).json({ error: "Item não encontrado." });
  return res.json(item);
});

/** GET /:id/file — arquivo anexado (foto/PDF do documento), só para o dono. */
lifeAdminRouter.get("/:id/file", async (req, res) => {
  const file = await getLifeAdminFile(getDb(), req.user!.id, req.params.id);
  if (!file) return res.status(404).json({ error: "Este item não tem arquivo." });
  return res.json(file);
});

lifeAdminRouter.post("/", async (req, res) => {
  const parsed = createLifeAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  return res.status(201).json(await createLifeAdminItem(getDb(), req.user!.id, parsed.data));
});

lifeAdminRouter.patch("/:id", async (req, res) => {
  const parsed = updateLifeAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  const item = await updateLifeAdminItem(getDb(), req.user!.id, req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: "Item não encontrado." });
  return res.json(item);
});

lifeAdminRouter.delete("/:id", async (req, res) => {
  const ok = await deleteLifeAdminItem(getDb(), req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Item não encontrado." });
  return res.status(204).send();
});

/** POST /:id/done — pagou/renovou/fez: grava histórico e calcula o próximo vencimento. */
lifeAdminRouter.post("/:id/done", async (req, res) => {
  const parsed = markLifeAdminDoneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  const item = await markLifeAdminDone(getDb(), req.user!.id, req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: "Item não encontrado." });
  return res.json(item);
});

lifeAdminRouter.delete("/:id/history/:historyId", async (req, res) => {
  const ok = await deleteLifeAdminHistory(getDb(), req.user!.id, req.params.id, req.params.historyId);
  if (!ok) return res.status(404).json({ error: "Registro não encontrado." });
  return res.json(await getLifeAdminItem(getDb(), req.user!.id, req.params.id));
});
