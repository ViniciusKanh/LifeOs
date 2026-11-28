import type { Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { CKAN_BASE, CKAN_DATASETS, ESCOLA_BASE, ESCOLA_PATHS, PUBLIC_HOSTS, PUBLIC_TTL, type CkanDataset, type EscolaPath } from "../config/publicData.js";
import { CityError } from "./apilibClient.js";
import { integrationFetch } from "./integrationsCore.js";

/**
 * Cliente das fontes públicas da Prefeitura (Portal de Dados Abertos/CKAN e Escola Aberta).
 *
 * - Só consulta os hosts de config/publicData.ts, por HTTPS, com caminhos montados aqui.
 * - Cache global em city_cache (dados públicos, iguais para todos), deduplicação de chamadas
 *   simultâneas, timeout, uma nova tentativa e cache vencido como reserva — nunca dado simulado.
 * - O portal tem um firewall que recusa algumas formas de SQL (devolve uma página HTML):
 *   isso vira um erro claro e cada painel trata a sua parte como indisponível.
 */

type Db = Client;
export type Json = Record<string, unknown>;

const TIMEOUT_MS = 20_000;
const MAX_CACHE_BYTES = 900_000;

export interface PublicResult<T> {
  data: T;
  fetchedAt: string;
  stale: boolean;
}

const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const keyOf = (url: string) => `pub:${createHash("sha256").update(url).digest("hex").slice(0, 40)}`;
const inflight = new Map<string, Promise<PublicResult<unknown>>>();

function assertAllowed(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(PUBLIC_HOSTS as readonly string[]).includes(u.hostname)) throw new CityError(400, "Fonte pública não permitida.");
}

async function readCache(db: Db, key: string): Promise<{ data: unknown; fetchedAt: string; fresh: boolean } | null> {
  const r = await db.execute({ sql: "SELECT payload, fetched_at, expires_at > datetime('now') AS fresh FROM city_cache WHERE cache_key = ?", args: [key] });
  const row = r.rows[0];
  if (!row) return null;
  try {
    return { data: JSON.parse(String(row.payload)), fetchedAt: String(row.fetched_at), fresh: Number(row.fresh) === 1 };
  } catch {
    return null;
  }
}

