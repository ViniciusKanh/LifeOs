import { api } from "./api";

/** Espelho de /api/city (Cidade Inteligente — apps/api/src/services/cityService.ts e apilibClient.ts). */

export type CityApi = "dom" | "licitacoes" | "fila" | "escolas" | "prato" | "procon" | "sp156" | "esic" | "idhm" | "censo" | "lentidao" | "sof";
export type CityDomain = "oportunidades" | "saude" | "educacao" | "consumo" | "cidadania" | "territorial" | "mobilidade" | "financas";
export type CityApiState = "nao_configurada" | "configurada" | "conectada" | "credencial_invalida" | "sem_autorizacao" | "indisponivel" | "limite" | "desatualizada" | "desativada";
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export interface ParamDef {
  in: "path" | "query";
  type: "int" | "day" | "text" | "enum";
  required?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  maxLength?: number;
  label: string;
}
export interface CatalogEntry {
  id: CityApi;
  name: string;
  apilibName: string;
  version: string;
  domain: CityDomain;
  group: string;
  route: string;
  source: string;
  coverage: string;
  methodology: string;
  limitations: string[];
  schemaDocumented: boolean;
  resources: Record<string, { label: string; paging: "limit_offset" | "page" | null; ttlSeconds: number; params: Record<string, ParamDef> }>;
}

export interface CredentialStatus {
  source: "pessoal" | "servidor" | null;
  mode: "token" | "client" | null;
  masked: string | null;
  disabled: CityApi[];
}
export interface ApiStatusView {
  api: CityApi;
  state: CityApiState;
  message: string | null;
  checkedAt: string | null;
  lastOkAt: string | null;
}
export interface StatusResponse {
  credential: CredentialStatus;
  apis: ApiStatusView[];
}

export interface FetchMeta {
  api: CityApi;
  resource: string;
  params: Record<string, string>;
  total: number | null;
  count: number;
  truncated: boolean;
  redacted: string[];
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
  staleReason: string | null;
}

export interface Publication {
  key: string;
  title: string;
  kind: string | null;
  section: string | null;
  advertiser: string | null;
  status: "publicado" | "recebido" | "cancelado" | "teste" | "outro";
  statusLabel: string | null;
  date: string | null;
  notebook: string | null;
  files: string[];
  matches: string[];
}
export type TenderPhase = "aberta" | "em_andamento" | "encerrada" | "sem_data";
export interface TenderEvent {
  key: string;
  object: string;
  modality: string | null;
  event: string | null;
  status: string | null;
  process: string | null;
  agency: string | null;
  segment: string | null;
  place: string | null;
  phase: TenderPhase;
  nextDeadline: { label: string; at: string } | null;
  values: Array<{ kind: "estimado" | "homologado" | "contratado"; value: number }>;
  contractor: string | null;
  publishedAt: string | null;
}
export type QueueLevel = "sem_fila" | "pequena" | "media" | "grande" | "fechado" | "desconhecida";
export interface QueuePost {
  key: string;
  unit: string;
  address: string | null;
  statusText: string | null;
  level: QueueLevel;
  updatedAt: string | null;
  outdated: boolean;
  vaccines: Array<{ name: string; available: boolean }>;
}

export interface Favorite {
  id: string;
  api: CityApi;
  itemKey: string;
  title: string;
  subtitle: string | null;
  url: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
export interface CityAlert {
  id: string;
  source: "publicacoes" | "licitacoes";
  name: string;
  keywords: string[];
  active: boolean;
  lastRunDay: string | null;
  lastHits: number;
}
export type ProtocolStatus = "aberto" | "em_andamento" | "respondido" | "encerrado";
export interface Protocol {
  id: string;
  kind: "sp156" | "esic";
  number: string;
  title: string;
  status: ProtocolStatus;
  notes: string | null;
  openedOn: string | null;
  updatedAt: string;
}
export interface HistoryEntry {
  day: string;
  api: CityApi;
  action: string;
  ref: string;
  label: string | null;
  at: string;
}
export interface CityPrefs {
  interests: CityDomain[];
  widgets: string[];
}

export type Block<T> = { ok: true; data: T; fetchedAt: string; stale: boolean } | { ok: false; state: CityApiState | null; error: string } | null;
export interface Overview {
  today: string;
  referenceDay: string;
  credential: CredentialStatus;
  apis: ApiStatusView[];
  prefs: CityPrefs;
  radar: {
    publications: Block<{ day: string; total: number; matched: Publication[]; byKind: Array<{ label: string; count: number }> }>;
    tenders: Block<{ day: string; total: number; open: TenderEvent[] }>;
    queue: Block<{ total: number; byLevel: Array<{ label: string; count: number }>; outdated: number }>;
  };
  favorites: Favorite[];
  favoritesTotal: number;
  alerts: CityAlert[];
  protocols: Protocol[];
  history: HistoryEntry[];
}

export interface OracleAnswer {
  ai: boolean;
  items: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string }>;
  disclaimer: string;
  sampleSize: number;
}

