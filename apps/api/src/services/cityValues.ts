import type { Row } from "./apilibClient.js";
import type { InsightSpec } from "../config/apilib.js";

/**
 * Valores da Cidade Inteligente como a Prefeitura publica — e como o LifeOS mostra.
 *
 * Os datasets do Portal de Dados Abertos chegam com formatos misturados (conferido nas bases
 * reais): "4.611.717,30" em texto, "24.953" em texto, 1.742 número (milhar lido como decimal pelo
 * portal), datas "2018-08-02T00:00:00", "02/01/2019", 20250126 e "01-jan-22", percentuais sem
 * vírgula (8800 = 88,00%), tempos "00:03:18" e textos com espaços sobrando.
 * Aqui cada coluna ganha um tipo, um rótulo em português e valores limpos — a tela só formata.
 */

export type ColumnKind = "money" | "number" | "percent" | "date" | "datetime" | "duration" | "code" | "text";
export interface ColumnMeta {
  key: string;
  label: string;
  kind: ColumnKind;
}
export type CleanRow = Record<string, string | number | boolean | null>;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Rótulos conhecidos (nomes técnicos das APIs → português). */
const LABELS: Record<string, string> = {
  // e-SIC
  cd_atendimento_pedido: "Atendimento",
  cd_pedido: "Pedido nº",
  dc_pedido: "Pergunta",
  dc_resposta: "Resposta",
  dc_status_pedido: "Situação",
  status_nome: "Situação",
  cd_orgao: "Cód. órgão",
  nm_orgao: "Órgão",
  orgao_nome: "Órgão",
  dt_resposta_atendimento: "Data da resposta",
  // Licitações (APILIB) e base de contratos
  retranca: "Retranca",
  numeroprocesso: "Processo",
  numerolicitacao: "Licitação",
  numerocontrato: "Contrato nº",
  dataassinaturaextrato: "Assinatura",
  datapublicacaoextrato: "Publicação",
  tipovalidadeextrato: "Unidade da vigência",
  validadeextrato: "Vigência",
  valorcontrato: "Valor do contrato",
  fornecedortipo: "Tipo de fornecedor",
  fornecedordocumento: "CNPJ do fornecedor",
  // SOF
  txtdescricaoorgao: "Órgão",
  txtdescricaofuncao: "Função",
  txtdescricaosubfuncao: "Subfunção",
  txtdescricaoprograma: "Programa",
  txtdescricaoprojetoatividade: "Projeto/atividade",
  txtdescricaounidade: "Unidade",
  txtdescricaomodalidade: "Modalidade",
  txtrazaosocial: "Razão social",
  txtobjetocontrato: "Objeto",
  txttipocontratacao: "Tipo de contratação",
  valorcadoinicial: "Orçado inicial",
  valorcadoatualizado: "Orçado atualizado",
  valcongelado: "Congelado",
  valdisponivel: "Disponível",
  valreservado: "Reservado",
  valempenhadoliquido: "Empenhado líquido",
  valtotalempenhado: "Total empenhado",
  valliquidado: "Liquidado",
  valpago: "Pago",
  valpagoexercicio: "Pago no exercício",
  valpagorestos: "Pago (restos a pagar)",
  valprincipal: "Valor principal",
  valaditamentos: "Aditamentos",
  valreajustes: "Reajustes",
  valanulacao: "Anulações",
  valanuladoempenho: "Empenho anulado",
  datassinaturacontrato: "Assinatura",
  datpublicacaocontrato: "Publicação",
  datvigencia: "Vigência",
  anocontrato: "Ano",
  anoexercicio: "Exercício",
  numoriginalcontrato: "Contrato nº",
  // Lentidão
  "data/hora": "Data e hora",
  trechos: "Trecho",
  tamanho: "Extensão (m)",
  nome_regiao: "Região",
  expressa: "Pista expressa",
  // Prato Aberto
  refeicao: "Refeição",
  cardapio: "Cardápio",
  idade: "Faixa etária",
  agrupamento: "Agrupamento",
  atendimento: "Atendimento",
  unidade: "Unidade",
  // Escola Aberta
  nomesc: "Escola",
  tipoesc: "Tipo",
  codesc: "Código",
  ceu: "CEU",
  diretoria: "Diretoria Regional",
  subpref: "Subprefeitura",
  endereco: "Endereço",
  bairro: "Bairro",
  distrito: "Distrito",
  // SP156
  "n.s. %": "Satisfação (%)",
  "p.a. %": "Prazo (%)",
  "q.s. %": "Qualidade (%)",
  "a.s. %": "Atendeu (%)",
};

