import type { Client } from "@libsql/client";
import { CITY_API_DEFS, type CityApi } from "../config/apilib.js";
import { CityError, cityFetch, type Row } from "./apilibClient.js";
import { shapeRows, type CleanRow, type ColumnMeta } from "./cityValues.js";

/**
 * Cidadania e Consumo — leituras próprias de PROCON, SP156 e e-SIC.
 *
 * As bases do PROCON são pequenas (centenas a ~1.500 reclamações por ano): o LifeOS carrega o ano
 * inteiro (páginas de 500, cada uma em cache) e calcula desfechos, taxa de resolução e a ficha de
 * cada empresa. SP156 e e-SIC são grandes: as leituras usam uma amostra declarada na tela.
 * Todas as regras (classificação de desfecho, taxa, agrupamento de empresas) ficam aqui.
 */

type Db = Client;
const PAGE = 500;
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ───────────────────────── carga paginada ───────────────────────── */

export interface Loaded {
  columns: ColumnMeta[];
  rows: CleanRow[];
  /** Total oficial da base (quando a API informa). */
  total: number | null;
  /** Quantos registros o LifeOS leu de fato. */
  loaded: number;
  fetchedAt: string;
  stale: boolean;
}

/**
 * Lê várias páginas de um recurso limite/offset (até `cap` registros). A primeira página dá o
 * total; as demais vão em paralelo. Cada página tem seu próprio cache no servidor.
 */
export async function loadPages(db: Db, ownerId: string, api: CityApi, resource: string, params: Record<string, string | number>, cap: number): Promise<Loaded> {
  const first = await cityFetch(db, ownerId, api, resource, { ...params, limite: PAGE, offset: 0 });
  const total = first.total;
  const want = Math.min(cap, total ?? first.items.length);
  const offsets: number[] = [];
  // Segue paginando enquanto a base informa mais registros do que a página trouxe.
  if (first.items.length > 0 && (total ?? 0) > first.items.length) for (let off = PAGE; off < want; off += PAGE) offsets.push(off);
  const rest = await Promise.all(offsets.map((offset) => cityFetch(db, ownerId, api, resource, { ...params, limite: PAGE, offset })));
  const items: Row[] = [...first.items, ...rest.flatMap((r) => r.items)].slice(0, cap);
  const shaped = shapeRows(items);
  return { ...shaped, total, loaded: shaped.rows.length, fetchedAt: first.fetchedAt, stale: first.stale || rest.some((r) => r.stale) };
}

/** Coluna por nome (os anos da mesma base mudam maiúsculas, acentos e até o nome). */
export function colOf(columns: ColumnMeta[], re: RegExp): string | null {
  return columns.find((c) => re.test(strip(c.key).replace(/\s+/g, " ").trim()))?.key ?? null;
}

const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
/** "PRODUTOS" / "produtos" / "Produtos" → "Produtos"; "SERVIÇOS ESSENCIAIS" → "Serviços Essenciais". */
export function normCategory(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").replace(/[–—]/g, "-").trim();
  if (!s || /^(-|n\/a|null)$/i.test(s)) return null;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bCip\b/, "CIP")
    .replace(/\bProcon\b/, "PROCON")
    .replace(/\bTacs\b/i, "TACs");
}

export function countList(values: Array<string | null>, top = 10): Array<{ label: string; count: number }> {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count }));
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

function monthSeries(dates: Array<string | null>): Array<{ x: string; y: number }> {
  const m = new Map<string, number>();
  for (const d of dates) if (d && /^\d{4}-\d{2}/.test(d)) m.set(d.slice(0, 7), (m.get(d.slice(0, 7)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, y]) => ({ x, y }));
}

/* ───────────────────────── PROCON ───────────────────────── */

export type Outcome = "resolvido" | "parcial" | "nao_resolvido" | "desistencia" | "orientacao" | "encaminhado" | "arquivado" | "sem_desfecho";
export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolvido: "Resolvido",
  parcial: "Resolvido em parte",
  nao_resolvido: "Não resolvido",
  desistencia: "Desistência do consumidor",
  orientacao: "Orientação / consulta",
  encaminhado: "Encaminhado (fiscalização, Justiça, outro órgão)",
  arquivado: "Arquivado (duplicado, sem fundamento…)",
  sem_desfecho: "Sem desfecho registrado",
};

/**
 * Desfecho do caso a partir do "motivo de baixa"/decisão publicado pelo PROCON.
 * "Fundamentada não atendida" vem antes de "atendida" (o texto contém as duas palavras).
 */
