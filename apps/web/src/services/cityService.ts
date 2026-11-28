import { api } from "./api";

/** Espelho de /api/city (Cidade Inteligente — apps/api/src/services/cityService.ts, cityValues.ts e apilibClient.ts). */

export type CityApi = "licitacoes" | "escolas" | "prato" | "procon" | "sp156" | "esic" | "lentidao" | "sof";
export type CityDomain = "oportunidades" | "educacao" | "consumo" | "cidadania" | "mobilidade" | "financas";
export type CityApiState = "nao_configurada" | "configurada" | "conectada" | "credencial_invalida" | "sem_autorizacao" | "indisponivel" | "limite" | "desatualizada" | "desativada";
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

/** Tipo da coluna decidido pelo servidor: a tela só formata (R$, datas, %, tempos). */
export type ColumnKind = "money" | "number" | "percent" | "date" | "datetime" | "duration" | "code" | "text";
export interface ColumnMeta {
  key: string;
  label: string;
  kind: ColumnKind;
}

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
  resources: Record<string, { label: string; paging: "limit_offset" | "page" | "numPagina" | null; ttlSeconds: number; insights: boolean; params: Record<string, ParamDef> }>;
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
  truncated: boolean;
  redacted: string[];
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
  staleReason: string | null;
}
export interface DataResponse extends FetchMeta {
  columns: ColumnMeta[];
  rows: Row[];
}

export interface Insights {
  sampleSize: number;
  dims: Array<{ label: string; column: string; items: Array<{ label: string; count: number }>; distinct: number }>;
  measures: Array<{ label: string; column: string; value: number; agg: "sum" | "avg" | "max"; filled: number; kind: ColumnKind }>;
  series: { label: string; column: string; by: "day" | "month" | "hour" | "weekday"; kind: ColumnKind | "count"; points: Array<{ x: string; y: number }> } | null;
  ranking: { label: string; dim: string; measure: string; kind: ColumnKind; items: Array<{ label: string; value: number }> } | null;
}
export interface InsightsResponse extends FetchMeta {
  insights: Insights | null;
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
export interface RadarData {
  params: Record<string, string | number>;
  total: number | null;
  sample: number;
  truncated: boolean;
  insights: Insights | null;
}
export interface Overview {
  today: string;
  credential: CredentialStatus;
  apis: ApiStatusView[];
  prefs: CityPrefs;
  radar: { orcamento: Block<RadarData>; transparencia: Block<RadarData>; atendimento: Block<RadarData>; contratos: Block<RadarData> };
  favorites: Favorite[];
  favoritesTotal: number;
  protocols: Protocol[];
  history: HistoryEntry[];
}

export interface OracleAnswer {
  ai: boolean;
  items: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string }>;
  disclaimer: string;
  sampleSize: number;
}

export type Params = Record<string, string | number | undefined | null>;
const qs = (p: Params) => {
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

  data: (apiId: CityApi, resource: string, params: Params, force = false) => api.get<DataResponse>(`/city/data/${apiId}/${resource}${qs({ ...params, force: force ? 1 : null })}`),
  insights: (apiId: CityApi, resource: string, params: Params) => api.get<InsightsResponse>(`/city/insights/${apiId}/${resource}${qs(params)}`),

  activity: (body: { api: CityApi; action: "read" | "explore" | "compare" | "territory"; ref: string; label?: string }) => api.post<{ recorded: boolean; xp: number }>("/city/activity", body),
  history: () => api.get<HistoryEntry[]>("/city/history"),

  favorites: (apiId?: CityApi) => api.get<Favorite[]>(`/city/favorites${qs({ api: apiId })}`),
  addFavorite: (f: { api: CityApi; itemKey: string; title: string; subtitle?: string | null; url?: string | null; payload?: Record<string, Cell> }) =>
    api.post<{ id: string; created: boolean; xp: number }>("/city/favorites", f),
  removeFavorite: (id: string) => api.delete<{ ok: true }>(`/city/favorites/${id}`),
  favoriteToTask: (id: string, dueDate: string | null) => api.post<{ id: string }>(`/city/favorites/${id}/task`, { dueDate }),
  favoriteToEvent: (id: string, startsAt: string) => api.post<{ id: string }>(`/city/favorites/${id}/event`, { startsAt }),

  protocols: () => api.get<Protocol[]>("/city/protocols"),
  createProtocol: (p: Omit<Protocol, "id" | "updatedAt">) => api.post<{ id: string }>("/city/protocols", p),
  updateProtocol: (id: string, p: Omit<Protocol, "id" | "updatedAt">) => api.put<{ id: string }>(`/city/protocols/${id}`, p),
  removeProtocol: (id: string) => api.delete<{ ok: true }>(`/city/protocols/${id}`),

  prefs: () => api.get<CityPrefs>("/city/prefs"),
  savePrefs: (p: CityPrefs) => api.put<CityPrefs>("/city/prefs", p),

  oracle: (body: { api: CityApi; resource: string; params: Record<string, string | number>; question: string | null }) => api.post<OracleAnswer>("/city/oracle", body),
};
