import { useMemo, useState } from "react";
import { GraduationCap, School, Search } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityData, useCityFavorites } from "@/hooks/useCity";
import type { ColumnMeta, DataResponse, Row } from "@/services/cityService";
import { CityBanner, CityError, CsvButton, DataTable, EmptyBox, FavoriteButton, LoadingBlock, RecordSheet, Select, SourceStrip, TextInput, cellText, pickColumns, useCityActivity } from "@/components/city/CityKit";

/** Opções de select de uma lista sem schema publicado: procura colunas de código e de nome. */
function optionsOf(data: DataResponse | undefined, codeHint: RegExp, nameHint: RegExp) {
  if (!data?.rows.length) return [];
  const code = data.columns.find((c) => codeHint.test(c.key))?.key ?? data.columns[0]?.key;
  const name = data.columns.find((c) => nameHint.test(c.key) && c.key !== code)?.key ?? code;
  if (!code || !name) return [];
  return data.rows.map((r) => ({ value: cellText(r[code]), label: cellText(r[name]) })).filter((o) => o.value !== "—");
}

const col = (cols: ColumnMeta[], re: RegExp) => cols.find((c) => re.test(c.key.toLowerCase()));

type Detail = "vagas" | "turmas" | "alunos" | "modalidades" | "ambientes" | "servidores";

export function EscolaAbertaPage() {
  const [notify, toast] = useLocalToast();
  const [draft, setDraft] = useState({ search: "", dre: "", tipoesc: "", distrito: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [school, setSchool] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Detail>("vagas");
  const dres = useCityData("escolas", "diretorias", {});
  const tipos = useCityData("escolas", "tipos", {});
  const searching = !!(filters.search || filters.dre || filters.tipoesc || filters.distrito);
  const list = useCityData("escolas", "escolas", { ...filters, page }, searching);
  const favs = useCityFavorites("escolas");
  const saved = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const rows = list.data?.rows ?? [];
  const allCols = list.data?.columns ?? [];
  const cols = useMemo(() => pickColumns(allCols, [/^nomesc$/, /^tipoesc$/, /^endereco$/, /^bairro$/, /^distrito$/, /^diretoria|^dre$/], 6), [allCols]);
  const codeCol = col(allCols, /^codesc$|^cd_escola$|^codigo$/);
  const nameCol = col(allCols, /^nomesc$|^nome/);
  const codesc = school && codeCol ? cellText(school[codeCol.key]) : null;
  const detailQ = useCityData("escolas", detail, { codesc: codesc ?? "" }, !!codesc && codesc !== "—");
  useCityActivity("escolas", "explore", list.isSuccess ? `busca:${JSON.stringify(filters)}`.slice(0, 120) : null, "Escola Aberta");

  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="educacao" eyebrow="Educação" title="Escola Aberta" subtitle="Encontre escolas da rede municipal e veja vagas, matrículas, turmas, modalidades, ambientes e servidores publicados pela Secretaria de Educação. Sem notas nem ranking — a API não publica avaliação de qualidade.">
        <RPGBadge tone="purple">Rede municipal</RPGBadge>
      </CityBanner>

      <section className="rpg-panel p-3" aria-label="Busca de escolas">
        <form
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(draft);
            setPage(1);
            setSchool(null);
          }}
        >
          <TextInput label="Nome da escola" value={draft.search} onChange={(v) => setDraft((d) => ({ ...d, search: v.slice(0, 80) }))} placeholder="Ex.: EMEF…" className="col-span-2 sm:col-span-1" />
          <Select label="Diretoria Regional" value={draft.dre} onChange={(v) => setDraft((d) => ({ ...d, dre: v }))} options={[{ value: "", label: dres.isError ? "indisponível" : "Todas" }, ...optionsOf(dres.data, /^(dre|cod|sigla)/i, /nome|desc|diretoria/i)]} />
          <Select label="Tipo" value={draft.tipoesc} onChange={(v) => setDraft((d) => ({ ...d, tipoesc: v }))} options={[{ value: "", label: tipos.isError ? "indisponível" : "Todos" }, ...optionsOf(tipos.data, /tipo|cod|sigla/i, /desc|nome/i)]} />
          <TextInput label="Distrito" value={draft.distrito} onChange={(v) => setDraft((d) => ({ ...d, distrito: v.slice(0, 60) }))} />
          <RPGButton type="submit" variant="primary">
            <Search size={14} aria-hidden /> Buscar
          </RPGButton>
        </form>
      </section>

      <SourceStrip apiId="escolas" meta={list.data ?? dres.data} />

      <div className="grid gap-3 xl:grid-cols-2">
        <KitSection title={list.data?.total != null ? `Escolas (${list.data.total.toLocaleString("pt-BR")})` : "Escolas"} icon={<School size={16} aria-hidden />} action={<CsvButton rows={rows} columns={allCols} filename="escolas.csv" />}>
          {!searching ? (
            dres.isError ? <CityError error={dres.error} onRetry={() => void dres.refetch()} /> : <EmptyBox title="Busque por nome, diretoria, tipo ou distrito." />
          ) : list.isLoading ? (
            <LoadingBlock />
          ) : list.isError ? (
            <CityError error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <>
              <DataTable
                rows={rows}
                columns={cols}
                caption="Escolas encontradas"
                onRowOpen={setSchool}
                actions={(r) => {
                  const key = cellText(codeCol ? r[codeCol.key] : r[cols[0]!.key]);
                  return <FavoriteButton apiId="escolas" itemKey={key} title={cellText(nameCol ? r[nameCol.key] : r[cols[0]!.key])} subtitle={cols.slice(1, 3).map((c) => cellText(r[c.key])).join(" · ")} saved={saved.has(key)} notify={notify} />;
                }}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-rpg-muted">
                <span>Página {page}</span>
                <div className="flex gap-2">
                  <RPGButton variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </RPGButton>
                  <RPGButton variant="secondary" disabled={!rows.length || (list.data?.total != null && page * rows.length >= list.data.total)} onClick={() => setPage((p) => p + 1)}>
                    Próxima
                  </RPGButton>
                </div>
              </div>
            </>
          )}
        </KitSection>

        <KitSection title={school && nameCol ? cellText(school[nameCol.key]) : "Detalhes da escola"} icon={<GraduationCap size={16} aria-hidden />}>
          {!school ? (
            <EmptyBox title="Selecione uma escola na lista." />
          ) : !codesc || codesc === "—" ? (
            <p className="text-sm text-rpg-muted">A escola não trouxe o código necessário para os detalhes.</p>
          ) : (
            <div className="space-y-3">
              <RecordSheet row={school} columns={allCols} />
              <ModuleTabs<Detail>
                label="Detalhes"
                value={detail}
                onChange={setDetail}
                tabs={[
                  { value: "vagas", label: "Vagas", icon: null },
                  { value: "turmas", label: "Turmas", icon: null },
                  { value: "alunos", label: "Alunos", icon: null },
                  { value: "modalidades", label: "Modalidades", icon: null },
                  { value: "ambientes", label: "Ambientes", icon: null },
                  { value: "servidores", label: "Servidores", icon: null },
                ]}
              />
              {detailQ.isLoading ? <LoadingBlock rows={3} /> : detailQ.isError ? <CityError error={detailQ.error} /> : <DataTable rows={detailQ.data?.rows ?? []} columns={pickColumns(detailQ.data?.columns ?? [], [], 7)} caption={`Escola ${codesc} — ${detail}`} />}
            </div>
          )}
        </KitSection>
      </div>
    </div>
  );
}
