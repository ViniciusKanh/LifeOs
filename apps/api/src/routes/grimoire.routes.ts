import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import {
  GrimoireError,
  cardFromBookNote,
  createCards,
  createDeck,
  deleteCard,
  deleteDeck,
  getDailyQueue,
  getDeck,
  getStats,
  listCards,
  listDecks,
  reviewCard,
  updateCard,
  updateDeck,
} from "../services/grimoireService.js";
import { proposeCards } from "../services/grimoireAIService.js";

/**
 * Grimório de Memorização (repetição espaçada). Toda rota é do usuário
 * autenticado; o serviço filtra owner_id em todas as queries. A geração
 * por IA só PROPÕE cartões — a gravação acontece em POST /decks/:id/cards
 * depois que o usuário revisa e confirma.
 */
export const grimoireRouter = Router();
grimoireRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador inválido.");
const optionalId = id.nullable().optional();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const deckSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao baralho.").max(120, "Nome muito longo."),
  description: z.string().trim().max(1000).nullable().optional(),
  subjectId: optionalId,
  courseId: optionalId,
  bookId: optionalId,
  newPerDay: z.number().int().min(0).max(200).optional(),
});
const deckPatchSchema = deckSchema.partial().extend({ archived: z.boolean().optional() });

const cardSchema = z.object({
  front: z.string().trim().min(1, "A frente do cartão é obrigatória.").max(2000),
  back: z.string().trim().min(1, "O verso do cartão é obrigatório.").max(4000),
});
const createCardsSchema = z.object({
  cards: z.array(cardSchema).min(1, "Nenhum cartão enviado.").max(100, "Máximo de 100 cartões por vez."),
  source: z.enum(["manual", "ai"]).default("manual"),
});
const cardPatchSchema = cardSchema.partial().extend({ deckId: id.optional() });
const reviewSchema = z.object({ quality: z.number().int().min(0).max(5) });
const fromNoteSchema = z.object({ noteId: id, deckId: id, front: z.string().trim().max(2000).optional(), back: z.string().trim().max(4000).optional() });

const generateSchema = z.object({
  count: z.number().int().min(3).max(20).optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string().trim().min(1, "Cole um texto.").max(12_000, "Texto muito longo (máx. 12.000 caracteres).") }),
    z.object({ kind: z.literal("book_notes"), bookId: id, noteIds: z.array(id).max(60).optional() }),
    z.object({ kind: z.literal("journal"), entryDate: dayKey }),
  ]),
});

function fail(res: Response, e: unknown) {
  if (e instanceof GrimoireError) return res.status(e.status).json({ error: e.message });
  throw e;
}

function bad(res: Response, err: z.ZodError) {
  return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
}

// ---------------- Baralhos ----------------

/** GET /api/grimoire/decks?archived=1&subjectId=&bookId= */
grimoireRouter.get("/decks", async (req, res) => {
  const q = z
    .object({ archived: z.enum(["0", "1"]).optional(), subjectId: id.optional(), bookId: id.optional() })
    .safeParse(req.query);
  if (!q.success) return bad(res, q.error);
  res.json(await listDecks(getDb(), req.user!.id, { includeArchived: q.data.archived === "1", subjectId: q.data.subjectId, bookId: q.data.bookId }));
});

grimoireRouter.post("/decks", async (req, res) => {
  const parsed = deckSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const deckId = await createDeck(getDb(), req.user!.id, parsed.data);
    return res.status(201).json(await getDeck(getDb(), req.user!.id, deckId));
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.get("/decks/:id", async (req, res) => {
  try {
    return res.json(await getDeck(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.patch("/decks/:id", async (req, res) => {
  const parsed = deckPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    await updateDeck(getDb(), req.user!.id, req.params.id, parsed.data);
    return res.json(await getDeck(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.delete("/decks/:id", async (req, res) => {
  try {
    await deleteDeck(getDb(), req.user!.id, req.params.id);
    return res.status(204).send();
  } catch (e) {
    return fail(res, e);
  }
});

// ---------------- Cartões ----------------

grimoireRouter.get("/decks/:id/cards", async (req, res) => {
  try {
    return res.json(await listCards(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});

/** POST /api/grimoire/decks/:id/cards — manual ou confirmação das sugestões da IA. */
grimoireRouter.post("/decks/:id/cards", async (req, res) => {
  const parsed = createCardsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const cards = await createCards(getDb(), req.user!.id, req.params.id, parsed.data.cards, parsed.data.source);
    return res.status(201).json(cards);
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.patch("/cards/:id", async (req, res) => {
  const parsed = cardPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    return res.json(await updateCard(getDb(), req.user!.id, req.params.id, parsed.data));
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.delete("/cards/:id", async (req, res) => {
  try {
    await deleteCard(getDb(), req.user!.id, req.params.id);
    return res.status(204).send();
  } catch (e) {
    return fail(res, e);
  }
});

/** POST /api/grimoire/cards/from-note — "Virar cartão" a partir de uma citação da Biblioteca. */
grimoireRouter.post("/cards/from-note", async (req, res) => {
  const parsed = fromNoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const card = await cardFromBookNote(getDb(), req.user!.id, parsed.data.noteId, parsed.data.deckId, { front: parsed.data.front, back: parsed.data.back });
    return res.status(201).json(card);
  } catch (e) {
    return fail(res, e);
  }
});

// ---------------- Estudo ----------------

/** GET /api/grimoire/queue?deckId= — fila de hoje (vencidos + novos dentro do limite diário). */
grimoireRouter.get("/queue", async (req, res) => {
  const q = z.object({ deckId: id.optional() }).safeParse(req.query);
  if (!q.success) return bad(res, q.error);
  try {
    return res.json(await getDailyQueue(getDb(), req.user!.id, { deckId: q.data.deckId }));
  } catch (e) {
    return fail(res, e);
  }
});

grimoireRouter.post("/cards/:id/review", async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    return res.json(await reviewCard(getDb(), req.user!.id, req.params.id, parsed.data.quality));
  } catch (e) {
    return fail(res, e);
  }
});

/** GET /api/grimoire/stats?deckId=&days= */
grimoireRouter.get("/stats", async (req, res) => {
  const q = z.object({ deckId: id.optional(), days: z.coerce.number().int().min(7).max(90).optional() }).safeParse(req.query);
  if (!q.success) return bad(res, q.error);
  try {
    return res.json(await getStats(getDb(), req.user!.id, q.data));
  } catch (e) {
    return fail(res, e);
  }
});

// ---------------- IA (só propõe) ----------------

/** POST /api/grimoire/generate — Gemini propõe cartões; NADA é salvo aqui. */
grimoireRouter.post("/generate", aiRateLimit(), async (req, res) => {
  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  const result = await proposeCards(getDb(), req.user!.id, parsed.data.source, { count: parsed.data.count });
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  return res.json(result.data);
});
