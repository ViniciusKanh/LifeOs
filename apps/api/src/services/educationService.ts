import type { Client } from "@libsql/client";
import { CityError } from "./apilibClient.js";
import { escolaGet, type Json } from "./publicDataClient.js";

/**
 * Educação — rede municipal a partir da Escola Aberta (SME), atualizada todo mês.
 *
 * Panorama: vagas oferecidas × atendidas por modalidade e série, escolas por tipo e porte,
 * profissionais por formação e cargo, ambientes — para a cidade ou uma Diretoria Regional.
 * Escola: vagas por série, alunos por turno, ambientes e servidores.
 * O LifeOS não cria nota, ranking de qualidade nem "melhor escola": a fonte não publica avaliação.
 */

type Db = Client;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const results = (raw: unknown): Json[] => {
  const o = raw as { results?: unknown };
  return Array.isArray(o?.results) ? (o.results as Json[]) : Array.isArray(raw) ? (raw as Json[]) : [];
};

const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "com"]);
/** "ENSINO FUNDAMENTAL DE 9 ANOS" → "Ensino Fundamental de 9 Anos" (siglas curtas ficam em maiúsculas). */
export function titleCase(s: string): string {
  return clean(s)
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : /^(eja|cieja|cei|emef|emei|emefm|ceu|cemei|cca|emebs|mova|cmct|ii|iii|iv|vi|ti|libras|nee|sme|dre)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bEducacao\b/g, "Educação")
    .replace(/\bMedio\b/g, "Médio")
    .replace(/\bTecnico\b/g, "Técnico")
    .replace(/\bQualificacao\b/g, "Qualificação")
    .replace(/\bBercario\b/g, "Berçário")
    .replace(/\bEspec\b/g, "Especial");
}

export interface Seats {
  turmas: number;
  vagas: number;
  atendimentos: number;
  remanescentes: number;
  /** Alunos por turma (média publicada). */
  mediaTurma: number | null;
  ocupacao: number | null;
}

function seats(r: Json): Seats {
  const vagas = num(r.vagas_oferecidas);
  const atend = num(r.atendimentos);
  return {
    turmas: num(r.total_turmas),
    vagas,
    atendimentos: atend,
    remanescentes: num(r.vagas_remanecentes),
    mediaTurma: r.media_atendimento == null ? null : num(r.media_atendimento),
    ocupacao: pct(atend, vagas),
  };
}

/**
 * Agrupa vagas por modalidade. Na fonte, a linha com série vazia é o subtotal da modalidade
 * (conferido: soma das séries = linha vazia); quando ela não vem, o subtotal é a soma das séries.
 */
export function modalitiesOf(rows: Json[]) {
  const m = new Map<string, { total: Seats | null; series: Array<{ label: string } & Seats> }>();
  for (const r of rows) {
    const mod = clean(r.modalidade);
    if (!mod) continue;
    const e = m.get(mod) ?? { total: null, series: [] };
    const serie = clean(r.decserie ?? r.serie);
    if (!serie) e.total = seats(r);
    else e.series.push({ label: titleCase(serie), ...seats(r) });
    m.set(mod, e);
  }
  return [...m.entries()]
    .map(([mod, e]) => {
      const sum = e.series.reduce((s, x) => ({ turmas: s.turmas + x.turmas, vagas: s.vagas + x.vagas, atendimentos: s.atendimentos + x.atendimentos, remanescentes: s.remanescentes + x.remanescentes }), { turmas: 0, vagas: 0, atendimentos: 0, remanescentes: 0 });
      const total = e.total ?? { ...sum, mediaTurma: sum.turmas ? Math.round(sum.atendimentos / sum.turmas) : null, ocupacao: pct(sum.atendimentos, sum.vagas) };
      return { label: titleCase(mod), ...total, series: e.series.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })) };
    })
    .filter((x) => x.vagas > 0 || x.atendimentos > 0)
    .sort((a, b) => b.vagas - a.vagas);
}

const FAIXA_ORDER = ["Sem estudantes cadastrados", "1 a 250 estudantes", "251 a 500 estudantes", "501 a 1000 estudantes", "1001 a 1500 estudantes", "1501 a 2000 estudantes", "2001 a 2500 estudantes"];
const faixaRank = (s: string) => {
  const i = FAIXA_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
};

function sumMap(rows: Json[], key: (r: Json) => string, val: (r: Json) => number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + val(r));
  }
  return m;
}
const list = (m: Map<string, number>) => [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

interface Part<T> {
  data: T | null;
  error: string | null;
  fetchedAt: string | null;
  stale: boolean;
}
async function part<T>(fn: () => Promise<{ data: T; fetchedAt: string; stale: boolean }>): Promise<Part<T>> {
  try {
    const r = await fn();
    return { data: r.data, error: null, fetchedAt: r.fetchedAt, stale: r.stale };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "indisponível", fetchedAt: null, stale: false };
  }
}