const qs = (p: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const cityService = {
  catalog: () => api.get<CatalogEntry[]>("/city/catalog"),
  status: () => api.get<StatusResponse>("/city/status"),
  overview: () => api.get<Overview>("/city/overview"),
  saveToken: (token: string) => api.put<{ ok: true; apis: ApiStatusView[] }>("/city/credentials", { mode: "token", token }),
  saveClient: (key: string, secret: string) => api.put<{ ok: true; apis: ApiStatusView[] }>("/city/credentials", { mode: "client", key, secret }),
  removeCredential: () => api.delete<{ ok: true }>("/city/credentials"),
  setDisabled: (disabled: CityApi[]) => api.put<StatusResponse>("/city/apis/disabled", { disabled }),
  test: (apis?: CityApi[]) => api.post<{ apis: ApiStatusView[] }>("/city/test", apis ? { apis } : {}),

  dom: (day: string, caderno: number, force = false) => api.get<FetchMeta & { publications: Publication[] }>(`/city/dom${qs({ day, caderno, force: force ? 1 : null })}`),
  domTenders: (day: string, caderno: number, force = false) => api.get<FetchMeta & { tenders: TenderEvent[] }>(`/city/dom/licitacoes${qs({ day, caderno, force: force ? 1 : null })}`),
  queue: (force = false) => api.get<FetchMeta & { posts: QueuePost[] }>(`/city/fila${qs({ force: force ? 1 : null })}`),
  data: (apiId: CityApi, resource: string, params: Record<string, string | number | undefined | null>, force = false) =>
    api.get<FetchMeta & { items: Row[] }>(`/city/data/${apiId}/${resource}${qs({ ...params, force: force ? 1 : null })}`),

  activity: (body: { api: CityApi; action: "read" | "explore" | "compare" | "territory"; ref: string; label?: string }) => api.post<{ recorded: boolean; xp: number }>("/city/activity", body),
  history: () => api.get<HistoryEntry[]>("/city/history"),

  favorites: (apiId?: CityApi) => api.get<Favorite[]>(`/city/favorites${qs({ api: apiId })}`),
  addFavorite: (f: { api: CityApi; itemKey: string; title: string; subtitle?: string | null; url?: string | null; payload?: Record<string, Cell> }) =>
    api.post<{ id: string; created: boolean; xp: number }>("/city/favorites", f),
  removeFavorite: (id: string) => api.delete<{ ok: true }>(`/city/favorites/${id}`),
  favoriteToTask: (id: string, dueDate: string | null) => api.post<{ id: string }>(`/city/favorites/${id}/task`, { dueDate }),
  favoriteToEvent: (id: string, startsAt: string) => api.post<{ id: string }>(`/city/favorites/${id}/event`, { startsAt }),

  alerts: () => api.get<CityAlert[]>("/city/alerts"),
  createAlert: (a: Omit<CityAlert, "id" | "lastRunDay" | "lastHits">) => api.post<{ id: string }>("/city/alerts", a),
  updateAlert: (id: string, a: Omit<CityAlert, "id" | "lastRunDay" | "lastHits">) => api.put<{ id: string }>(`/city/alerts/${id}`, a),
  removeAlert: (id: string) => api.delete<{ ok: true }>(`/city/alerts/${id}`),
  runAlerts: () => api.post<{ hits: number; alerts: CityAlert[] }>("/city/alerts/run", {}),

  protocols: () => api.get<Protocol[]>("/city/protocols"),
  createProtocol: (p: Omit<Protocol, "id" | "updatedAt">) => api.post<{ id: string }>("/city/protocols", p),
  updateProtocol: (id: string, p: Omit<Protocol, "id" | "updatedAt">) => api.put<{ id: string }>(`/city/protocols/${id}`, p),
  removeProtocol: (id: string) => api.delete<{ ok: true }>(`/city/protocols/${id}`),

  prefs: () => api.get<CityPrefs>("/city/prefs"),
  savePrefs: (p: CityPrefs) => api.put<CityPrefs>("/city/prefs", p),

  oracle: (body: { api: CityApi; resource: string; params: Record<string, string | number>; question: string | null }) => api.post<OracleAnswer>("/city/oracle", body),
};
