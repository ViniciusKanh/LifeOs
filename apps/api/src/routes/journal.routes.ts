import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { journalUpsertSchema, journalMediaCreateSchema, journalMediaUpdateSchema, journalPinSetSchema, journalPinVerifySchema, journalAudioCreateSchema, journalAiApplySchema, journalAiAssistSchema } from "../validators/journal.schema.js";
import { mimeFromDataUri } from "../validators/attachment.schema.js";
import { organizeJournalDay, applyJournalOrganization, clearJournalOrganization, assistJournalDay } from "../services/journalAIService.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { buildJournalEntryPdf } from "../services/journalPdfService.js";
import {
  getJournalAutoData,
  getJournalInsights,
  listJournalDays,
  getJournalCalendarMonth,
  ensureJournalEntryId,
  getJournalMedia,
  addJournalMedia,
  updateJournalMediaDetails,
  journalMediaKindFromMime,
  deleteJournalMedia,
  setJournalFavorite,
  setJournalTags,
  deleteJournalEntry,
  getJournalOnThisDay,
  getJournalPinStatus,
  setJournalPin,
  verifyJournalPin,
  removeJournalPin,
  getJournalEntryLinks,
  addJournalEntryLink,
  removeJournalEntryLink,
  moveJournalEntryDate,
  getJournalLocations,
  getJournalDaysByLocation,
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

/** Organização por IA já confirmada pelo usuário (null quando nunca foi salva). */
function parseAiOrganization(row: Record<string, unknown> | undefined) {
  if (!row?.ai_organized_at) return null;
  let categories: Array<{ name: string; points: string[] }> = [];
  try {
    const parsed = JSON.parse((row.ai_categories as string) || "[]");
    if (Array.isArray(parsed)) categories = parsed;
  } catch {
    categories = [];
  }
  return {
    title: (row.ai_title as string | null) ?? null,
    summary: (row.ai_summary as string | null) ?? null,
    categories,
    organizedAt: row.ai_organized_at as string,
  };
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
  const links = row ? await getJournalEntryLinks(db, row.id as string) : [];
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
    locationLabel: row?.location_label ?? null,
    locationLat: row?.location_lat ?? null,
    locationLng: row?.location_lng ?? null,
    tags: parseJsonArray(row?.tags),
    links,
    ai: parseAiOrganization(row),
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

/** GET /api/journal/pin/status — se o Diário tem PIN de privacidade ativo (Fase 12). Nunca expõe o hash. */
journalRouter.get("/pin/status", async (req, res) => {
  const db = getDb();
  return res.json(await getJournalPinStatus(db, req.user!.id));
});

/** POST /api/journal/pin — define ou troca o PIN do Diário (Fase 12). */
journalRouter.post("/pin", async (req, res) => {
  const parsed = journalPinSetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "PIN inválido." });
  const db = getDb();
  await setJournalPin(db, req.user!.id, parsed.data.pin);
  return res.status(204).end();
});

/** POST /api/journal/pin/verify — confere o PIN pra desbloquear o Diário nesta sessão (Fase 12). */
journalRouter.post("/pin/verify", async (req, res) => {
  const parsed = journalPinVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "PIN inválido." });
  const db = getDb();
  const valid = await verifyJournalPin(db, req.user!.id, parsed.data.pin);
  return res.json({ valid });
});

/** DELETE /api/journal/pin — remove o bloqueio de privacidade do Diário (Fase 12); exige o PIN atual. */
journalRouter.delete("/pin", async (req, res) => {
  const parsed = journalPinVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "PIN inválido." });
  const db = getDb();
  const valid = await verifyJournalPin(db, req.user!.id, parsed.data.pin);
  if (!valid) return res.status(401).json({ error: "PIN incorreto." });
  await removeJournalPin(db, req.user!.id);
  return res.status(204).end();
});

/**
 * GET /api/journal/on-this-day?date=YYYY-MM-DD — "Lembranças" (Fase 10):
 * entradas reais de anos anteriores no mesmo dia/mês (padrão: hoje).
 * Precisa vir ANTES de "/:date".
 */
journalRouter.get("/on-this-day", async (req, res) => {
  const raw = typeof req.query.date === "string" ? req.query.date : undefined;
  const date = raw && isValidDate(raw) ? raw : new Date().toISOString().slice(0, 10);
  const db = getDb();
  return res.json({ items: await getJournalOnThisDay(db, req.user!.id, date) });
});

/**
 * GET /api/journal/locations — locais reais (aba "Lugares"), agrupados
 * a partir de journal_entries.location_label. Precisa vir ANTES de
 * "/:date". Sem parâmetros: sempre os dados atuais, nunca cacheado.
 */
journalRouter.get("/locations", async (req, res) => {
  const db = getDb();
  return res.json({ items: await getJournalLocations(db, req.user!.id) });
});

