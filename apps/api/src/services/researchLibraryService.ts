/**
 * Biblioteca do Mestrado — artigos científicos por DOI, lista de leitura por
 * categoria/capítulo, fichamento estruturado, citações literais (só as que o
 * usuário digitou) e exportação de referências.
 *
 * research_papers = metadados compartilhados vindos das APIs.
 * user_papers = leitura, status, correções e organização do usuário.
 */
import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { userDayContext, shiftDayKey } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { lookupDoi, normalizeDoi, openAlexCiting, openAlexWorks, type PaperAuthor, type PaperMetadata, type RelatedWork } from "./researchProviders.js";
import { formatCitation, type CitationFormat } from "./citationFormat.js";
import { insertTask } from "./taskWriteService.js";
import { createTaskSchema } from "../validators/task.schema.js";

export class ResearchError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 502 = 400) {
    super(message);
  }
}

export const DEFAULT_CATEGORIES = ["Fundamentação Teórica", "Trabalhos Relacionados", "Estado da Arte", "Metodologia", "Resultados e Discussão", "Referências Complementares"];
export const PAPER_STATUSES = ["para_ler", "lendo", "lido", "fichado"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];
export const REVIEW_FIELDS = ["problema", "objetivo", "fundamentacao", "metodologia", "base_dados", "experimentos", "resultados", "contribuicoes", "limitacoes", "trabalhos_futuros", "relacao_pesquisa", "notas_pessoais"] as const;
export type ReviewFields = Partial<Record<(typeof REVIEW_FIELDS)[number], string>>;

/** XP da pesquisa: só pela leitura e pelo fichamento (salvar rende pouco e tem teto diário). */
export const RESEARCH_XP = { paper_added: 5, paper_read: 20, paper_reviewed: 40, addedDailyCap: 10 } as const;

/** Campos que o usuário pode corrigir só para ele. */
export const OVERRIDABLE = ["title", "authors", "year", "venue", "volume", "issue", "pages", "publisher", "abstract", "url"] as const;
export type PaperOverrides = Partial<Pick<PaperMetadata, (typeof OVERRIDABLE)[number]>>;

