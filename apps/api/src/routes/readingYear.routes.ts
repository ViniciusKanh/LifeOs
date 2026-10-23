import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ReadingYearError, deleteYearGoal, getReadingYearSummary, listQuotes, upsertYearGoal } from "../services/readingYearService.js";

/**
 * Biblioteca: meta anual de leitura (progresso derivado das fontes reais)
 * e mural de citações (book_notes do tipo citação/insight).
 */
export const readingYearRouter = Router();
readingYearRouter.use(requireAuth);

const yearSchema = z.coerce.number().int().min(2000).max(2100);
const target = (max: number) => z.number().int().min(1).max(max).nullable();
const goalSchema = z.object({ booksTarget: target(1000), pagesTarget: target(1_000_000) });

/** GET /api/reading/year?year=2026 */
readingYearRouter.get("/year", async (req, res) => {
  const q = z.object({ year: yearSchema.optional() }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Ano inválido." });
  res.json(await getReadingYearSummary(getDb(), req.user!.id, q.data.year));
});

/** PUT /api/reading/year/:year — cria ou altera a meta do ano. */
readingYearRouter.put("/year/:year", async (req, res) => {
  const year = yearSchema.safeParse(req.params.year);
  const body = goalSchema.safeParse(req.body ?? {});
  if (!year.success) return res.status(400).json({ error: "Ano inválido." });
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    await upsertYearGoal(getDb(), req.user!.id, year.data, body.data);
    return res.json(await getReadingYearSummary(getDb(), req.user!.id, year.data));
  } catch (e) {
    if (e instanceof ReadingYearError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

readingYearRouter.delete("/year/:year", async (req, res) => {
  const year = yearSchema.safeParse(req.params.year);
  if (!year.success) return res.status(400).json({ error: "Ano inválido." });
  try {
    await deleteYearGoal(getDb(), req.user!.id, year.data);
    return res.status(204).send();
  } catch (e) {
    if (e instanceof ReadingYearError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** GET /api/reading/quotes?bookId=&q=&kinds=quote,insight */
readingYearRouter.get("/quotes", async (req, res) => {
  const q = z
    .object({
      bookId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
      q: z.string().max(200).optional(),
      kinds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(",") : undefined))
        .pipe(z.array(z.enum(["quote", "insight", "note", "summary", "idea"])).optional()),
    })
    .safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Filtro inválido." });
  res.json(await listQuotes(getDb(), req.user!.id, q.data));
});
