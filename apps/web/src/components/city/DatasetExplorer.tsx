import { useMemo, useState, type ReactNode } from "react";
import { Filter, RefreshCw, Search, Table2 } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityCatalog, useCityData, useCityFavorites } from "@/hooks/useCity";
import { cityService, type CityApi, type CityDomain, type ParamDef, type Row } from "@/services/cityService";
import { useQueryClient } from "@tanstack/react-query";
import {
  CityError,
  CsvButton,
  DataTable,
  DOMAIN,
  EmptyBox,
  FacetBars,
  FavoriteButton,
  LoadingBlock,
  OracleBox,
  Pager,
  Select,
  SourceStrip,
  TextInput,
  autoColumns,
  cellText,
  useCityActivity,
  yearOptions,
} from "./CityKit";

/**
 * Explorador dos datasets anuais/semestrais do APILIB (Portal de Dados Abertos).
 * Como a maioria das APIs não publica o schema de resposta, as colunas são descobertas
 * nos próprios registros; agrupamentos e filtros valem só para a amostra carregada.
 */

const LIMIT = 100;

/** Chave estável de um registro sem id oficial (as primeiras colunas preenchidas). */
export function rowKey(r: Row): string {
  const parts = Object.entries(r)
    .filter(([, v]) => v != null && v !== "")
    .slice(0, 6)
    .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`);
  return parts.join("|").slice(0, 190) || "registro";
}

/** Colunas boas para agrupar: texto com poucos valores distintos na amostra. */
export function facetCandidates(rows: Row[], columns: string[]): string[] {
  return columns.filter((c) => {
    const filled = rows.map((r) => r[c]).filter((v) => v != null && v !== "" && typeof v !== "number");
    const vals = new Set(filled);
    // Precisa repetir valores (códigos únicos por linha não agrupam nada).
    return vals.size >= 2 && vals.size <= 60 && vals.size <= Math.max(2, Math.floor(filled.length * 0.6));
  });
}

export interface DatasetExplorerProps {
  apiId: CityApi;
  domain: CityDomain;
  /** Recursos que o usuário pode alternar (ex.: SP156: solicitações, ligações, avaliação). */
  resources: Array<{ id: string; label: string }>;
  /** Valores iniciais dos parâmetros de caminho/consulta (ano, semestre, arquivo…). */
  initial: Record<string, string>;
  /** Colunas preferidas (quando existirem nos registros). */
  prefer?: string[];
  oracleSuggestions?: string[];
  /** Bloco específico da tela, calculado sobre a amostra carregada. */
  insights?: (rows: Row[]) => ReactNode;
  /** Ação "comparar" (IDHM): recebe os registros marcados. */
  compare?: { label: string; render: (rows: Row[]) => ReactNode; refOf: (r: Row) => string };
  csvName: string;
  /** Chamado ao abrir um registro (ex.: território explorado no IDHM/Censo). */
  onRowOpened?: (r: Row) => void;
}

export function DatasetExplorer({ apiId, domain, resources, initial, prefer = [], oracleSuggestions, insights, compare, csvName, onRowOpened }: DatasetExplorerProps) {
  const [notify, toast] = useLocalToast();
  const qc = useQueryClient();
  const catalog = useCityCatalog();
  const entry = catalog.data?.find((c) => c.id === apiId);
  const [resource, setResource] = useState(resources[0]!.id);
  const [params, setParams] = useState<Record<string, string>>(initial);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState<string>("");
  const [open, setOpen] = useState<Row | null>(null);
  const [picked, setPicked] = useState<Row[]>([]);
  const defs = entry?.resources[resource]?.params ?? {};
  const paging = entry?.resources[resource]?.paging ?? null;

  const query = useMemo(() => {
    const p: Record<string, string | number> = {};
    for (const [k, def] of Object.entries(defs)) if (def.in === "path" || def.required) if (params[k]) p[k] = params[k]!;
    if (paging === "limit_offset") Object.assign(p, { limite: LIMIT, offset });
    return p;
  }, [defs, params, offset, paging]);

  const ready = !!entry && Object.entries(defs).every(([k, d]) => !d.required || !!params[k]);
  const data = useCityData(apiId, resource, query, ready);
  const favs = useCityFavorites(apiId);
  const savedKeys = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const rows = data.data?.items ?? [];
  const columns = useMemo(() => autoColumns(rows, 8, prefer), [rows, prefer]);
  const allColumns = useMemo(() => autoColumns(rows, 60), [rows]);
  const facets = useMemo(() => facetCandidates(rows, allColumns), [rows, allColumns]);
  const activeFacet = facet && facets.includes(facet) ? facet : (facets[0] ?? "");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(t))) : rows;
  }, [rows, q]);

  useCityActivity(apiId, "explore", data.isSuccess ? `${resource}:${Object.values(query).join("-")}`.slice(0, 120) : null, entry?.name);

  const setParam = (k: string, v: string) => {
    setParams((p) => ({ ...p, [k]: v }));
    setOffset(0);
    setPicked([]);
  };

  const control = (k: string, d: ParamDef) => {
    if (d.type === "enum" && d.values) return <Select key={k} label={d.label} value={params[k] ?? ""} onChange={(v) => setParam(k, v)} options={d.values.map((v) => ({ value: v, label: v }))} />;
    if (d.type === "int" && d.min != null && d.max != null && d.max - d.min <= 40)
      return <Select key={k} label={d.label} value={params[k] ?? ""} onChange={(v) => setParam(k, v)} options={k === "semestre" ? [{ value: "1", label: "1º semestre" }, { value: "2", label: "2º semestre" }] : yearOptions(d.min, d.max)} />;
    return null;
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

  return (
    <div className="space-y-3">
      {toast}
      <section className="rpg-panel min-w-0 p-3" aria-label="Filtros">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          {resources.length > 1 && <Select label="Conjunto" value={resource} onChange={(v) => (setResource(v), setOffset(0), setPicked([]))} options={resources.map((r) => ({ value: r.id, label: r.label }))} />}
          {Object.entries(defs).map(([k, def]) => control(k, def))}
          <TextInput label="Filtrar a amostra" value={q} onChange={setQ} placeholder="palavra em qualquer coluna" className="col-span-2 sm:col-span-1" />
          <div className="col-span-2 flex gap-2 sm:col-span-1 lg:col-span-1">
            <RPGButton variant="secondary" onClick={refresh} disabled={!data.isSuccess} aria-label="Buscar de novo na Prefeitura">
              <RefreshCw size={14} aria-hidden /> Atualizar
            </RPGButton>
            <CsvButton rows={filtered} columns={allColumns} filename={`${csvName}-${Object.values(query).join("-")}.csv`} />
          </div>
        </div>
      </section>

      <SourceStrip apiId={apiId} meta={data.data} reference={Object.entries(params).filter(([k]) => defs[k]).map(([k, v]) => `${defs[k]!.label} ${v}`).join(" · ")} />

      {!ready || data.isLoading ? (
        <LoadingBlock />
      ) : data.isError ? (
        <CityError error={data.error} onRetry={() => void data.refetch()} />
      ) : (
        <>
          {insights && rows.length > 0 && insights(filtered)}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rpg-panel min-w-0 space-y-2 p-3" aria-label="Registros">
              <div className="flex flex-wrap items-center gap-2">
                <Table2 size={16} className={d.text} aria-hidden />
                <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Registros</h2>
                {compare && picked.length > 0 && <span className="text-xs text-rpg-muted">{picked.length} marcado(s) para comparar</span>}
              </div>
              {filtered.length === 0 && rows.length > 0 ? (
                <EmptyBox title="Nada na amostra com esse filtro." />
              ) : (
                <DataTable
                  rows={filtered}
                  columns={columns}
                  caption={`${entry?.name ?? apiId} — registros`}
                  onRowOpen={(r) => (setOpen(r), onRowOpened?.(r))}
                  actions={(r) => (
                    <div className="flex items-center gap-1">
                      {compare && (
                        <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 px-1 text-[11px] text-rpg-muted">
                          <input
                            type="checkbox"
                            checked={picked.includes(r)}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r].slice(-4) : p.filter((x) => x !== r)))}
                            aria-label="Marcar para comparar"
                          />
                          comparar
                        </label>
                      )}
                      <FavoriteButton apiId={apiId} itemKey={rowKey(r)} title={cellText(r[columns[0]!]).slice(0, 200)} subtitle={columns.slice(1, 3).map((c) => cellText(r[c])).join(" · ").slice(0, 280)} payload={Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))} saved={savedKeys.has(rowKey(r))} notify={notify} />
                    </div>
                  )}
                />
              )}
              {paging === "limit_offset" && <Pager offset={offset} limit={LIMIT} count={rows.length} total={data.data?.total ?? null} onChange={setOffset} />}
              {data.data?.truncated && <p className="text-xs text-rpg-muted">A resposta veio maior que o limite do LifeOS; mostrando os primeiros registros.</p>}
            </section>
            <aside className="min-w-0 space-y-3">
              <section className="rpg-panel p-3" aria-label="Agrupamento">
                <div className="mb-2 flex items-center gap-2">
                  <Filter size={15} className={d.text} aria-hidden />
                  <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Agrupar</h2>
                </div>
                {facets.length ? (
                  <>
                    <Select label="Coluna" value={activeFacet} onChange={setFacet} options={facets.map((f) => ({ value: f, label: f }))} />
                    <div className="mt-3">
                      <FacetBars rows={filtered} column={activeFacet} title={activeFacet} tone={d.tone} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-rpg-muted">Sem colunas agrupáveis nesta amostra.</p>
                )}
              </section>
              {compare && picked.length >= 2 && (
                <section className="rpg-panel p-3" aria-label="Comparação">
                  {compare.render(picked)}
                </section>
              )}
              <OracleBox apiId={apiId} resource={resource} params={query} disabled={!rows.length} suggestions={oracleSuggestions} />
            </aside>
          </div>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title="Registro completo" size="lg">
        {open && (
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
            {Object.entries(open).map(([k, v]) => (
              <div key={k} className="min-w-0 border-b border-rpg-border/50 pb-1">
                <dt className="truncate font-pixel text-[10px] uppercase text-rpg-muted">{k}</dt>
                <dd className="break-words text-rpg-text">{cellText(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 flex items-center gap-1 text-xs text-rpg-muted">
          <Search size={12} aria-hidden /> Exatamente como a Prefeitura publicou (campos pessoais ocultados).
        </p>
      </Modal>
    </div>
  );
}
