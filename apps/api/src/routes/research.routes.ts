import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  addQuote,
  createCategory,
  createReadingTask,
  deleteCategory,
  deletePaper,
  deleteQuote,
  exportReferences,
  getLibraryHub,
  getPaperDetail,
  listLibrary,
  PAPER_STATUSES,
  previewDoi,
  relatedWorks,
  renameCategory,
  reorderCategories,
  ResearchError,
  REVIEW_FIELDS,
  savePaper,
  saveReview,
  saveSettings,
  updatePaper,
} from "../services/researchLibraryService.js";

/** Biblioteca do Mestrado (/api/research): artigos por DOI, leitura, fichamento e referências. */
export const researchRouter = Router();
researchRouter.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof ResearchError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
  console.error("[biblioteca-mestrado] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação na Biblioteca do Mestrado." });
}
const wrap = (fn: (req: import("express").Request, res: Response) => Promise<unknown>) => async (req: import("express").Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (err) {
    fail(res, err);
  }
};

// Consultas às APIs acadêmicas: limite próprio para não abusar das fontes públicas.
const lookupLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: "Muitas consultas seguidas às bases acadêmicas. Aguarde um instante." });

const author = z.object({ name: z.string().trim().min(1).max(200), given: z.string().max(150).nullable(), family: z.string().max(150).nullable() });
const overrides = z
  .object({
    title: z.string().trim().min(1).max(500),
    authors: z.array(author).max(100),
    year: z.number().int().min(1000).max(2100).nullable(),
    venue: z.string().max(300).nullable(),
    volume: z.string().max(30).nullable(),
    issue: z.string().max(30).nullable(),
    pages: z.string().max(30).nullable(),
    publisher: z.string().max(200).nullable(),
    abstract: z.string().max(10000).nullable(),
    url: z.string().url().max(500).nullable(),
  })
  .partial()
  .strict();
const status = z.enum(PAPER_STATUSES);
const priority = z.enum(["baixa", "media", "alta"]);

researchRouter.get("/", wrap(async (req, res) => res.json(await getLibraryHub(getDb(), req.user!.id))));

researchRouter.get(
  "/papers",
  wrap(async (req, res) => {
    const f = z
      .object({
        q: z.string().max(200).optional(),
        status: status.optional(),
        categoryId: z.string().max(40).optional(),
        projectId: z.string().max(40).optional(),
        year: z.coerce.number().int().optional(),
        venue: z.string().max(200).optional(),
        favorite: z.enum(["1", "true"]).optional(),
        tag: z.string().max(40).optional(),
        sort: z.enum(["position", "recent", "year", "citations", "title"]).optional(),
      })
      .parse(req.query);
    res.json(await listLibrary(getDb(), req.user!.id, { ...f, favorite: !!f.favorite }));
  }),
);

researchRouter.get("/doi", lookupLimit, wrap(async (req, res) => res.json(await previewDoi(getDb(), req.user!.id, z.string().min(4).max(300).parse(req.query.doi)))));

researchRouter.post(
  "/papers",
  lookupLimit,
  wrap(async (req, res) => {
    const p = z
      .object({ doi: z.string().min(4).max(300), overrides: overrides.optional(), academicProjectId: z.string().max(40).nullable().optional(), categoryId: z.string().max(40).nullable().optional(), status: status.optional(), priority: priority.optional() })
      .strict()
      .parse(req.body);
    res.status(201).json(await savePaper(getDb(), req.user!.id, p));
  }),
);

researchRouter.get("/papers/:id", wrap(async (req, res) => res.json(await getPaperDetail(getDb(), req.user!.id, req.params.id))));

researchRouter.patch(
  "/papers/:id",
  wrap(async (req, res) => {
    const p = z
      .object({
        status: status,
        priority: priority,
        progress: z.number().int().min(0).max(100),
        favorite: z.boolean(),
        tags: z.array(z.string().trim().min(1).max(40)).max(15),
        notes: z.string().max(5000).nullable(),
        categoryId: z.string().max(40).nullable(),
        academicProjectId: z.string().max(40).nullable(),
        chapter: z.string().max(120).nullable(),
        position: z.number().int().min(0).max(100000),
        overrides,
      })
      .partial()
      .strict()
      .parse(req.body);
    res.json(await updatePaper(getDb(), req.user!.id, req.params.id, p));
  }),
);

researchRouter.delete(
  "/papers/:id",
  wrap(async (req, res) => {
    await deletePaper(getDb(), req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

researchRouter.put(
  "/papers/:id/review",
  wrap(async (req, res) => {
    const p = z.object(Object.fromEntries(REVIEW_FIELDS.map((k) => [k, z.string().max(8000)])) as Record<(typeof REVIEW_FIELDS)[number], z.ZodString>).partial().strict().parse(req.body);
    res.json(await saveReview(getDb(), req.user!.id, req.params.id, p));
  }),
);

researchRouter.post(
  "/papers/:id/quotes",
  wrap(async (req, res) => {
    const p = z.object({ text: z.string().trim().min(1).max(3000), page: z.string().trim().max(20).nullable().optional(), comment: z.string().trim().max(2000).nullable().optional() }).strict().parse(req.body);
    res.status(201).json(await addQuote(getDb(), req.user!.id, req.params.id, p));
  }),
);

researchRouter.delete(
  "/quotes/:quoteId",
  wrap(async (req, res) => {
    await deleteQuote(getDb(), req.user!.id, req.params.quoteId);
    res.status(204).send();
  }),
);

researchRouter.get(
  "/papers/:id/related",
  lookupLimit,
  wrap(async (req, res) => res.json(await relatedWorks(getDb(), req.user!.id, req.params.id, z.enum(["related", "references", "citing"]).catch("related").parse(req.query.kind)))),
);

researchRouter.post("/papers/:id/task", wrap(async (req, res) => res.status(201).json(await createReadingTask(getDb(), req.user!.id, req.params.id))));

researchRouter.post(
  "/export",
  wrap(async (req, res) => {
    const p = z.object({ format: z.enum(["abnt", "apa", "bibtex", "ris"]), ids: z.array(z.string().max(40)).max(500).nullable().optional() }).strict().parse(req.body);
    res.json(await exportReferences(getDb(), req.user!.id, p.ids ?? null, p.format));
  }),
);

researchRouter.post("/categories", wrap(async (req, res) => res.status(201).json(await createCategory(getDb(), req.user!.id, z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body).name))));
researchRouter.patch(
  "/categories/:id",
  wrap(async (req, res) => {
    await renameCategory(getDb(), req.user!.id, req.params.id, z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body).name);
    res.status(204).send();
  }),
);
researchRouter.delete(
  "/categories/:id",
  wrap(async (req, res) => {
    await deleteCategory(getDb(), req.user!.id, req.params.id);
    res.status(204).send();
  }),
);
researchRouter.put(
  "/categories/order",
  wrap(async (req, res) => {
    await reorderCategories(getDb(), req.user!.id, z.object({ ids: z.array(z.string().max(40)).max(100) }).parse(req.body).ids);
    res.status(204).send();
  }),
);

researchRouter.put(
  "/settings",
  wrap(async (req, res) => {
    const p = z.object({ weeklyGoal: z.number().int().min(0).max(50), activeProjectId: z.string().max(40).nullable() }).partial().strict().parse(req.body);
    res.json(await saveSettings(getDb(), req.user!.id, p));
  }),
);
