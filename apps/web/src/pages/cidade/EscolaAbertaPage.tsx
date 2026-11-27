import { useMemo, useState } from "react";
import { GraduationCap, School, Search } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityData, useCityFavorites } from "@/hooks/useCity";
import type { Row } from "@/services/cityService";
import { CityBanner, CityError, CsvButton, DataTable, EmptyBox, FavoriteButton, LoadingBlock, R, Select, SourceStrip, TextInput, autoColumns, cellText, useCityActivity } from "@/components/city/CityKit";

/** Opções de select a partir de uma lista sem schema publicado: procura colunas de código e nome. */
function optionsOf(rows: Row[], codeHint: RegExp, nameHint: RegExp) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]!);
  const code = keys.find((k) => codeHint.test(k)) ?? keys[0]!;
  const name = keys.find((k) => nameHint.test(k) && k !== code) ?? code;
  return rows.map((r) => ({ value: cellText(r[code]), label: cellText(r[name]) })).filter((o) => o.value !== "—");
}

type Detail = "vagas" | "alunos" | "modalidades" | "ambientes";

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
  const rows = list.data?.items ?? [];
  const cols = useMemo(() => autoColumns(rows, 7, ["nomesc", "tipoesc", "endereco", "bairro", "distrito", "dre", "codesc"]), [rows]);
  const codesc = school ? cellText(school.codesc ?? school.cd_escola ?? school.codigo ?? null) : null;
  const detailQ = useCityData("escolas", detail, { codesc: codesc ?? "" }, !!codesc && codesc !== "—");
  useCityActivity("escolas", "explore", list.isSuccess ? `busca:${JSON.stringify(filters)}`.slice(0, 120) : null, "Escola Aberta");

  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="educacao" eyebrow="Saúde e Educação" title="Escola Aberta" subtitle="Encontre escolas da rede municipal e veja vagas, turmas, modalidades e ambientes publicados pela Secretaria de Educação. Sem notas nem ranking — a API não publica avaliação de qualidade.">
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
          <Select label="Diretoria Regional" value={draft.dre} onChange={(v) => setDraft((d) => ({ ...d, dre: v }))} options={[{ value: "", label: dres.isError ? "indisponível" : "Todas" }, ...optionsOf(dres.data?.items ?? [], /^(dre|cod|sigla)/i, /nome|desc/i)]} />
          <Select label="Tipo" value={draft.tipoesc} onChange={(v) => setDraft((d) => ({ ...d, tipoesc: v }))} options={[{ value: "", label: tipos.isError ? "indisponível" : "Todos" }, ...optionsOf(tipos.data?.items ?? [], /tipo|cod|sigla/i, /desc|nome/i)]} />
          <TextInput label="Distrito" value={draft.distrito} onChange={(v) => setDraft((d) => ({ ...d, distrito: v.slice(0, 60) }))} />
          <RPGButton type="submit" variant="primary">
            <Search size={14} aria-hidden /> Buscar
          </RPGButton>
        </form>
      </section>

      <SourceStrip apiId="escolas" meta={list.data ?? dres.data} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <KitSection title="Escolas" icon={<School size={16} aria-hidden />} action={<CsvButton rows={rows} columns={autoColumns(rows, 40)} filename="escolas.csv" />}>
          {!searching ? (
            dres.isError ? (
              <CityError error={dres.error} onRetry={() => void dres.refetch()} />
            ) : (
              <EmptyBox title="Busque por nome, diretoria, tipo ou distrito." />
            )
          ) : list.isLoading ? (
            <LoadingBlock />
          ) : list.isError ? (
            <CityError error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <>
              <DataTable rows={rows} columns={cols} caption="Escolas encontradas" onRowOpen={setSchool} actions={(r) => <FavoriteButton apiId="escolas" itemKey={cellText(r.codesc ?? r[cols[0]!])} title={cellText(r.nomesc ?? r[cols[0]!])} subtitle={cellText(r.endereco ?? null)} saved={saved.has(cellText(r.codesc ?? r[cols[0]!]))} notify={notify} />} />
              <div className="mt-2 flex items-center justify-between text-xs text-rpg-muted">
                <span>
                  Página {page}
                  {list.data?.total != null && ` · ${list.data.total} escola(s)`}
                </span>
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

        <KitSection title={school ? cellText(school.nomesc ?? school[cols[0]!]) : "Detalhes da escola"} icon={<GraduationCap size={16} aria-hidden />}>
          {!school ? (
            <EmptyBox title="Selecione uma escola na lista." />
          ) : !codesc || codesc === "—" ? (
            <p className="text-sm text-rpg-muted">A escola não trouxe o código (codesc) necessário para os detalhes.</p>
          ) : (
            <div className="space-y-2">
              <ModuleTabs<Detail>
                label="Detalhes"
                value={detail}
                onChange={setDetail}
                tabs={[
                  { value: "vagas", label: "Vagas", icon: null },
                  { value: "alunos", label: "Alunos", icon: null },
                  { value: "modalidades", label: "Modalidades", icon: null },
                  { value: "ambientes", label: "Ambientes", icon: null },
                ]}
              />
              {detailQ.isLoading ? <LoadingBlock rows={3} /> : detailQ.isError ? <CityError error={detailQ.error} /> : <DataTable rows={detailQ.data?.items ?? []} columns={autoColumns(detailQ.data?.items ?? [], 7)} caption={`Escola ${codesc} — ${detail}`} />}
              <div className="border-t border-rpg-border pt-2 text-xs" style={R}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {autoColumns([school], 12).map((k) => (
                    <div key={k} className="min-w-0">
                      <dt className="truncate text-rpg-muted">{k}</dt>
                      <dd className="truncate text-rpg-text/90">{cellText(school[k])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </KitSection>
      </div>
    </div>
  );
}
