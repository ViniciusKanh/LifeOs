import type { Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { integrationFetch } from "./integrationsCore.js";
import {
  APILIB_ALLOWED_HOST,
  APILIB_DEFAULT_TOKEN_URL,
  APILIB_GATEWAY,
  CITY_APIS,
  CITY_API_DEFS,
  type CityApi,
  type CityApiState,
  type ParamDef,
} from "../config/apilib.js";

/**
 * Cliente central do APILIB (Prefeitura de São Paulo).
 *
 * - Credencial por usuário, criptografada (cryptoService); fallback do servidor por variável
 *   de ambiente (APILIB_ACCESS_TOKEN ou APILIB_CONSUMER_KEY + APILIB_CONSUMER_SECRET).
 * - Dois modos: token de acesso gerado no Store, ou consumer key/secret (client_credentials).
 * - Só monta URLs a partir do catálogo (config/apilib.ts) com parâmetros validados.
 * - Timeout, retry com backoff exponencial + jitter (429/5xx/timeout), respeita Retry-After,
 *   circuit breaker por API, deduplicação de chamadas simultâneas e cache com fallback "stale".
 * - Nenhum token/segredo aparece em erros, logs ou respostas.
 */

export class CityError extends Error {
  constructor(public status: number, message: string, public state: CityApiState | null = null) {
    super(message);
  }
}

type Db = Client;

/* ───────────────────────── credenciais ───────────────────────── */

export type CredMode = "token" | "client";
export interface CredentialStatus {
  source: "pessoal" | "servidor" | null;
  mode: CredMode | null;
  masked: string | null;
  disabled: CityApi[];
}
interface ResolvedCred {
  mode: CredMode;
  token?: string;
  key?: string;
  secret?: string;
  /** Identificador estável (hash) da credencial — chave do cache de token, nunca exibido. */
  fingerprint: string;
}

const mask = (k: string) => (k.length <= 4 ? "••••" : `••••${k.slice(-4)}`);
const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const cleanCredential = (v: string) => v.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^Bearer\s+/i, "").trim();

function parseDisabled(v: unknown): CityApi[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    return Array.isArray(arr) ? arr.filter((x): x is CityApi => (CITY_APIS as readonly string[]).includes(String(x))) : [];
  } catch {
    return [];
  }
}

function envCredential(): ResolvedCred | null {
  const token = process.env.APILIB_ACCESS_TOKEN?.trim();
  if (token) return { mode: "token", token, fingerprint: fp(`env:t:${token}`) };
  const key = process.env.APILIB_CONSUMER_KEY?.trim();
  const secret = process.env.APILIB_CONSUMER_SECRET?.trim();
  if (key && secret) return { mode: "client", key, secret, fingerprint: fp(`env:c:${key}`) };
  return null;
}

