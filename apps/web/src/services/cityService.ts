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
export interface Execution {
  orcadoInicial: number;
  orcado: number;
  empenhado: number;
  liquidado: number;
  pago: number;
  disponivel: number;
  congelado: number;
  execEmpenhado: number | null;
  execLiquidado: number | null;
  execPago: number | null;
}
export interface Radar {
  orcamento: Block<{ ano: number; mes: number; latest: Execution & { mes: number }; previousYear: (Execution & { ano: number; mes: number }) | null }>;
  transparencia: Block<{ ano: number; total: number | null; atendidoPct: number | null; status: Record<EsicStatus, number>; orgaos: Count[] }>;
  atendimento: Block<{ periodLabel: string; total: number | null; temas: Count[]; satisfacaoBoaPct: number | null; medianDays: number | null }>;
  contratos: Block<{ ano: number; sample: number; valor: number; modalidades: Array<Count & { valor: number; share: number | null }>; recente: SofContract | null }>;
  educacao: Block<{ atualizadoEm: string | null; kpis: EduKpis; sobras: Array<EduSeries & { modalidade: string }> }>;
}
export interface Overview {
  today: string;
  credential: CredentialStatus;
  apis: ApiStatusView[];
  prefs: CityPrefs;
  radar: Radar;
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

/* ───────────── Cidadania e Consumo (leituras próprias do servidor) ───────────── */

export type Outcome = "resolvido" | "parcial" | "nao_resolvido" | "desistencia" | "orientacao" | "encaminhado" | "arquivado" | "concluido" | "sem_desfecho";
/** Período publicado no Portal de Dados Abertos ("2025", "2025-T1", "2024-S2"). */
export interface PeriodOption {
  key: string;
  label: string;
  total: number;
}
export interface PublicSource {
  name: string;
  resource: string;
  url: string;
}
/** Campos comuns das leituras do Portal de Dados Abertos. */
export interface PublicPanorama {
  periods: PeriodOption[];
  source: PublicSource;
  warnings: string[];
}
export interface Count {
  label: string;
  count: number;
}
export interface Rate {
  rate: number | null;
  base: number;
}
export interface ProconPanorama extends PublicPanorama {
  ano: number;
  total: number | null;
  loaded: number;
  complete: boolean;
  fetchedAt: string;
  stale: boolean;
  outcomes: Array<{ key: Outcome; label: string; count: number }>;
  resolution: Rate;
  areas: Array<{ label: string; count: number } & Rate>;
  regions: Count[];
  months: Array<{ x: string; y: number }>;
  companies: Array<{ key: string; name: string; count: number } & Rate>;
  companiesDistinct: number;
  detailedOutcomes: Count[];
}
export interface ProconCompany {
  query: string;
  yearsRead: number[];
  yearsFailed: number[];
  matches: Array<{ key: string; name: string; count: number } & Rate>;
  count: number;
  shareOfAll: number | null;
  byYear: Array<{ ano: number; count: number }>;
  outcomes: Array<{ key: Outcome; label: string; count: number }>;
  resolution: Rate;
  cityResolution: Rate;
  areas: Count[];
  regions: Count[];
  recent: Array<{ date: string | null; company: string | null; area: string | null; region: string | null; outcome: Outcome; outcomeLabel: string; outcomeRaw: string | null }>;
}
export interface Sp156Panorama extends PublicPanorama {
  periodo: string;
  periodLabel: string;
  ano: number;
  solicitacoesError: string | null;
  ligacoesNote: string | null;
  solicitacoes: {
    total: number | null;
    loaded: number;
    fetchedAt: string;
    stale: boolean;
    temas: Count[];
    servicos: Count[];
    subprefeituras: Count[];
    distritos: Count[];
    status: Count[];
    canais: Count[];
    orgaos: Count[];
    months: Array<{ x: string; y: number }>;
    medianDays: number | null;
    daysBase: number;
    slowestThemes: Array<{ label: string; medianDays: number; count: number }>;
    satisfacao: Count[];
    satisfacaoBoaPct: number | null;
    avaliadas: number;
    atendeu: Count[];
  } | null;
  ligacoes: {
    periodLabel: string;
    days: number;
    entrantes: number | null;
    atendidas: number | null;
    abandonadas: number | null;
    taxaAtendimento: number | null;
    nivelServico: number | null;
    esperaMediaSeg: number | null;
    atendimentoMedioSeg: number | null;
    series: Array<{ x: string; entrantes: number; atendidas: number }>;
  } | null;
}
export type EsicStatus = "atendido" | "parcial" | "negado" | "finalizado" | "tramitando" | "outro";
export interface EsicItem {
  id: string;
  orgao: string | null;
  status: EsicStatus;
  statusRaw: string | null;
  data: string | null;
  pedido: string;
  resposta: string;
}
export interface EsicPanorama extends PublicPanorama {
  ano: number;
  total: number | null;
  atendimentos: number | null;
  statusRaw: Count[];
  loaded: number;
  fetchedAt: string;
  stale: boolean;
  status: Record<EsicStatus, number>;
  atendidoPct: number | null;
  decided: number;
  orgaos: Array<{ label: string; count: number; atendidoPct: number | null; negadoPct: number | null }>;
  months: Array<{ x: string; y: number }>;
  query: string | null;
  results: EsicItem[];
  recent: EsicItem[];
}

/* ───────────── Educação (Escola Aberta) ───────────── */
export interface EduSeats {
  turmas: number;
  vagas: number;
  atendimentos: number;
  remanescentes: number;
  mediaTurma?: number | null;
  ocupacao: number | null;
}
export type EduSeries = { label: string } & EduSeats;
export interface EduKpis extends EduSeats {
  escolas: number | null;
  profissionais: number | null;
}
export interface EduPanorama {
  dre: string | null;
  dreLabel: string | null;
  dres: Array<{ value: string; label: string }>;
  atualizadoEm: string | null;
  fetchedAt: string | null;
  stale: boolean;
  warnings: string[];
  kpis: EduKpis;
  modalidades: Array<EduSeries & { series: EduSeries[] }>;
  sobras: Array<EduSeries & { modalidade: string }>;
  lotadas: Array<EduSeries & { modalidade: string }>;
  escolasPorTipo: Count[];
  escolasPorFaixa: Count[];
  formacao: Count[];
  cargos: Count[];
  ambientes: Count[];
  source: { name: string; url: string };
}
export interface School {
  codesc: string;
  nome: string;
  tipo: string;
  dre: string | null;
  diretoria: string | null;
  distrito: string | null;
  bairro: string | null;
  subpref: string | null;
  endereco: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  situacao: string | null;
  lat: number | null;
  lng: number | null;
  criadaEm: string | null;
}
export interface SchoolSearch {
  total: number;
  page: number;
  pageSize: number;
  rows: School[];
  fetchedAt: string;
  stale: boolean;
}
export interface SchoolDetail {
  school: School;
  modalidades: string[];
  totals: EduSeats;
  series: EduSeries[];
  turnos: Count[];
  alunos: number | null;
  ambientes: Count[];
  servidores: Count[];
  servidoresTotal: number | null;
  fetchedAt: string | null;
  stale: boolean;
  warnings: string[];
}
export interface SchoolQuery {
  search?: string;
  dre?: string;
  tipoesc?: string;
  distrito?: string;
  page: number;
}

/* ───────────── Finanças Públicas (SOF) ───────────── */
export interface SofResumo {
  ano: number;
  mes: number;
  codOrgao: string | null;
  latest: Execution & { mes: number };
  previousYear: (Execution & { ano: number; mes: number }) | null;
  cumulative: Array<Execution & { mes: number }>;
  monthly: Array<{ mes: number; empenhado: number; liquidado: number; pago: number }>;
  partialErrors: number;
  fetchedAt: string;
  stale: boolean;
}
export interface SofFuncoes {
  ano: number;
  mes: number;
  items: Array<Execution & { cod: string; label: string; share: number | null }>;
  failed: number;
  total: number;
  fetchedAt: string;
}
export interface SofContract {
  id: string;
  numero: string | null;
  orgao: string | null;
  objeto: string | null;
  modalidade: string;
  tipo: string | null;
  assinatura: string | null;
  vigencia: string | null;
  valor: number;
  aditamentos: number;
  empenhado: number;
  pago: number;
}
export interface SofContratos {
  ano: number;
  sample: number;
  pagesRead: number;
  valor: number;
  pago: number;
  modalidades: Array<Count & { valor: number; share: number | null }>;
  recentes: SofContract[];
  maiores: SofContract[];
  fetchedAt: string;
  stale: boolean;
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

