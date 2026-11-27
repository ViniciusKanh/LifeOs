import type { Client } from "@libsql/client";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { normalizeDoi, type PaperAuthor } from "./researchProviders.js";
import { addPaperFromMetadata, type PaperDraft } from "./researchLibraryService.js";

/**
 * Portal do Zotero (Biblioteca do Mestrado) — importa a biblioteca pessoal do
 * Zotero pela Web API v3 com a chave pessoal do usuário (só leitura basta).
 *
 * - Incremental: usa a versão da biblioteca (Last-Modified-Version) e `since`.
 * - Retomável: cada chamada tem orçamento de tempo; se não terminar, guarda o
 *   ponto (next_start) e a próxima sincronização continua dali ("parcial").
 * - Sem duplicar: item com DOI já salvo é vinculado ao artigo existente; o
 *   vínculo (zotero_items) impede importar o mesmo item duas vezes.
 * - Item apagado no Zotero NÃO apaga o artigo do LifeOS (pode ter fichamento):
 *   só é marcado como removido no vínculo.
 * - PDFs não são baixados: só registramos que o item tem PDF anexado.
 */

export class ZoteroError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

const API = "https://api.zotero.org";
const BUDGET_MS = 20_000;
const PAGE = 50;
/** Tipos que não são obras (anexos, notas, anotações) ficam de fora. */
const SKIP_TYPES = new Set(["attachment", "note", "annotation"]);
const READ_TAGS = new Set(["lido", "lida", "read", "já lido"]);

const headers = (key: string) => ({ "Zotero-API-Key": key, "Zotero-API-Version": "3", Accept: "application/json" });

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 401 || err.status === 403) throw new ZoteroError("O Zotero recusou a chave. Crie uma chave com acesso de leitura à biblioteca em zotero.org/settings/keys.", 422);
    if (err.status === 429) throw new ZoteroError("O Zotero pediu para esperar. Tente em alguns minutos.", 429);
    throw new ZoteroError(err.message, 502);
  }
  throw err;
}

interface ZCreator {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}
export interface ZItemData {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  creators?: ZCreator[];
  abstractNote?: string;
  publicationTitle?: string;
  proceedingsTitle?: string;
  bookTitle?: string;
  university?: string;
  repository?: string;
  institution?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  date?: string;
  DOI?: string;
  url?: string;
  publisher?: string;
  extra?: string;
  tags?: Array<{ tag: string }>;
  collections?: string[];
  parentItem?: string;
  contentType?: string;
}
type ZItem = { key: string; version: number; data: ZItemData };

const clean = (v: string | undefined | null, max = 300) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/** Converte um item do Zotero nos metadados da biblioteca (nada é inventado). */
export function zoteroToDraft(d: ZItemData): PaperDraft | null {
  const title = clean(d.title, 500);
  if (!title) return null;
  const doiFromExtra = d.extra?.match(/^DOI:\s*(\S+)/im)?.[1];
  const doi = normalizeDoi(d.DOI ?? doiFromExtra ?? "") ?? null;
  const authors: PaperAuthor[] = (d.creators ?? [])
    .filter((c) => !c.creatorType || c.creatorType === "author" || c.creatorType === "inventor" || c.creatorType === "presenter")
    .map((c) => (c.name ? { name: c.name, given: null, family: c.name } : { name: [c.firstName, c.lastName].filter(Boolean).join(" "), given: c.firstName ?? null, family: c.lastName ?? null }))
    .filter((a) => a.name)
    .slice(0, 40);
  const year = Number(d.date?.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1]);
  return {
    doi,
    openalexId: null,
    title,
    authors,
    year: Number.isFinite(year) ? year : null,
    venue: clean(d.publicationTitle ?? d.proceedingsTitle ?? d.bookTitle ?? d.university ?? d.repository ?? d.institution, 200),
    volume: clean(d.volume, 30),
    issue: clean(d.issue, 30),
    pages: clean(d.pages, 30),
    publisher: clean(d.publisher, 120),
    abstract: clean(d.abstractNote, 6000),
    keywords: [],
    citedBy: null,
    citedBySource: null,
    url: clean(d.url, 500) ?? (doi ? `https://doi.org/${doi}` : null),
    oaUrl: null,
    type: d.itemType,
    sources: ["Zotero"],
  };
}