export async function resolveCredential(db: Db, ownerId: string): Promise<{ cred: ResolvedCred | null; status: CredentialStatus }> {
  const r = await db.execute({ sql: "SELECT mode, token_enc, key_enc, secret_enc, masked, disabled_json FROM city_credentials WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  const disabled = parseDisabled(row?.disabled_json);
  if (row && (row.token_enc || row.key_enc)) {
    try {
      const mode = String(row.mode) as CredMode;
      const cred: ResolvedCred =
        mode === "token"
          ? { mode, token: decryptSecret(String(row.token_enc)), fingerprint: "" }
          : { mode, key: decryptSecret(String(row.key_enc)), secret: decryptSecret(String(row.secret_enc)), fingerprint: "" };
      cred.fingerprint = fp(`${ownerId}:${mode}:${cred.token ?? cred.key}`);
      return { cred, status: { source: "pessoal", mode, masked: row.masked == null ? null : String(row.masked), disabled } };
    } catch {
      // Chave de criptografia do servidor trocada: tenta a credencial do servidor.
    }
  }
  const env = envCredential();
  return { cred: env, status: { source: env ? "servidor" : null, mode: env?.mode ?? null, masked: null, disabled } };
}

export async function saveCredential(db: Db, ownerId: string, input: { mode: "token"; token: string } | { mode: "client"; key: string; secret: string }) {
  const masked = input.mode === "token" ? mask(cleanCredential(input.token)) : mask(cleanCredential(input.key));
  await db.execute({
    sql: `INSERT INTO city_credentials (owner_id, mode, token_enc, key_enc, secret_enc, masked) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET mode = excluded.mode, token_enc = excluded.token_enc, key_enc = excluded.key_enc,
            secret_enc = excluded.secret_enc, masked = excluded.masked, updated_at = datetime('now')`,
    args: [
      ownerId,
      input.mode,
      input.mode === "token" ? encryptSecret(cleanCredential(input.token)) : null,
      input.mode === "client" ? encryptSecret(cleanCredential(input.key)) : null,
      input.mode === "client" ? encryptSecret(cleanCredential(input.secret)) : null,
      masked,
    ],
  });
  forgetTokens(ownerId);
  // Credencial nova: estados anteriores (inclusive "conectada") deixam de valer.
  await db.execute({ sql: "DELETE FROM city_api_status WHERE owner_id = ?", args: [ownerId] });
}

export async function deleteCredential(db: Db, ownerId: string) {
  await db.execute({ sql: "UPDATE city_credentials SET token_enc = NULL, key_enc = NULL, secret_enc = NULL, masked = NULL, updated_at = datetime('now') WHERE owner_id = ?", args: [ownerId] });
  await db.execute({ sql: "DELETE FROM city_api_status WHERE owner_id = ?", args: [ownerId] });
  forgetTokens(ownerId);
}

export async function setDisabledApis(db: Db, ownerId: string, disabled: CityApi[]) {
  const json = JSON.stringify([...new Set(disabled)]);
  await db.execute({
    sql: `INSERT INTO city_credentials (owner_id, mode, disabled_json) VALUES (?, 'token', ?)
          ON CONFLICT (owner_id) DO UPDATE SET disabled_json = excluded.disabled_json, updated_at = datetime('now')`,
    args: [ownerId, json],
  });
}

/* ───────────────────────── token (client_credentials) ───────────────────────── */

const tokenCache = new Map<string, { token: string; exp: number; owner: string }>();
function forgetTokens(ownerId: string) {
  for (const [k, v] of tokenCache) if (v.owner === ownerId) tokenCache.delete(k);
}

/** URL do token: só o servidor configura, e só dentro do domínio do APILIB. */
export function tokenUrl(): string {
  const raw = process.env.APILIB_TOKEN_URL?.trim() || APILIB_DEFAULT_TOKEN_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !APILIB_ALLOWED_HOST.test(u.hostname)) return APILIB_DEFAULT_TOKEN_URL;
    return u.toString();
  } catch {
    return APILIB_DEFAULT_TOKEN_URL;
  }
}

