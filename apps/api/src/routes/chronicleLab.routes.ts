import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import {
  ChronicleError,
  explainLabResult,
  exportExperimentCsv,
  getLabHub,
  setExperimentGoal,
} from "../services/chronicleLabService.js";
import { getExperimentAnalysis } from "../services/experimentAnalysisService.js";

/**
 * /api/lab — Laboratório da Jornada 2.0 (o Diário foi removido do LifeOS).
 * Tudo por usuário autenticado. Nenhuma rota concede XP.
 */
export const labRouter = Router();
labRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(res: Response, err: unknown) {
  if (err instanceof ChronicleError) return res.status(err.status).json({ error: err.message });
  throw err;
}

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
