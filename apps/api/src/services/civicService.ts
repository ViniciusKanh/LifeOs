import type { Client } from "@libsql/client";
import { CKAN_DATASETS } from "../config/publicData.js";
import { CityError } from "./apilibClient.js";
import { shapeRows, type ColumnMeta } from "./cityValues.js";
import { ckanPeriods, ckanRows, ckanSql, fieldOf, maskPII, safeTerms, sql, type CkanField, type CkanResource, type Json } from "./publicDataClient.js";

/**
 * Cidadania e Consumo — PROCON, SP156 e e-SIC a partir do Portal de Dados Abertos (CKAN).
 *
 * As bases mais recentes (PROCON 2025, SP156 1º tri 2025, e-SIC 2023) só existem no portal; o APILIB
 * parou em 2016–2020. Todas as contagens são agregações SQL sobre a base INTEIRA do período (nada
 * de amostra). Cada consulta falha sozinha: o painel mostra o que veio e avisa o que faltou.
 * Regras (desfecho, taxa de resolução, agrupamento de empresas, status do e-SIC) ficam aqui.
 */

type Db = Client;
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Coluna por nome (mantido para leituras do APILIB: os anos mudam maiúsculas, acentos e nomes). */
export function colOf(columns: ColumnMeta[], re: RegExp): string | null {
  return columns.find((c) => re.test(strip(c.key).replace(/\s+/g, " ").trim()))?.key ?? null;
}

const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
/** "PRODUTOS" / "produtos" → "Produtos"; "SERVIÇOS ESSENCIAIS" → "Serviços Essenciais". */
export function normCategory(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").replace(/[–—]/g, "-").trim();
  if (!s || /^(-|n\/a|null|nao informado|não informado)$/i.test(s)) return null;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bCip\b/, "CIP")
    .replace(/\bProcon\b/, "PROCON")
    .replace(/\bTacs\b/i, "TACs")
    .replace(/\bSp156\b/i, "SP156");
}

export interface Count {
  label: string;
  count: number;
}

export function countList(values: Array<string | null>, top = 10): Count[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return toList(m, top);
}

function toList(m: Map<string, number>, top: number): Count[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count }));
}

/** Soma contagens já agrupadas pelo SQL, normalizando o rótulo (grafias diferentes viram uma). */
function sumBy(rows: Json[], key: string, top: number, norm: (v: unknown) => string | null = normCategory): Count[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = norm(r[key]);
    if (k) m.set(k, (m.get(k) ?? 0) + num(r.n));
  }
  return toList(m, top);
}

/* ───────────────────────── consultas ───────────────────────── */

interface Section<T> {
  value: T | null;
  error: string | null;
}

/** Roda uma consulta; falha vira aviso (o resto do painel continua). */
async function attempt<T>(warnings: string[], label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    warnings.push(`${label}: ${e instanceof Error ? e.message : "indisponível"}`);
    return null;
  }
}

const groupSql = (rid: string, col: CkanField, where: string, limit: number) =>
  `SELECT ${sql.id(col.id)} k, count(*) n FROM ${sql.id(rid)}${where ? ` WHERE ${where}` : ""} GROUP BY k ORDER BY n DESC LIMIT ${limit}`;

/**
 * Contagem por dia. O firewall do portal recusa to_char/date_trunc/"month": para colunas timestamp
 * usa dias desde 1970 (floor(epoch/86400)); para datas em texto agrupa o valor como veio.
 */
function daySql(rid: string, col: CkanField, where: string) {
  const expr = col.type.startsWith("timestamp") || col.type === "date" ? `floor(extract(epoch FROM ${sql.id(col.id)})/86400)` : sql.id(col.id);
  return `SELECT ${expr} k, count(*) n FROM ${sql.id(rid)}${where ? ` WHERE ${where}` : ""} GROUP BY k ORDER BY n DESC LIMIT 3000`;
}

