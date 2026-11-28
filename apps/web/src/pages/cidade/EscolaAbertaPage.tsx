import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Armchair, Building, CalendarCheck, Compass, GraduationCap, LayoutList, Mail, MapPin, Phone, School as SchoolIcon, Search, Sparkles, Users } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { CityBanner, CityError, EmptyBox, FavoriteButton, LoadingBlock, PublicSourceStrip, R, Select, TextInput, dayBR, useCityActivity } from "@/components/city/CityKit";
import { BarList } from "@/components/city/InsightsPanel";
import { BigStat, Panel, RankList, fmtInt, fmtPct } from "@/components/city/civic/CivicKit";
import { CountChips, ModalityRow, OccupancyBar, OccupancyLegend, SeriesTable } from "@/components/city/edu/EduKit";
import { useCityFavorites, useEduPanorama, useEduSchool, useEduSchools } from "@/hooks/useCity";
import type { School, SchoolQuery } from "@/services/cityService";

const SchoolMap = lazy(() => import("@/components/city/edu/SchoolMap"));

/**
 * Educação — rede municipal de São Paulo (Escola Aberta, atualização mensal, sem credencial).
 * Panorama da cidade ou de uma Diretoria Regional (vagas × atendidos por modalidade e série,
 * onde sobram vagas, escolas por tipo e porte, profissionais e ambientes) e o localizador de
 * escolas com mapa e ficha. Sem notas nem ranking: a fonte não publica avaliação de qualidade.
 */

