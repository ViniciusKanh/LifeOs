path = "journal.routes.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_import = '''import {
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
} from "../services/journalService.js";'''
assert content.count(old_import) == 1
new_import = '''import {
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
  getJournalOnThisDay,
} from "../services/journalService.js";'''
content = content.replace(old_import, new_import)

old_anchor = '''journalRouter.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});'''
assert content.count(old_anchor) == 1
new_anchor = '''/**
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

journalRouter.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});'''
content = content.replace(old_anchor, new_anchor)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
