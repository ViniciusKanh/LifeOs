import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { NOTE_KINDS, NOTE_LINK_TYPES, createNoteSchema, noteLinkSchema, updateNoteSchema, type NoteLinkType } from "../validators/notes.schema.js";
import {
  addNoteLink,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  notesGraph,
  notesLinkedTo,
  removeNoteLink,
  searchLinkTargets,
  updateNote,
} from "../services/notesService.js";

/** Notas e conhecimento (ver notesService.ts). */
export const notesRouter = Router();
notesRouter.use(requireAuth);

const bad = (issues: { message: string }[]) => ({ error: issues[0]?.message ?? "Dados inválidos." });
const isLinkType = (v: unknown): v is NoteLinkType => typeof v === "string" && (NOTE_LINK_TYPES as readonly string[]).includes(v);

notesRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : undefined;
  const kind = typeof req.query.kind === "string" && (NOTE_KINDS as readonly string[]).includes(req.query.kind) ? req.query.kind : undefined;
  const tag = typeof req.query.tag === "string" ? req.query.tag.slice(0, 40) : undefined;
  res.json(await listNotes(getDb(), req.user!.id, { q, kind, tag, includeArchived: req.query.includeArchived === "true" }));
});

notesRouter.get("/graph", async (req, res) => res.json(await notesGraph(getDb(), req.user!.id)));

/** GET /linked?type=project&id= — notas ligadas a um item de outro módulo. */
notesRouter.get("/linked", async (req, res) => {
  if (!isLinkType(req.query.type) || typeof req.query.id !== "string") return res.status(400).json({ error: "Informe type e id." });
  return res.json(await notesLinkedTo(getDb(), req.user!.id, req.query.type, req.query.id));
});

/** GET /targets?type=task&q= — busca itens para vincular. */
notesRouter.get("/targets", async (req, res) => {
  if (!isLinkType(req.query.type)) return res.status(400).json({ error: "Tipo inválido." });
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  return res.json(await searchLinkTargets(getDb(), req.user!.id, req.query.type, q));
});

notesRouter.get("/:id", async (req, res) => {
  const note = await getNote(getDb(), req.user!.id, req.params.id);
  if (!note) return res.status(404).json({ error: "Nota não encontrada." });
  return res.json(note);
});

notesRouter.post("/", async (req, res) => {
  const parsed = createNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  return res.status(201).json(await createNote(getDb(), req.user!.id, parsed.data));
});

notesRouter.patch("/:id", async (req, res) => {
  const parsed = updateNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  const note = await updateNote(getDb(), req.user!.id, req.params.id, parsed.data);
  if (!note) return res.status(404).json({ error: "Nota não encontrada." });
  return res.json(note);
});

notesRouter.delete("/:id", async (req, res) => {
  const ok = await deleteNote(getDb(), req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Nota não encontrada." });
  return res.status(204).send();
});

notesRouter.post("/:id/links", async (req, res) => {
  const parsed = noteLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  const result = await addNoteLink(getDb(), req.user!.id, req.params.id, parsed.data.targetType, parsed.data.targetId);
  if (result === "note_not_found") return res.status(404).json({ error: "Nota não encontrada." });
  if (result === "target_not_found") return res.status(400).json({ error: "Item para vincular não encontrado." });
  return res.status(201).json(await getNote(getDb(), req.user!.id, req.params.id));
});

notesRouter.delete("/:id/links/:linkId", async (req, res) => {
  const ok = await removeNoteLink(getDb(), req.user!.id, req.params.id, req.params.linkId);
  if (!ok) return res.status(404).json({ error: "Vínculo não encontrado." });
  return res.json(await getNote(getDb(), req.user!.id, req.params.id));
});