const PREFIX = /^(txt|val|cod|dat|num|nom|qtd|nm|dc|cd|dt|vl|tx)(?=[A-Z_])_?/;

/** Rótulo legível: dicionário → nome técnico humanizado → CAIXA ALTA em frase. */
export function labelOf(key: string): string {
  const k = strip(key).replace(/\s+/g, " ").trim();
  const flat = k.replace(/[\s_]/g, "");
  if (LABELS[k]) return LABELS[k]!;
  if (LABELS[flat]) return LABELS[flat]!;
  let s = key.trim();
  if (/^[A-ZÀ-Ú0-9 ./%()-]+$/.test(s) && /[A-Z]/.test(s)) s = s.toLowerCase(); // "RAZÃO SOCIAL" → "razão social"
  s = s
    .replace(PREFIX, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

/* ───────────────────────── leitura dos valores ───────────────────────── */

/** "4.611.717,30", "24.953", "1234,5", "R$ 10" → número; nada reconhecível → null. */
export function parseNumberBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/R\$|\s/g, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

const MONTHS: Record<string, string> = { jan: "01", fev: "02", feb: "02", mar: "03", abr: "04", apr: "04", mai: "05", may: "05", jun: "06", jul: "07", ago: "08", aug: "08", set: "09", sep: "09", out: "10", oct: "10", nov: "11", dez: "12", dec: "12" };

/** Datas em qualquer formato visto nas bases → "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM". */
export function parseDateLoose(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return m[4] && `${m[4]}:${m[5]}` !== "00:00" ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) return m[4] && `${m[4]}:${m[5]}` !== "00:00" ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}` : `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  m = strip(s).match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/);
  if (m && MONTHS[m[2]!]) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${MONTHS[m[2]!]}-${m[1]!.padStart(2, "0")}`;
  return null;
}

/** "00:03:18" → 198 segundos. */
export function parseDuration(v: unknown): number | null {
  const m = String(v ?? "").trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/* ───────────────────────── tipo de cada coluna ───────────────────────── */

const K = {
  code: /^(_id|cod|cd_|codigo|cep$|num(ero)?[ _]?(processo|licitacao|contrato|original)|numero ?(processo|licitacao|contrato)|n[uú]mero (processo|licita|contrato)|retranca|protocolo|processo$|cd pedido|.*documento|.*cnpj|latitude|longitude|numero$|codesc|udh$)/,
  money: /^(valor|vl[ _])|valor /,
  percent: /\(%\)|%$|percent/,
  duration: /^tempo medio/,
  date: /^dt[ _]|^data|data |entrada|^dia$/,
  number: /quantidade|^qtd|^qt[ _]|tamanho|extens|^total|matricul|vagas|alunos|turmas|^ano$|^ano[a-z]|^anoexercicio|^mes|^semestre/,
};

function kindFromKey(key: string): ColumnKind | null {
  const k = strip(key).replace(/\s+/g, " ").trim();
  const flat = k.replace(/[\s_]/g, "");
  if (K.percent.test(k)) return "percent";
  if (K.code.test(k) || K.code.test(flat)) return "code";
  // Prefixos do SOF dependem da caixa: valPago/datVigencia (e não "validade"/"dataset").
  if (/^val[A-Z]/.test(key.trim()) || K.money.test(k)) return "money";
  if (K.duration.test(k)) return "duration";
  if (/^dat[A-Z]/.test(key.trim()) || K.date.test(k)) return "date";
  if (K.number.test(k) || K.number.test(flat)) return "number";
  return null;
}

/** Tipo da coluna pelo nome; sem pista no nome, pelos valores da amostra. */
export function inferKind(key: string, values: unknown[]): ColumnKind {
  const filled = values.filter((v) => v != null && String(v).trim() !== "");
  const byKey = kindFromKey(key);
  if (byKey === "date") {
    const ok = filled.filter((v) => parseDateLoose(v)).length;
    if (ok >= Math.max(1, filled.length * 0.6)) return filled.some((v) => (parseDateLoose(v) ?? "").includes("T")) ? "datetime" : "date";
    return "text";
  }
  if (byKey) return byKey;
  if (!filled.length) return "text";
  if (filled.every((v) => typeof v === "number" || parseNumberBR(v) != null)) return "number";
  if (filled.filter((v) => /^\d{4}-\d{2}-\d{2}T/.test(String(v)) || /^\d{2}\/\d{2}\/\d{4}$/.test(String(v).trim())).length >= filled.length * 0.8) return "date";
  return "text";
}

function cleanText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && !/^(n\/a|null|-)$/i.test(s) ? s : null;
}

/**
 * Limpa uma coluna inteira. Regras que dependem da coluna toda:
 * - percentual sem vírgula: se algum valor passa de 100, a coluna toda vem em centésimos (8800 → 88).
 * - quantidade lida como decimal pelo portal (1.742 → 1742): só em colunas de quantidade, que
 *   nunca têm fração.
 */
function cleanColumn(key: string, kind: ColumnKind, values: unknown[]): Array<string | number | null> {
  if (kind === "money" || kind === "number" || kind === "percent") {
    const nums = values.map((v) => parseNumberBR(v));
    if (kind === "percent" && nums.some((n) => n != null && n > 100)) return nums.map((n) => (n == null ? null : Math.round(n) / 100));
    if (kind === "number" && /quantidade|^qtd/.test(strip(key)))
      // Contagem não tem fração: 1.742 / 3.49 vieram do milhar lido como decimal (zeros finais somem: 3.490 → 3.49).
      return nums.map((n, i) => (n != null && typeof values[i] === "number" && !Number.isInteger(n) ? Math.round(n * 1000) : n));
    return nums;
  }
  if (kind === "date" || kind === "datetime") return values.map((v) => parseDateLoose(v));
  if (kind === "duration") return values.map((v) => parseDuration(v));
  if (kind === "code") return values.map((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()));
  return values.map((v) => (typeof v === "boolean" ? (v ? "Sim" : "Não") : cleanText(v)));
}

/**
 * Linhas normalizadas → colunas tipadas e rotuladas + valores limpos.
 * Colunas totalmente vazias e o "_id" interno do portal saem.
 */
export function shapeRows(rows: Row[]): { columns: ColumnMeta[]; rows: CleanRow[] } {
  const keys: string[] = [];
  for (const r of rows.slice(0, 400)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const columns: ColumnMeta[] = [];
  const cleaned: Record<string, Array<string | number | null>> = {};
  for (const key of keys) {
    if (key === "_id") continue;
    const values = rows.map((r) => r[key] ?? null);
    const kind = inferKind(key, values.slice(0, 400));
    const col = cleanColumn(key, kind, values);
    if (col.every((v) => v == null)) continue;
    columns.push({ key, label: labelOf(key), kind });
    cleaned[key] = col;
  }
  // Rótulos repetidos (ex.: "Órgão" em dois campos) ganham o nome técnico entre parênteses.
  const seen = new Map<string, number>();
  for (const c of columns) seen.set(c.label, (seen.get(c.label) ?? 0) + 1);
  for (const c of columns) if ((seen.get(c.label) ?? 0) > 1) c.label = `${c.label} (${c.key})`;
  return { columns, rows: rows.map((_, i) => Object.fromEntries(columns.map((c) => [c.key, cleaned[c.key]![i] ?? null]))) };
}

/* ───────────────────────── agregações (Insights) ───────────────────────── */

export interface InsightsResult {
  sampleSize: number;
  dims: Array<{ label: string; column: string; items: Array<{ label: string; count: number }>; distinct: number }>;
  measures: Array<{ label: string; column: string; value: number; agg: string; filled: number; kind: ColumnKind }>;
  series: { label: string; column: string; by: string; kind: ColumnKind | "count"; points: Array<{ x: string; y: number }> } | null;
  ranking: { label: string; dim: string; measure: string; kind: ColumnKind; items: Array<{ label: string; value: number }> } | null;
}

const pick = (columns: ColumnMeta[], re: RegExp) => columns.find((c) => re.test(strip(c.key)) || re.test(strip(c.label)));
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Agregações calculadas pelo LifeOS sobre a amostra (a tela diz isso). */
export function computeInsights(shaped: { columns: ColumnMeta[]; rows: CleanRow[] }, spec: InsightSpec): InsightsResult {
  const { columns, rows } = shaped;
  const dims = spec.dims
    .map((d) => {
      const col = pick(columns, d.fields);
      if (!col) return null;
      const m = new Map<string, number>();
      for (const r of rows) {
        const v = r[col.key];
        if (v == null || v === "") continue;
        const key = String(v);
        m.set(key, (m.get(key) ?? 0) + 1);
      }
      const items = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, d.top ?? 8).map(([label, count]) => ({ label, count }));
      return items.length ? { label: d.label, column: col.label, items, distinct: m.size } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const measures = (spec.measures ?? [])
    .map((ms) => {
      const col = pick(columns, ms.fields);
      if (!col) return null;
      const nums = rows.map((r) => r[col.key]).filter((v): v is number => typeof v === "number");
      if (!nums.length) return null;
      const value = ms.agg === "sum" ? nums.reduce((s, n) => s + n, 0) : ms.agg === "max" ? Math.max(...nums) : nums.reduce((s, n) => s + n, 0) / nums.length;
      return { label: ms.label, column: col.label, value, agg: ms.agg, filled: nums.length, kind: col.kind };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  let series: InsightsResult["series"] = null;
  if (spec.series) {
    const col = pick(columns, spec.series.fields);
    const mcol = spec.series.measure ? pick(columns, spec.series.measure) : null;
    if (col) {
      const m = new Map<string, number>();
      for (const r of rows) {
        const d = r[col.key];
        if (typeof d !== "string") continue;
        const x =
          spec.series.by === "day" ? d.slice(0, 10) : spec.series.by === "month" ? d.slice(0, 7) : spec.series.by === "hour" ? (d.length > 10 ? `${d.slice(11, 13)}h` : null) : WEEKDAY[new Date(`${d.slice(0, 10)}T12:00:00Z`).getUTCDay()];
        if (!x) continue;
        const y = mcol ? (typeof r[mcol.key] === "number" ? (r[mcol.key] as number) : 0) : 1;
        m.set(x, (m.get(x) ?? 0) + y);
      }
      const order = spec.series.by === "weekday" ? WEEKDAY : null;
      const points = [...m.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => (order ? order.indexOf(a.x) - order.indexOf(b.x) : a.x.localeCompare(b.x)));
      if (points.length >= 2) series = { label: spec.series.label, column: mcol ? mcol.label : col.label, by: spec.series.by, kind: mcol ? mcol.kind : "count", points };
    }
  }
  let ranking: InsightsResult["ranking"] = null;
  if (spec.rankBy) {
    const dc = pick(columns, spec.rankBy.dim);
    const mc = pick(columns, spec.rankBy.measure);
    if (dc && mc) {
      const m = new Map<string, number>();
      for (const r of rows) {
        const d = r[dc.key];
        const v = r[mc.key];
        if (d == null || typeof v !== "number") continue;
        m.set(String(d), (m.get(String(d)) ?? 0) + v);
      }
      const items = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, spec.rankBy.top ?? 8).map(([label, value]) => ({ label, value }));
      if (items.length) ranking = { label: spec.rankBy.label, dim: dc.label, measure: mc.label, kind: mc.kind, items };
    }
  }
  return { sampleSize: rows.length, dims, measures, series, ranking };
}
