import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ChronicleEntryError, getEntryMeta, learningToGrimoire, scribeAssist, setWritingGoal, transcribeVoiceNote } from "../services/chronicleEntryService.js";

/**
 * Entrada do Diário 3.0 (/api/chronicle-entry). Leitura derivada + ações do
 * Escriba Arcano (sempre prévia, com consentimento explícito por chamada).
 * O salvamento do texto continua em PUT /api/journal/:date (fonte oficial).
 */
export const chronicleEntryRouter = Router();
chronicleEntryRouter.use(requireAuth);

const aiLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function fail(res: Response, err: unknown) {
  if (err instanceof ChronicleEntryError) return res.status(err.status).json({ error: err.message });
  console.error("[cronica] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}

chronicleEntryRouter.get("/:date/meta", async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: "Data inválida." });
  try {
    return res.json(await getEntryMeta(getDb(), req.user!.id, req.params.date));
  } catch (err) {
    return fail(res, err);
  }
});

chronicleEntryRouter.put("/settings/writing-goal", async (req, res) => {
  const p = z.object({ goal: z.number().int().min(50).max(5000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "A meta de escrita deve ficar entre 50 e 5000 palavras." });
  try {
    await setWritingGoal(getDb(), req.user!.id, p.data.goal);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

const scribeSchema = z.object({
  action: z.enum(["review", "organize", "summary", "title", "moments", "learnings", "tasks", "tags", "expand"]),
  consent: z.literal(true, { errorMap: () => ({ message: "Autorize o envio do texto ao Gemini para usar o Escriba." }) }),
});

chronicleEntryRouter.post("/:date/scribe", aiLimit, async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: "Data inválida." });
  const p = scribeSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await scribeAssist(getDb(), req.user!.id, req.params.date, p.data.action, p.data.consent));
  } catch (err) {
    return fail(res, err);
  }
});

chronicleEntryRouter.post("/media/:mediaId/transcribe", aiLimit, async (req, res) => {
  const p = z.object({ consent: z.literal(true, { errorMap: () => ({ message: "Autorize o envio do áudio ao Gemini para transcrever." }) }) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await transcribeVoiceNote(getDb(), req.user!.id, req.params.mediaId, p.data.consent));
  } catch (err) {
    return fail(res, err);
  }
});

chronicleEntryRouter.post("/:date/learning-to-grimoire", async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: "Data inválida." });
  const p = z.object({ text: z.string().trim().min(5).max(2000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Escreva o aprendizado (5 a 2000 caracteres)." });
  try {
    return res.json(await learningToGrimoire(getDb(), req.user!.id, req.params.date, p.data.text));
  } catch (err) {
    return fail(res, err);
  }
});