export async function educationPanorama(db: Db, dre: string | null) {
  const p = dre ? { dre } : {};
  const [vagas, escolas, prof, amb, upd, dres] = await Promise.all([
    part(() => escolaGet(db, dre ? "smeVagasDre" : "smeVagas", p)),
    part(() => escolaGet(db, dre ? "smeEscolasDre" : "smeEscolas", p)),
    part(() => escolaGet(db, dre ? "smeProfissionaisDre" : "smeProfissionais", p)),
    part(() => escolaGet(db, dre ? "smeAmbientesDre" : "smeAmbientes", p)),
    part(() => escolaGet(db, "atualizacao")),
    part(() => escolaGet(db, "diretorias")),
  ]);
  if (!vagas.data && !escolas.data) throw new CityError(503, vagas.error ?? "A Escola Aberta não respondeu agora.", "indisponivel");

  const modalidades = vagas.data ? modalitiesOf(results(vagas.data)) : [];
  const tot = modalidades.reduce((s, m) => ({ turmas: s.turmas + m.turmas, vagas: s.vagas + m.vagas, atendimentos: s.atendimentos + m.atendimentos, remanescentes: s.remanescentes + m.remanescentes }), { turmas: 0, vagas: 0, atendimentos: 0, remanescentes: 0 });
  const escRows = escolas.data ? results(escolas.data) : [];
  const porTipo = list(sumMap(escRows, (r) => clean(r.tipoesc), (r) => num(r.count)));
  const porFaixa = list(sumMap(escRows, (r) => clean(r.faixa), (r) => num(r.count))).sort((a, b) => faixaRank(a.label) - faixaRank(b.label));
  const profRows = prof.data ? results(prof.data) : [];
  const formacao = list(sumMap(profRows, (r) => titleCase(String(r.formacao ?? "")) || "Não informada", (r) => num(r.total)));
  const cargos = list(sumMap(profRows, (r) => titleCase(String(r.titulo ?? "")), (r) => num(r.total)));
  const ambientes = (amb.data ? results(amb.data) : []).map((r) => ({ label: titleCase(String(r.ambiente ?? "")), count: num(r.total) })).filter((x) => x.label).sort((a, b) => b.count - a.count);
  // "Onde sobram vagas": séries com mais vagas remanescentes (ofertadas e não preenchidas).
  const sobras = modalidades
    .flatMap((m) => m.series.map((s) => ({ modalidade: m.label, ...s })))
    .filter((s) => s.remanescentes > 0)
    .sort((a, b) => b.remanescentes - a.remanescentes)
    .slice(0, 8);
  const lotadas = modalidades
    .flatMap((m) => m.series.map((s) => ({ modalidade: m.label, ...s })))
    .filter((s) => s.vagas >= 200 && s.ocupacao != null)
    .sort((a, b) => (b.ocupacao ?? 0) - (a.ocupacao ?? 0))
    .slice(0, 6);
  const dreList = (dres.data ? results(dres.data) : []).map((r) => ({ value: clean(r.dre), label: titleCase(String(r.diretoria ?? "").replace(/^DIRETORIA REGIONAL DE EDUCACAO\s*/i, "")) })).filter((d) => /^[A-Z]{1,3}$/.test(d.value));
  const parts = { vagas, escolas, prof, amb };
  return {
    dre,
    dreLabel: dre ? (dreList.find((d) => d.value === dre)?.label ?? dre) : null,
    dres: dreList.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    atualizadoEm: upd.data ? String(results(upd.data)[0]?.dt_atualizacao ?? "") || null : null,
    fetchedAt: vagas.fetchedAt ?? escolas.fetchedAt,
    stale: Object.values(parts).some((x) => x.stale),
    warnings: Object.entries(parts)
      .filter(([, v]) => v.error)
      .map(([k, v]) => `${{ vagas: "Vagas", escolas: "Escolas", prof: "Profissionais", amb: "Ambientes" }[k]}: ${v.error}`),
    kpis: {
      escolas: porTipo.reduce((s, x) => s + x.count, 0) || null,
      ...tot,
      ocupacao: pct(tot.atendimentos, tot.vagas),
      profissionais: profRows.length ? profRows.reduce((s, r) => s + num(r.total), 0) : null,
    },
    modalidades,
    sobras,
    lotadas,
    escolasPorTipo: porTipo,
    escolasPorFaixa: porFaixa,
    formacao,
    cargos: cargos.slice(0, 12),
    ambientes: ambientes.slice(0, 16),
    source: { name: "Secretaria Municipal de Educação — Escola Aberta", url: "https://escolaaberta.sme.prefeitura.sp.gov.br/" },
  };
}

/* ───────────────────────── busca e ficha da escola ───────────────────────── */