interface Conn {
  zotero_user_id: string;
  username: string | null;
  api_key_enc: string;
  library_version: number;
  pending_version: number | null;
  next_start: number;
  collection_key: string | null;
  last_sync_at: string | null;
}

async function getConn(db: Client, ownerId: string): Promise<Conn | null> {
  const r = await db.execute({ sql: "SELECT * FROM zotero_connections WHERE owner_id = ?", args: [ownerId] });
  return (r.rows[0] as unknown as Conn | undefined) ?? null;
}

export async function connectZotero(db: Client, ownerId: string, apiKey: string) {
  const key = apiKey.trim();
  const info = await fetchJson<{ userID: number; username?: string; displayName?: string; access?: { user?: { library?: boolean } } }>(`${API}/keys/current`, { headers: headers(key) }, { label: "Zotero", retries: 1 }).catch(friendly);
  if (!info?.userID) throw new ZoteroError("Não foi possível identificar a conta dessa chave.", 422);
  if (info.access?.user?.library === false) throw new ZoteroError("Essa chave não tem acesso à biblioteca pessoal. Marque \"Allow library access\" ao criar a chave.", 422);
  await db.execute({
    sql: `INSERT INTO zotero_connections (owner_id, zotero_user_id, username, api_key_enc) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET zotero_user_id = excluded.zotero_user_id, username = excluded.username, api_key_enc = excluded.api_key_enc,
            library_version = CASE WHEN zotero_connections.zotero_user_id = excluded.zotero_user_id THEN zotero_connections.library_version ELSE 0 END,
            next_start = 0, pending_version = NULL, last_sync_status = NULL, last_sync_error = NULL, updated_at = datetime('now')`,
    args: [ownerId, String(info.userID), info.username ?? info.displayName ?? null, encryptSecret(key)],
  });
  await recordWorldEvent(db, ownerId, { type: "zotero.connected", title: "O Portal do Zotero foi aberto na Biblioteca do Mestrado", detail: info.username ?? null });
  return { username: info.username ?? info.displayName ?? null };
}

/** Desconecta e apaga a chave. Artigos importados continuam na biblioteca. */
export async function disconnectZotero(db: Client, ownerId: string) {
  await db.batch(
    [
      { sql: "DELETE FROM zotero_connections WHERE owner_id = ?", args: [ownerId] },
      { sql: "DELETE FROM zotero_collections WHERE owner_id = ?", args: [ownerId] },
    ],
    "write",
  );
}

export async function setZoteroCollection(db: Client, ownerId: string, collectionKey: string | null) {
  if (collectionKey) {
    const ok = await db.execute({ sql: "SELECT 1 FROM zotero_collections WHERE owner_id = ? AND collection_key = ?", args: [ownerId, collectionKey] });
    if (!ok.rows.length) throw new ZoteroError("Coleção não encontrada.", 404);
  }
  // Trocar o filtro recomeça a leitura (itens já vinculados não duplicam).
  const r = await db.execute({ sql: "UPDATE zotero_connections SET collection_key = ?, library_version = 0, next_start = 0, pending_version = NULL, updated_at = datetime('now') WHERE owner_id = ?", args: [collectionKey, ownerId] });
  if (!r.rowsAffected) throw new ZoteroError("Conecte o Zotero primeiro.", 404);
}

/**
 * Grava um lote de itens. Exportada para testes: o mesmo lote duas vezes não
 * cria artigos nem XP novos.
 */
