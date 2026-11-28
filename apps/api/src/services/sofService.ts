import type { Client } from "@libsql/client";
import { CityError, cityFetch, type Row } from "./apilibClient.js";

/**
 * Finanças Públicas — Sistema de Orçamento e Finanças (SOF) da Prefeitura, via APILIB.
 *
 * A consulta de despesas devolve UM registro agregado por filtro (acumulado do ano até o mês).
 * Por isso o LifeOS monta as leituras com várias consultas filtradas:
 *   - série mês a mês (1..M) da cidade ou de um órgão → execução ao longo do ano;
 *   - uma consulta por função de governo (Saúde, Educação…) no último mês com dados;
 *   - o mesmo mês do ano anterior para comparação.
 * Tudo em cache no servidor. Dados públicos — totalmente separados das finanças pessoais.
 */

type Db = Client;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Ano e mês correntes em São Paulo. */
export function spToday(date = new Date()): { ano: number; mes: number } {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(date).split("-");
  return { ano: Number(y), mes: Number(m) };
}

/** Executa no máximo `limit` promessas ao mesmo tempo (o APILIB limita rajadas). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = { status: "fulfilled", value: await fn(items[idx]!) };
      } catch (e) {
        out[idx] = { status: "rejected", reason: e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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

export function execution(r: Row | undefined): Execution | null {
  if (!r) return null;
  const orcado = num(r.valOrcadoAtualizado);
  const e = num(r.valEmpenhadoLiquido);
  const l = num(r.valLiquidado);
  const p = num(r.valPagoExercicio);
  if (!orcado && !e && !p) return null;
  return {
    orcadoInicial: num(r.valOrcadoInicial),
    orcado,
    empenhado: e,
    liquidado: l,
    pago: p,
    disponivel: num(r.valDisponivel),
    congelado: num(r.valCongelado),
    execEmpenhado: pct(e, orcado),
    execLiquidado: pct(l, orcado),
    execPago: pct(p, orcado),
  };
}

type Filter = { codOrgao?: string; codFuncao?: string };

async function despesa(db: Db, ownerId: string, ano: number, mes: number, f: Filter = {}) {
  const r = await cityFetch(db, ownerId, "sof", "despesas", { anoDotacao: ano, mesDotacao: mes, ...f });
  return { exec: execution(r.items[0]), fetchedAt: r.fetchedAt, stale: r.stale };
}

/** Meses 1..M do ano (M = mês corrente no ano corrente, 12 nos anteriores) com o acumulado de cada um. */
async function series(db: Db, ownerId: string, ano: number, f: Filter) {
  const today = spToday();
  if (ano > today.ano) throw new CityError(400, "Ano ainda sem orçamento executado.");
  const last = ano === today.ano ? today.mes : 12;
  const months = Array.from({ length: last }, (_, i) => i + 1);
  const res = await mapLimit(months, 6, (mes) => despesa(db, ownerId, ano, mes, f));
  const firstErr = res.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
  const points = res
    .map((r, i) => (r.status === "fulfilled" && r.value.exec ? { mes: months[i]!, ...r.value.exec, fetchedAt: r.value.fetchedAt, stale: r.value.stale } : null))
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!points.length) {
    if (firstErr instanceof CityError) throw firstErr;
    throw new CityError(404, "O SOF ainda não publicou despesas para este ano.");
  }
  // Valor do mês = acumulado do mês − acumulado do mês anterior.
  const monthly = points.map((p, i) => {
    const prev = i > 0 && points[i - 1]!.mes === p.mes - 1 ? points[i - 1]! : null;
    return { mes: p.mes, empenhado: prev ? p.empenhado - prev.empenhado : p.empenhado, liquidado: prev ? p.liquidado - prev.liquidado : p.liquidado, pago: prev ? p.pago - prev.pago : p.pago };
  });
  return { points, monthly, latest: points[points.length - 1]!, partialErrors: res.filter((r) => r.status === "rejected").length };
}

export async function sofResumo(db: Db, ownerId: string, ano: number, codOrgao: string | null) {
  const f: Filter = codOrgao ? { codOrgao } : {};
  const s = await series(db, ownerId, ano, f);
  const M = s.latest.mes;
  const prev = await despesa(db, ownerId, ano - 1, M, f).catch(() => null);
  const { fetchedAt, stale, ...latest } = s.latest;
  return {
    ano,
    mes: M,
    codOrgao,
    latest,
    previousYear: prev?.exec ? { ano: ano - 1, mes: M, ...prev.exec } : null,
    cumulative: s.points.map(({ fetchedAt: _f, stale: _s, ...p }) => p),
    monthly: s.monthly,
    partialErrors: s.partialErrors,
    fetchedAt,
    stale: stale || s.points.some((p) => p.stale),
  };
}