/** Converte a chave de dia (número de dias ou texto dd/mm/aaaa, aaaa-mm-dd…) em "aaaa-mm". */
export function monthKey(k: unknown): string | null {
  if (k == null || k === "") return null;
  if (typeof k === "number" || /^\d+(\.0+)?$/.test(String(k))) {
    const d = new Date(Number(k) * 86_400_000);
    return Number.isFinite(d.getTime()) && d.getUTCFullYear() > 1990 ? d.toISOString().slice(0, 7) : null;
  }
  const s = String(k);
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}`;
  return null;
}

function monthSeries(rows: Json[]): Array<{ x: string; y: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(r.k);
    if (k) m.set(k, (m.get(k) ?? 0) + num(r.n));
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, y]) => ({ x, y }));
}

const nonEmpty = (f: CkanField) => (f.type === "text" ? `coalesce(${sql.id(f.id)},'') <> ''` : `${sql.id(f.id)} > 0`);

export interface PeriodOption {
  key: string;
  label: string;
  total: number;
}
const periodOptions = (rs: CkanResource[]): PeriodOption[] => rs.map((r) => ({ key: r.key, label: r.label, total: r.total }));

function pickPeriod(rs: CkanResource[], key: string | null, what: string): CkanResource {
  if (!rs.length) throw new CityError(503, `O Portal de Dados Abertos não listou bases de ${what} agora.`, "indisponivel");
  if (!key) return rs[0]!;
  const r = rs.find((x) => x.key === key);
  if (!r) throw new CityError(400, `Período indisponível para ${what}.`);
  return r;
}

const sourceOf = (ds: keyof typeof CKAN_DATASETS, r: CkanResource) => ({
  name: `Portal de Dados Abertos da Prefeitura — ${CKAN_DATASETS[ds].label}`,
  resource: r.name,
  url: `https://dados.prefeitura.sp.gov.br/dataset/${CKAN_DATASETS[ds].pkg}`,
});

/* ───────────────────────── PROCON ───────────────────────── */

export type Outcome = "resolvido" | "parcial" | "nao_resolvido" | "desistencia" | "orientacao" | "encaminhado" | "arquivado" | "concluido" | "sem_desfecho";
export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolvido: "Resolvido",
  parcial: "Resolvido em parte",
  nao_resolvido: "Não resolvido",
  desistencia: "Desistência do consumidor",
  orientacao: "Orientação / consulta",
  encaminhado: "Encaminhado (fiscalização, Justiça, outro órgão)",
  arquivado: "Arquivado (duplicado, sem fundamento…)",
  concluido: "Concluído (sem detalhe do desfecho)",
  sem_desfecho: "Sem desfecho publicado",
};

/**
 * Desfecho a partir do "motivo de baixa" (2016–2019) ou do "status da reclamação" (2023–2025).
 * "Fundamentada não atendida" vem antes de "atendida" (o texto contém as duas palavras).
 * Status que só dizem que a reclamação existe ("RECLAMAÇÃO", "EM ANDAMENTO") não são desfecho.
 */
export function classifyOutcome(raw: unknown): Outcome {
  const s = strip(String(raw ?? "")).replace(/\s+/g, " ").trim();
  if (!s) return "sem_desfecho";
  if (/resolucao parcial/.test(s)) return "parcial";
  if (/nao atendida|sem resolucao/.test(s)) return "nao_resolvido";
  if (/com resolucao|fundamentada atendida/.test(s)) return "resolvido";
  if (/desist/.test(s)) return "desistencia";
  if (/simples consulta|atendimento preliminar|orientac/.test(s)) return "orientacao";
  if (/extra.?procon|fiscaliza|judicia|\btac\b/.test(s)) return "encaminhado";
  if (/duplicidade|litispend|domicilio|nao fundamentada|inconsistente|arquivad/.test(s)) return "arquivado";
  if (/conclui|finaliz|encerrad/.test(s)) return "concluido";
  if (/^reclamacao$|andamento|aberta|aguardando|em analise|registrad/.test(s)) return "sem_desfecho";
  return "sem_desfecho";
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

interface ProconCols {
  date: CkanField | null;
  region: CkanField | null;
  company: CkanField;
  area: CkanField | null;
  outcome: CkanField | null;
}
function proconCols(r: CkanResource): ProconCols {
  return {
    date: fieldOf(r.fields, /entrada/),
    region: fieldOf(r.fields, /^regiao$/),
    company: fieldOf(r.fields, /razao social/)!,
    area: fieldOf(r.fields, /^area/),
    outcome: fieldOf(r.fields, /motivo de baixa|status da reclamacao|decisao/),
  };
}

const outcomeList = (m: Partial<Record<Outcome, number>>) =>
  (Object.keys(OUTCOME_LABEL) as Outcome[]).map((k) => ({ key: k, label: OUTCOME_LABEL[k], count: m[k] ?? 0 })).filter((x) => x.count > 0);

function addOutcome(m: Partial<Record<Outcome, number>>, raw: unknown, n: number) {
  const o = classifyOutcome(raw);
  m[o] = (m[o] ?? 0) + n;
}

/** Empresa válida: sem "N/A", "-" ou vazio. */
const realCompany = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && !/^(n\/?a|-+|nao informado|não informado|null)$/i.test(s) ? s : null;
};