type Row = Record<string, unknown>;
const json = <T>(raw: unknown, fb: T): T => {
  try {
    return typeof raw === "string" && raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
};
const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

/* ───────────────────────── Categorias e preferências ───────────────────────── */

export async function ensureCategories(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT id, name, position FROM reading_categories WHERE owner_id = ? ORDER BY position, name", args: [ownerId] });
  if (r.rows.length) return r.rows.map((x) => ({ id: String(x.id), name: String(x.name), position: Number(x.position) }));
  await db.batch(DEFAULT_CATEGORIES.map((name, i) => ({ sql: "INSERT OR IGNORE INTO reading_categories (id, owner_id, name, position) VALUES (?, ?, ?, ?)", args: [nanoid(), ownerId, name, i] })), "write");
  return ensureCategories(db, ownerId);
}

export async function createCategory(db: Client, ownerId: string, name: string) {
  const cats = await ensureCategories(db, ownerId);
  if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new ResearchError("Já existe uma categoria com esse nome.", 409);
  const id = nanoid();
  await db.execute({ sql: "INSERT INTO reading_categories (id, owner_id, name, position) VALUES (?, ?, ?, ?)", args: [id, ownerId, name, cats.length] });
  return { id, name, position: cats.length };
}

export async function renameCategory(db: Client, ownerId: string, id: string, name: string) {
  const r = await db.execute({ sql: "UPDATE reading_categories SET name = ? WHERE id = ? AND owner_id = ?", args: [name, id, ownerId] }).catch(() => {
    throw new ResearchError("Já existe uma categoria com esse nome.", 409);
  });
  if (!r.rowsAffected) throw new ResearchError("Categoria não encontrada.", 404);
}

export async function deleteCategory(db: Client, ownerId: string, id: string) {
  // Artigos da categoria ficam "sem categoria" (ON DELETE SET NULL) — nada é apagado.
  const r = await db.execute({ sql: "DELETE FROM reading_categories WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new ResearchError("Categoria não encontrada.", 404);
}

export async function reorderCategories(db: Client, ownerId: string, ids: string[]) {
  await db.batch(ids.map((id, i) => ({ sql: "UPDATE reading_categories SET position = ? WHERE id = ? AND owner_id = ?", args: [i, id, ownerId] })), "write");
}

export async function getSettings(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT weekly_goal, active_project_id FROM research_settings WHERE owner_id = ?", args: [ownerId] });
  return { weeklyGoal: r.rows[0] ? Number(r.rows[0].weekly_goal) : 3, activeProjectId: str(r.rows[0]?.active_project_id) };
}

async function assertProject(db: Client, ownerId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const r = await db.execute({ sql: "SELECT 1 FROM academic_projects WHERE id = ? AND owner_id = ?", args: [projectId, ownerId] });
  if (!r.rows.length) throw new ResearchError("Projeto acadêmico não encontrado.", 404);
}

async function assertCategory(db: Client, ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const r = await db.execute({ sql: "SELECT 1 FROM reading_categories WHERE id = ? AND owner_id = ?", args: [categoryId, ownerId] });
  if (!r.rows.length) throw new ResearchError("Categoria não encontrada.", 404);
}

export async function saveSettings(db: Client, ownerId: string, patch: { weeklyGoal?: number; activeProjectId?: string | null }) {
  await assertProject(db, ownerId, patch.activeProjectId);
  const cur = await getSettings(db, ownerId);
  const next = { ...cur, ...patch };
  await db.execute({
    sql: `INSERT INTO research_settings (owner_id, weekly_goal, active_project_id) VALUES (?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET weekly_goal = excluded.weekly_goal, active_project_id = excluded.active_project_id, updated_at = datetime('now')`,
    args: [ownerId, next.weeklyGoal, next.activeProjectId],
  });
  return next;
}

/* ───────────────────────── DOI ───────────────────────── */

export async function previewDoi(db: Client, ownerId: string, raw: string) {
  const doi = normalizeDoi(raw);
  if (!doi) throw new ResearchError("DOI inválido. Use o formato 10.xxxx/identificador.", 422);
  let found;
  try {
    found = await lookupDoi(doi);
  } catch {
    throw new ResearchError("As bases acadêmicas não responderam agora. Tente de novo em instantes.", 502);
  }
  if (!found) throw new ResearchError("Nenhuma base acadêmica encontrou esse DOI.", 404);
  const saved = await db.execute({ sql: "SELECT up.id FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ? AND p.doi = ?", args: [ownerId, doi] });
  return { ...found.meta, savedId: str(saved.rows[0]?.id) };
}

/** Metadados de um artigo vindos de fora (Zotero, Radar): o DOI pode não existir. */
export type PaperDraft = Omit<PaperMetadata, "doi"> & { doi: string | null };

async function upsertPaper(db: Client, meta: PaperDraft): Promise<string> {
  const now = new Date().toISOString();
  // Sem DOI não há chave global confiável: cada item vira um registro próprio
  // (a deduplicação fica no vínculo de origem, ex.: zotero_items).
  const existing = meta.doi ? await db.execute({ sql: "SELECT id FROM research_papers WHERE doi = ?", args: [meta.doi] }) : { rows: [] };
  if (existing.rows[0]) {
    const id = String(existing.rows[0].id);
    // Atualiza os indicadores (citações mudam com o tempo) e completa o que faltava.
    await db.execute({
      sql: `UPDATE research_papers SET cited_by = COALESCE(?, cited_by), cited_by_source = COALESCE(?, cited_by_source), cited_by_at = CASE WHEN ? IS NULL THEN cited_by_at ELSE ? END,
              abstract = COALESCE(abstract, ?), oa_url = COALESCE(oa_url, ?), openalex_id = COALESCE(openalex_id, ?), updated_at = datetime('now') WHERE id = ?`,
      args: [meta.citedBy, meta.citedBySource, meta.citedBy, now, meta.abstract, meta.oaUrl, meta.openalexId, id],
    });
    return id;
  }
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO research_papers (id, doi, openalex_id, title, authors_json, year, venue, volume, issue, pages, publisher, abstract, keywords_json, cited_by, cited_by_source, cited_by_at, url, oa_url, type, sources_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, meta.doi, meta.openalexId, meta.title, JSON.stringify(meta.authors), meta.year, meta.venue, meta.volume, meta.issue, meta.pages, meta.publisher, meta.abstract, JSON.stringify(meta.keywords), meta.citedBy, meta.citedBySource, meta.citedBy != null ? now : null, meta.url, meta.oaUrl, meta.type, JSON.stringify(meta.sources)],
  });
  return id;
}

export async function savePaper(db: Client, ownerId: string, input: { doi: string; overrides?: PaperOverrides; academicProjectId?: string | null; categoryId?: string | null; status?: PaperStatus; priority?: "baixa" | "media" | "alta" }) {
  const doi = normalizeDoi(input.doi);
  if (!doi) throw new ResearchError("DOI inválido.", 422);
  await assertProject(db, ownerId, input.academicProjectId);
  await assertCategory(db, ownerId, input.categoryId);
  let found;
  try {
    found = await lookupDoi(doi);
  } catch {
    throw new ResearchError("As bases acadêmicas não responderam agora. Tente de novo em instantes.", 502);
  }
  if (!found) throw new ResearchError("Nenhuma base acadêmica encontrou esse DOI.", 404);
  const r = await addPaperFromMetadata(db, ownerId, found.meta, input);
  if (!r.created) throw new ResearchError("Esse artigo já está na sua biblioteca.", 409);
  return getPaper(db, ownerId, r.id);
}

/**
 * Coloca um artigo na biblioteca do usuário a partir de metadados já obtidos
 * (DOI, Zotero, Radar). Se ele já estiver lá, devolve o existente (created=false).
 * O XP de "artigo salvo" segue o mesmo teto diário em qualquer origem.
 */
export async function addPaperFromMetadata(
  db: Client,
  ownerId: string,
  meta: PaperDraft,
  input: { overrides?: PaperOverrides; academicProjectId?: string | null; categoryId?: string | null; status?: PaperStatus; priority?: "baixa" | "media" | "alta"; tags?: string[] } = {},
): Promise<{ id: string; created: boolean; xp: number }> {
  const paperId = await upsertPaper(db, meta);
  const dup = await db.execute({ sql: "SELECT id FROM user_papers WHERE owner_id = ? AND paper_id = ?", args: [ownerId, paperId] });
  if (dup.rows[0]) return { id: String(dup.rows[0].id), created: false, xp: 0 };
  const settings = await getSettings(db, ownerId);
  const pos = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM user_papers WHERE owner_id = ?", args: [ownerId] });
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO user_papers (id, owner_id, paper_id, academic_project_id, category_id, status, priority, overrides_json, position, tags_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, paperId, input.academicProjectId === undefined ? settings.activeProjectId : input.academicProjectId, input.categoryId ?? null, input.status ?? "para_ler", input.priority ?? "media", JSON.stringify(sanitizeOverrides(input.overrides)), Number(pos.rows[0]?.p ?? 0), JSON.stringify((input.tags ?? []).slice(0, 12))],
  });
  const { today } = await userDayContext(db, ownerId);
  const added = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'research' AND event_type = 'paper_added' AND day_key = ?", args: [ownerId, today] });
  let xp = 0;
  if (Number(added.rows[0]?.n ?? 0) < RESEARCH_XP.addedDailyCap) {
    const ok = await award(db, ownerId, { sourceType: "research", sourceId: paperId, eventType: "paper_added", xp: RESEARCH_XP.paper_added, coins: 0, label: `Artigo salvo: ${meta.title.slice(0, 80)}` }, today);
    if (ok) xp = RESEARCH_XP.paper_added;
  }
  return { id, created: true, xp };
}