async function accessToken(cred: ResolvedCred, ownerId: string, fresh = false): Promise<string> {
  if (cred.mode === "token") return cred.token!;
  const cached = tokenCache.get(cred.fingerprint);
  if (!fresh && cached && cached.exp > Date.now() + 30_000) return cached.token;
  let res: Response;
  try {
    res = await withTimeout((signal) =>
      integrationFetch(tokenUrl(), {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${cred.key}:${cred.secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal,
      }),
    );
  } catch {
    throw new CityError(503, "O serviço de autenticação do APILIB não respondeu.", "indisponivel");
  }
  if (res.status === 400 || res.status === 401) throw new CityError(422, "O APILIB recusou a Consumer Key/Secret. Confira no Store (Applications → Production Keys).", "credencial_invalida");
  if (!res.ok) throw new CityError(503, `O serviço de autenticação do APILIB respondeu ${res.status}.`, "indisponivel");
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const token = typeof body?.access_token === "string" ? body.access_token : null;
  if (!token) throw new CityError(503, "Resposta inesperada do serviço de autenticação do APILIB.", "indisponivel");
  const ttl = Math.max(60, Math.min(Number(body?.expires_in) || 3600, 24 * 3600));
  tokenCache.set(cred.fingerprint, { token, exp: Date.now() + ttl * 1000, owner: ownerId });
  return token;
}

/* ───────────────────────── validação de parâmetros e URL ───────────────────────── */

export type ParamInput = Record<string, string | number | undefined | null>;

function maxOf(def: ParamDef): number | undefined {
  return def.max === "currentYear" ? new Date().getUTCFullYear() : def.max;
}

/** Valida e normaliza os parâmetros contra o catálogo. Parâmetros desconhecidos são rejeitados. */
export function validateParams(api: CityApi, resource: string, input: ParamInput): Record<string, string> {
  const res = CITY_API_DEFS[api].resources[resource];
  if (!res) throw new CityError(400, "Recurso desconhecido para esta API.");
  const out: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (input[key] == null || input[key] === "") continue;
    if (!res.params[key]) throw new CityError(400, `Parâmetro não suportado: ${key.slice(0, 30)}.`);
  }
  for (const [key, def] of Object.entries(res.params)) {
    const raw = input[key];
    if (raw == null || raw === "") {
      if (def.required) throw new CityError(400, `Informe ${def.label.toLowerCase()}.`);
      continue;
    }
    const v = String(raw).trim();
    if (def.type === "int") {
      if (!/^\d{1,9}$/.test(v)) throw new CityError(400, `${def.label} inválido.`);
      const n = Number(v);
      const max = maxOf(def);
      if ((def.min != null && n < def.min) || (max != null && n > max)) throw new CityError(400, `${def.label} fora do intervalo disponível (${def.min ?? 0}–${max}).`);
      out[key] = String(n);
    } else if (def.type === "day") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new CityError(400, `${def.label} inválida.`);
      out[key] = v;
    } else if (def.type === "enum") {
      if (!def.values?.includes(v)) throw new CityError(400, `${def.label} inválido.`);
      out[key] = v;
    } else {
      // Texto livre: só letras, números, espaço e pontuação simples — vai como query/segmento codificado.
      if (v.length > (def.maxLength ?? 80) || !/^[\p{L}\p{N} .,'()/-]+$/u.test(v)) throw new CityError(400, `${def.label} tem caracteres inválidos.`);
      out[key] = v;
    }
  }
  return out;
}

export function buildUrl(api: CityApi, resource: string, params: Record<string, string>): string {
  const def = CITY_API_DEFS[api];
  const res = def.resources[resource]!;
  let path = res.path;
  const query = new URLSearchParams();
  for (const [key, p] of Object.entries(res.params)) {
    const v = params[key];
    if (v == null) continue;
    if (p.in === "path") path = path.replace(`{${key}}`, encodeURIComponent(v));
    else query.set(key, v);
  }
  if (/\{[^}]+\}/.test(path)) throw new CityError(400, "Parâmetro obrigatório ausente.");
  const url = new URL(`${APILIB_GATEWAY}${def.base}${path}`);
  url.search = query.toString();
  // Defesa extra: o host final precisa ser o gateway do APILIB.
  if (!APILIB_ALLOWED_HOST.test(url.hostname) || url.protocol !== "https:") throw new CityError(400, "Destino não permitido.");
  return url.toString();
}

/* ───────────────────────── normalização ───────────────────────── */

const PII_KEY = /(cpf(?!cnpj)|e-?mail|telefone|celular|^rg$|_rg$|nome_?(do_?)?(consumidor|solicitante|requerente|reclamante|munic[ií]pe|cidad[aã]o)|endereco_?(do_?)?(consumidor|solicitante|requerente|munic))/i;
const MAX_ITEMS = 1000;
const MAX_STR = 600;

export type Row = Record<string, string | number | boolean | null>;
export interface Normalized {
  items: Row[];
  total: number | null;
  /** Campos removidos por privacidade (nomes, não valores). */
  redacted: string[];
  truncated: boolean;
}