  procon: (ano: number | null) => api.get<ProconPanorama>(`/city/civic/procon${qs({ ano })}`),
  proconCompany: (q: string) => api.get<ProconCompany>(`/city/civic/procon/empresa${qs({ q })}`),
  sp156: (periodo: string | null) => api.get<Sp156Panorama>(`/city/civic/sp156${qs({ periodo })}`),
  esic: (ano: number | null, q: string | null) => api.get<EsicPanorama>(`/city/civic/esic${qs({ ano, q })}`),

  eduPanorama: (dre: string | null) => api.get<EduPanorama>(`/city/edu/panorama${qs({ dre })}`),
  eduSchools: (q: SchoolQuery) => api.get<SchoolSearch>(`/city/edu/escolas${qs({ ...q })}`),
  eduSchool: (codesc: string) => api.get<SchoolDetail>(`/city/edu/escola/${encodeURIComponent(codesc)}`),

  sofResumo: (ano: number, orgao: string | null) => api.get<SofResumo>(`/city/sof/resumo${qs({ ano, orgao })}`),
  sofFuncoes: (ano: number, mes: number, orgao: string | null) => api.get<SofFuncoes>(`/city/sof/funcoes${qs({ ano, mes, orgao })}`),
  sofOrgaos: (ano: number) => api.get<{ ano: number; items: Array<{ cod: string; label: string }> }>(`/city/sof/orgaos${qs({ ano })}`),
  sofContratos: (ano: number, orgao: string | null) => api.get<SofContratos>(`/city/sof/contratos${qs({ ano, orgao })}`),

  oracle: (body: { api: CityApi; resource: string; params: Record<string, string | number>; question: string | null }) => api.post<OracleAnswer>("/city/oracle", body),
};
