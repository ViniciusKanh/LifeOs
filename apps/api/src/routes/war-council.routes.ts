import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { buildProposal, FOCUS_TYPES, getCouncilOverview, MAX_FOCUS, sealPlan, WarCouncilError } from "../services/warCouncilService.js";

/** Conselho de Guerra — planejamento da semana. Só POST /seal grava. */
export const warCouncilRouter = Router();
warCouncilRouter.use(requireAuth);

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");
const focusSchema = z.array(z.object({ type: z.enum(FOCUS_TYPES), id: z.string().min(1).max(64) })).max(MAX_FOCUS, `Escolha no máximo ${MAX_FOCUS} focos.`);

const proposalSchema = z.object({ weekStart: DAY, focus: focusSchema.default([]) });

const sealSchema = z.object({
  weekStart: DAY,
  focus: focusSchema.default([]),
  notes: z.string().trim().max(2000).nullable().optional(),
  assignments: z.array(z.object({ taskId: z.string().min(1).max(64), plannedDate: DAY.nullable() })).max(200),
  events: z
    .array(
      z.object({
        taskId: z.string().min(1).max(64),
        date: DAY,
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário deve estar no formato HH:MM"),
        durationMinutes: z.number().int().min(15).max(480),
      }),
    )
    .max(50)
    .optional(),
});

function fail(res: Response, err: unknown) {
  if (err instanceof WarCouncilError) return res.status(err.status).json({ error: err.message });
  console.error("[conselho] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir o Conselho de Guerra." });
}

/** GET /api/war-council?weekStart=YYYY-MM-DD — semana, focos disponíveis, plano e aderência. */
warCouncilRouter.get("/", async (req, res) => {
  const raw = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
  if (raw !== undefined && !DAY.safeParse(raw).success) return res.status(400).json({ error: "Semana inválida." });
  try {
    return res.json(await getCouncilOverview(getDb(), req.user!.id, raw));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/war-council/proposal — candidatas + distribuição sugerida (não grava). */
warCouncilRouter.post("/proposal", async (req, res) => {
  const parsed = proposalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await buildProposal(getDb(), req.user!.id, parsed.data.weekStart, parsed.data.focus));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/war-council/seal — grava datas planejadas, blocos na Agenda e o plano. */
warCouncilRouter.post("/seal", async (req, res) => {
  const parsed = sealSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await sealPlan(getDb(), req.user!.id, parsed.data));
  } catch (err) {
    return fail(res, err);
  }
});