async function writeCache(db: Db, key: string, data: unknown, ttl: number) {
  const payload = JSON.stringify(data);
  if (payload.length > MAX_CACHE_BYTES) return;
  await db.execute({
    sql: `INSERT INTO city_cache (cache_key, api, payload, fetched_at, expires_at) VALUES (?, 'publico', ?, datetime('now'), datetime('now', ?))
          ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
    args: [key, payload, `+${ttl} seconds`],
  });
}

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await integrationFetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    } catch {
      clearTimeout(t);
      if (attempt < 1) continue;
      throw new CityError(503, "A fonte pública da Prefeitura não respondeu a tempo.", "indisponivel");
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 500 && attempt < 1) continue;
    if (res.status === 404) throw new CityError(404, "A fonte pública não tem dados para esta consulta.");
    const text = await res.text();
    // Página HTML no lugar de JSON = firewall do portal recusou a consulta.
    if (/^\s*</.test(text)) throw new CityError(503, "O Portal de Dados Abertos recusou esta consulta agora.", "indisponivel");
    if (!res.ok) throw new CityError(503, `A fonte pública respondeu com erro (HTTP ${res.status}).`, "indisponivel");
    try {
      return JSON.parse(text);
    } catch {
      throw new CityError(503, "A fonte pública devolveu uma resposta ilegível.", "indisponivel");
    }
  }
}

/** GET com cache. `extract` reduz a resposta ao que interessa antes de gravar (cache menor). */
export async function publicGet<T>(db: Db, url: string, ttl: number, extract: (raw: unknown) => T): Promise<PublicResult<T>> {
  assertAllowed(url);
  const key = keyOf(url);
  const cached = await readCache(db, key);
  if (cached?.fresh) return { data: cached.data as T, fetchedAt: cached.fetchedAt, stale: false };
  const running = inflight.get(key);
  if (running) return running as Promise<PublicResult<T>>;
  const job = (async (): Promise<PublicResult<T>> => {
    try {
      const data = extract(await fetchJson(url));
      await writeCache(db, key, data, ttl);
      return { data, fetchedAt: now(), stale: false };
    } catch (e) {
      if (cached && e instanceof CityError && e.status !== 404) return { data: cached.data as T, fetchedAt: cached.fetchedAt, stale: true };
      throw e;
    }
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/* ───────────────────────── CKAN ───────────────────────── */

const ckanUrl = (action: string, params: Record<string, string | number>) => {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]));
  return `${CKAN_BASE}/${action}?${qs.toString()}`;
};

function ckanResult(raw: unknown): Json {
  const o = raw as { success?: boolean; result?: Json };
  if (!o || o.success !== true || !o.result) throw new CityError(503, "O Portal de Dados Abertos não concluiu a consulta.", "indisponivel");
  return o.result;
}

export interface CkanField {
  id: string;
  type: string;
}

export interface CkanPeriod {
  key: string;
  label: string;
  year: number;
  kind: "ano" | "tri" | "sem";
  part: number | null;
}

/** "Dados do SP156 - 1º TRI 2025" → 2025-T1; "(2° SEM de 2024)" → 2024-S2; "(2023)" → 2023. */
export function parsePeriod(name: string): CkanPeriod | null {
  const y = name.match(/(20\d{2})/);
  if (!y) return null;
  const year = Number(y[1]);
  const tri = name.match(/(\d)\s*[º°o]?\s*tri/i);
  if (tri) return { key: `${year}-T${tri[1]}`, label: `${tri[1]}º tri ${year}`, year, kind: "tri", part: Number(tri[1]) };
  const sem = name.match(/(\d)\s*[º°o]?\s*sem/i);
  if (sem) return { key: `${year}-S${sem[1]}`, label: `${sem[1]}º sem ${year}`, year, kind: "sem", part: Number(sem[1]) };
  return { key: String(year), label: String(year), year, kind: "ano", part: null };
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function ckanFields(db: Db, resourceId: string): Promise<PublicResult<{ fields: CkanField[]; total: number }>> {
  if (!UUID.test(resourceId)) throw new CityError(400, "Recurso inválido.");
  return publicGet(db, ckanUrl("datastore_search", { resource_id: resourceId, limit: 0 }), PUBLIC_TTL.fields, (raw) => {
    const r = ckanResult(raw);
    const fields = ((r.fields as CkanField[]) ?? []).filter((f) => f.id !== "_id").map((f) => ({ id: String(f.id), type: String(f.type) }));
    return { fields, total: Number(r.total ?? 0) };
  });
}

export interface CkanResource extends CkanPeriod {
  id: string;
  name: string;
  total: number;
  fields: CkanField[];
}

/**
 * Períodos disponíveis de um conjunto: só recursos com datastore ativo, com o nome esperado e com
 * as colunas da base registro a registro (descarta "mais reclamados", planilhas-resumo etc.).
 * Quando o portal publica o mesmo período duas vezes, fica o recurso com mais registros.
 */
export async function ckanPeriods(db: Db, dataset: CkanDataset): Promise<CkanResource[]> {
  const def = CKAN_DATASETS[dataset];
  const pkg = await publicGet(db, ckanUrl("package_show", { id: def.pkg }), PUBLIC_TTL.packages, (raw) => {
    const r = ckanResult(raw);
    return ((r.resources as Json[]) ?? [])
      .filter((x) => x.datastore_active === true && typeof x.id === "string" && UUID.test(x.id as string))
      .map((x) => ({ id: String(x.id), name: String(x.name ?? "").trim() }));
  });
  const candidates = pkg.data.filter((r) => def.match.test(r.name) && !(def.exclude?.test(r.name) ?? false)).map((r) => ({ ...r, period: parsePeriod(r.name) })).filter((r) => r.period);
  const infos = await Promise.allSettled(candidates.map((c) => ckanFields(db, c.id)));
  const best = new Map<string, CkanResource>();
  candidates.forEach((c, i) => {
    const info = infos[i];
    if (info?.status !== "fulfilled") return;
    const names = info.value.data.fields.map((f) => strip(f.id));
    if (!def.requires.every((re) => names.some((n) => re.test(n)))) return;
    const res: CkanResource = { ...c.period!, id: c.id, name: c.name, total: info.value.data.total, fields: info.value.data.fields };
    const prev = best.get(res.key);
    if (!prev || res.total > prev.total) best.set(res.key, res);
  });
  return [...best.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** Coluna de um recurso pelo nome normalizado (sem acento, minúsculas). */
export function fieldOf(fields: CkanField[], re: RegExp): CkanField | null {
  return fields.find((f) => re.test(strip(f.id))) ?? null;
}

export const sql = {
  /** Identificador entre aspas duplas (nomes vêm do próprio portal). */
  id: (s: string) => `"${s.replace(/"/g, '""')}"`,
  /** Literal de texto escapado. */
  lit: (s: string) => `'${s.replace(/'/g, "''")}'`,
};

