import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { stripHtml } from "./journalService.js";
import type { NoteLinkType } from "../validators/notes.schema.js";

/**
 * Notas e conhecimento ("segundo cérebro"). Cada nota pode citar outras
 * com [[Título]] (vira vínculo "wiki", recalculado a cada salvamento) e ser
 * ligada à mão a tarefas, projetos, metas, livros, dias do diário e
 * formações. Backlinks = quem aponta para esta nota.
 */

type Db = ReturnType<typeof getDb>;

/** Tabela, coluna de rótulo e caminho de cada tipo que pode ser vinculado — o dono é sempre conferido. */
const TARGETS: Record<NoteLinkType, { table: string; label: string; path: (id: string, label: string) => string }> = {
  note: { table: "notes", label: "title", path: (id) => `/notas?nota=${id}` },
  task: { table: "tasks", label: "title", path: (id) => `/tarefas?task=${id}` },
  project: { table: "projects", label: "name", path: (id) => `/projetos/${id}` },
  goal: { table: "goals", label: "title", path: () => "/metas" },
  book: { table: "books", label: "title", path: (id) => `/biblioteca/${id}` },
  journal: { table: "journal_entries", label: "entry_date", path: (_id, label) => `/diario?date=${label}` },
  education: { table: "educations", label: "course_name", path: (id) => `/educacao/${id}` },
};

export interface NoteSummary {
  id: string;
  title: string;
  kind: string;
  tags: string[];
  pinned: boolean;
  preview: string;
  sourceUrl: string | null;
  linkCount: number;
  backlinkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedLink {
  linkId: string;
  targetType: NoteLinkType;
  targetId: string;
  label: string;
  path: string;
  origin: "manual" | "wiki";
}

function parseTags(v: unknown): string[] {
  try {
    const t = JSON.parse(String(v ?? "[]"));
    return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toSummary(r: Record<string, unknown>): NoteSummary {
  const plain = String(r.plain_text ?? "");
  return {
    id: String(r.id),
    title: String(r.title),
    kind: String(r.kind),
    tags: parseTags(r.tags),
    pinned: Number(r.pinned) === 1,
    preview: plain.length > 220 ? `${plain.slice(0, 220)}…` : plain,
    sourceUrl: (r.source_url as string | null) ?? null,
    linkCount: Number(r.link_count ?? 0),
    backlinkCount: Number(r.backlink_count ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** Títulos citados como [[Título]] (ignora vazios e repetidos). */
export function extractWikiTitles(html: string | null | undefined): string[] {
  const text = stripHtml(html ?? "");
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]\n]{1,200})\]\]/g)) {
    const t = m[1].trim();
    if (t) out.add(t);
  }
  return [...out];
}

const SUMMARY_SQL = `SELECT n.*,
  (SELECT COUNT(*) FROM note_links l WHERE l.note_id = n.id) AS link_count,
  (SELECT COUNT(*) FROM note_links l WHERE l.owner_id = n.owner_id AND l.target_type = 'note' AND l.target_id = n.id) AS backlink_count
  FROM notes n`;

export async function listNotes(
  db: Db,
  ownerId: string,
  opts: { q?: string; kind?: string; tag?: string; includeArchived?: boolean } = {}
): Promise<NoteSummary[]> {
  const where = ["n.owner_id = ?"];
  const args: string[] = [ownerId];
  if (!opts.includeArchived) where.push("n.archived_at IS NULL");
  if (opts.kind) {
    where.push("n.kind = ?");
    args.push(opts.kind);
  }
  if (opts.q?.trim()) {
    where.push("(n.title LIKE ? OR n.plain_text LIKE ?)");
    const like = `%${opts.q.trim()}%`;
    args.push(like, like);
  }
  const res = await db.execute({ sql: `${SUMMARY_SQL} WHERE ${where.join(" AND ")} ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 500`, args });
  let notes = (res.rows as unknown as Array<Record<string, unknown>>).map(toSummary);
  if (opts.tag) notes = notes.filter((n) => n.tags.includes(opts.tag!));
  return notes;
}

async function resolveLinks(db: Db, ownerId: string, rows: Array<{ id: string; target_type: NoteLinkType; target_id: string; origin: string }>): Promise<ResolvedLink[]> {
  const out: ResolvedLink[] = [];
  for (const r of rows) {
    const t = TARGETS[r.target_type];
    if (!t) continue;
    const q = await db.execute({ sql: `SELECT ${t.label} AS label FROM ${t.table} WHERE id = ? AND owner_id = ?`, args: [r.target_id, ownerId] });
    const label = q.rows[0] ? String((q.rows[0] as unknown as { label: string }).label) : null;
    if (label == null) continue; // alvo apagado: o vínculo some da tela
    out.push({ linkId: r.id, targetType: r.target_type, targetId: r.target_id, label, path: t.path(r.target_id, label), origin: r.origin as "manual" | "wiki" });
  }
  return out;
}

