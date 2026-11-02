import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import {
  ChronicleError,
  deleteRetrospective,
  explainLabResult,
  exportExperimentCsv,
  generateRetrospective,
  getChronicleHub,
  getDayContext,
  getLabHub,
  saveRetrospective,
  sendNoteToExperiment,
  setExperimentGoal,
} from "../services/chronicleLabService.js";
import { getExperimentAnalysis } from "../services/experimentAnalysisService.js";

/**
 * /api/chronicle e /api/lab — Diário da Jornada 2.0 e Laboratório 2.0.
 * Tudo por usuário autenticado. Nenhuma rota concede XP; o texto do Diário só
 * vai para a IA quando o corpo traz `useAi: true` (pedido explícito do usuário).
 */
export const chronicleRouter = Router();
export const labRouter = Router();
chronicleRouter.use(requireAuth);
labRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(res: Response, err: unknown) {
  if (err instanceof ChronicleError) return res.status(err.status).json({ error: err.message });
  throw err;
}

chronicleRouter.get("/hub", async (req, res) => res.json(await getChronicleHub(getDb(), req.user!.id)));

chronicleRouter.get("/context/:date", async (req, res) => {
  const d = day.safeParse(req.params.date);
  if (!d.success) return res.status(400).json({ error: "Data inválida." });
  return res.json(await getDayContext(getDb(), req.user!.id, d.data));
});

const retroGen = z.object({ weekStart: day, useAi: z.boolean().default(false) });
chronicleRouter.post("/retro/generate", aiRateLimit(), async (req, res) => {
  const b = retroGen.safeParse(req.body ?? {});
  if (!b.success) return res.status(400).json({ error: "Semana inválida." });
  try {
    return res.json(await generateRetrospective(getDb(), req.user!.id, b.data.weekStart, b.data.useAi));
  } catch (e) {
    return fail(res, e);
  }
});
chronicleRouter.put("/retro/:weekStart", async (req, res) => {
  const w = day.safeParse(req.params.weekStart);
  const b = z.object({ content: z.string().trim().min(1).max(8000) }).safeParse(req.body ?? {});
  if (!w.success || !b.success) return res.status(400).json({ error: "Retrospectiva inválida." });
  await saveRetrospective(getDb(), req.user!.id, w.data, b.data.content);
  return res.json({ ok: true });
});
chronicleRouter.delete("/retro/:weekStart", async (req, res) => {
  const w = day.safeParse(req.params.weekStart);
  if (!w.success) return res.status(400).json({ error: "Semana inválida." });
  return (await deleteRetrospective(getDb(), req.user!.id, w.data)) ? res.status(204).end() : res.status(404).json({ error: "Retrospectiva não encontrada." });
});

const noteSchema = z.object({ experimentId: id, text: z.string().trim().min(1).max(1500) });
chronicleRouter.post("/:date/experiment-note", async (req, res) => {
  const d = day.safeParse(req.params.date);
  const b = noteSchema.safeParse(req.body ?? {});
  if (!d.success || !b.success) return res.status(400).json({ error: "Observação inválida." });
  try {
    return res.json(await sendNoteToExperiment(getDb(), req.user!.id, d.data, b.data.experimentId, b.data.text));
  } catch (e) {
    return fail(res, e);
  }
});

// ---------------- Laboratório ----------------
labRouter.get("/hub", async (req, res) => res.json(await getLabHub(getDb(), req.user!.id)));

labRouter.patch("/experiments/:id/goal", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = z.object({ goalId: id.nullable() }).safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await setExperimentGoal(getDb(), req.user!.id, i.data, b.data.goalId);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

labRouter.get("/experiments/:id/export.csv", async (req, res) => {
  const i = id.safeParse(req.params.id);
  if (!i.success) return res.status(400).json({ error: "Experimento inválido." });
  try {
    const csv = await exportExperimentCsv(getDb(), req.user!.id, i.data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="experimento-${i.data}.csv"`);
    return res.send(csv);
  } catch (e) {
    return fail(res, e);
  }
});

/** Explica a análise de um experimento só com os números calculados pelo servidor. */
labRouter.post("/experiments/:id/explain", aiRateLimit(), async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = z.object({ question: z.string().max(300).optional() }).safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Dados inválidos." });
  let a;
  try {
    a = await getExperimentAnalysis(getDb(), req.user!.id, i.data);
  } catch {
    return res.status(404).json({ error: "Experimento não encontrado." });
  }
  const facts = [
    `Leitura geral: ${a.verdict.title} — ${a.verdict.text}`,
    `Critério de sucesso: ${a.success.message}`,
    ...a.metrics.map(
      (m) =>
        `${m.label}${m.isPrimary ? " (principal)" : ""}: antes média ${m.before.mean ?? "—"} (n=${m.before.n}), durante média ${m.during.mean ?? "—"} (n=${m.during.n}), cobertura ${m.coveragePct}% dos dias. Efeito: ${JSON.stringify(m.effect).slice(0, 200)}`,
    ),
    `Percepção registrada: média ${a.perception.avg ?? "—"} em ${a.perception.total} registro(s).`,
    a.overlaps.length ? `Experimentos simultâneos (possível confusão): ${a.overlaps.map((o) => o.title).join(", ")}.` : "Sem outros experimentos simultâneos.",
  ];
  return res.json(await explainLabResult(facts, b.data.question));
});
