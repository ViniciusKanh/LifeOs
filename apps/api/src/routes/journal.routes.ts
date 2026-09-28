import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { journalUpsertSchema, journalMediaCreateSchema, journalMediaUpdateSchema } from "../validators/journal.schema.js";
import {
  getJournalAutoData,
  getJournalInsights,
  listJournalDays,
  getJournalCalendarMonth,
  ensureJournalEntryId,
  getJournalMedia,
  addJournalMedia,
  updateJournalMediaCaption,
  deleteJournalMedia,
  setJournalFavorite,
  deleteJournalEntry,
} from "../services/journalService.js";

export const journalRouter = Router();
journalRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: string) {
  return DATE_RE.test(date);
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/journal/:date — entrada do Diário do dia, já mesclada com os
 * dados reais derivados de outros módulos (humor, sono, insight, foco
 * sugerido, livro atual). Sempre devolve um objeto (mesmo sem entrada
 * salva ainda), pra o front não precisar tratar 404 como caso especial.
 */
async function buildJournalResponse(db: ReturnType<typeof getDb>, ownerId: string, date: string) {
  const [entryRes, auto] = await Promise.all([
    db.execute({ sql: "SELECT * FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] }),
    getJournalAutoData(db, ownerId, date),
  ]);
  const row = entryRes.rows[0] as unknown as Record<string, unknown> | undefined;
  const journalIds = row
    ? (
        await db.execute({
          sql: "SELECT journal_id FROM journal_entry_journals WHERE entry_id = ?",
          args: [row.id as string],
        })
      ).rows.map((r) => (r as unknown as { journal_id: string }).journal_id)
    : [];
  const media = row ? await getJournalMedia(db, row.id as string) : [];
  return {
    date,
    intention: row?.intention ?? null,
    thoughts: row?.thoughts ?? null,
    gratitude: parseJsonArray(row?.gratitude),
    selfCare: parseJsonArray(row?.self_care),
    selfCareOther: row?.self_care_other ?? null,
    challenges: row?.challenges ?? null,
    lighterPlan: row?.lighter_plan ?? null,
    feelGood: row?.feel_good ?? null,
    nightMood: row?.night_mood ?? null,
    nightHelped: row?.night_helped ?? null,
    nightTakeaway: row?.night_takeaway ?? null,
    focusTaskIds: parseJsonArray(row?.focus_task_ids),
    journalIds,
    media,
    isFavorite: Number(row?.is_favorite ?? 0) === 1,
    auto,
  };
}

/**
 * Sincroniza os diários (coleções) vinculados a uma entrada — substitui a
 * associação inteira pelas ids recebidas, ignorando ids que não existam
 * ou não pertençam a este usuário (nunca vincula diário de outro dono).
 */
async function syncEntryJournals(db: ReturnType<typeof getDb>, ownerId: string, entryId: string, journalIds: string[]) {
  await db.execute({ sql: "DELETE FROM journal_entry_journals WHERE entry_id = ?", args: [entryId] });
  if (journalIds.length === 0) return;
  const ownedRes = await db.execute({
    sql: `SELECT id FROM journals WHERE owner_id = ? AND archived_at IS NULL AND id IN (${journalIds.map(() => "?").join(",")})`,
    args: [ownerId, ...journalIds],
  });
  const ownedIds = (ownedRes.rows as unknown as Array<{ id: string }>).map((r) => r.id);
  for (const journalId of ownedIds) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO journal_entry_journals (entry_id, journal_id) VALUES (?, ?)",
      args: [entryId, journalId],
    });
  }
}

/**
 * GET /api/journal/insights — estatísticas reais do hábito de escrever no
 * diário (streak, recorde, total de entradas e palavras). Precisa vir
 * ANTES de "/:date", senão "insights" seria interpretado como uma data.
 */
journalRouter.get("/insights", async (req, res) => {
  const db = getDb();
  return res.json(await getJournalInsights(db, req.user!.id));
});

/**
 * GET /api/journal/days — feed cronológico (aba "Entradas"): só dias com
 * conteúdo real escrito, paginado por cursor (?before=YYYY-MM-DD&limit=20).
 * Precisa vir ANTES de "/:date".
 */
journalRouter.get("/days", async (req, res) => {
  const before = typeof req.query.before === "string" && isValidDate(req.query.before) ? req.query.before : undefined;
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const journalId = typeof req.query.journalId === "string" ? req.query.journalId : undefined;
  const favoritesOnly = req.query.favoritesOnly === "1";
  const db = getDb();
  return res.json(await listJournalDays(db, req.user!.id, { before, limit, journalId, favoritesOnly }));
});

/**
 * GET /api/journal/calendar?month=YYYY-MM — datas do mês com entrada
 * real escrita (aba "Calendário"). Precisa vir ANTES de "/:date".
 */