export function classifyOutcome(raw: unknown): Outcome {
  const s = strip(String(raw ?? "")).replace(/\s+/g, " ");
  if (!s.trim()) return "sem_desfecho";
  if (/resolucao parcial/.test(s)) return "parcial";
  if (/nao atendida|sem resolucao/.test(s)) return "nao_resolvido";
  if (/com resolucao|fundamentada atendida/.test(s)) return "resolvido";
  if (/desist/.test(s)) return "desistencia";
  if (/simples consulta|atendimento preliminar/.test(s)) return "orientacao";
  if (/extra.?procon|fiscaliza|judicia|tac/.test(s)) return "encaminhado";
  if (/duplicidade|litispend|domicilio|nao fundamentada|inconsistente/.test(s)) return "arquivado";
  return "arquivado";
}

/** Taxa de resolução = resolvidos (inteiro + metade dos parciais) ÷ casos com decisão sobre a empresa. */
export function resolutionRate(counts: Partial<Record<Outcome, number>>): { rate: number | null; base: number } {
  const r = counts.resolvido ?? 0;
  const p = counts.parcial ?? 0;
  const n = counts.nao_resolvido ?? 0;
  const base = r + p + n;
  return { rate: base ? Math.round(((r + p / 2) / base) * 1000) / 10 : null, base };
}