export async function proconPanorama(db: Db, ano: number | null) {
  const periods = (await ckanPeriods(db, "procon")).filter((p) => p.kind === "ano");
  const r = pickPeriod(periods, ano ? String(ano) : null, "reclamações do PROCON");
  const c = proconCols(r);
  const valid = nonEmpty(c.company);
  const warnings: string[] = [];
  const rid = r.id;

  const [totals, byCompany, byArea, regions, days] = await Promise.all([
    attempt(warnings, "Total", () => ckanSql(db, `SELECT count(*) n, count(DISTINCT ${sql.id(c.company.id)}) d FROM ${sql.id(rid)} WHERE ${valid}`)),
    attempt(warnings, "Empresas", () =>
      ckanSql(db, `SELECT ${sql.id(c.company.id)} c, ${c.outcome ? sql.id(c.outcome.id) : "''"} s, count(*) n FROM ${sql.id(rid)} WHERE ${valid} GROUP BY c, s ORDER BY n DESC LIMIT 4000`),
    ),
    attempt(warnings, "Áreas", () =>
      c.area ? ckanSql(db, `SELECT ${sql.id(c.area.id)} a, ${c.outcome ? sql.id(c.outcome.id) : "''"} s, count(*) n FROM ${sql.id(rid)} WHERE ${valid} GROUP BY a, s ORDER BY n DESC LIMIT 2000`) : Promise.resolve(null),
    ),
    attempt(warnings, "Regiões", () => (c.region ? ckanSql(db, groupSql(rid, c.region, valid, 40)) : Promise.resolve(null))),
    attempt(warnings, "Meses", () => (c.date ? ckanSql(db, daySql(rid, c.date, valid)) : Promise.resolve(null))),
  ]);

  const total = totals ? num(totals.data[0]?.n) : null;
  const oc: Partial<Record<Outcome, number>> = {};
  const detailed = new Map<string, number>();
  const companies = new Map<string, { names: Map<string, number>; count: number; oc: Partial<Record<Outcome, number>> }>();
  for (const row of byCompany?.data ?? []) {
    const n = num(row.n);
    addOutcome(oc, row.s, n);
    const det = normCategory(row.s);
    if (det) detailed.set(det, (detailed.get(det) ?? 0) + n);
    const name = realCompany(row.c);
    if (!name) continue;
    const key = companyKey(name);
    if (key.length < 2) continue;
    const e = companies.get(key) ?? { names: new Map<string, number>(), count: 0, oc: {} };
    e.names.set(name, (e.names.get(name) ?? 0) + n);
    e.count += n;
    addOutcome(e.oc, row.s, n);
    companies.set(key, e);
  }
  const areaMap = new Map<string, { count: number; oc: Partial<Record<Outcome, number>> }>();
  for (const row of byArea?.data ?? []) {
    const label = normCategory(row.a);
    if (!label) continue;
    const e = areaMap.get(label) ?? { count: 0, oc: {} };
    e.count += num(row.n);
    addOutcome(e.oc, row.s, num(row.n));
    areaMap.set(label, e);
  }
  const loaded = total ?? [...companies.values()].reduce((s, e) => s + e.count, 0);
  return {
    ano: r.year,
    periods: periodOptions(periods),
    source: sourceOf("procon", r),
    total,
    loaded,
    complete: true,
    fetchedAt: totals?.fetchedAt ?? byCompany?.fetchedAt ?? new Date().toISOString(),
    stale: [totals, byCompany, byArea, regions, days].some((x) => x?.stale),
    warnings,
    outcomes: outcomeList(oc),
    resolution: resolutionRate(oc),
    areas: [...areaMap.entries()].map(([label, e]) => ({ label, count: e.count, ...resolutionRate(e.oc) })).sort((a, b) => b.count - a.count),
    regions: regions ? sumBy(regions.data, "k", 8) : [],
    months: days ? monthSeries(days.data) : [],
    companies: [...companies.entries()]
      .map(([key, e]) => ({ key, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0]![0], count: e.count, ...resolutionRate(e.oc) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12),
    companiesDistinct: companies.size || (totals ? num(totals.data[0]?.d) : 0),
    detailedOutcomes: toList(detailed, 12),
  };
}

/** Ficha de uma empresa em todos os anos publicados, comparada à média da cidade. */
export async function proconCompany(db: Db, query: string) {
  const q = companyKey(query);
  const terms = safeTerms(query, 3).filter((t) => !/^(ltda|eireli|brasil|grupo|companhia)$/.test(t));
  if (q.length < 3 || !terms.length) throw new CityError(400, "Digite ao menos 3 letras do nome da empresa.");
  const periods = (await ckanPeriods(db, "procon")).filter((p) => p.kind === "ano");
  if (!periods.length) throw new CityError(503, "O Portal de Dados Abertos não listou as bases do PROCON agora.", "indisponivel");

  const years = await Promise.allSettled(
    periods.map(async (p) => {
      const c = proconCols(p);
      const cols = [`${sql.id(c.company.id)} c`, c.outcome ? `${sql.id(c.outcome.id)} s` : "'' s", c.area ? `${sql.id(c.area.id)} a` : "'' a", c.region ? `${sql.id(c.region.id)} g` : "'' g", c.date ? `${sql.id(c.date.id)} d` : "'' d"];
      const like = terms.map((t) => `${sql.id(c.company.id)} ILIKE ${sql.lit(`%${t}%`)}`).join(" AND ");
      const [rows, city] = await Promise.all([
        ckanSql(db, `SELECT ${cols.join(", ")} FROM ${sql.id(p.id)} WHERE ${like} LIMIT 2000`),
        ckanSql(db, `SELECT ${c.outcome ? sql.id(c.outcome.id) : "''"} s, count(*) n FROM ${sql.id(p.id)} WHERE ${nonEmpty(c.company)} GROUP BY s ORDER BY n DESC LIMIT 200`),
      ]);
      return { ano: p.year, rows: rows.data.filter((r) => companyKey(String(r.c ?? "")).includes(q)), city: city.data };
    }),
  );
  const ok = years.filter((y): y is PromiseFulfilledResult<{ ano: number; rows: Json[]; city: Json[] }> => y.status === "fulfilled").map((y) => y.value);
  if (!ok.length) {
    const err = years.find((y): y is PromiseRejectedResult => y.status === "rejected")?.reason;
    throw err instanceof CityError ? err : new CityError(503, "Não foi possível ler as bases do PROCON agora.");
  }
  const rows: Json[] = ok.flatMap((y) => y.rows.map((r) => ({ ...r, ano: y.ano })));
  const groups = new Map<string, { names: Map<string, number>; count: number; oc: Partial<Record<Outcome, number>> }>();
  const oc: Partial<Record<Outcome, number>> = {};
  for (const r of rows) {
    const name = realCompany(r.c);
    if (!name) continue;
    const key = companyKey(name);
    const g = groups.get(key) ?? { names: new Map<string, number>(), count: 0, oc: {} };
    g.names.set(name, (g.names.get(name) ?? 0) + 1);
    g.count += 1;
    addOutcome(g.oc, r.s, 1);
    groups.set(key, g);
    addOutcome(oc, r.s, 1);
  }
  const cityOc: Partial<Record<Outcome, number>> = {};
  let cityTotal = 0;
  for (const y of ok)
    for (const r of y.city) {
      addOutcome(cityOc, r.s, num(r.n));
      cityTotal += num(r.n);
    }
  const dateOf = (r: Json) => {
    const m = String(r.d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})|^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]!.padStart(2, "0")}-${m[4]!.padStart(2, "0")}`;
  };
  return {
    query,
    yearsRead: ok.map((y) => y.ano).sort((a, b) => a - b),
    yearsFailed: periods.map((p) => p.year).filter((a) => !ok.some((y) => y.ano === a)),
    matches: [...groups.entries()]
      .map(([key, g]) => ({ key, name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]![0], count: g.count, ...resolutionRate(g.oc) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    count: rows.length,
    shareOfAll: pct(rows.length, cityTotal),
    byYear: ok.map((y) => ({ ano: y.ano, count: y.rows.length })).sort((a, b) => a.ano - b.ano),
    outcomes: outcomeList(oc),
    resolution: resolutionRate(oc),
    cityResolution: resolutionRate(cityOc),
    areas: countList(rows.map((r) => normCategory(r.a)), 6),
    regions: countList(rows.map((r) => normCategory(r.g)), 6),
    recent: rows
      .map((r) => ({ r, date: dateOf(r) }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 12)
      .map(({ r, date }) => {
        const o = classifyOutcome(r.s);
        return { date, company: realCompany(r.c), area: normCategory(r.a), region: normCategory(r.g), outcome: o, outcomeLabel: OUTCOME_LABEL[o], outcomeRaw: normCategory(r.s) };
      }),
  };
}

/* ───────────────────────── SP156 ───────────────────────── */

/** Dias entre abertura e finalização (só quando as duas datas existem e fazem sentido). */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000;
  return Number.isFinite(d) && d >= 0 && d < 3650 ? d : null;
}

const SATISFACTION_ORDER = ["Excelente", "Ótimo", "Bom", "Razoável", "Ruim", "Péssimo"];
const isTs = (f: CkanField | null): f is CkanField => !!f && (f.type.startsWith("timestamp") || f.type === "date");

/** Semestre das ligações que cobre o período das solicitações (trimestres 1–2 → 1º semestre). */
const ligacoesKeyFor = (p: CkanResource) => (p.kind === "tri" ? `${p.year}-S${p.part! <= 2 ? 1 : 2}` : p.kind === "sem" ? p.key : null);

export async function sp156Panorama(db: Db, periodo: string | null) {
  const [periods, ligPeriods] = await Promise.all([ckanPeriods(db, "sp156"), ckanPeriods(db, "ligacoes").catch(() => [] as CkanResource[])]);
  const r = pickPeriod(periods, periodo, "solicitações do SP156");
  const f = (re: RegExp) => fieldOf(r.fields, re);
  const c = {
    tema: f(/^tema$/)!,
    servico: f(/^servico$/),
    status: f(/^status/),
    sub: f(/^subprefeitura$/),
    distrito: f(/^distrito$|^bairro$/),
    canal: f(/^canal$/),
    orgao: f(/^orgao$/),
    abertura: f(/data de abertura/),
    fim: f(/data de finaliza|data de parecer/),
    satisfacao: f(/^nivel( satisfacao)?$/),
    atendeu: f(/^atendeu/),
  };
  const valid = nonEmpty(c.tema);
  const rid = r.id;
  const warnings: string[] = [];
  const g = (label: string, col: CkanField | null, limit: number) => attempt(warnings, label, () => (col ? ckanSql(db, groupSql(rid, col, valid, limit)) : Promise.resolve(null)));
  const durationExpr = isTs(c.abertura) && isTs(c.fim) ? `extract(epoch FROM (${sql.id(c.fim.id)} - ${sql.id(c.abertura.id)}))/86400` : null;
  const durWhere = durationExpr ? `${sql.id(c.fim!.id)} >= ${sql.id(c.abertura!.id)}` : "";

  const [total, temas, servicos, subs, distritos, status, canais, orgaos, satisf, atendeu, days, median, slow] = await Promise.all([
    attempt(warnings, "Total", () => ckanSql(db, `SELECT count(*) n FROM ${sql.id(rid)} WHERE ${valid}`)),
    g("Temas", c.tema, 12),
    g("Serviços", c.servico, 14),
    g("Subprefeituras", c.sub, 40),
    g("Distritos", c.distrito, 12),
    g("Status", c.status, 10),
    g("Canais", c.canal, 8),
    g("Órgãos", c.orgao, 10),
    g("Satisfação", c.satisfacao, 10),
    g("Atendeu a solicitação", c.atendeu, 8),
    attempt(warnings, "Meses", () => (c.abertura ? ckanSql(db, daySql(rid, c.abertura, valid)) : Promise.resolve(null))),
    attempt(warnings, "Tempo de atendimento", () =>
      durationExpr ? ckanSql(db, `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ${durationExpr}) m, count(*) n FROM ${sql.id(rid)} WHERE ${durWhere}`) : Promise.resolve(null),
    ),
    attempt(warnings, "Temas mais lentos", () =>
      durationExpr
        ? ckanSql(db, `SELECT ${sql.id(c.tema.id)} k, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${durationExpr}) m, count(*) n FROM ${sql.id(rid)} WHERE ${durWhere} GROUP BY k ORDER BY n DESC LIMIT 40`)
        : Promise.resolve(null),
    ),
  ]);

  const satisfacao = satisf ? sumBy(satisf.data, "k", 10).sort((a, b) => SATISFACTION_ORDER.indexOf(a.label) - SATISFACTION_ORDER.indexOf(b.label)) : [];
  const evaluated = satisfacao.reduce((s, x) => s + x.count, 0);
  const good = satisfacao.filter((x) => /^(excelente|ótimo|bom)$/i.test(x.label)).reduce((s, x) => s + x.count, 0);
  const solicitacoes = {
    total: total ? num(total.data[0]?.n) : null,
    loaded: total ? num(total.data[0]?.n) : 0,
    fetchedAt: total?.fetchedAt ?? new Date().toISOString(),
    stale: [total, temas, days].some((x) => x?.stale),
    temas: temas ? sumBy(temas.data, "k", 12) : [],
    servicos: servicos ? sumBy(servicos.data, "k", 14) : [],
    subprefeituras: subs ? sumBy(subs.data, "k", 40) : [],
    distritos: distritos ? sumBy(distritos.data, "k", 12) : [],
    status: status ? sumBy(status.data, "k", 10) : [],
    canais: canais ? sumBy(canais.data, "k", 8) : [],
    orgaos: orgaos ? sumBy(orgaos.data, "k", 10, (v) => (String(v ?? "").trim() ? String(v).trim() : null)) : [],
    satisfacao,
    satisfacaoBoaPct: pct(good, evaluated),
    avaliadas: evaluated,
    atendeu: atendeu ? sumBy(atendeu.data, "k", 8) : [],
    months: days ? monthSeries(days.data) : [],
    medianDays: median?.data[0]?.m != null ? Math.round(num(median.data[0].m) * 10) / 10 : null,
    daysBase: median ? num(median.data[0]?.n) : 0,
    slowestThemes: (slow?.data ?? [])
      .filter((x) => num(x.n) >= 20 && normCategory(x.k))
      .map((x) => ({ label: normCategory(x.k)!, medianDays: Math.round(num(x.m) * 10) / 10, count: num(x.n) }))
      .sort((a, b) => b.medianDays - a.medianDays)
      .slice(0, 6),
  };

  let ligacoes = null;
  const lk = ligacoesKeyFor(r);
  const lr = ligPeriods.find((p) => p.key === lk) ?? null;
  if (lr) {
    const lig = await attempt(warnings, "Ligações", () => ckanRows(db, lr.id, 400));
    if (lig?.data.length) ligacoes = { periodLabel: lr.label, ...callCenter(lig.data) };
  }
  return {
    periodo: r.key,
    periodLabel: r.label,
    ano: r.year,
    periods: periodOptions(periods),
    source: sourceOf("sp156", r),
    warnings,
    solicitacoes,
    ligacoes,
    ligacoesNote: lr ? null : "O portal ainda não publicou as ligações da central para este período.",
    solicitacoesError: null as string | null,
  };
}

/** Central 156: soma e médias a partir das linhas diárias (números limpos por shapeRows). */
function callCenter(raw: Json[]) {
  const l = shapeRows(raw as Parameters<typeof shapeRows>[0]);
  const col = (re: RegExp) => colOf(l.columns, re);
  const c = {
    data: col(/^data$/),
    entr: col(/entrantes/),
    aten: col(/ligacoes atendidas$/),
    aban: col(/ligacoes abandonadas$/),
    nivel: col(/nivel de servico/),
    tme: col(/tempo medio de espera/),
    tma: col(/tempo medio de atendimento/),
  };
  const sum = (k: string | null) => (k ? l.rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0) : null);
  const avg = (k: string | null) => {
    if (!k) return null;
    const xs = l.rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };
  const entrantes = sum(c.entr);
  const atendidas = sum(c.aten);
  return {
    days: l.rows.length,
    entrantes,
    atendidas,
    abandonadas: sum(c.aban),
    taxaAtendimento: entrantes && atendidas != null ? pct(atendidas, entrantes) : null,
    nivelServico: avg(c.nivel),
    esperaMediaSeg: avg(c.tme),
    atendimentoMedioSeg: avg(c.tma),
    series:
      c.data && c.entr
        ? l.rows
            .filter((r) => typeof r[c.data!] === "string")
            .map((r) => ({ x: String(r[c.data!]).slice(0, 10), entrantes: (r[c.entr!] as number) ?? 0, atendidas: c.aten ? ((r[c.aten] as number) ?? 0) : 0 }))
            .sort((a, b) => a.x.localeCompare(b.x))
        : [],
  };
}

/* ───────────────────────── e-SIC ───────────────────────── */

export type EsicStatus = "atendido" | "parcial" | "negado" | "finalizado" | "tramitando" | "outro";

/** Status do pedido. "Finalizado" (encerrado sem dizer se foi atendido) fica separado de "Atendido". */
export function classifyEsic(raw: unknown): EsicStatus {
  const s = strip(String(raw ?? ""));
  if (/parcial/.test(s)) return "parcial";
  if (/indefer|negad|nao atendid/.test(s)) return "negado";
  if (/atendid|respondid|deferid/.test(s)) return "atendido";
  if (/finaliz|encerrad|conclu/.test(s)) return "finalizado";
  if (/tramita|registrad|andamento|aberto|prorrog|recurso|aguard/.test(s)) return "tramitando";
  return "outro";
}

const EMPTY_STATUS = (): Record<EsicStatus, number> => ({ atendido: 0, parcial: 0, negado: 0, finalizado: 0, tramitando: 0, outro: 0 });

export async function esicPanorama(db: Db, ano: number | null, query: string | null) {
  const periods = (await ckanPeriods(db, "esic")).filter((p) => p.kind === "ano");
  const r = pickPeriod(periods, ano ? String(ano) : null, "pedidos do e-SIC");
  const f = (re: RegExp) => fieldOf(r.fields, re);
  const c = {
    id: f(/^cd_pedido$/)!,
    status: f(/status/)!,
    orgao: f(/^(nm_orgao|orgao_nome)$/),
    data: f(/^dt_resposta/),
    pedido: f(/^dc_pedido$/),
    resposta: f(/^dc_resposta$/),
  };
  const rid = r.id;
  const warnings: string[] = [];
  const order = c.data ? `${sql.id(c.id.id)}, ${sql.id(c.data.id)} DESC` : sql.id(c.id.id);
  // Um pedido tem vários atendimentos (registro, prorrogação, resposta): vale o mais recente.
  const latest = `(SELECT DISTINCT ON (${sql.id(c.id.id)}) ${sql.id(c.id.id)} p, ${c.orgao ? sql.id(c.orgao.id) : "''"} o, ${sql.id(c.status.id)} s FROM ${sql.id(rid)} ORDER BY ${order}) t`;
  const terms = query ? safeTerms(query) : [];
  const textCols = (n1: number, n2: number) => `${c.pedido ? `left(${sql.id(c.pedido.id)}, ${n1})` : "''"} q, ${c.resposta ? `left(${sql.id(c.resposta.id)}, ${n2})` : "''"} a`;
  const baseCols = `${sql.id(c.id.id)} p, ${c.orgao ? sql.id(c.orgao.id) : "''"} o, ${sql.id(c.status.id)} s, ${c.data ? sql.id(c.data.id) : "''"} d`;

  const [totals, byOrg, days, results, recent] = await Promise.all([
    attempt(warnings, "Total", () => ckanSql(db, `SELECT count(*) n, count(DISTINCT ${sql.id(c.id.id)}) d FROM ${sql.id(rid)}`)),
    attempt(warnings, "Órgãos e status", () => ckanSql(db, `SELECT o, s, count(*) n FROM ${latest} GROUP BY o, s ORDER BY n DESC LIMIT 3000`)),
    attempt(warnings, "Meses", () =>
      c.data
        ? ckanSql(db, `SELECT floor(extract(epoch FROM d)/86400) k, count(*) n FROM (SELECT ${sql.id(c.id.id)}, min(${sql.id(c.data.id)}) d FROM ${sql.id(rid)} GROUP BY ${sql.id(c.id.id)}) x GROUP BY k ORDER BY n DESC LIMIT 400`)
        : Promise.resolve(null),
    ),
    attempt(warnings, "Busca", () =>
      terms.length && c.pedido
        ? ckanSql(
            db,
            `SELECT ${baseCols}, ${textCols(1200, 1600)} FROM ${sql.id(rid)} WHERE ${terms.map((t) => `${sql.id(c.pedido!.id)} ILIKE ${sql.lit(`%${t}%`)}`).join(" AND ")} ORDER BY d DESC LIMIT 120`,
          )
        : Promise.resolve(null),
    ),
    attempt(warnings, "Respostas recentes", () =>
      !terms.length && c.pedido && c.data
        ? ckanSql(db, `SELECT ${baseCols}, ${textCols(600, 900)} FROM ${sql.id(rid)} WHERE ${sql.id(c.status.id)} = 'Atendido' ORDER BY d DESC LIMIT 6`)
        : Promise.resolve(null),
    ),
  ]);

  const st = EMPTY_STATUS();
  const statusRaw = new Map<string, number>();
  const org = new Map<string, Record<EsicStatus, number>>();
  for (const row of byOrg?.data ?? []) {
    const n = num(row.n);
    const s = classifyEsic(row.s);
    st[s] += n;
    const raw = normCategory(row.s);
    if (raw) statusRaw.set(raw, (statusRaw.get(raw) ?? 0) + n);
    const o = String(row.o ?? "").trim();
    if (!o) continue;
    const e = org.get(o) ?? EMPTY_STATUS();
    e[s] += n;
    org.set(o, e);
  }
  const decided = st.atendido + st.parcial + st.negado;
  const item = (x: Json) => {
    const s = classifyEsic(x.s);
    return { id: String(x.p ?? ""), orgao: String(x.o ?? "").trim() || null, status: s, statusRaw: normCategory(x.s), data: x.d ? String(x.d).slice(0, 10) : null, pedido: maskPII(String(x.q ?? "")), resposta: maskPII(String(x.a ?? "")) };
  };
  // A busca devolve atendimentos: fica um por pedido (o mais recente vem primeiro pelo ORDER BY).
  const seen = new Set<string>();
  const found = (results?.data ?? []).map(item).filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 40);
  return {
    ano: r.year,
    periods: periodOptions(periods),
    source: sourceOf("esic", r),
    warnings,
    total: totals ? num(totals.data[0]?.d) : null,
    atendimentos: totals ? num(totals.data[0]?.n) : null,
    loaded: Object.values(st).reduce((a, b) => a + b, 0),
    fetchedAt: totals?.fetchedAt ?? new Date().toISOString(),
    stale: [totals, byOrg].some((x) => x?.stale),
    status: st,
    statusRaw: toList(statusRaw, 12),
    atendidoPct: pct(st.atendido, decided),
    decided,
    orgaos: [...org.entries()]
      .map(([label, e]) => {
        const count = Object.values(e).reduce((a, b) => a + b, 0);
        return { label, count, atendidoPct: pct(e.atendido, e.atendido + e.parcial + e.negado), negadoPct: pct(e.negado, count) };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    months: days ? monthSeries(days.data) : [],
    query: terms.length ? query : null,
    results: found,
    recent: (recent?.data ?? []).map(item),
  };
}