journalRouter.get("/calendar", async (req, res) => {
  const month = req.query.month;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "Mês inválido. Use o formato YYYY-MM." });
  }
  const journalId = typeof req.query.journalId === "string" ? req.query.journalId : undefined;
  const db = getDb();
  return res.json({ days: await getJournalCalendarMonth(db, req.user!.id, month, journalId) });
});

journalRouter.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});

/** PATCH /api/journal/:date/favorite — marca/desmarca o dia como favorito (Fase 6). */
journalRouter.patch("/:date/favorite", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  if (typeof req.body?.isFavorite !== "boolean") {
    return res.status(400).json({ error: "isFavorite precisa ser um booleano." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  await setJournalFavorite(db, ownerId, date, req.body.isFavorite);
  return res.json(await buildJournalResponse(db, ownerId, date));
});

/**
 * DELETE /api/journal/:date — exclui a entrada do dia inteira (Fase 8:
 * privacidade/exclusão) — fotos, vínculos com diários e o registro em si.
 * Idempotente: excluir um dia que nunca teve entrada não é erro.
 */
journalRouter.delete("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  await deleteJournalEntry(db, req.user!.id, date);
  return res.status(204).end();
});

/**
 * POST /api/journal/:date/media — anexa uma foto à entrada do dia (Fase 4).
 * Cria a entrada vazia se ainda não existir (uma foto sozinha já conta como
 * registro do dia). A foto chega já comprimida do cliente como data URI.
 */
journalRouter.post("/:date/media", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalMediaCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const entryId = await ensureJournalEntryId(db, ownerId, date);
  const media = await addJournalMedia(db, ownerId, entryId, parsed.data.dataUri, parsed.data.caption ?? null);
  if (!media) {
    return res.status(400).json({ error: "Limite de fotos por dia atingido." });
  }
  return res.status(201).json(await buildJournalResponse(db, ownerId, date));
});

/** PATCH /api/journal/:date/media/:mediaId — atualiza a legenda de uma foto. */
journalRouter.patch("/:date/media/:mediaId", async (req, res) => {
  const { date, mediaId } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalMediaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const ok = await updateJournalMediaCaption(db, ownerId, mediaId, parsed.data.caption ?? null);
  if (!ok) return res.status(404).json({ error: "Foto não encontrada." });
  return res.json(await buildJournalResponse(db, ownerId, date));
});

/** DELETE /api/journal/:date/media/:mediaId — remove uma foto da entrada do dia. */
journalRouter.delete("/:date/media/:mediaId", async (req, res) => {
  const { date, mediaId } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const db = getDb();
  const ownerId = req.user!.id;
  const ok = await deleteJournalMedia(db, ownerId, mediaId);
  if (!ok) return res.status(404).json({ error: "Foto não encontrada." });
  return res.json(await buildJournalResponse(db, ownerId, date));
});

/** PUT /api/journal/:date — cria ou atualiza a entrada do dia (upsert). */
journalRouter.put("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const data = parsed.data;
  const db = getDb();
  const ownerId = req.user!.id;

  const existing = await db.execute({
    sql: "SELECT id FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
    args: [ownerId, date],
  });
  const existingRow = existing.rows[0] as unknown as { id: string } | undefined;

  const values = {
    intention: data.intention ?? null,
    thoughts: data.thoughts ?? null,
    gratitude: JSON.stringify(data.gratitude ?? []),
    self_care: JSON.stringify(data.selfCare ?? []),
    self_care_other: data.selfCareOther ?? null,
    challenges: data.challenges ?? null,
    lighter_plan: data.lighterPlan ?? null,
    feel_good: data.feelGood ?? null,
    night_mood: data.nightMood ?? null,
    night_helped: data.nightHelped ?? null,
    night_takeaway: data.nightTakeaway ?? null,
    focus_task_ids: JSON.stringify(data.focusTaskIds ?? []),
  };

  const entryId = existingRow?.id ?? nanoid();

  if (existingRow) {
    await db.execute({
      sql: `UPDATE journal_entries SET
              intention = ?, thoughts = ?, gratitude = ?, self_care = ?, self_care_other = ?,
              challenges = ?, lighter_plan = ?, feel_good = ?, night_mood = ?, night_helped = ?,
              night_takeaway = ?, focus_task_ids = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        values.intention,
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.challenges,
        values.lighter_plan,
        values.feel_good,
        values.night_mood,
        values.night_helped,
        values.night_takeaway,
        values.focus_task_ids,
        entryId,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO journal_entries
              (id, owner_id, entry_date, intention, thoughts, gratitude, self_care, self_care_other,
               challenges, lighter_plan, feel_good, night_mood, night_helped, night_takeaway, focus_task_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entryId,
        ownerId,
        date,
        values.intention,
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.challenges,
        values.lighter_plan,
        values.feel_good,
        values.night_mood,
        values.night_helped,
        values.night_takeaway,
        values.focus_task_ids,
      ],
    });
  }

  if (data.journalIds !== undefined) {
    await syncEntryJournals(db, ownerId, entryId, data.journalIds);
  }

  return res.json(await buildJournalResponse(db, ownerId, date));
});