/** Chave para agrupar a mesma empresa escrita de jeitos diferentes ("Sptrans", "SPTRANS LTDA."). */
export function companyKey(name: string): string {
  return strip(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltda|s ?a|s ?\/ ?a|me|epp|eireli|cia|companhia|grupo|do brasil|brasil)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ProconRow {
  date: string | null;
  region: string | null;
  company: string | null;
  area: string | null;
  outcome: Outcome;
  outcomeRaw: string | null;
}

function proconRows(l: Loaded): ProconRow[] {
  const c = {
    date: colOf(l.columns, /entrada/),
    region: colOf(l.columns, /^regiao$/),
    company: colOf(l.columns, /razao social/),
    area: colOf(l.columns, /^area/),
    outcome: colOf(l.columns, /motivo de baixa|status da reclamacao|decisao/),
  };
  return l.rows
    .map((r) => {
      const company = c.company ? normCategory(r[c.company]) : null;
      return {
        date: c.date && typeof r[c.date] === "string" ? (r[c.date] as string) : null,
        region: c.region ? normCategory(r[c.region]) : null,
        company: company && !/^(n\/a|nao informado|-)$/i.test(company) ? String(r[c.company!]).trim() : null,
        area: c.area ? normCategory(r[c.area]) : null,
        outcomeRaw: c.outcome ? normCategory(r[c.outcome]) : null,
        outcome: classifyOutcome(c.outcome ? r[c.outcome] : null),
      };
    })
    .filter((r) => r.date || r.company || r.area || r.region);
}

function outcomeCounts(rows: ProconRow[]) {
  const m: Partial<Record<Outcome, number>> = {};
  for (const r of rows) m[r.outcome] = (m[r.outcome] ?? 0) + 1;
  return m;
}

function outcomeList(m: Partial<Record<Outcome, number>>) {
  return (Object.keys(OUTCOME_LABEL) as Outcome[]).map((k) => ({ key: k, label: OUTCOME_LABEL[k], count: m[k] ?? 0 })).filter((x) => x.count > 0);
}

function groupCompanies(rows: ProconRow[]) {
  const g = new Map<string, { names: Map<string, number>; rows: ProconRow[] }>();
  for (const r of rows) {
    if (!r.company) continue;
    const key = companyKey(r.company);
    if (key.length < 2) continue;
    const e = g.get(key) ?? { names: new Map<string, number>(), rows: [] as ProconRow[] };
    e.names.set(r.company, (e.names.get(r.company) ?? 0) + 1);
    e.rows.push(r);
    g.set(key, e);
  }
  return [...g.entries()].map(([key, e]) => {
    const name = [...e.names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const oc = outcomeCounts(e.rows);
    return { key, name, count: e.rows.length, ...resolutionRate(oc), outcomes: oc, rows: e.rows };
  });
}

const PROCON_YEARS = [2016, 2017, 2018, 2019];
/** Teto por ano (as bases publicadas têm até ~1.500 linhas): cobre o ano inteiro. */
const PROCON_CAP = 3000;

export async function proconPanorama(db: Db, ownerId: string, ano: number) {
  if (!PROCON_YEARS.includes(ano)) throw new CityError(400, "O PROCON publica reclamações de 2016 a 2019 nesta API.");
  const l = await loadPages(db, ownerId, "procon", "reclamacoes", { ano }, PROCON_CAP);
  const rows = proconRows(l);
  const oc = outcomeCounts(rows);
  const res = resolutionRate(oc);
  const areaGroups = new Map<string, ProconRow[]>();
  for (const r of rows) if (r.area) areaGroups.set(r.area, [...(areaGroups.get(r.area) ?? []), r]);
  const areas = [...areaGroups.entries()]
    .map(([label, rs]) => ({ label, count: rs.length, ...resolutionRate(outcomeCounts(rs)) }))
    .sort((a, b) => b.count - a.count);
  const companies = groupCompanies(rows)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map(({ rows: _r, outcomes: _o, key, ...c }) => ({ ...c, key }));
  return {
    ano,
    total: l.total,
    loaded: l.loaded,
    complete: l.total != null && l.loaded >= l.total,
    fetchedAt: l.fetchedAt,
    stale: l.stale,
    outcomes: outcomeList(oc),
    resolution: res,
    areas,
    regions: countList(rows.map((r) => r.region), 8),
    months: monthSeries(rows.map((r) => r.date)),
    companies,
    companiesDistinct: new Set(rows.map((r) => r.company && companyKey(r.company)).filter(Boolean)).size,
    detailedOutcomes: countList(rows.map((r) => r.outcomeRaw), 12),
  };
}

/** Ficha de uma empresa nas quatro bases (2016–2019), comparada à média da cidade. */
export async function proconCompany(db: Db, ownerId: string, query: string) {
  const q = companyKey(query);
  if (q.length < 3) throw new CityError(400, "Digite ao menos 3 letras do nome da empresa.");
  const years = await Promise.allSettled(PROCON_YEARS.map((ano) => loadPages(db, ownerId, "procon", "reclamacoes", { ano }, PROCON_CAP).then((l) => ({ ano, rows: proconRows(l) }))));
  const ok = years.filter((y): y is PromiseFulfilledResult<{ ano: number; rows: ProconRow[] }> => y.status === "fulfilled").map((y) => y.value);
  if (!ok.length) {
    const err = years.find((y): y is PromiseRejectedResult => y.status === "rejected")?.reason;
    throw err instanceof CityError ? err : new CityError(503, "Não foi possível ler as bases do PROCON agora.");
  }
  const all = ok.flatMap((y) => y.rows);
  const groups = groupCompanies(all).filter((g) => g.key.includes(q));
  const rows = groups.flatMap((g) => g.rows);
  const oc = outcomeCounts(rows);
  const city = resolutionRate(outcomeCounts(all));
  return {
    query,
    yearsRead: ok.map((y) => y.ano).sort(),
    yearsFailed: PROCON_YEARS.filter((a) => !ok.some((y) => y.ano === a)),
    matches: groups
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((g) => ({ key: g.key, name: g.name, count: g.count, rate: g.rate, base: g.base })),
    count: rows.length,
    shareOfAll: pct(rows.length, all.length),
    byYear: ok.map((y) => ({ ano: y.ano, count: y.rows.filter((r) => r.company && companyKey(r.company).includes(q)).length })).sort((a, b) => a.ano - b.ano),
    outcomes: outcomeList(oc),
    resolution: resolutionRate(oc),
    cityResolution: city,
    areas: countList(rows.map((r) => r.area), 6),
    regions: countList(rows.map((r) => r.region), 6),
    recent: rows
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 12)
      .map((r) => ({ date: r.date, company: r.company, area: r.area, region: r.region, outcome: r.outcome, outcomeLabel: OUTCOME_LABEL[r.outcome], outcomeRaw: r.outcomeRaw })),
  };
}

/* ───────────────────────── SP156 ───────────────────────── */

const SP156_CAP = 1500;

/** Dias entre abertura e finalização (só quando as duas datas existem e fazem sentido). */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000;
  return Number.isFinite(d) && d >= 0 && d < 3650 ? d : null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export async function sp156Panorama(db: Db, ownerId: string, ano: number, semestre: number) {
  const [sol, lig] = await Promise.allSettled([
    loadPages(db, ownerId, "sp156", "solicitacoes", { ano, semestre }, SP156_CAP),
    loadPages(db, ownerId, "sp156", "ligacoes", { ano, semestre }, 400),
  ]);
  let solicitacoes = null;
  if (sol.status === "fulfilled") {
    const l = sol.value;
    const c = {
      tema: colOf(l.columns, /^tema$/),
      assunto: colOf(l.columns, /^assunto$/),
      servico: colOf(l.columns, /^servico$/),
      status: colOf(l.columns, /status/),
      sub: colOf(l.columns, /^subprefeitura$/),
      distrito: colOf(l.columns, /^distrito$/),
      canal: colOf(l.columns, /^canal$/),
      orgao: colOf(l.columns, /^orgao$/),
      abertura: colOf(l.columns, /data de abertura/),
      fim: colOf(l.columns, /data de finaliza/),
    };
    const get = (r: CleanRow, k: string | null) => (k ? normCategory(r[k]) : null);
    const days = l.rows.map((r) => daysBetween(c.abertura ? (r[c.abertura] as string | null) : null, c.fim ? (r[c.fim] as string | null) : null));
    const temaDays = new Map<string, number[]>();
    l.rows.forEach((r, i) => {
      const t = get(r, c.tema);
      const d = days[i];
      if (t && d != null) temaDays.set(t, [...(temaDays.get(t) ?? []), d]);
    });
    const withDays = days.filter((d): d is number => d != null);
    solicitacoes = {
      total: l.total,
      loaded: l.loaded,
      fetchedAt: l.fetchedAt,
      stale: l.stale,
      temas: countList(l.rows.map((r) => get(r, c.tema)), 10),
      servicos: countList(l.rows.map((r) => get(r, c.servico)), 12),
      subprefeituras: countList(l.rows.map((r) => get(r, c.sub)), 32),
      distritos: countList(l.rows.map((r) => get(r, c.distrito)), 10),
      status: countList(l.rows.map((r) => get(r, c.status)), 8),
      canais: countList(l.rows.map((r) => get(r, c.canal)), 6),
      orgaos: countList(l.rows.map((r) => get(r, c.orgao)), 8),
      months: monthSeries(c.abertura ? l.rows.map((r) => r[c.abertura!] as string | null) : []),
      medianDays: median(withDays),
      daysBase: withDays.length,
      slowestThemes: [...temaDays.entries()]
        .filter(([, d]) => d.length >= 5)
        .map(([label, d]) => ({ label, medianDays: median(d)!, count: d.length }))
        .sort((a, b) => b.medianDays - a.medianDays)
        .slice(0, 6),
    };
  }
  let ligacoes = null;
  if (lig.status === "fulfilled" && lig.value.rows.length) {
    const l = lig.value;
    const c = {
      data: colOf(l.columns, /^data$/),
      entr: colOf(l.columns, /entrantes/),
      aten: colOf(l.columns, /ligacoes atendidas$/),
      aban: colOf(l.columns, /ligacoes abandonadas$/),
      nivel: colOf(l.columns, /nivel de servico/),
      tme: colOf(l.columns, /tempo medio de espera/),
      tma: colOf(l.columns, /tempo medio de atendimento/),
    };
    const sum = (k: string | null) => (k ? l.rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0) : null);
    const avg = (k: string | null) => {
      if (!k) return null;
      const xs = l.rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
      return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
    };
    const entrantes = sum(c.entr);
    const atendidas = sum(c.aten);
    ligacoes = {
      days: l.rows.length,
      entrantes,
      atendidas,
      abandonadas: sum(c.aban),
      taxaAtendimento: entrantes && atendidas != null ? pct(atendidas, entrantes) : null,
      nivelServico: avg(c.nivel),
      esperaMediaSeg: avg(c.tme),
      atendimentoMedioSeg: avg(c.tma),
      series: c.data && c.entr ? l.rows.filter((r) => typeof r[c.data!] === "string").map((r) => ({ x: String(r[c.data!]).slice(0, 10), entrantes: (r[c.entr!] as number) ?? 0, atendidas: c.aten ? ((r[c.aten] as number) ?? 0) : 0 })).sort((a, b) => a.x.localeCompare(b.x)) : [],
    };
  }
  if (!solicitacoes && !ligacoes) {
    const err = sol.status === "rejected" ? sol.reason : null;
    throw err instanceof CityError ? err : new CityError(404, "O SP156 não publicou dados para este semestre.");
  }
  return { ano, semestre, solicitacoes, ligacoes, solicitacoesError: sol.status === "rejected" ? errText(sol.reason) : null };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Falha ao consultar.");

/* ───────────────────────── e-SIC ───────────────────────── */

const ESIC_CAP = 2000;

export type EsicStatus = "atendido" | "parcial" | "negado" | "tramitando" | "outro";
export function classifyEsic(raw: unknown): EsicStatus {
  const s = strip(String(raw ?? ""));
  if (/parcial/.test(s)) return "parcial";
  if (/indefer|negad|nao atendid/.test(s)) return "negado";
  if (/atendid|respondid|deferid/.test(s)) return "atendido";
  if (/tramita|registrad|andamento|aberto|prorrog|recurso/.test(s)) return "tramitando";
  return "outro";
}

export async function esicPanorama(db: Db, ownerId: string, ano: number, query: string | null) {
  const l = await loadPages(db, ownerId, "esic", "pedidos", { ano }, ESIC_CAP);
  const c = {
    pedido: colOf(l.columns, /^dc_pedido$|^pedido$|^pergunta/),
    resposta: colOf(l.columns, /^dc_resposta$|^resposta$/),
    orgao: colOf(l.columns, /^(nm_orgao|orgao_nome)$/),
    status: colOf(l.columns, /status/),
    data: colOf(l.columns, /^dt_resposta|data/),
    id: colOf(l.columns, /^cd_pedido$/),
  };
  const rows = l.rows.map((r) => ({
    id: c.id ? String(r[c.id] ?? "") : "",
    pedido: c.pedido ? String(r[c.pedido] ?? "") : "",
    resposta: c.resposta ? String(r[c.resposta] ?? "") : "",
    orgao: c.orgao ? normCategory(r[c.orgao]) : null,
    statusRaw: c.status ? normCategory(r[c.status]) : null,
    status: classifyEsic(c.status ? r[c.status] : null),
    data: c.data ? (r[c.data] as string | null) : null,
  }));
  const st = { atendido: 0, parcial: 0, negado: 0, tramitando: 0, outro: 0 } as Record<EsicStatus, number>;
  for (const r of rows) st[r.status] += 1;
  const decided = st.atendido + st.parcial + st.negado;
  const orgGroups = new Map<string, typeof rows>();
  for (const r of rows) if (r.orgao) orgGroups.set(r.orgao, [...(orgGroups.get(r.orgao) ?? []), r]);
  const orgaos = [...orgGroups.entries()]
    .map(([label, rs]) => {
      const a = rs.filter((r) => r.status === "atendido").length;
      const d = rs.filter((r) => r.status !== "tramitando" && r.status !== "outro").length;
      return { label, count: rs.length, atendidoPct: pct(a, d) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  let results: Array<{ id: string; orgao: string | null; status: EsicStatus; statusRaw: string | null; data: string | null; pedido: string; resposta: string }> = [];
  const q = query ? strip(query).trim() : "";
  if (q.length >= 3) {
    const words = q.split(/\s+/).filter((w) => w.length >= 3);
    results = rows
      .map((r) => ({ r, hay: strip(`${r.pedido} ${r.resposta} ${r.orgao ?? ""}`) }))
      .filter(({ hay }) => words.every((w) => hay.includes(w)))
      .slice(0, 40)
      .map(({ r }) => ({ id: r.id, orgao: r.orgao, status: r.status, statusRaw: r.statusRaw, data: r.data, pedido: r.pedido.slice(0, 1200), resposta: r.resposta.slice(0, 1600) }));
  }
  return {
    ano,
    total: l.total,
    loaded: l.loaded,
    fetchedAt: l.fetchedAt,
    stale: l.stale,
    status: st,
    atendidoPct: pct(st.atendido, decided),
    decided,
    orgaos,
    months: monthSeries(rows.map((r) => r.data)),
    query: q.length >= 3 ? query : null,
    results,
    recent: q.length >= 3 ? [] : rows
      .filter((r) => r.pedido && r.status !== "tramitando")
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
      .slice(0, 6)
      .map((r) => ({ id: r.id, orgao: r.orgao, status: r.status, statusRaw: r.statusRaw, data: r.data, pedido: r.pedido.slice(0, 600), resposta: r.resposta.slice(0, 800) })),
  };
}

/** Fonte de cada painel (para a faixa de transparência). */
export const civicSource = (api: "procon" | "sp156" | "esic") => CITY_API_DEFS[api].source;