export async function getNote(db: Db, ownerId: string, id: string) {
  const res = await db.execute({ sql: `${SUMMARY_SQL} WHERE n.id = ? AND n.owner_id = ?`, args: [id, ownerId] });
  const row = res.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  const [linksRes, backRes] = await Promise.all([
    db.execute({ sql: "SELECT id, target_type, target_id, origin FROM note_links WHERE note_id = ? AND owner_id = ? ORDER BY created_at", args: [id, ownerId] }),
    db.execute({
      sql: `SELECT n.id, n.title, n.plain_text FROM note_links l JOIN notes n ON n.id = l.note_id
            WHERE l.owner_id = ? AND l.target_type = 'note' AND l.target_id = ? AND n.archived_at IS NULL ORDER BY n.updated_at DESC`,
      args: [ownerId, id],
    }),
  ]);
  const links = await resolveLinks(db, ownerId, linksRes.rows as unknown as Array<{ id: string; target_type: NoteLinkType; target_id: string; origin: string }>);
  const wikiTitles = extractWikiTitles(row.content as string | null);
  const resolvedTitles = new Set(links.filter((l) => l.origin === "wiki").map((l) => l.label.toLowerCase()));
  return {
    ...toSummary(row),
    content: (row.content as string | null) ?? "",
    archived: row.archived_at != null,
    links,
    backlinks: (backRes.rows as unknown as Array<{ id: string; title: string; plain_text: string | null }>).map((b) => ({
      id: b.id,
      title: b.title,
      preview: String(b.plain_text ?? "").slice(0, 140),
    })),
    // [[Títulos]] que ainda não existem — a UI oferece "criar nota".
    unresolvedWikiLinks: wikiTitles.filter((t) => !resolvedTitles.has(t.toLowerCase())),
  };
}

/** Recalcula os vínculos [[wiki]] da nota a partir do conteúdo (só notas do mesmo dono). */
async function syncWikiLinks(db: Db, ownerId: string, noteId: string, content: string | null) {
  const titles = extractWikiTitles(content);
  const targets: string[] = [];
  for (const t of titles) {
    const r = await db.execute({
      sql: "SELECT id FROM notes WHERE owner_id = ? AND lower(title) = lower(?) AND id != ? AND archived_at IS NULL LIMIT 1",
      args: [ownerId, t, noteId],
    });
    if (r.rows[0]) targets.push(String((r.rows[0] as unknown as { id: string }).id));
  }
  await db.execute({ sql: "DELETE FROM note_links WHERE note_id = ? AND owner_id = ? AND origin = 'wiki'", args: [noteId, ownerId] });
  for (const targetId of new Set(targets)) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO note_links (id, owner_id, note_id, target_type, target_id, origin) VALUES (?, ?, ?, 'note', ?, 'wiki')",
      args: [nanoid(), ownerId, noteId, targetId],
    });
  }
}

export async function createNote(
  db: Db,
  ownerId: string,
  d: { title: string; content?: string | null; kind: string; tags?: string[]; sourceUrl?: string | null; pinned?: boolean }
) {
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO notes (id, owner_id, title, content, plain_text, kind, tags, source_url, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, ownerId, d.title, d.content ?? null, stripHtml(d.content ?? ""), d.kind, JSON.stringify(d.tags ?? []), d.sourceUrl ?? null, d.pinned ? 1 : 0],
  });
  await syncWikiLinks(db, ownerId, id, d.content ?? null);
  // Notas que já citavam este título como [[…]] passam a apontar para ela.
  await relinkReferencesTo(db, ownerId, d.title);
  return getNote(db, ownerId, id);
}

async function relinkReferencesTo(db: Db, ownerId: string, title: string) {
  const candidates = await db.execute({
    sql: "SELECT id, content FROM notes WHERE owner_id = ? AND archived_at IS NULL AND plain_text LIKE ?",
    args: [ownerId, `%[[${title}]]%`],
  });
  for (const c of candidates.rows as unknown as Array<{ id: string; content: string | null }>) await syncWikiLinks(db, ownerId, c.id, c.content);
}