export async function importZoteroItems(db: Client, ownerId: string, items: ZItemData[], pdfParents: Set<string>, collectionNames: Map<string, string>, deadline = Number.POSITIVE_INFINITY) {
  let created = 0;
  let linked = 0;
  let xp = 0;
  let processed = 0;
  for (const d of items) {
    if (Date.now() > deadline) break;
    processed++;
    if (SKIP_TYPES.has(d.itemType)) continue;
    const existing = await db.execute({ sql: "SELECT user_paper_id FROM zotero_items WHERE owner_id = ? AND item_key = ?", args: [ownerId, d.key] });
    const collections = (d.collections ?? []).map((k) => collectionNames.get(k)).filter((x): x is string => !!x);
    let paperId = existing.rows[0]?.user_paper_id == null ? null : String(existing.rows[0].user_paper_id);
    if (!existing.rows[0]) {
      const draft = zoteroToDraft(d);
      if (!draft) continue;
      const tags = [...new Set([...collections, ...(d.tags ?? []).map((t) => t.tag.trim()).filter(Boolean)])].slice(0, 12);
      const read = (d.tags ?? []).some((t) => READ_TAGS.has(t.tag.trim().toLowerCase()));
      const r = await addPaperFromMetadata(db, ownerId, draft, { status: read ? "lido" : "para_ler", tags });
      paperId = r.id;
      if (r.created) created++;
      else linked++;
      xp += r.xp;
    }
    await db.execute({
      sql: `INSERT INTO zotero_items (owner_id, item_key, user_paper_id, item_type, version, has_pdf, collections_json, deleted, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
            ON CONFLICT (owner_id, item_key) DO UPDATE SET version = excluded.version, item_type = excluded.item_type,
              has_pdf = MAX(zotero_items.has_pdf, excluded.has_pdf), collections_json = excluded.collections_json, deleted = 0, synced_at = excluded.synced_at`,
      args: [ownerId, d.key, paperId, d.itemType, d.version, pdfParents.has(d.key) ? 1 : 0, JSON.stringify(collections)],
    });
  }
  return { created, linked, xp, processed };
}

