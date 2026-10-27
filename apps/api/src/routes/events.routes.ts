import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createEventSchema, updateEventSchema } from "../validators/event.schema.js";
import { insertManualEvent } from "../services/eventWriteService.js";
import { getCalendarItems } from "../services/calendarAggregationService.js";
import { getOrCreateIcsFeedUrl, regenerateIcsFeedUrl } from "../services/icsFeedService.js";

export const eventsRouter = Router();

// Toda rota exige sessão — req.user.id é a única fonte de verdade
// sobre "de quem" são os dados (nunca aceitar owner vindo do corpo).
eventsRouter.use(requireAuth);

/**
 * GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — visão unificada do
 * calendário (ver calendarAggregationService.ts). Sem `from`/`to`, devolve
 * os próximos 60 dias a partir de hoje.
 */
eventsRouter.get("/", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = (req.query.from as string) || today;
  const to = (req.query.to as string) || in60;

  const items = await getCalendarItems(db, ownerId, from, to);
  return res.json(items);
});

/**
 * GET /api/events/ics-feed — URL da assinatura de calendário externo (.ics)
 * do usuário (gera o token na primeira vez). Somente leitura: tarefas com
 * prazo + eventos do Calendário; ver icsFeedService.ts e a rota pública
 * GET /api/ics/:token.ics (ics.routes.ts, sem autenticação — quem consome é
 * o próprio app de calendário externo, não o navegador do usuário).
 */
eventsRouter.get("/ics-feed", async (req, res) => {
  const url = await getOrCreateIcsFeedUrl(getDb(), req.user!.id, req);
  return res.json({ url });
});

/** POST /api/events/ics-feed/regenerate — invalida a URL atual e gera uma nova (ex.: se o link vazou). */
eventsRouter.post("/ics-feed/regenerate", async (req, res) => {
  const url = await regenerateIcsFeedUrl(getDb(), req.user!.id, req);
  return res.json({ url });
});

/** POST /api/events — cria um evento manual */
eventsRouter.post("/", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const created = await insertManualEvent(getDb(), req.user!.id, parsed.data);
  return res.status(201).json(created);
});

/** PATCH /api/events/:id — só edita eventos manuais (os derivados de outras telas se editam na tela de origem) */
eventsRouter.patch("/:id", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id FROM events WHERE id = ? AND owner_id = ? AND source_type = 'manual'",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Evento não encontrado." });
  }

  const fieldMap: Record<string, string> = {
    title: "title",
    description: "description",
    startsAt: "starts_at",
    endsAt: "ends_at",
    allDay: "all_day",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in parsed.data) {
      const value = (parsed.data as Record<string, unknown>)[key];
      sets.push(`${column} = ?`);
      args.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as string | null));
    }
  }
  if (sets.length === 0) {
    const current = await db.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [req.params.id] });
    return res.json(current.rows[0]);
  }
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM events WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/events/:id — só remove eventos manuais */
eventsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM events WHERE id = ? AND owner_id = ? AND source_type = 'manual'",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Evento não encontrado (ou não pode ser removido por aqui)." });
  }
  return res.status(204).send();
});
