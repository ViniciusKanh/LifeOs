path = "journalService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1) Extract the enrichment/mapping block (mood, journal links, photos) out of
# listJournalDays into a reusable helper, so getJournalOnThisDay (Fase 10) can
# share the exact same real-data enrichment instead of duplicating it.
old_block = '''  const result = await db.execute({
    sql: `SELECT * FROM journal_entries WHERE ${conditions.join(" AND ")} ORDER BY entry_date DESC LIMIT ?`,
    args: [...args, limit + 1],
  });
  const rows = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const moodByDate = new Map<string, { mood: number; energy: number }>();
  const journalIdsByEntry = new Map<string, string[]>();
  const photoCountByEntry = new Map<string, number>();
  const coverPhotoByEntry = new Map<string, string>();
  if (page.length > 0) {
    const dates = page.map((r) => String(r.entry_date));
    const placeholders = dates.map(() => "?").join(",");
    const moodRes = await db.execute({
      // Um registro de humor por dia (o mais recente) — window function em
      // vez de GROUP BY, pra não depender de comportamento implícito do SQLite.
      sql: `SELECT d, mood, energy FROM (
              SELECT date(recorded_at) AS d, mood, energy,
                     ROW_NUMBER() OVER (PARTITION BY date(recorded_at) ORDER BY recorded_at DESC) AS rn
              FROM mood_entries
              WHERE owner_id = ? AND date(recorded_at) IN (${placeholders})
            ) WHERE rn = 1`,
      args: [ownerId, ...dates],
    });
    for (const r of moodRes.rows as unknown as Array<{ d: string; mood: number; energy: number }>) {
      moodByDate.set(r.d, { mood: r.mood, energy: r.energy });
    }

    const entryIds = page.map((r) => String(r.id));
    const entryPlaceholders = entryIds.map(() => "?").join(",");
    const journalLinksRes = await db.execute({
      sql: `SELECT entry_id, journal_id FROM journal_entry_journals WHERE entry_id IN (${entryPlaceholders})`,
      args: entryIds,
    });
    for (const r of journalLinksRes.rows as unknown as Array<{ entry_id: string; journal_id: string }>) {
      const list = journalIdsByEntry.get(r.entry_id) ?? [];
      list.push(r.journal_id);
      journalIdsByEntry.set(r.entry_id, list);
    }

    const mediaCountRes = await db.execute({
      sql: `SELECT entry_id, COUNT(*) AS total FROM journal_entry_media WHERE entry_id IN (${entryPlaceholders}) GROUP BY entry_id`,
      args: entryIds,
    });
    for (const r of mediaCountRes.rows as unknown as Array<{ entry_id: string; total: number }>) {
      photoCountByEntry.set(r.entry_id, Number(r.total));
    }
    const coverPhotoRes = await db.execute({
      sql: `SELECT entry_id, data_uri FROM (
              SELECT entry_id, data_uri,
                     ROW_NUMBER() OVER (PARTITION BY entry_id ORDER BY sort_order ASC, created_at ASC) AS rn
              FROM journal_entry_media
              WHERE entry_id IN (${entryPlaceholders})
            ) WHERE rn = 1`,
      args: entryIds,
    });
    for (const r of coverPhotoRes.rows as unknown as Array<{ entry_id: string; data_uri: string }>) {
      coverPhotoByEntry.set(r.entry_id, r.data_uri);
    }
  }

  const items: JournalDaySummary[] = page.map((row) => ({
    date: String(row.entry_date),
    preview: buildPreview(row),
    wordCount: WRITTEN_FIELDS.reduce((s, f) => s + countWords(row[f] as string | null), 0),
    gratitudeCount: parseJsonArraySafe(row.gratitude as string | undefined).length,
    selfCareCount: parseJsonArraySafe(row.self_care as string | undefined).length,
    nightMood: (row.night_mood as number | null) ?? null,
    mood: moodByDate.get(String(row.entry_date)) ?? null,
    journalIds: journalIdsByEntry.get(String(row.id)) ?? [],
    photoCount: photoCountByEntry.get(String(row.id)) ?? 0,
    coverPhoto: coverPhotoByEntry.get(String(row.id)) ?? null,
    isFavorite: Number(row.is_favorite ?? 0) === 1,
  }));

  return { items, hasMore };
}'''
assert content.count(old_block) == 1
new_block = '''  const result = await db.execute({
    sql: `SELECT * FROM journal_entries WHERE ${conditions.join(" AND ")} ORDER BY entry_date DESC LIMIT ?`,
    args: [...args, limit + 1],
  });
  const rows = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const items = await enrichEntrySummaries(db, ownerId, page);
  return { items, hasMore };
}

/**
 * Enriquece linhas cruas de journal_entries com o mesmo dado real usado no
 * feed "Entradas" (humor do dia, diários vinculados, contagem e capa de
 * fotos) — compartilhado entre listJournalDays e getJournalOnThisDay
 * (Fase 10) pra nunca duplicar essa lógica.
 */
async function enrichEntrySummaries(db: Db, ownerId: string, page: Array<Record<string, unknown>>): Promise<JournalDaySummary[]> {
  const moodByDate = new Map<string, { mood: number; energy: number }>();
  const journalIdsByEntry = new Map<string, string[]>();
  const photoCountByEntry = new Map<string, number>();
  const coverPhotoByEntry = new Map<string, string>();
  if (page.length > 0) {
    const dates = page.map((r) => String(r.entry_date));
    const placeholders = dates.map(() => "?").join(",");
    const moodRes = await db.execute({
      // Um registro de humor por dia (o mais recente) — window function em
      // vez de GROUP BY, pra não depender de comportamento implícito do SQLite.
      sql: `SELECT d, mood, energy FROM (
              SELECT date(recorded_at) AS d, mood, energy,
                     ROW_NUMBER() OVER (PARTITION BY date(recorded_at) ORDER BY recorded_at DESC) AS rn
              FROM mood_entries
              WHERE owner_id = ? AND date(recorded_at) IN (${placeholders})
            ) WHERE rn = 1`,
      args: [ownerId, ...dates],
    });
    for (const r of moodRes.rows as unknown as Array<{ d: string; mood: number; energy: number }>) {
      moodByDate.set(r.d, { mood: r.mood, energy: r.energy });
    }

    const entryIds = page.map((r) => String(r.id));
    const entryPlaceholders = entryIds.map(() => "?").join(",");
    const journalLinksRes = await db.execute({
      sql: `SELECT entry_id, journal_id FROM journal_entry_journals WHERE entry_id IN (${entryPlaceholders})`,
      args: entryIds,
    });
    for (const r of journalLinksRes.rows as unknown as Array<{ entry_id: string; journal_id: string }>) {
      const list = journalIdsByEntry.get(r.entry_id) ?? [];
      list.push(r.journal_id);
      journalIdsByEntry.set(r.entry_id, list);
    }

    const mediaCountRes = await db.execute({
      sql: `SELECT entry_id, COUNT(*) AS total FROM journal_entry_media WHERE entry_id IN (${entryPlaceholders}) GROUP BY entry_id`,
      args: entryIds,
    });
    for (const r of mediaCountRes.rows as unknown as Array<{ entry_id: string; total: number }>) {
      photoCountByEntry.set(r.entry_id, Number(r.total));
    }
    const coverPhotoRes = await db.execute({
      sql: `SELECT entry_id, data_uri FROM (
              SELECT entry_id, data_uri,
                     ROW_NUMBER() OVER (PARTITION BY entry_id ORDER BY sort_order ASC, created_at ASC) AS rn
              FROM journal_entry_media
              WHERE entry_id IN (${entryPlaceholders})
            ) WHERE rn = 1`,
      args: entryIds,
    });
    for (const r of coverPhotoRes.rows as unknown as Array<{ entry_id: string; data_uri: string }>) {
      coverPhotoByEntry.set(r.entry_id, r.data_uri);
    }
  }

  return page.map((row) => ({
    date: String(row.entry_date),
    preview: buildPreview(row),
    wordCount: WRITTEN_FIELDS.reduce((s, f) => s + countWords(row[f] as string | null), 0),
    gratitudeCount: parseJsonArraySafe(row.gratitude as string | undefined).length,
    selfCareCount: parseJsonArraySafe(row.self_care as string | undefined).length,
    nightMood: (row.night_mood as number | null) ?? null,
    mood: moodByDate.get(String(row.entry_date)) ?? null,
    journalIds: journalIdsByEntry.get(String(row.id)) ?? [],
    photoCount: photoCountByEntry.get(String(row.id)) ?? 0,
    coverPhoto: coverPhotoByEntry.get(String(row.id)) ?? null,
    isFavorite: Number(row.is_favorite ?? 0) === 1,
  }));
}

/**
 * "Lembranças" (Fase 10 — On This Day do Apple Journal): entradas reais de
 * anos anteriores no mesmo dia e mês de `date` (padrão: hoje). Nunca mistura
 * com o ano atual, nunca inventa nada — só existe quando o usuário
 * realmente escreveu algo naquele dia em um ano passado.
 */
export async function getJournalOnThisDay(db: Db, ownerId: string, date: string): Promise<JournalDaySummary[]> {
  const result = await db.execute({
    sql: `SELECT * FROM journal_entries
          WHERE owner_id = ? AND entry_date != ? AND strftime('%m-%d', entry_date) = strftime('%m-%d', ?)
          ORDER BY entry_date DESC`,
    args: [ownerId, date, date],
  });
  const page = (result.rows as unknown as Array<Record<string, unknown>>).filter(hasWrittenContent);
  return enrichEntrySummaries(db, ownerId, page);
}'''
content = content.replace(old_block, new_block)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