export async function syncZotero(db: Client, ownerId: string) {
  const c = await getConn(db, ownerId);
  if (!c) throw new ZoteroError("Conecte o Zotero primeiro.", 404);
  const deadline = Date.now() + BUDGET_MS;
  const key = decryptSecret(c.api_key_enc);
  const base = `${API}/users/${encodeURIComponent(c.zotero_user_id)}`;
  const since = c.library_version;
  try {
    // Coleções (nomes viram etiquetas dos artigos importados).
    const cols = await fetchJson<Array<{ key: string; data: { name: string; parentCollection: string | false } }>>(`${base}/collections?limit=100`, { headers: headers(key) }, { label: "Zotero" }).catch(friendly);
    if (cols?.length) {
      await db.batch(
        cols.map((x) => ({
          sql: `INSERT INTO zotero_collections (owner_id, collection_key, name, parent_key) VALUES (?, ?, ?, ?)
                ON CONFLICT (owner_id, collection_key) DO UPDATE SET name = excluded.name, parent_key = excluded.parent_key`,
          args: [ownerId, x.key, x.data.name.slice(0, 120), x.data.parentCollection || null],
        })),
        "write",
      );
    }
    const collectionNames = new Map((cols ?? []).map((x) => [x.key, x.data.name]));

    // Anexos PDF alterados desde a última versão: marcam o item pai.
    const pdfParents = new Set<string>();
    for (let start = 0; start < 500; start += 100) {
      const atts = await fetchJson<ZItem[]>(`${base}/items?itemType=attachment&since=${since}&limit=100&start=${start}`, { headers: headers(key) }, { label: "Zotero" }).catch(friendly);
      for (const a of atts ?? []) if (a.data.parentItem && a.data.contentType === "application/pdf") pdfParents.add(a.data.parentItem);
      if (!atts || atts.length < 100) break;
    }
    if (pdfParents.size) {
      const keys = [...pdfParents];
      for (let i = 0; i < keys.length; i += 80) {
        const slice = keys.slice(i, i + 80);
        await db.execute({ sql: `UPDATE zotero_items SET has_pdf = 1 WHERE owner_id = ? AND item_key IN (${slice.map(() => "?").join(",")})`, args: [ownerId, ...slice] });
      }
    }

    // Itens de topo, paginados e retomáveis.
    const scope = c.collection_key ? `${base}/collections/${encodeURIComponent(c.collection_key)}/items/top` : `${base}/items/top`;
    let start = c.next_start;
    let latest = c.pending_version ?? since;
    let total = null as number | null;
    const sum = { created: 0, linked: 0, xp: 0 };
    let finished = false;
    while (Date.now() < deadline) {
      const page = await fetchJson<ZItem[]>(`${scope}?since=${since}&limit=${PAGE}&start=${start}&sort=dateAdded&direction=asc`, { headers: headers(key) }, {
        label: "Zotero",
        onHeaders: (h) => {
          const v = Number(h.get("last-modified-version"));
          if (Number.isFinite(v)) latest = Math.max(latest, v);
          const t = Number(h.get("total-results"));
          if (Number.isFinite(t)) total = t;
        },
      }).catch(friendly);
      const list = page ?? [];
      const r = await importZoteroItems(db, ownerId, list.map((x) => x.data), pdfParents, collectionNames, deadline);
      sum.created += r.created;
      sum.linked += r.linked;
      sum.xp += r.xp;
      start += r.processed;
      if (r.processed < list.length) break; // acabou o tempo no meio da página
      if (list.length < PAGE) {
        finished = true;
        break;
      }
    }

    // Itens apagados no Zotero (só marca o vínculo).
    let removed = 0;
    if (finished && since > 0) {
      const del = await fetchJson<{ items?: string[] }>(`${base}/deleted?since=${since}`, { headers: headers(key) }, { label: "Zotero" }).catch(friendly);
      const keys = (del?.items ?? []).slice(0, 500);
      for (let i = 0; i < keys.length; i += 80) {
        const slice = keys.slice(i, i + 80);
        const u = await db.execute({ sql: `UPDATE zotero_items SET deleted = 1 WHERE owner_id = ? AND item_key IN (${slice.map(() => "?").join(",")})`, args: [ownerId, ...slice] });
        removed += u.rowsAffected;
      }
    }

    await db.execute({
      sql: `UPDATE zotero_connections SET library_version = ?, pending_version = ?, next_start = ?, last_sync_at = ?, last_sync_status = ?, last_sync_error = NULL, updated_at = datetime('now') WHERE owner_id = ?`,
      args: finished ? [latest, null, 0, new Date().toISOString(), "ok", ownerId] : [since, latest, start, new Date().toISOString(), "parcial", ownerId],
    });
    if (sum.created > 0) await recordWorldEvent(db, ownerId, { type: "zotero.imported", title: `O Portal do Zotero trouxe ${sum.created} artigo(s) para a biblioteca`, detail: sum.xp ? `+${sum.xp} XP de pesquisa` : null });
    return { ok: true as const, done: finished, ...sum, removed, remaining: finished ? 0 : total != null ? Math.max(0, total - start) : null };
  } catch (err) {
    await db.execute({ sql: "UPDATE zotero_connections SET last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [(err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    throw err;
  }
}

export async function getZoteroOverview(db: Client, ownerId: string) {
  const [conn, stats, cols] = await Promise.all([
    db.execute({ sql: "SELECT username, collection_key, last_sync_at, last_sync_status, last_sync_error, library_version FROM zotero_connections WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: `SELECT COUNT(*) AS items, SUM(CASE WHEN has_pdf = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS pdfs, SUM(deleted) AS removed,
                   SUM(CASE WHEN deleted = 0 AND user_paper_id IS NOT NULL THEN 1 ELSE 0 END) AS linked
              FROM zotero_items WHERE owner_id = ?`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT collection_key, name, parent_key FROM zotero_collections WHERE owner_id = ? ORDER BY name", args: [ownerId] }),
  ]);
  const c = conn.rows[0];
  const s = stats.rows[0];
  return {
    connected: !!c,
    connection: c
      ? {
          username: c.username == null ? null : String(c.username),
          collectionKey: c.collection_key == null ? null : String(c.collection_key),
          lastSyncAt: c.last_sync_at == null ? null : String(c.last_sync_at),
          lastSyncStatus: c.last_sync_status == null ? null : (String(c.last_sync_status) as "ok" | "parcial" | "erro"),
          lastSyncError: c.last_sync_error == null ? null : String(c.last_sync_error),
          neverCompleted: Number(c.library_version) === 0,
        }
      : null,
    stats: { linked: Number(s?.linked ?? 0), withPdf: Number(s?.pdfs ?? 0), removed: Number(s?.removed ?? 0) },
    collections: cols.rows.map((r) => ({ key: String(r.collection_key), name: String(r.name), parentKey: r.parent_key == null ? null : String(r.parent_key) })),
  };
}

/** Ids de artigos vindos do Zotero (para o selo na lista da biblioteca). */
export async function zoteroPaperFlags(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT user_paper_id, has_pdf, deleted, item_key FROM zotero_items WHERE owner_id = ? AND user_paper_id IS NOT NULL", args: [ownerId] });
  return r.rows.map((x) => ({ paperId: String(x.user_paper_id), itemKey: String(x.item_key), hasPdf: Number(x.has_pdf) === 1, removed: Number(x.deleted) === 1 }));
}