/** Achata um registro (1 nível de objetos aninhados vira "pai.filho"), corta textos e remove dados pessoais. */
function flattenRow(obj: Record<string, unknown>, redacted: Set<string>): Row {
  const out: Row = {};
  const put = (k: string, v: unknown) => {
    if (PII_KEY.test(k)) {
      redacted.add(k);
      return;
    }
    if (/cpfcnpj|cpf_cnpj/i.test(k) && typeof v === "string") {
      // CNPJ (14 dígitos) é público; CPF (11) de pessoa física é ocultado.
      const d = v.replace(/\D/g, "");
      if (d.length !== 14) {
        redacted.add(k);
        return;
      }
    }
    if (v == null) out[k] = null;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…` : v;
    else if (Array.isArray(v)) out[k] = v.length === 0 ? null : JSON.stringify(v).slice(0, MAX_STR);
  };
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) put(`${k}.${k2}`, v2);
    } else put(k, v);
  }
  return out;
}

function largestObjectArray(obj: Record<string, unknown>): unknown[] | null {
  let best: unknown[] | null = null;
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && !Array.isArray(x)) && (!best || v.length > best.length)) best = v;
  }
  return best;
}

/** Envelopes conhecidos: array direto, {total, data} (Portal de Dados Abertos), {count, results} (DRF) e, por fim, o maior array de objetos. */
export function normalizePayload(payload: unknown): Normalized {
  let arr: unknown[] = [];
  let total: number | null = null;
  if (Array.isArray(payload)) arr = payload;
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    const direct = [o.data, o.results, o.items, o.registros, o.content].find((v) => Array.isArray(v)) as unknown[] | undefined;
    arr = direct ?? largestObjectArray(o) ?? [o];
    for (const k of ["total", "count", "totalRegistros", "totalElements", "quantidade"]) {
      const n = Number(o[k]);
      if (o[k] != null && Number.isFinite(n)) {
        total = n;
        break;
      }
    }
  }
  const redacted = new Set<string>();
  const objs = arr.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
  const items = objs.slice(0, MAX_ITEMS).map((x) => flattenRow(x, redacted));
  return { items, total: total ?? (Array.isArray(payload) ? arr.length : null), redacted: [...redacted].sort(), truncated: objs.length > MAX_ITEMS };
}

/* ───────────────────────── resiliência ───────────────────────── */

const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BREAKER_FAILS = 4;
const BREAKER_OPEN_MS = 60_000;
const MAX_RETRY_AFTER_MS = 8_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let sleepImpl = sleep;
/** Só para testes: evita esperar o backoff real. */
export function setCitySleepForTests(fn: ((ms: number) => Promise<void>) | null) {
  sleepImpl = fn ?? sleep;
}

export function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(ms) && ms > 0) return Math.min(ms, MAX_RETRY_AFTER_MS);
  }
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * base * 0.5); // jitter de até 50%
}

const breakers = new Map<CityApi, { fails: number; openUntil: number }>();
export function resetCityBreakersForTests() {
  breakers.clear();
  inflight.clear();
  tokenCache.clear();
}
const breakerOpen = (api: CityApi) => (breakers.get(api)?.openUntil ?? 0) > Date.now();
function breakerResult(api: CityApi, ok: boolean) {
  if (ok) return void breakers.delete(api);
  const b = breakers.get(api) ?? { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= BREAKER_FAILS) {
    b.openUntil = Date.now() + BREAKER_OPEN_MS;
    b.fails = 0;
  }
  breakers.set(api, b);
}

function stateFromHttp(status: number): { state: CityApiState; http: number; message: string } {
  if (status === 401) return { state: "credencial_invalida", http: 422, message: "O APILIB não aceitou a credencial (token expirado ou inválido)." };
  if (status === 403) return { state: "sem_autorizacao", http: 403, message: "Sua aplicação no APILIB não está inscrita nesta API. Assine-a no Store." };
  if (status === 429) return { state: "limite", http: 429, message: "Limite de requisições do APILIB atingido. Tente de novo em alguns minutos." };
  if (status === 404) return { state: "indisponivel", http: 404, message: "A API não encontrou dados para esse filtro." };
  return { state: "indisponivel", http: 503, message: `O serviço da Prefeitura respondeu ${status}.` };
}

/** Uma chamada real ao gateway, com retry/backoff. Devolve o JSON (ou erro tipado). */
async function gatewayGet(api: CityApi, url: string, cred: ResolvedCred, ownerId: string): Promise<unknown> {
  let token = await accessToken(cred, ownerId);
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await withTimeout((signal) => integrationFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal }));
    } catch {
      if (attempt < MAX_RETRIES) {
        await sleepImpl(retryDelay(attempt, null));
        continue;
      }
      breakerResult(api, false);
      throw new CityError(503, "O serviço da Prefeitura não respondeu a tempo.", "indisponivel");
    }
    // Token de client_credentials expirado antes do previsto: renova uma vez.
    if (res.status === 401 && cred.mode === "client" && !refreshed) {
      refreshed = true;
      token = await accessToken(cred, ownerId, true);
      attempt--;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleepImpl(retryDelay(attempt, res.headers.get("retry-after")));
      continue;
    }
    if (!res.ok) {
      const m = stateFromHttp(res.status);
      if (res.status >= 500) breakerResult(api, false);
      throw new CityError(m.http, m.message, m.state);
    }
    breakerResult(api, true);
    const text = await res.text();
    if (!text.trim()) return [];
    try {
      return JSON.parse(text);
    } catch {
      throw new CityError(502, "A Prefeitura respondeu num formato inesperado.", "indisponivel");
    }
  }
}

/* ───────────────────────── status por usuário ───────────────────────── */

async function writeStatus(db: Db, ownerId: string, api: CityApi, state: CityApiState, message: string | null, http: number | null) {
  const ok = state === "conectada";
  await db.execute({
    sql: `INSERT INTO city_api_status (owner_id, api, state, message, http_status, checked_at, last_ok_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)
          ON CONFLICT (owner_id, api) DO UPDATE SET state = excluded.state, message = excluded.message, http_status = excluded.http_status,
            checked_at = excluded.checked_at, last_ok_at = COALESCE(excluded.last_ok_at, city_api_status.last_ok_at)`,
    args: [ownerId, api, state, message, http, ok ? 1 : 0],
  });
}

export interface ApiStatusView {
  api: CityApi;
  state: CityApiState;
  message: string | null;
  checkedAt: string | null;
  lastOkAt: string | null;
}

export async function listApiStatus(db: Db, ownerId: string): Promise<{ credential: CredentialStatus; apis: ApiStatusView[] }> {
  const [{ status }, r] = await Promise.all([resolveCredential(db, ownerId), db.execute({ sql: "SELECT api, state, message, checked_at, last_ok_at FROM city_api_status WHERE owner_id = ?", args: [ownerId] })]);
  const byApi = new Map(r.rows.map((x) => [String(x.api), x]));
  const apis = CITY_APIS.map((api): ApiStatusView => {
    const row = byApi.get(api);
    const base = { api, checkedAt: row?.checked_at == null ? null : String(row.checked_at), lastOkAt: row?.last_ok_at == null ? null : String(row.last_ok_at) };
    if (status.disabled.includes(api)) return { ...base, state: "desativada", message: "Desativada por você." };
    if (!status.source) return { ...base, state: "nao_configurada", message: "Cadastre a credencial do APILIB." };
    if (!row) return { ...base, state: "configurada", message: "Credencial cadastrada — ainda sem consulta bem-sucedida." };
    return { ...base, state: String(row.state) as CityApiState, message: row.message == null ? null : String(row.message) };
  });
  return { credential: status, apis };
}

/* ───────────────────────── consulta com cache ───────────────────────── */

export interface CityFetchResult extends Normalized {
  api: CityApi;
  resource: string;
  params: Record<string, string>;
  fetchedAt: string;
  fromCache: boolean;
  /** Dado servido do cache vencido porque a API falhou agora. */
  stale: boolean;
  staleReason: string | null;
}

const MAX_CACHE_BYTES = 900_000;
const inflight = new Map<string, Promise<CityFetchResult>>();

export function cacheKeyOf(api: CityApi, resource: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${api}:${resource}?${sorted}`;
}

async function readCache(db: Db, key: string): Promise<{ data: Normalized; fetchedAt: string; fresh: boolean } | null> {
  const r = await db.execute({ sql: "SELECT payload, fetched_at, expires_at > datetime('now') AS fresh FROM city_cache WHERE cache_key = ?", args: [key] });
  const row = r.rows[0];
  if (!row) return null;
  try {
    return { data: JSON.parse(String(row.payload)) as Normalized, fetchedAt: String(row.fetched_at), fresh: Number(row.fresh) === 1 };
  } catch {
    return null;
  }
}

async function writeCache(db: Db, key: string, api: CityApi, data: Normalized, ttl: number) {
  let payload = JSON.stringify(data);
  if (payload.length > MAX_CACHE_BYTES) {
    // Respostas grandes: guarda só a parte que cabe (marcada como truncada).
    const ratio = MAX_CACHE_BYTES / payload.length;
    const cut = { ...data, items: data.items.slice(0, Math.max(1, Math.floor(data.items.length * ratio * 0.9))), truncated: true };
    payload = JSON.stringify(cut);
    if (payload.length > MAX_CACHE_BYTES) return;
  }
  await db.execute({
    sql: `INSERT INTO city_cache (cache_key, api, payload, fetched_at, expires_at) VALUES (?, ?, ?, datetime('now'), datetime('now', ?))
          ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
    args: [key, api, payload, `+${ttl} seconds`],
  });
}

/**
 * Consulta um recurso do catálogo para o usuário. Exige credencial (pessoal ou do servidor) e
 * API habilitada. Usa o cache válido; se a API falhar, devolve o cache vencido marcado como
 * desatualizado — nunca dado simulado.
 */
export async function cityFetch(db: Db, ownerId: string, api: CityApi, resource: string, input: ParamInput, opts: { force?: boolean } = {}): Promise<CityFetchResult> {
  const def = CITY_API_DEFS[api];
  if (!def) throw new CityError(404, "API desconhecida.");
  const params = validateParams(api, resource, input);
  const { cred, status } = await resolveCredential(db, ownerId);
  if (status.disabled.includes(api)) throw new CityError(409, "Esta API está desativada nas suas configurações da Cidade Inteligente.", "desativada");
  if (!cred) throw new CityError(412, "Cadastre sua credencial do APILIB para consultar os dados da Prefeitura.", "nao_configurada");

  const key = cacheKeyOf(api, resource, params);
  const cached = await readCache(db, key);
  const base = { api, resource, params };
  if (cached?.fresh && !opts.force) return { ...base, ...cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: false, staleReason: null };

  const flightKey = `${cred.fingerprint}|${key}`;
  const running = inflight.get(flightKey);
  if (running) return running;

  const job = (async (): Promise<CityFetchResult> => {
    const fallback = (err: CityError): CityFetchResult => {
      if (!cached) throw err;
      return { ...base, ...cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, staleReason: err.message };
    };
    if (breakerOpen(api)) {
      const err = new CityError(503, "A API da Prefeitura falhou várias vezes seguidas; nova tentativa em instantes.", "indisponivel");
      await writeStatus(db, ownerId, api, cached ? "desatualizada" : "indisponivel", err.message, 503);
      return fallback(err);
    }
    try {
      const raw = await gatewayGet(api, buildUrl(api, resource, params), cred, ownerId);
      const data = normalizePayload(raw);
      await writeCache(db, key, api, data, def.resources[resource]!.ttl);
      await writeStatus(db, ownerId, api, "conectada", null, 200);
      return { ...base, ...data, fetchedAt: new Date().toISOString().replace("T", " ").slice(0, 19), fromCache: false, stale: false, staleReason: null };
    } catch (e) {
      if (!(e instanceof CityError)) throw e;
      // 404 do backend da Prefeitura = filtro sem dados; o gateway aceitou a credencial.
      if (e.status === 404) await writeStatus(db, ownerId, api, "conectada", "Sem dados para o último filtro consultado.", 404);
      else if (e.state) await writeStatus(db, ownerId, api, cached && e.state === "indisponivel" ? "desatualizada" : e.state, e.message, e.status);
      if (e.status === 404) return { ...base, items: [], total: 0, redacted: [], truncated: false, fetchedAt: new Date().toISOString().replace("T", " ").slice(0, 19), fromCache: false, stale: false, staleReason: null };
      // Credencial/autorização: não mascara com cache — o usuário precisa agir.
      if (e.state === "credencial_invalida" || e.state === "sem_autorizacao") throw e;
      return fallback(e);
    }
  })();
  inflight.set(flightKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(flightKey);
  }
}

/** Resolve os marcadores do probe (data de hoje em SP, ano corrente). */
function probeParams(api: CityApi): Record<string, string | number> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(CITY_API_DEFS[api].probe.params)) out[k] = v === "TODAY" ? today : v === "CURRENT_YEAR" ? new Date().getUTCFullYear() : v;
  return out;
}

/** Testa a conexão de cada API habilitada com uma consulta real e barata. */
export async function testConnections(db: Db, ownerId: string, only?: CityApi[]): Promise<ApiStatusView[]> {
  const { status } = await resolveCredential(db, ownerId);
  const targets = (only?.length ? only : [...CITY_APIS]).filter((a) => !status.disabled.includes(a));
  await Promise.all(
    targets.map(async (api) => {
      try {
        await cityFetch(db, ownerId, api, CITY_API_DEFS[api].probe.resource, probeParams(api), { force: true });
      } catch {
        // O estado já foi gravado por cityFetch.
      }
    }),
  );
  return (await listApiStatus(db, ownerId)).apis;
}