/** Termo de busca seguro para ILIKE: só letras, números e espaços (sem %, _ ou aspas). */
export function safeTerms(q: string, max = 4): string[] {
  return strip(q)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3)
    .slice(0, max)
    .map((w) => w.slice(0, 30));
}

export async function ckanSql(db: Db, statement: string, ttl: number = PUBLIC_TTL.aggregates): Promise<PublicResult<Json[]>> {
  return publicGet(db, ckanUrl("datastore_search_sql", { sql: statement }), ttl, (raw) => (ckanResult(raw).records as Json[]) ?? []);
}

export async function ckanRows(db: Db, resourceId: string, limit: number): Promise<PublicResult<Json[]>> {
  if (!UUID.test(resourceId)) throw new CityError(400, "Recurso inválido.");
  return publicGet(db, ckanUrl("datastore_search", { resource_id: resourceId, limit }), PUBLIC_TTL.aggregates, (raw) => (ckanResult(raw).records as Json[]) ?? []);
}

/* ───────────────────────── Escola Aberta ───────────────────────── */

const CODESC = /^\d{6}$/;
const DRE = /^[A-Z]{1,3}$/;

export function escolaUrl(path: EscolaPath, params: { codesc?: string; dre?: string } = {}, query: Record<string, string | number> = {}): string {
  let p: string = ESCOLA_PATHS[path];
  if (p.includes("{codesc}")) {
    if (!params.codesc || !CODESC.test(params.codesc)) throw new CityError(400, "Código de escola inválido.");
    p = p.replace("{codesc}", params.codesc);
  }
  if (p.includes("{dre}")) {
    if (!params.dre || !DRE.test(params.dre)) throw new CityError(400, "Diretoria inválida.");
    p = p.replace("{dre}", params.dre);
  }
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== "" && v != null).map(([k, v]): [string, string] => [k, String(v)]));
  return `${ESCOLA_BASE}${p}${qs.toString() ? `?${qs}` : ""}`;
}

export function escolaGet<T = unknown>(db: Db, path: EscolaPath, params: { codesc?: string; dre?: string } = {}, query: Record<string, string | number> = {}) {
  return publicGet<T>(db, escolaUrl(path, params, query), PUBLIC_TTL.escola, (raw) => raw as T);
}

/* ───────────────────────── privacidade ───────────────────────── */

/**
 * Textos livres publicados (pedidos do e-SIC): oculta e-mails, CPFs, telefones e sequências longas
 * de dígitos antes de mostrar. Nomes não são detectáveis com segurança — por isso os trechos são curtos.
 */
export function maskPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\d[\d.\-/ ]{8,}\d/g, "[número]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