/** Execução por função de governo no último mês com dados. */
export async function sofFuncoes(db: Db, ownerId: string, ano: number, mes: number, codOrgao: string | null) {
  const list = await cityFetch(db, ownerId, "sof", "funcoes", { anoExercicio: ano });
  const funcoes = list.items
    .map((r) => ({ cod: String(r.codFuncao ?? "").trim(), label: String(r.textDescricaoFuncao ?? r.txtDescricaoFuncao ?? "").trim() }))
    .filter((x) => /^\d{1,3}$/.test(x.cod) && x.label);
  const res = await mapLimit(funcoes, 6, (fn) => despesa(db, ownerId, ano, mes, { codFuncao: fn.cod, ...(codOrgao ? { codOrgao } : {}) }));
  const items = funcoes
    .map((fn, i) => {
      const r = res[i]!;
      return r.status === "fulfilled" && r.value.exec && r.value.exec.orcado > 0 ? { ...fn, ...r.value.exec } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.orcado - a.orcado);
  const orcado = items.reduce((s, x) => s + x.orcado, 0);
  return {
    ano,
    mes,
    codOrgao,
    items: items.map((x) => ({ ...x, share: pct(x.orcado, orcado) })),
    failed: res.filter((r) => r.status === "rejected").length,
    total: funcoes.length,
    fetchedAt: list.fetchedAt,
  };
}

export async function sofOrgaos(db: Db, ownerId: string, ano: number) {
  const r = await cityFetch(db, ownerId, "sof", "orgaos", { anoExercicio: ano });
  const seen = new Set<string>();
  const items = r.items
    .map((x) => ({ cod: String(x.codOrgao ?? "").trim(), label: String(x.txtDescricaoOrgao ?? "").trim() }))
    .filter((x) => /^\d{1,6}$/.test(x.cod) && x.label && !seen.has(x.cod) && (seen.add(x.cod), true))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return { ano, items, fetchedAt: r.fetchedAt };
}

const CONTRACT_PAGES = 4;

/**
 * Contratos do ano: a API pagina de 50 em 50 sem ordem nem total — o LifeOS lê as primeiras
 * páginas (amostra declarada na tela), ordena pela assinatura e resume por modalidade e tipo.
 */
export async function sofContratos(db: Db, ownerId: string, ano: number, codOrgao: string | null) {
  const pages = Array.from({ length: CONTRACT_PAGES }, (_, i) => i + 1);
  const res = await mapLimit(pages, 4, (numPagina) => cityFetch(db, ownerId, "sof", "contratos", { anoContrato: ano, numPagina, ...(codOrgao ? { codOrgao } : {}) }));
  const ok = res.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof cityFetch>>> => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) {
    const err = (res[0] as PromiseRejectedResult).reason;
    throw err instanceof CityError ? err : new CityError(503, "Não foi possível ler os contratos agora.");
  }
  const seen = new Set<string>();
  const rows = ok
    .flatMap((r) => r.items)
    .map((r) => ({
      id: `${r.codEmpresa ?? ""}-${r.codContrato ?? ""}-${r.numOriginalContrato ?? ""}`,
      numero: r.numOriginalContrato ? String(r.numOriginalContrato) : null,
      orgao: r.txtDescricaoOrgao ? String(r.txtDescricaoOrgao) : null,
      objeto: r.txtObjetoContrato ? String(r.txtObjetoContrato).replace(/\s+/g, " ").trim() : null,
      modalidade: r.txtDescricaoModalidade ? String(r.txtDescricaoModalidade) : "Não informada",
      tipo: r.txtTipoContratacao ? String(r.txtTipoContratacao) : null,
      assinatura: r.datAssinaturaContrato ? String(r.datAssinaturaContrato).slice(0, 10) : null,
      vigencia: r.datVigencia ? String(r.datVigencia).slice(0, 10) : null,
      valor: num(r.valPrincipal),
      aditamentos: num(r.valAditamentos),
      empenhado: num(r.valEmpenhadoLiquido),
      pago: num(r.valPago),
    }))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const byMod = new Map<string, { count: number; valor: number }>();
  for (const r of rows) {
    const e = byMod.get(r.modalidade) ?? { count: 0, valor: 0 };
    e.count += 1;
    e.valor += r.valor;
    byMod.set(r.modalidade, e);
  }
  const valor = rows.reduce((s, r) => s + r.valor, 0);
  return {
    ano,
    codOrgao,
    sample: rows.length,
    pagesRead: ok.length,
    valor,
    pago: rows.reduce((s, r) => s + r.pago, 0),
    modalidades: [...byMod.entries()].map(([label, e]) => ({ label, count: e.count, valor: e.valor, share: pct(e.valor, valor) })).sort((a, b) => b.valor - a.valor),
    recentes: rows
      .filter((r) => r.assinatura)
      .sort((a, b) => b.assinatura!.localeCompare(a.assinatura!))
      .slice(0, 12),
    maiores: [...rows].sort((a, b) => b.valor - a.valor).slice(0, 8),
    fetchedAt: ok[0]!.fetchedAt,
    stale: ok.some((r) => r.stale),
  };
}
