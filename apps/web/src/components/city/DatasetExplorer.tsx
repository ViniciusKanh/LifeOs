import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw, Scale, Search, Table2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { RPGButton } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityCatalog, useCityData, useCityFavorites } from "@/hooks/useCity";
import { cityService, type CityApi, type CityDomain, type ColumnMeta, type ParamDef, type Params, type Row } from "@/services/cityService";
import { CityError, CsvButton, DataTable, DOMAIN, EmptyBox, FavoriteButton, LoadingBlock, OracleBox, R, RecordSheet, Select, SourceStrip, TextInput, formatValue, pickColumns, useCityActivity, yearOptions } from "./CityKit";
import { InsightsPanel } from "./InsightsPanel";

/**
 * Explorador dos conjuntos do APILIB: filtros oficiais (ano, semestre, mês…), panorama calculado
 * no servidor sobre uma amostra grande, tabela com valores já tipados (R$, datas, %, tempos),
 * ficha completa, favoritos, comparação e Oráculo.
 */

const LIMIT = 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Chave estável de um registro sem id oficial (as primeiras colunas preenchidas). */
export function rowKey(r: Row): string {
  const parts = Object.entries(r)
    .filter(([, v]) => v != null && v !== "")
    .slice(0, 6)
    .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`);
  return parts.join("|").slice(0, 190) || "registro";
}

export interface DatasetExplorerProps {
  apiId: CityApi;
  domain: CityDomain;
  resources: Array<{ id: string; label: string }>;
  /** Valores iniciais dos parâmetros (ano, semestre, mês…). */
  initial: Record<string, string>;
  /** Colunas na ordem preferida (regex sobre nome técnico ou rótulo). */
  prefer?: RegExp[];
  /** Colunas de texto longo que quebram linha na tabela. */
  wrap?: RegExp[];
  /** Título do favorito/ficha (regex da coluna). */
  titleField?: RegExp;
  oracleSuggestions?: string[];
  csvName: string;
  /** Abrir um registro conta como leitura (e-SIC, contratos). */
  readOnOpen?: boolean;
  /** Comparação lado a lado de até 4 registros marcados. */
  compareBy?: RegExp;
  /** Clique numa barra do panorama (ex.: subprefeitura → território explorado). */
  onDimPick?: (dim: string, value: string) => void;
  /** Controles extras (ex.: órgão do SOF). */
  extraControls?: (params: Record<string, string>, set: (k: string, v: string) => void) => ReactNode;
  /** Bloco próprio da tela, acima da tabela. */
  header?: ReactNode;
  totalLabel?: string;
}

export function DatasetExplorer(props: DatasetExplorerProps) {
  const { apiId, domain, resources, initial, prefer = [], wrap = [], titleField, oracleSuggestions, csvName, readOnOpen, compareBy, onDimPick, extraControls, header, totalLabel } = props;
  const [notify, toast] = useLocalToast();
  const qc = useQueryClient();
  const a = useCityActions();
  const catalog = useCityCatalog();
  const entry = catalog.data?.find((c) => c.id === apiId);
  const [resource, setResource] = useState(resources[0]!.id);
  const [params, setParams] = useState<Record<string, string>>(initial);
  const [offset, setOffset] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [picked, setPicked] = useState<Row[]>([]);
  const res = entry?.resources[resource];
  const defs = res?.params ?? {};
  const paging = res?.paging ?? null;

  /** Filtros oficiais: só os parâmetros que este recurso declara (o resto do estado é ignorado). */
  const base = useMemo(() => {
    const p: Params = {};
    for (const k of Object.keys(defs)) if (params[k] && !["limite", "offset", "page", "numPagina"].includes(k)) p[k] = params[k];
    return p;
  }, [defs, params]);
  const query = useMemo(() => {
    const p: Params = { ...base };
    if (paging === "limit_offset") Object.assign(p, { limite: LIMIT, offset });
    if (paging === "numPagina") p.numPagina = pageNo;
    if (paging === "page") p.page = pageNo;
    return p;
  }, [base, paging, offset, pageNo]);

  const ready = !!entry && Object.entries(defs).every(([k, d]) => !d.required || !!params[k]);
  const data = useCityData(apiId, resource, query, ready);
  const favs = useCityFavorites(apiId);
  const savedKeys = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const rows = data.data?.rows ?? [];
  const allColumns = data.data?.columns ?? [];
  const columns = useMemo(() => pickColumns(allColumns, prefer, 7), [allColumns, prefer]);
  const wrapKeys = useMemo(() => allColumns.filter((c) => wrap.some((re) => re.test(norm(c.key)) || re.test(norm(c.label)))).map((c) => c.key), [allColumns, wrap]);
  const titleCol: ColumnMeta | undefined = useMemo(() => (titleField ? allColumns.find((c) => titleField.test(norm(c.key)) || titleField.test(norm(c.label))) : undefined) ?? columns[0], [allColumns, titleField, columns]);
  const filtered = useMemo(() => {
    const t = norm(q.trim());
    return t ? rows.filter((r) => Object.values(r).some((v) => v != null && norm(String(v)).includes(t))) : rows;
  }, [rows, q]);

  useCityActivity(apiId, "explore", data.isSuccess ? `${resource}:${Object.values(base).join("-")}`.slice(0, 120) : null, entry?.name);

  const setParam = (k: string, v: string) => {
    setParams((p) => ({ ...p, [k]: v }));
    setOffset(0);
    setPageNo(1);
    setPicked([]);
  };

  const control = (k: string, d: ParamDef) => {
    if (["limite", "offset", "page", "numPagina"].includes(k)) return null;
    if (d.type === "enum" && d.values) return <Select key={k} label={d.label} value={params[k] ?? ""} onChange={(v) => setParam(k, v)} options={d.values.map((v) => ({ value: v, label: v }))} />;
    if (k === "semestre") return <Select key={k} label={d.label} value={params[k] ?? "1"} onChange={(v) => setParam(k, v)} options={[{ value: "1", label: "1º semestre" }, { value: "2", label: "2º semestre" }]} />;
    if (/^mes/.test(k)) return <Select key={k} label={d.label} value={params[k] ?? "1"} onChange={(v) => setParam(k, v)} options={["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"].map((m, i) => ({ value: String(i + 1), label: m }))} />;
    if (d.type === "int" && d.min != null && d.max != null && d.max - d.min <= 40) return <Select key={k} label={d.label} value={params[k] ?? ""} onChange={(v) => setParam(k, v)} options={yearOptions(d.min, d.max)} />;
    return null;
  };

  const openRow = (r: Row) => {
    setOpen(r);
    if (readOnOpen && titleCol) a.activity.mutate({ api: apiId, action: "read", ref: rowKey(r).slice(0, 120), label: String(r[titleCol.key] ?? "").slice(0, 150) }, { onSuccess: (x) => x.xp && notify(`Leitura registrada. +${x.xp} XP`) });
  };

  const refresh = async () => {
    try {
      const fresh = await cityService.data(apiId, resource, query, true);
      qc.setQueryData(["city", "data", apiId, resource, query], fresh);
      notify(fresh.stale ? "A Prefeitura não respondeu; mantida a última cópia." : "Dados atualizados.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar.", "error");
    }
  };

  const d = DOMAIN[domain];
  const reference = Object.entries(base)
    .map(([k, v]) => `${defs[k]?.label ?? k} ${k === "semestre" ? `${v}º` : v}`)
    .join(" · ");
  const compareCols = useMemo(() => allColumns.filter((c) => ["money", "number", "percent", "duration"].includes(c.kind)), [allColumns]);
  const compareLabelCol = compareBy ? allColumns.find((c) => compareBy.test(norm(c.key)) || compareBy.test(norm(c.label))) : undefined;

  return (
    <div className="space-y-3">
      {toast}
      <section className="rpg-panel min-w-0 p-3" aria-label="Filtros">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          {resources.length > 1 && <Select label="Conjunto" value={resource} onChange={(v) => (setResource(v), setOffset(0), setPageNo(1), setPicked([]))} options={resources.map((r) => ({ value: r.id, label: r.label }))} />}
          {Object.entries(defs).map(([k, def]) => control(k, def))}
          {extraControls?.(params, setParam)}
          <TextInput label="Buscar nos registros carregados" value={q} onChange={setQ} placeholder="palavra em qualquer coluna" className="col-span-2 sm:col-span-1" />
          <div className="col-span-2 flex gap-2 sm:col-span-1 lg:col-span-1">
            <RPGButton variant="secondary" onClick={refresh} disabled={!data.isSuccess} aria-label="Buscar de novo na Prefeitura">
              <RefreshCw size={14} aria-hidden /> Atualizar
            </RPGButton>
            <CsvButton rows={filtered} columns={allColumns} filename={`${csvName}-${Object.values(base).join("-")}.csv`} />
          </div>
        </div>
      </section>

      <SourceStrip apiId={apiId} meta={data.data} reference={reference} />

      {header}

      {res?.insights && ready && <InsightsPanel apiId={apiId} resource={resource} params={base} domain={domain} onDimPick={onDimPick} totalLabel={totalLabel} />}

      {!ready || data.isLoading ? (
        <LoadingBlock />
      ) : data.isError ? (
        <CityError error={data.error} onRetry={() => void data.refetch()} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rpg-panel min-w-0 space-y-2 p-3" aria-label="Registros">
            <div className="flex flex-wrap items-center gap-2">
              <Table2 size={16} className={d.text} aria-hidden />
              <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Registros</h2>
              <span className="text-xs text-rpg-muted">
                {filtered.length !== rows.length ? `${filtered.length} de ${rows.length} carregados` : `${rows.length} carregados`}
                {compareBy && picked.length > 0 && ` · ${picked.length} marcado(s)`}
              </span>
            </div>
            {filtered.length === 0 && rows.length > 0 ? (
              <EmptyBox title="Nada nos registros carregados com essa busca." />
            ) : (
              <DataTable
                rows={filtered}
                columns={columns}
                wrap={wrapKeys}
                caption={`${entry?.name ?? apiId} — registros`}
                onRowOpen={openRow}
                actions={(r) => (
                  <div className="flex items-center gap-1">
                    {compareBy && (
                      <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 px-1 text-[11px] text-rpg-muted">
                        <input type="checkbox" checked={picked.includes(r)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r].slice(-4) : p.filter((x) => x !== r)))} aria-label="Marcar para comparar" />
                        comparar
                      </label>
                    )}
                    <FavoriteButton
                      apiId={apiId}
                      itemKey={rowKey(r)}
                      title={titleCol ? formatValue(titleCol.kind, r[titleCol.key]).slice(0, 200) : "Registro"}
                      subtitle={columns
                        .filter((c) => c !== titleCol)
                        .slice(0, 3)
                        .map((c) => formatValue(c.kind, r[c.key]))
                        .join(" · ")
                        .slice(0, 280)}
                      payload={Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? null]))}
                      saved={savedKeys.has(rowKey(r))}
                      notify={notify}
                    />
                  </div>
                )}
              />
            )}
            {paging === "limit_offset" ? (
              <Pager label={`Registros ${rows.length ? offset + 1 : 0}–${offset + rows.length}${data.data?.total != null ? ` de ${data.data.total.toLocaleString("pt-BR")}` : ""}`} prev={offset > 0} next={rows.length >= LIMIT && (data.data?.total == null || offset + rows.length < data.data.total)} onPrev={() => setOffset(Math.max(0, offset - LIMIT))} onNext={() => setOffset(offset + LIMIT)} />
            ) : paging ? (
              <Pager label={`Página ${pageNo}`} prev={pageNo > 1} next={rows.length > 0} onPrev={() => setPageNo(pageNo - 1)} onNext={() => setPageNo(pageNo + 1)} />
            ) : null}
            {data.data?.truncated && <p className="text-xs text-rpg-muted">A resposta veio maior que o limite do LifeOS; mostrando os primeiros registros.</p>}
          </section>
          <aside className="min-w-0 space-y-3">
            {compareBy && picked.length >= 2 && compareLabelCol && (
              <Compare apiId={apiId} rows={picked} labelCol={compareLabelCol} cols={compareCols} />
            )}
            {compareBy && picked.length < 2 && <p className="rpg-panel p-3 text-xs text-rpg-muted">Marque 2 a 4 registros em “comparar” para ver lado a lado.</p>}
            <OracleBox apiId={apiId} resource={resource} params={query as Record<string, string | number>} disabled={!rows.length} suggestions={oracleSuggestions} />
          </aside>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open && titleCol ? formatValue(titleCol.kind, open[titleCol.key]).slice(0, 90) : "Registro"} size="lg">
        {open && <RecordSheet row={open} columns={allColumns} />}
        <p className="mt-3 flex items-center gap-1 text-xs text-rpg-muted">
          <Search size={12} aria-hidden /> Como a Prefeitura publicou, com datas e valores formatados (campos pessoais ocultados).
        </p>
      </Modal>
    </div>
  );
}

function Pager({ label, prev, next, onPrev, onNext }: { label: string; prev: boolean; next: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-xs text-rpg-muted" aria-label="Paginação">
      <span>{label}</span>
      <div className="flex gap-2">
        <RPGButton variant="secondary" disabled={!prev} onClick={onPrev}>
          Anterior
        </RPGButton>
        <RPGButton variant="secondary" disabled={!next} onClick={onNext}>
          Próxima
        </RPGButton>
      </div>
    </nav>
  );
}

function Compare({ apiId, rows, labelCol, cols }: { apiId: CityApi; rows: Row[]; labelCol: ColumnMeta; cols: ColumnMeta[] }) {
  const name = (r: Row) => formatValue(labelCol.kind, r[labelCol.key]);
  useCityActivity(apiId, "compare", rows.map(name).sort().join(" × ").slice(0, 120), "Comparação");
  return (
    <section className="rpg-panel p-3" aria-label="Comparação">
      <p className="mb-2 flex items-center gap-1.5 font-pixel text-[10px] uppercase text-rpg-gold">
        <Scale size={13} aria-hidden /> Lado a lado
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-1 py-1 text-left text-rpg-muted">Campo</th>
              {rows.map((r, i) => (
                <th key={i} className="max-w-[110px] truncate px-1 py-1 text-right text-rpg-text" title={name(r)}>
                  {name(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.slice(0, 12).map((c) => (
              <tr key={c.key} className="border-t border-rpg-border/60">
                <td className="max-w-[120px] truncate px-1 py-1 text-rpg-muted" title={c.label}>
                  {c.label}
                </td>
                {rows.map((r, i) => (
                  <td key={i} className="whitespace-nowrap px-1 py-1 text-right tabular-nums text-rpg-text" style={R}>
                    {formatValue(c.kind, r[c.key], { short: true })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-rpg-muted">Valores exatamente como publicados. Diferenças não indicam causa.</p>
    </section>
  );
}