export function EscolaAbertaPage() {
  const [notify, toast] = useLocalToast();
  const [dre, setDre] = useState<string | null>(null);
  const p = useEduPanorama(dre);
  const d = p.data;
  useCityActivity("escolas", "explore", p.isSuccess ? `panorama:${dre ?? "cidade"}` : null, "Escola Aberta");

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="educacao" eyebrow="Educação" title="Rede Municipal de Ensino" subtitle="Vagas, estudantes atendidos, escolas, profissionais e estrutura da rede municipal — da cidade inteira ou de cada Diretoria Regional — e o localizador de escolas com mapa. Sem notas nem ranking: a Prefeitura não publica avaliação de qualidade.">
        <RPGBadge tone="purple">{d?.atualizadoEm ? `Atualizado em ${dayBR(d.atualizadoEm)}` : "Escola Aberta"}</RPGBadge>
        <RPGBadge tone="green">Sem credencial</RPGBadge>
      </CityBanner>

      <section className="rpg-panel flex flex-col gap-2 p-3 sm:flex-row sm:items-end" aria-label="Recorte do panorama">
        <Select
          label="Recorte"
          value={dre ?? ""}
          onChange={(v) => setDre(v || null)}
          options={[{ value: "", label: "Cidade inteira" }, ...(d?.dres ?? []).map((x) => ({ value: x.value, label: `DRE ${x.label}` }))]}
          className="sm:w-72"
        />
        <p className="text-xs text-rpg-muted sm:pb-2">
          {d ? (
            <>
              Mostrando <strong className="text-rpg-text">{d.dreLabel ? `a Diretoria Regional ${d.dreLabel}` : "a cidade inteira"}</strong>. O localizador abaixo usa o mesmo recorte.
            </>
          ) : (
            "Escolha a cidade inteira ou uma das 13 Diretorias Regionais de Educação."
          )}
        </p>
      </section>

      {p.isLoading ? (
        <LoadingBlock label="Lendo a rede municipal na Escola Aberta…" rows={5} />
      ) : p.isError ? (
        <CityError error={p.error} onRetry={() => void p.refetch()} />
      ) : !d ? null : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <BigStat label="Unidades" value={fmtInt(d.kpis.escolas)} hint={`${fmtInt(d.escolasPorTipo.length)} tipos de unidade`} accent="bg-purple-500" icon={<SchoolIcon size={20} />} />
            <BigStat label="Estudantes atendidos" value={fmtInt(d.kpis.atendimentos)} hint={`${fmtPct(d.kpis.ocupacao)} de ${fmtInt(d.kpis.vagas)} vagas ofertadas`} accent="bg-indigo-500" icon={<Users size={20} />} />
            <BigStat label="Vagas livres" value={fmtInt(d.kpis.remanescentes)} hint="ofertadas e ainda não preenchidas" accent="bg-teal-500" icon={<Armchair size={20} />} />
            <BigStat label="Profissionais" value={fmtInt(d.kpis.profissionais)} hint={`${fmtInt(d.kpis.turmas)} turmas na rede`} accent="bg-amber-500" icon={<GraduationCap size={20} />} />
          </div>

          <Panel title="Vagas e atendimentos por modalidade" icon={<LayoutList size={16} />} subtitle="Toque numa modalidade para ver cada série" action={<OccupancyLegend />}>
            <ul className="grid items-start gap-2 lg:grid-cols-2">
              {d.modalidades.map((m, i) => (
                <ModalityRow key={m.label} m={m} defaultOpen={i === 0} />
              ))}
            </ul>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Onde sobram vagas" icon={<Armchair size={16} />} subtitle="Séries com mais vagas ofertadas e não preenchidas">
              {d.sobras.length ? (
                <RankList items={d.sobras.map((s) => ({ label: `${s.label} · ${s.modalidade}`, value: `${fmtInt(s.remanescentes)} livres`, extra: <span className="inline-block w-12 text-right text-[11px] tabular-nums text-rpg-muted">{fmtPct(s.ocupacao, 0)}</span> }))} />
              ) : (
                <p className="text-sm text-rpg-muted">Nenhuma série com vagas livres neste recorte.</p>
              )}
            </Panel>
            <Panel title="Séries mais cheias" icon={<Users size={16} />} subtitle="Maior ocupação entre séries com ao menos 200 vagas">
              <ul className="space-y-2">
                {d.lotadas.map((s) => (
                  <li key={`${s.modalidade}-${s.label}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-rpg-text">
                        {s.label} <span className="text-xs text-rpg-muted">· {s.modalidade}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-rpg-text/90">{fmtPct(s.ocupacao)}</span>
                    </div>
                    <OccupancyBar vagas={s.vagas} atendimentos={s.atendimentos} ocupacao={s.ocupacao} compact />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Unidades por tipo" icon={<Building size={16} />}>
              <BarList title="Tipo de unidade" items={d.escolasPorTipo.slice(0, 12).map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="purple" />
            </Panel>
            <Panel title="Porte das unidades" icon={<Users size={16} />} subtitle="Faixa de estudantes matriculados">
              <BarList title="Porte" items={d.escolasPorFaixa.map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="blue" />
            </Panel>
            <Panel title="Formação dos profissionais" icon={<GraduationCap size={16} />}>
              <BarList title="Formação" items={d.formacao.slice(0, 8).map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="gold" />
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Cargos mais presentes" icon={<Users size={16} />}>
              <RankList items={d.cargos.slice(0, 10).map((c) => ({ label: c.label, value: fmtInt(c.count) }))} />
            </Panel>
            <Panel title="Estrutura: ambientes da rede" icon={<Compass size={16} />} subtitle="Quantidade de cada ambiente cadastrado">
              <CountChips items={d.ambientes} />
            </Panel>
          </div>
        </>
      )}

      <SchoolFinder dre={dre} tipos={d?.escolasPorTipo.map((t) => t.label) ?? []} notify={notify} />

      {d && (
        <PublicSourceStrip
          source={d.source}
          fetchedAt={d.fetchedAt}
          stale={d.stale}
          reference={d.atualizadoEm ? `Base de ${dayBR(d.atualizadoEm)}` : null}
          warnings={d.warnings}
          method="Totais oficiais da Secretaria Municipal de Educação (Escola Aberta), por modalidade e série, para a cidade ou a DRE escolhida. Ocupação = estudantes atendidos ÷ vagas ofertadas. Vagas livres = vagas remanescentes publicadas."
          limitations={["A fonte não publica avaliação de qualidade — o LifeOS não cria nota nem ranking de escolas.", "Vagas livres numa série não garantem vaga perto de casa: confira a escola e o período de matrícula.", "Os números mudam ao longo do ano letivo; a base é atualizada mensalmente."]}
        />
      )}
    </div>
  );
}

/* ───────────────────────── localizador de escolas ───────────────────────── */

function SchoolFinder({ dre, tipos, notify }: { dre: string | null; tipos: string[]; notify: (m: string, t?: "success" | "error") => void }) {
  const [draft, setDraft] = useState({ search: "", tipoesc: "", distrito: "" });
  const [q, setQ] = useState<SchoolQuery | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // Mudar o recorte (DRE) refaz a busca já feita.
  useEffect(() => {
    setQ((cur) => (cur ? { ...cur, dre: dre ?? undefined, page: 1 } : cur));
  }, [dre]);
  const list = useEduSchools(q ?? { page: 1 }, !!q);
  const rows = list.data?.rows ?? [];
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const favs = useCityFavorites("escolas");
  const saved = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const submit = () => {
    setQ({ search: draft.search.trim() || undefined, tipoesc: draft.tipoesc || undefined, distrito: draft.distrito.trim() || undefined, dre: dre ?? undefined, page: 1 });
    setSelected(null);
  };
  const pick = (codesc: string) => {
    setSelected(codesc);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <section className="space-y-3" aria-label="Localizador de escolas">
      <div className="rpg-panel border-purple-400/40 bg-gradient-to-br from-purple-950/50 via-rpg-panel to-rpg-panel p-3">
        <p className="mb-2 flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
          <Search size={20} className="text-purple-300" aria-hidden /> Encontre uma escola
        </p>
        <form
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextInput label="Nome da escola" value={draft.search} onChange={(v) => setDraft((x) => ({ ...x, search: v.slice(0, 80) }))} placeholder="Ex.: Alípio Correa Neto" className="col-span-2 sm:col-span-1" />
          <Select label="Tipo" value={draft.tipoesc} onChange={(v) => setDraft((x) => ({ ...x, tipoesc: v }))} options={[{ value: "", label: "Todos" }, ...tipos.map((t) => ({ value: t, label: t }))]} />
          <TextInput label="Distrito" value={draft.distrito} onChange={(v) => setDraft((x) => ({ ...x, distrito: v.slice(0, 60) }))} placeholder="Ex.: Vila Sônia" />
          <RPGButton type="submit" variant="primary" className="col-span-2 sm:col-span-1">
            <Search size={14} aria-hidden /> Buscar
          </RPGButton>
        </form>
        <p className="mt-1.5 text-[11px] text-rpg-muted">Dica: “EMEF Alípio” também funciona — o tipo é separado do nome automaticamente.{dre ? " A busca respeita a DRE escolhida acima." : ""}</p>
      </div>

      {!q ? (
        <EmptyBox title="Busque por nome, tipo ou distrito para ver as escolas no mapa." />
      ) : list.isLoading ? (
        <LoadingBlock label="Procurando escolas…" rows={4} />
      ) : list.isError ? (
        <CityError error={list.error} onRetry={() => void list.refetch()} />
      ) : !rows.length ? (
        <EmptyBox title="Nenhuma escola encontrada com esses filtros.">Tente só parte do nome, sem acentos, ou outro distrito.</EmptyBox>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel title={`Escolas encontradas (${fmtInt(list.data!.total)})`} icon={<SchoolIcon size={16} />} subtitle={`Página ${q.page} de ${pages}`}>
            <ul className="space-y-1.5">
              {rows.map((s) => (
                <li key={s.codesc}>
                  <SchoolRow s={s} active={s.codesc === selected} onOpen={() => pick(s.codesc)} />
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2">
              <RPGButton variant="secondary" disabled={q.page <= 1} onClick={() => setQ({ ...q, page: q.page - 1 })}>
                Anterior
              </RPGButton>
              <span className="text-xs text-rpg-muted">
                {q.page} / {pages}
              </span>
              <RPGButton variant="secondary" disabled={q.page >= pages} onClick={() => setQ({ ...q, page: q.page + 1 })}>
                Próxima
              </RPGButton>
            </div>
          </Panel>
          <div className="min-w-0 space-y-3">
            <Suspense fallback={<LoadingBlock label="Carregando o mapa…" rows={3} />}>
              <SchoolMap schools={rows} selected={selected} onSelect={pick} />
            </Suspense>
            <div ref={detailRef}>{selected ? <SchoolSheet codesc={selected} saved={saved.has(selected)} notify={notify} /> : <EmptyBox title="Toque numa escola da lista ou do mapa para abrir a ficha." />}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function SchoolRow({ s, active, onOpen }: { s: School; active: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`flex min-h-[52px] w-full items-center gap-2 border-2 px-2 py-1.5 text-left hover:border-purple-300 ${active ? "border-amber-400 bg-amber-400/10" : "border-rpg-border bg-rpg-bg-2/60"}`} style={R} aria-pressed={active}>
      <span className="shrink-0 border border-purple-400/50 bg-purple-500/15 px-1.5 py-0.5 font-pixel text-[10px] text-purple-200" style={R}>
        {s.tipo}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-rpg-text">{s.nome}</span>
        <span className="block truncate text-[11px] text-rpg-muted">{[s.bairro, s.distrito, s.diretoria && `DRE ${s.diretoria}`].filter(Boolean).join(" · ")}</span>
      </span>
      {s.lat == null && <span className="shrink-0 text-[10px] text-rpg-muted" title="Sem coordenadas no cadastro">sem mapa</span>}
    </button>
  );
}

function SchoolSheet({ codesc, saved, notify }: { codesc: string; saved: boolean; notify: (m: string, t?: "success" | "error") => void }) {
  const q = useEduSchool(codesc);
  useCityActivity("escolas", "explore", q.isSuccess ? `escola:${codesc}` : null, "Escola Aberta");
  if (q.isLoading) return <LoadingBlock label="Abrindo a ficha da escola…" rows={4} />;
  if (q.isError) return <CityError error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const s = d.school;
  const maps = s.lat != null && s.lng != null ? `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}` : null;
  return (
    <section className="rpg-panel space-y-3 p-3" aria-label={`Ficha de ${s.nome}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase text-purple-300">
            {s.tipo} · código {s.codesc}
            {s.situacao && s.situacao !== "ATIVA" ? ` · ${s.situacao}` : ""}
          </p>
          <h3 className="font-rpg text-lg font-bold leading-tight text-rpg-text">{s.nome}</h3>
          {!!d.modalidades.length && <p className="text-xs text-rpg-muted">{d.modalidades.join(" · ")}</p>}
        </div>
        <FavoriteButton apiId="escolas" itemKey={s.codesc} title={`${s.tipo} ${s.nome}`} subtitle={[s.bairro, s.distrito].filter(Boolean).join(" · ") || null} saved={saved} notify={notify} />
      </div>

      <ul className="grid gap-1.5 text-sm text-rpg-text/90 sm:grid-cols-2">
        {s.endereco && (
          <li className="flex min-w-0 items-start gap-1.5">
            <MapPin size={14} className="mt-0.5 shrink-0 text-purple-300" aria-hidden />
            <span className="min-w-0">
              {s.endereco}
              {s.bairro ? ` — ${s.bairro}` : ""}
              {s.cep ? ` · CEP ${s.cep}` : ""}
              {maps && (
                <>
                  {" "}
                  <a href={maps} target="_blank" rel="noreferrer noopener" className="text-rpg-blue underline-offset-2 hover:underline">
                    ver no mapa
                  </a>
                </>
              )}
            </span>
          </li>
        )}
        {s.telefone && (
          <li className="flex items-center gap-1.5">
            <Phone size={14} className="shrink-0 text-purple-300" aria-hidden />
            <a href={`tel:${s.telefone.replace(/\D/g, "")}`} className="hover:underline">
              {s.telefone}
            </a>
          </li>
        )}
        {s.email && (
          <li className="flex min-w-0 items-center gap-1.5">
            <Mail size={14} className="shrink-0 text-purple-300" aria-hidden />
            <a href={`mailto:${s.email}`} className="truncate hover:underline">
              {s.email}
            </a>
          </li>
        )}
        {s.diretoria && (
          <li className="flex items-center gap-1.5">
            <Building size={14} className="shrink-0 text-purple-300" aria-hidden /> DRE {s.diretoria}
            {s.subpref ? ` · Subprefeitura ${s.subpref}` : ""}
          </li>
        )}
        {s.criadaEm && (
          <li className="flex items-center gap-1.5">
            <CalendarCheck size={14} className="shrink-0 text-purple-300" aria-hidden /> Criada em {dayBR(s.criadaEm)}
          </li>
        )}
      </ul>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BigStat label="Vagas" value={fmtInt(d.totals.vagas)} hint={`${fmtInt(d.totals.turmas)} turmas`} accent="bg-purple-500" />
        <BigStat label="Atendidos" value={fmtInt(d.totals.atendimentos)} hint={fmtPct(d.totals.ocupacao) + " das vagas"} accent="bg-indigo-500" />
        <BigStat label="Vagas livres" value={fmtInt(d.totals.remanescentes)} accent="bg-teal-500" />
        <BigStat label="Servidores" value={fmtInt(d.servidoresTotal)} accent="bg-amber-500" />
      </div>

      <div>
        <p className="mb-1.5 font-pixel text-[10px] uppercase text-rpg-gold">Vagas por série</p>
        <SeriesTable series={d.series} caption={`Vagas por série — ${s.nome}`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {!!d.turnos.length && <BarList title="Estudantes por turno" items={d.turnos.map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="purple" />}
        {!!d.servidores.length && (
          <div>
            <p className="mb-1.5 font-pixel text-[10px] uppercase text-rpg-gold">Servidores por atuação</p>
            <RankList items={d.servidores.slice(0, 8).map((x) => ({ label: x.label, value: fmtInt(x.count) }))} />
          </div>
        )}
      </div>
      {!!d.ambientes.length && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 font-pixel text-[10px] uppercase text-rpg-gold">
            <Sparkles size={12} aria-hidden /> Ambientes da escola
          </p>
          <CountChips items={d.ambientes} max={24} />
        </div>
      )}
      {!!d.warnings.length && <p className="text-[11px] text-amber-300">Partes indisponíveis agora: {d.warnings.join(" · ")}</p>}
    </section>
  );
}