function sanitizeOverrides(o: PaperOverrides | undefined): PaperOverrides {
  if (!o) return {};
  const out: PaperOverrides = {};
  for (const k of OVERRIDABLE) if (o[k] !== undefined) (out as Record<string, unknown>)[k] = o[k];
  return out;
}

/* ───────────────────────── Leitura ───────────────────────── */

const SELECT_PAPER = `SELECT up.*, p.doi, p.openalex_id, p.title, p.authors_json, p.year, p.venue, p.volume, p.issue, p.pages, p.publisher, p.abstract,
                             p.keywords_json, p.cited_by, p.cited_by_source, p.cited_by_at, p.url, p.oa_url, p.type, p.sources_json,
                             c.name AS category_name, ap.title AS project_title,
                             (SELECT COUNT(*) FROM paper_quotes q WHERE q.user_paper_id = up.id) AS quotes_count,
                             (SELECT 1 FROM paper_reviews rv WHERE rv.user_paper_id = up.id AND rv.fields_json != '{}') AS has_review
                        FROM user_papers up JOIN research_papers p ON p.id = up.paper_id
                        LEFT JOIN reading_categories c ON c.id = up.category_id
                        LEFT JOIN academic_projects ap ON ap.id = up.academic_project_id`;

function mapPaper(r: Row) {
  const ov = json<PaperOverrides>(r.overrides_json, {});
  const authors = (ov.authors ?? json<PaperAuthor[]>(r.authors_json, [])) as PaperAuthor[];
  return {
    id: String(r.id),
    paperId: String(r.paper_id),
    doi: str(r.doi),
    openalexId: str(r.openalex_id),
    title: ov.title ?? String(r.title),
    authors,
    year: ov.year ?? num(r.year),
    venue: ov.venue ?? str(r.venue),
    volume: ov.volume ?? str(r.volume),
    issue: ov.issue ?? str(r.issue),
    pages: ov.pages ?? str(r.pages),
    publisher: ov.publisher ?? str(r.publisher),
    abstract: ov.abstract ?? str(r.abstract),
    url: ov.url ?? str(r.url),
    oaUrl: str(r.oa_url),
    type: str(r.type),
    keywords: json<string[]>(r.keywords_json, []),
    citedBy: num(r.cited_by),
    citedBySource: str(r.cited_by_source),
    citedByAt: str(r.cited_by_at),
    sources: json<string[]>(r.sources_json, []),
    overrides: Object.keys(ov),
    academicProjectId: str(r.academic_project_id),
    projectTitle: str(r.project_title),
    categoryId: str(r.category_id),
    categoryName: str(r.category_name),
    chapter: str(r.chapter),
    status: String(r.status) as PaperStatus,
    priority: String(r.priority) as "baixa" | "media" | "alta",
    progress: Number(r.progress),
    favorite: Number(r.favorite) === 1,
    tags: json<string[]>(r.tags_json, []),
    notes: str(r.notes),
    position: Number(r.position),
    quotesCount: Number(r.quotes_count ?? 0),
    hasReview: Number(r.has_review ?? 0) === 1,
    readAt: str(r.read_at),
    reviewedAt: str(r.reviewed_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
export type LibraryPaper = ReturnType<typeof mapPaper>;

export interface LibraryFilters {
  q?: string;
  status?: PaperStatus;
  categoryId?: string;
  projectId?: string;
  year?: number;
  venue?: string;
  favorite?: boolean;
  tag?: string;
  sort?: "position" | "recent" | "year" | "citations" | "title";
}

export async function listLibrary(db: Client, ownerId: string, f: LibraryFilters = {}) {
  const where: string[] = ["up.owner_id = ?"];
  const args: Array<string | number> = [ownerId];
  if (f.status) (where.push("up.status = ?"), args.push(f.status));
  if (f.categoryId === "none") where.push("up.category_id IS NULL");
  else if (f.categoryId) (where.push("up.category_id = ?"), args.push(f.categoryId));
  if (f.projectId) (where.push("up.academic_project_id = ?"), args.push(f.projectId));
  if (f.year) (where.push("p.year = ?"), args.push(f.year));
  if (f.venue) (where.push("p.venue LIKE ?"), args.push(`%${f.venue}%`));
  if (f.favorite) where.push("up.favorite = 1");
  const order = { position: "up.position ASC", recent: "up.created_at DESC", year: "p.year DESC", citations: "p.cited_by DESC", title: "p.title COLLATE NOCASE" }[f.sort ?? "position"];
  const r = await db.execute({ sql: `${SELECT_PAPER} WHERE ${where.join(" AND ")} ORDER BY ${order}`, args });
  let items = r.rows.map((x) => mapPaper(x as Row));
  // Busca por título/autor/tag sobre o visual já mesclado com as correções do usuário.
  if (f.q) {
    const q = f.q.toLowerCase();
    items = items.filter((p) => p.title.toLowerCase().includes(q) || p.authors.some((a) => a.name.toLowerCase().includes(q)) || (p.doi ?? "").includes(q));
  }
  if (f.tag) items = items.filter((p) => p.tags.includes(f.tag!));
  return items;
}

export async function getPaper(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: `${SELECT_PAPER} WHERE up.id = ? AND up.owner_id = ?`, args: [id, ownerId] });
  if (!r.rows[0]) throw new ResearchError("Artigo não encontrado na sua biblioteca.", 404);
  return mapPaper(r.rows[0] as Row);
}

export async function getPaperDetail(db: Client, ownerId: string, id: string) {
  const paper = await getPaper(db, ownerId, id);
  const [review, quotes, history] = await Promise.all([
    db.execute({ sql: "SELECT fields_json, updated_at FROM paper_reviews WHERE user_paper_id = ? AND owner_id = ?", args: [id, ownerId] }),
    db.execute({ sql: "SELECT id, text, page, comment, created_at FROM paper_quotes WHERE user_paper_id = ? AND owner_id = ? ORDER BY created_at", args: [id, ownerId] }),
    db.execute({ sql: "SELECT field, old_value, new_value, created_at FROM user_paper_history WHERE user_paper_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 30", args: [id, ownerId] }),
  ]);
  return {
    paper,
    review: { fields: json<ReviewFields>(review.rows[0]?.fields_json, {}), updatedAt: str(review.rows[0]?.updated_at) },
    quotes: quotes.rows.map((q) => ({ id: String(q.id), text: String(q.text), page: str(q.page), comment: str(q.comment), createdAt: String(q.created_at) })),
    history: history.rows.map((h) => ({ field: String(h.field), oldValue: str(h.old_value), newValue: str(h.new_value), at: String(h.created_at) })),
  };
}

export interface PaperPatch {
  status?: PaperStatus;
  priority?: "baixa" | "media" | "alta";
  progress?: number;
  favorite?: boolean;
  tags?: string[];
  notes?: string | null;
  categoryId?: string | null;
  academicProjectId?: string | null;
  chapter?: string | null;
  position?: number;
  overrides?: PaperOverrides;
}

export async function updatePaper(db: Client, ownerId: string, id: string, patch: PaperPatch) {
  const cur = await getPaper(db, ownerId, id);
  if (patch.categoryId !== undefined) await assertCategory(db, ownerId, patch.categoryId);
  if (patch.academicProjectId !== undefined) await assertProject(db, ownerId, patch.academicProjectId);
  const next = { ...patch };
  // Coerência entre status e progresso: lido/fichado = 100%; 100% sem status de lido vira "lido".
  if (next.status === "lido" || next.status === "fichado") next.progress = 100;
  else if (next.progress === 100 && (cur.status === "para_ler" || cur.status === "lendo") && !next.status) next.status = "lido";
  else if (next.progress !== undefined && next.progress > 0 && next.progress < 100 && cur.status === "para_ler" && !next.status) next.status = "lendo";
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  const history: Array<[string, string | null, string | null]> = [];
  const set = (col: string, v: string | number | null, field?: string, old?: string | null) => {
    sets.push(`${col} = ?`);
    args.push(v);
    if (field && String(old ?? "") !== String(v ?? "")) history.push([field, old ?? null, v == null ? null : String(v)]);
  };
  if (next.status !== undefined) set("status", next.status, "status", cur.status);
  if (next.priority !== undefined) set("priority", next.priority, "prioridade", cur.priority);
  if (next.progress !== undefined) set("progress", Math.max(0, Math.min(100, Math.round(next.progress))), "progresso", String(cur.progress));
  if (next.favorite !== undefined) set("favorite", next.favorite ? 1 : 0);
  if (next.tags !== undefined) set("tags_json", JSON.stringify([...new Set(next.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 15)));
  if (next.notes !== undefined) set("notes", next.notes);
  if (next.categoryId !== undefined) set("category_id", next.categoryId, "categoria", cur.categoryName);
  if (next.academicProjectId !== undefined) set("academic_project_id", next.academicProjectId, "projeto", cur.projectTitle);
  if (next.chapter !== undefined) set("chapter", next.chapter, "capítulo", cur.chapter);
  if (next.position !== undefined) set("position", next.position);
  if (next.overrides !== undefined) set("overrides_json", JSON.stringify(sanitizeOverrides(next.overrides)), "metadados", null);
  if (next.status === "lido" && !cur.readAt) sets.push("read_at = datetime('now')");
  if (next.status === "fichado" && !cur.reviewedAt) sets.push("reviewed_at = datetime('now')", "read_at = COALESCE(read_at, datetime('now'))");
  if (!sets.length) return cur;
  await db.execute({ sql: `UPDATE user_papers SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
  if (history.length)
    await db.batch(history.map(([field, o, n]) => ({ sql: "INSERT INTO user_paper_history (id, owner_id, user_paper_id, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)", args: [nanoid(), ownerId, id, field, o, n] })), "write");
  await rewardStatus(db, ownerId, cur, next.status);
  return getPaper(db, ownerId, id);
}

async function rewardStatus(db: Client, ownerId: string, cur: LibraryPaper, status: PaperStatus | undefined) {
  if (!status || status === cur.status) return;
  const { today } = await userDayContext(db, ownerId);
  const short = cur.title.slice(0, 80);
  if (status === "lido" || status === "fichado") {
    await award(db, ownerId, { sourceType: "research", sourceId: cur.paperId, eventType: "paper_read", xp: RESEARCH_XP.paper_read, coins: 2, label: `Artigo lido: ${short}` }, today);
  }
  if (status === "fichado") {
    const granted = await award(db, ownerId, { sourceType: "research", sourceId: cur.paperId, eventType: "paper_reviewed", xp: RESEARCH_XP.paper_reviewed, coins: 4, label: `Artigo fichado: ${short}` }, today);
    if (granted) await recordWorldEvent(db, ownerId, { type: "academic.paper_reviewed", title: "O bibliotecário arquivou um novo fichamento", detail: short, refId: cur.id });
  }
}

export async function deletePaper(db: Client, ownerId: string, id: string) {
  // Some só da biblioteca do usuário (fichamento e citações juntos). O XP ganho é histórico.
  const r = await db.execute({ sql: "DELETE FROM user_papers WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new ResearchError("Artigo não encontrado.", 404);
}

/* ───────────────────────── Fichamento e citações ───────────────────────── */

export async function saveReview(db: Client, ownerId: string, id: string, fields: ReviewFields) {
  await getPaper(db, ownerId, id);
  const clean: ReviewFields = {};
  for (const k of REVIEW_FIELDS) if (typeof fields[k] === "string" && fields[k]!.trim()) clean[k] = fields[k]!.slice(0, 8000);
  await db.execute({
    sql: `INSERT INTO paper_reviews (user_paper_id, owner_id, fields_json) VALUES (?, ?, ?)
          ON CONFLICT (user_paper_id) DO UPDATE SET fields_json = excluded.fields_json, updated_at = datetime('now')`,
    args: [id, ownerId, JSON.stringify(clean)],
  });
  return { fields: clean, updatedAt: new Date().toISOString() };
}

export async function addQuote(db: Client, ownerId: string, id: string, q: { text: string; page?: string | null; comment?: string | null }) {
  await getPaper(db, ownerId, id);
  const quoteId = nanoid();
  await db.execute({ sql: "INSERT INTO paper_quotes (id, owner_id, user_paper_id, text, page, comment) VALUES (?, ?, ?, ?, ?, ?)", args: [quoteId, ownerId, id, q.text, q.page ?? null, q.comment ?? null] });
  return { id: quoteId, text: q.text, page: q.page ?? null, comment: q.comment ?? null, createdAt: new Date().toISOString() };
}

export async function deleteQuote(db: Client, ownerId: string, quoteId: string) {
  const r = await db.execute({ sql: "DELETE FROM paper_quotes WHERE id = ? AND owner_id = ?", args: [quoteId, ownerId] });
  if (!r.rowsAffected) throw new ResearchError("Citação não encontrada.", 404);
}

/* ───────────────────────── Relacionados, referências, exportação ───────────────────────── */

export type RelationKind = "related" | "references" | "citing";

/**
 * "references" e "citing" são relações bibliográficas comprovadas (OpenAlex);
 * "related" é recomendação algorítmica do OpenAlex — a UI diz isso.
 */
export async function relatedWorks(db: Client, ownerId: string, id: string, kind: RelationKind): Promise<{ kind: RelationKind; proven: boolean; items: Array<RelatedWork & { savedId: string | null }> }> {
  const paper = await getPaper(db, ownerId, id);
  if (!paper.doi) return { kind, proven: kind !== "related", items: [] };
  let items: RelatedWork[] = [];
  try {
    if (kind === "citing") items = paper.openalexId ? await openAlexCiting(paper.openalexId) : [];
    else {
      const found = await lookupDoi(paper.doi);
      items = await openAlexWorks(kind === "related" ? found?.relatedIds ?? [] : found?.referenceIds ?? []);
    }
  } catch {
    throw new ResearchError("O OpenAlex não respondeu agora. Tente de novo em instantes.", 502);
  }
  const dois = items.map((i) => i.doi).filter((d): d is string => !!d);
  const saved = new Map<string, string>();
  if (dois.length) {
    const r = await db.execute({ sql: `SELECT up.id, p.doi FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ? AND p.doi IN (${dois.map(() => "?").join(",")})`, args: [ownerId, ...dois] });
    for (const x of r.rows) saved.set(String(x.doi), String(x.id));
  }
  return { kind, proven: kind !== "related", items: items.map((i) => ({ ...i, savedId: i.doi ? saved.get(i.doi) ?? null : null })) };
}

export async function exportReferences(db: Client, ownerId: string, ids: string[] | null, format: CitationFormat) {
  const all = await listLibrary(db, ownerId, { sort: "title" });
  const chosen = ids && ids.length ? all.filter((p) => ids.includes(p.id)) : all;
  if (!chosen.length) throw new ResearchError("Nenhum artigo para exportar.", 404);
  const sep = format === "bibtex" || format === "ris" ? "\n\n" : "\n\n";
  const sorted = format === "abnt" || format === "apa" ? [...chosen].sort((a, b) => (a.authors[0]?.family ?? a.title).localeCompare(b.authors[0]?.family ?? b.title, "pt-BR")) : chosen;
  const text = sorted.map((p) => formatCitation(p, format)).join(sep);
  return { format, count: chosen.length, text };
}

/** Cria uma tarefa "Ler: título" no projeto (Kanban) ligado ao projeto acadêmico do artigo. */
export async function createReadingTask(db: Client, ownerId: string, id: string) {
  const p = await getPaper(db, ownerId, id);
  let projectId: string | null = null;
  if (p.academicProjectId) {
    const r = await db.execute({ sql: "SELECT project_id FROM academic_projects WHERE id = ? AND owner_id = ?", args: [p.academicProjectId, ownerId] });
    projectId = str(r.rows[0]?.project_id);
  }
  const data = createTaskSchema.parse({
    title: `Ler: ${p.title}`.slice(0, 200),
    description: `Leitura da Biblioteca do Mestrado${p.categoryName ? ` (${p.categoryName})` : ""}.${p.doi ? ` DOI: ${p.doi}` : ""}`,
    projectId,
    status: "A Fazer",
    priority: p.priority === "alta" ? "Alta" : p.priority === "baixa" ? "Baixa" : "Média",
  });
  return insertTask(db, ownerId, data);
}

/* ───────────────────────── Indicadores ───────────────────────── */

export async function libraryStats(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const weekStart = shiftDayKey(today, -6);
  const [counts, cites, byCat, week, settings] = await Promise.all([
    db.execute({ sql: "SELECT status, COUNT(*) AS n FROM user_papers WHERE owner_id = ? GROUP BY status", args: [ownerId] }),
    db.execute({
      sql: `SELECT COALESCE(SUM(p.cited_by), 0) AS total, COUNT(p.cited_by) AS known, GROUP_CONCAT(DISTINCT p.cited_by_source) AS sources, MAX(p.cited_by_at) AS at
              FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ?`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT up.category_id, COUNT(*) AS n, SUM(CASE WHEN up.status IN ('lido','fichado') THEN 1 ELSE 0 END) AS done FROM user_papers up WHERE up.owner_id = ? GROUP BY up.category_id", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM user_papers WHERE owner_id = ? AND read_at IS NOT NULL AND date(read_at) >= date(?)", args: [ownerId, weekStart] }),
    getSettings(db, ownerId),
  ]);
  const by = Object.fromEntries(PAPER_STATUSES.map((s) => [s, 0])) as Record<PaperStatus, number>;
  for (const r of counts.rows) by[String(r.status) as PaperStatus] = Number(r.n);
  const saved = Object.values(by).reduce((a, b) => a + b, 0);
  return {
    saved,
    byStatus: by,
    read: by.lido + by.fichado,
    reviewed: by.fichado,
    pending: by.para_ler + by.lendo,
    progressPct: saved ? Math.round(((by.lido + by.fichado) / saved) * 100) : 0,
    citations: { total: Number(cites.rows[0]?.total ?? 0), papersWithData: Number(cites.rows[0]?.known ?? 0), sources: str(cites.rows[0]?.sources)?.split(",") ?? [], updatedAt: str(cites.rows[0]?.at) },
    byCategory: byCat.rows.map((r) => ({ categoryId: str(r.category_id), total: Number(r.n), done: Number(r.done ?? 0) })),
    weekly: { read: Number(week.rows[0]?.n ?? 0), goal: settings.weeklyGoal },
    settings,
  };
}

export async function getLibraryHub(db: Client, ownerId: string) {
  const [categories, stats, projects] = await Promise.all([
    ensureCategories(db, ownerId),
    libraryStats(db, ownerId),
    db.execute({ sql: "SELECT id, title, kind, defense_date, progress_pct FROM academic_projects WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] }),
  ]);
  return {
    categories,
    stats,
    projects: projects.rows.map((p) => ({ id: String(p.id), title: String(p.title), kind: String(p.kind), defenseDate: str(p.defense_date), progressPct: Number(p.progress_pct) })),
  };
}

/** Timeline: um evento por artigo fichado (marco), sem spam de "salvou artigo". */
export async function researchTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({
    sql: `SELECT up.id, up.reviewed_at, p.title FROM user_papers up JOIN research_papers p ON p.id = up.paper_id
           WHERE up.owner_id = ? AND up.reviewed_at IS NOT NULL AND up.reviewed_at >= date(?) AND up.reviewed_at < date(?, '+1 day')`,
    args: [ownerId, from, to],
  });
  return r.rows.map((x) => ({ type: "research", icon: "📜", id: `paper-reviewed-${String(x.id)}`, label: `Artigo fichado: ${String(x.title).slice(0, 120)}`, at: String(x.reviewed_at) }));
}