export async function updateNote(
  db: Db,
  ownerId: string,
  id: string,
  d: { title?: string; content?: string | null; kind?: string; tags?: string[]; sourceUrl?: string | null; pinned?: boolean; archived?: boolean }
) {
  const exists = await db.execute({ sql: "SELECT title FROM notes WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (exists.rows.length === 0) return null;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  const put = (col: string, v: string | number | null) => {
    sets.push(`${col} = ?`);
    args.push(v);
  };
  if (d.title !== undefined) put("title", d.title);
  if (d.content !== undefined) {
    put("content", d.content);
    put("plain_text", stripHtml(d.content ?? ""));
  }
  if (d.kind !== undefined) put("kind", d.kind);
  if (d.tags !== undefined) put("tags", JSON.stringify(d.tags));
  if (d.sourceUrl !== undefined) put("source_url", d.sourceUrl);
  if (d.pinned !== undefined) put("pinned", d.pinned ? 1 : 0);
  if (d.archived !== undefined) put("archived_at", d.archived ? new Date().toISOString() : null);
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    await db.execute({ sql: `UPDATE notes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
  }
  if (d.content !== undefined) await syncWikiLinks(db, ownerId, id, d.content);
  if (d.title !== undefined) await relinkReferencesTo(db, ownerId, d.title);
  return getNote(db, ownerId, id);
}

export async function deleteNote(db: Db, ownerId: string, id: string): Promise<boolean> {
  const res = await db.execute({ sql: "DELETE FROM notes WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (res.rowsAffected > 0) {
    // Backlinks de outras notas para esta deixam de existir.
    await db.execute({ sql: "DELETE FROM note_links WHERE owner_id = ? AND target_type = 'note' AND target_id = ?", args: [ownerId, id] });
  }
  return res.rowsAffected > 0;
}

export async function addNoteLink(db: Db, ownerId: string, noteId: string, targetType: NoteLinkType, targetId: string): Promise<"ok" | "note_not_found" | "target_not_found"> {
  const note = await db.execute({ sql: "SELECT id FROM notes WHERE id = ? AND owner_id = ?", args: [noteId, ownerId] });
  if (note.rows.length === 0) return "note_not_found";
  if (targetType === "note" && targetId === noteId) return "target_not_found";
  const t = TARGETS[targetType];
  const target = await db.execute({ sql: `SELECT id FROM ${t.table} WHERE id = ? AND owner_id = ?`, args: [targetId, ownerId] });
  if (target.rows.length === 0) return "target_not_found";
  await db.execute({
    sql: "INSERT OR IGNORE INTO note_links (id, owner_id, note_id, target_type, target_id, origin) VALUES (?, ?, ?, ?, ?, 'manual')",
    args: [nanoid(), ownerId, noteId, targetType, targetId],
  });
  return "ok";
}

export async function removeNoteLink(db: Db, ownerId: string, noteId: string, linkId: string): Promise<boolean> {
  const res = await db.execute({ sql: "DELETE FROM note_links WHERE id = ? AND note_id = ? AND owner_id = ?", args: [linkId, noteId, ownerId] });
  return res.rowsAffected > 0;
}

/** Notas ligadas a um item de outro módulo (ex.: notas de um projeto ou de uma tarefa). */
export async function notesLinkedTo(db: Db, ownerId: string, targetType: NoteLinkType, targetId: string) {
  const res = await db.execute({
    sql: `SELECT n.id, n.title, n.kind, n.updated_at FROM note_links l JOIN notes n ON n.id = l.note_id
          WHERE l.owner_id = ? AND l.target_type = ? AND l.target_id = ? AND n.archived_at IS NULL ORDER BY n.updated_at DESC LIMIT 50`,
    args: [ownerId, targetType, targetId],
  });
  return (res.rows as unknown as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), title: String(r.title), kind: String(r.kind), updatedAt: String(r.updated_at) }));
}

/** Itens que podem ser vinculados (busca por nome), para o seletor da UI. */
export async function searchLinkTargets(db: Db, ownerId: string, targetType: NoteLinkType, q: string) {
  const t = TARGETS[targetType];
  const like = `%${q.trim()}%`;
  const res = await db.execute({
    sql: `SELECT id, ${t.label} AS label FROM ${t.table} WHERE owner_id = ? AND CAST(${t.label} AS TEXT) LIKE ? ORDER BY ${t.label} LIMIT 15`,
    args: [ownerId, like],
  });
  return (res.rows as unknown as Array<{ id: string; label: string }>).map((r) => ({ id: String(r.id), label: String(r.label) }));
}

/** Grafo das notas (nó = nota, aresta = vínculo nota→nota), para a visão de mapa. */
export async function notesGraph(db: Db, ownerId: string) {
  const [nodes, edges] = await Promise.all([
    db.execute({ sql: "SELECT id, title, kind FROM notes WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT note_id, target_id FROM note_links WHERE owner_id = ? AND target_type = 'note'", args: [ownerId] }),
  ]);
  const ids = new Set((nodes.rows as unknown as Array<{ id: string }>).map((n) => String(n.id)));
  return {
    nodes: (nodes.rows as unknown as Array<{ id: string; title: string; kind: string }>).map((n) => ({ id: String(n.id), title: String(n.title), kind: String(n.kind) })),
    edges: (edges.rows as unknown as Array<{ note_id: string; target_id: string }>)
      .filter((e) => ids.has(String(e.note_id)) && ids.has(String(e.target_id)))
      .map((e) => ({ from: String(e.note_id), to: String(e.target_id) })),
  };
}