/**
 * GET /api/journal/locations/:label/days — dias reais escritos naquele
 * local exato (clique num pino/local da aba "Lugares"). Precisa vir
 * ANTES de "/:date".
 */
journalRouter.get("/locations/:label/days", async (req, res) => {
  const db = getDb();
  const label = decodeURIComponent(req.params.label);
  return res.json({ items: await getJournalDaysByLocation(db, req.user!.id, label) });
});

journalRouter.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});

/**
 * PATCH /api/journal/:date/date — "Alterar data" do menu do card: move a
 * entrada inteira pra outro dia. Recusa se o destino já tiver entrada
 * própria (nunca mescla ou sobrescreve em silêncio).
 */
journalRouter.patch("/:date/date", async (req, res) => {
  const { date } = req.params;
  const newDate = req.body?.newDate;
  if (!isValidDate(date) || typeof newDate !== "string" || !isValidDate(newDate)) {
    return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const result = await moveJournalEntryDate(db, ownerId, date, newDate);
  if (!result.ok) return res.status(409).json({ error: result.reason ?? "Não foi possível mover a entrada." });
  return res.json(await buildJournalResponse(db, ownerId, newDate));
});

/**
 * POST /api/journal/:date/links — "Vincular a projeto/meta" do menu do
 * card: liga o dia a um projeto ou meta real do usuário autenticado.
 */
journalRouter.post("/:date/links", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const targetType = req.body?.targetType;
  const targetId = req.body?.targetId;
  if ((targetType !== "project" && targetType !== "goal") || typeof targetId !== "string" || !targetId) {
    return res.status(400).json({ error: "targetType precisa ser 'project' ou 'goal', e targetId é obrigatório." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const ok = await addJournalEntryLink(db, ownerId, date, targetType, targetId);
  if (!ok) return res.status(404).json({ error: "Projeto ou meta não encontrado(a)." });
  return res.json(await buildJournalResponse(db, ownerId, date));
});

/** DELETE /api/journal/:date/links/:linkId — remove um vínculo de projeto/meta da entrada. */
journalRouter.delete("/:date/links/:linkId", async (req, res) => {
  const { date, linkId } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  const ownerId = req.user!.id;
  await removeJournalEntryLink(db, ownerId, linkId);
  return res.json(await buildJournalResponse(db, ownerId, date));
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

/** PATCH /api/journal/:date/tags — atualiza só as etiquetas do dia (menu "Adicionar etiquetas" do card). */
journalRouter.patch("/:date/tags", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const tags = req.body?.tags;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    return res.status(400).json({ error: "tags precisa ser uma lista de strings." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  await setJournalTags(db, ownerId, date, tags);
  return res.json(await buildJournalResponse(db, ownerId, date));
});

/**
 * PATCH /api/journal/:date/journals — move/associa o dia a um conjunto de
 * diários (coleções), sem tocar em nenhum outro campo da entrada — ao
 * contrário do PUT /:date (que é um upsert completo e zeraria o resto do
 * dia se recebesse só journalIds). Usado pelo menu "Mover para diário" do
 * card no feed "Entradas".
 */
journalRouter.patch("/:date/journals", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const journalIds = req.body?.journalIds;
  if (!Array.isArray(journalIds) || !journalIds.every((id) => typeof id === "string")) {
    return res.status(400).json({ error: "journalIds precisa ser uma lista de strings." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const entryId = await ensureJournalEntryId(db, ownerId, date);
  await syncEntryJournals(db, ownerId, entryId, journalIds);
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
 * GET /api/journal/:date/export/pdf — "Compartilhar entrada" (Fase 16):
 * gera um PDF de uma única entrada do dia, com o mesmo conteúdo real do
 * editor (texto, gratidão, fotos, humor/energia). Nunca inclui dados de
 * outro dia nem de outro usuário — sempre o dono autenticado.
 */
journalRouter.get("/:date/export/pdf", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  const entry = await buildJournalResponse(db, req.user!.id, date);
  const pdf = await buildJournalEntryPdf(entry as unknown as Parameters<typeof buildJournalEntryPdf>[0]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="diario-${date}.pdf"`);
  return res.send(pdf);
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
  // O tipo (foto/vídeo/PDF) vem do MIME real do data URI, nunca de um campo à parte.
  const mimeType = mimeFromDataUri(parsed.data.dataUri);
  const media = await addJournalMedia(
    db,
    ownerId,
    entryId,
    parsed.data.dataUri,
    parsed.data.caption ?? null,
    journalMediaKindFromMime(mimeType),
    null,
    { story: parsed.data.story ?? null, fileName: parsed.data.fileName ?? null, mimeType }
  );
  if (!media) {
    return res.status(400).json({ error: "Limite de mídias por dia atingido." });
  }
  return res.status(201).json(await buildJournalResponse(db, ownerId, date));
});

/**
 * POST /api/journal/:date/media/audio — anexa uma nota de voz à entrada
 * do dia (Fase 13). Gravada no navegador (MediaRecorder) e enviada já
 * como data URI, igual ao padrão das fotos.
 */
journalRouter.post("/:date/media/audio", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalAudioCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const entryId = await ensureJournalEntryId(db, ownerId, date);
  const media = await addJournalMedia(db, ownerId, entryId, parsed.data.dataUri, parsed.data.caption ?? null, "audio", parsed.data.durationSeconds);
  if (!media) {
    return res.status(400).json({ error: "Limite de itens de mídia por dia atingido." });
  }
  return res.status(201).json(await buildJournalResponse(db, ownerId, date));
});

/** PATCH /api/journal/:date/media/:mediaId — atualiza a legenda e/ou a história de uma mídia. */
journalRouter.patch("/:date/media/:mediaId", async (req, res) => {
  const { date, mediaId } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalMediaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const ok = await updateJournalMediaDetails(db, ownerId, mediaId, {
    caption: parsed.data.caption,
    story: parsed.data.story,
  });
  if (!ok) return res.status(404).json({ error: "Mídia não encontrada." });
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

/**
 * POST /api/journal/:date/ai/organize — o Gemini SUGERE uma organização por
 * temas do dia (título, resumo, temas e categoria de cada mídia). Não grava
 * nada: a UI mostra a prévia e só salva após confirmação (rota /apply).
 */
journalRouter.post("/:date/ai/organize", rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const result = await organizeJournalDay(getDb(), req.user!.id, date);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  return res.json(result.suggestion);
});

/**
 * POST /api/journal/:date/ai/assist — ajuda a escrever o dia (perguntas sobre
 * o que de fato aconteceu, rascunho e sugestões para amanhã). Só sugere: o
 * texto do usuário não é alterado aqui.
 */
journalRouter.post("/:date/ai/assist", rateLimit({ windowMs: 60_000, max: 8 }), async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const parsed = journalAiAssistSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const result = await assistJournalDay(getDb(), req.user!.id, date, parsed.data.notes ?? null);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  return res.json(result.assist);
});

/** POST /api/journal/:date/ai/organize/apply — salva a organização que o usuário confirmou. */
journalRouter.post("/:date/ai/organize/apply", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const parsed = journalAiApplySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const db = getDb();
  const ok = await applyJournalOrganization(db, req.user!.id, date, parsed.data);
  if (!ok) return res.status(404).json({ error: "Entrada do dia não encontrada." });
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});

/** DELETE /api/journal/:date/ai/organize — descarta a organização por IA (o texto original fica intacto). */
journalRouter.delete("/:date/ai/organize", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  await clearJournalOrganization(db, req.user!.id, date);
  return res.json(await buildJournalResponse(db, req.user!.id, date));
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

  // Desde a 0050 o diário é texto corrido: intention, challenges, lighter_plan,
  // feel_good, night_helped e night_mood não são mais gravados por aqui — o que
  // já existia foi movido para thoughts (ou, no caso do humor, segue como
  // registro antigo). Assim um cliente novo nunca apaga dado não migrado.
  const values = {
    thoughts: data.thoughts ?? null,
    gratitude: JSON.stringify(data.gratitude ?? []),
    self_care: JSON.stringify(data.selfCare ?? []),
    self_care_other: data.selfCareOther ?? null,
    night_takeaway: data.nightTakeaway ?? null,
    focus_task_ids: JSON.stringify(data.focusTaskIds ?? []),
    location_label: data.locationLabel ?? null,
    location_lat: data.locationLat ?? null,
    location_lng: data.locationLng ?? null,
    tags: JSON.stringify(data.tags ?? []),
  };

  const entryId = existingRow?.id ?? nanoid();

  if (existingRow) {
    await db.execute({
      sql: `UPDATE journal_entries SET
              thoughts = ?, gratitude = ?, self_care = ?, self_care_other = ?, night_takeaway = ?,
              focus_task_ids = ?, location_label = ?, location_lat = ?, location_lng = ?, tags = ?,
              updated_at = datetime('now')
            WHERE id = ? AND owner_id = ?`,
      args: [
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.night_takeaway,
        values.focus_task_ids,
        values.location_label,
        values.location_lat,
        values.location_lng,
        values.tags,
        entryId,
        ownerId,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO journal_entries
              (id, owner_id, entry_date, thoughts, gratitude, self_care, self_care_other, night_takeaway,
               focus_task_ids, location_label, location_lat, location_lng, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entryId,
        ownerId,
        date,
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.night_takeaway,
        values.focus_task_ids,
        values.location_label,
        values.location_lat,
        values.location_lng,
        values.tags,
      ],
    });
  }

  if (data.journalIds !== undefined) {
    await syncEntryJournals(db, ownerId, entryId, data.journalIds);
  }

  return res.json(await buildJournalResponse(db, ownerId, date));
});