export interface SchoolSummary {
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

function school(r: Json): SchoolSummary {
  const lat = typeof r.latitude === "number" ? r.latitude : null;
  const lng = typeof r.longitude === "number" ? r.longitude : null;
  const cep = r.cep == null ? null : String(r.cep).padStart(8, "0");
  const tel = clean(r.tel1);
  return {
    codesc: clean(r.codesc),
    nome: clean(r.nomesc),
    tipo: clean(r.tipoesc),
    dre: clean(r.dre) || null,
    diretoria: r.diretoria ? titleCase(String(r.diretoria).replace(/^DIRETORIA REGIONAL DE EDUCACAO\s*/i, "")) : null,
    distrito: r.distrito ? titleCase(String(r.distrito)) : null,
    bairro: r.bairro ? titleCase(String(r.bairro)) : null,
    subpref: r.subpref ? titleCase(String(r.subpref)) : null,
    endereco: [clean(r.endereco), clean(r.numero)].filter(Boolean).join(", ") || null,
    cep: cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null,
    telefone: tel ? (tel.length === 8 ? `(11) ${tel.slice(0, 4)}-${tel.slice(4)}` : tel) : null,
    email: clean(r.email) || null,
    situacao: clean(r.situacao) || null,
    // Coordenadas fora da Grande SP são descartadas (erro de cadastro).
    lat: lat != null && lat < -23.2 && lat > -24.1 ? lat : null,
    lng: lng != null && lng < -46.3 && lng > -47 ? lng : null,
    criadaEm: r.dt_criacao ? String(r.dt_criacao).slice(0, 10) : null,
  };
}

export interface SchoolQuery {
  search?: string;
  dre?: string;
  tipoesc?: string;
  distrito?: string;
  page: number;
}

export async function searchSchools(db: Db, q: SchoolQuery) {
  const r = await escolaGet<{ count?: number; results?: Json[] }>(db, "escolas", {}, { page: q.page, search: q.search ?? "", dre: q.dre ?? "", tipoesc: q.tipoesc ?? "", distrito: q.distrito ?? "" });
  const rows = (r.data.results ?? []).map(school);
  return { total: typeof r.data.count === "number" ? r.data.count : rows.length, page: q.page, pageSize: 10, rows, fetchedAt: r.fetchedAt, stale: r.stale };
}

export async function schoolDetail(db: Db, codesc: string) {
  const [info, vagas, alunos, amb, serv, mods] = await Promise.all([
    part(() => escolaGet(db, "escola", { codesc })),
    part(() => escolaGet(db, "vagasSerie", { codesc })),
    part(() => escolaGet(db, "alunos", { codesc })),
    part(() => escolaGet(db, "ambientes", { codesc })),
    part(() => escolaGet(db, "servidores", { codesc })),
    part(() => escolaGet(db, "modalidades", { codesc })),
  ]);
  if (!info.data) throw new CityError(info.error?.includes("não tem dados") ? 404 : 503, info.error ?? "Escola não encontrada.");
  const series = (vagas.data ? results(vagas.data) : []).map((r) => ({ label: titleCase(clean(r.serie)), ...seats(r) })).filter((s) => s.label);
  const tot = series.reduce((s, x) => ({ turmas: s.turmas + x.turmas, vagas: s.vagas + x.vagas, atendimentos: s.atendimentos + x.atendimentos, remanescentes: s.remanescentes + x.remanescentes }), { turmas: 0, vagas: 0, atendimentos: 0, remanescentes: 0 });
  const alunoRows = alunos.data ? results(alunos.data) : [];
  const turnos = list(sumMap(alunoRows, (r) => clean(r.turno) || "Não informado", (r) => num(r.total_alunos)));
  const servidores = (serv.data ? results(serv.data) : []).map((r) => ({ label: titleCase(String(r.area_de_atuacao ?? "")), count: num(r.total) })).filter((x) => x.label).sort((a, b) => b.count - a.count);
  const modalidades = ((mods.data as { modalidade?: unknown } | null)?.modalidade as unknown[] | undefined)?.map((m) => titleCase(String(m))) ?? [];
  return {
    school: school(info.data as Json),
    modalidades,
    totals: { ...tot, ocupacao: pct(tot.atendimentos, tot.vagas) },
    series,
    turnos,
    alunos: turnos.reduce((s, t) => s + t.count, 0) || null,
    ambientes: (amb.data ? results(amb.data) : []).map((r) => ({ label: titleCase(String(r.ambiente ?? "")), count: num(r.total) })).filter((x) => x.label).sort((a, b) => b.count - a.count),
    servidores,
    servidoresTotal: servidores.reduce((s, x) => s + x.count, 0) || null,
    fetchedAt: info.fetchedAt,
    stale: [info, vagas, alunos, amb, serv].some((x) => x.stale),
    warnings: [vagas, alunos, amb, serv].filter((x) => x.error).map((x) => x.error!),
  };
}
