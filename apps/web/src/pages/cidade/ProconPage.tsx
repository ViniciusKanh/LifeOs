import { useEffect, useRef, useState } from "react";
import { BarChart3, Building, Gavel, Layers, LineChart, MapPinned, Scale, Search, ShieldCheck, Store, Table2 } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { useCityActivity, CityBanner, CityError, EmptyBox, FIELD, LoadingBlock, R, SourceStrip, dayBR } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";
import { BarList } from "@/components/city/InsightsPanel";
import { BigStat, Collapsible, OUTCOME_STYLE, Panel, Pills, RankList, RatePill, RegionMap, StackedBar, fmtInt, fmtPct } from "@/components/city/civic/CivicKit";
import { useProcon, useProconCompany } from "@/hooks/useCity";
import type { ProconCompany } from "@/services/cityService";
import { Notice } from "./DatasetPages";

/**
 * Balcão do Consumidor (PROCON Paulistano): o ano inteiro de reclamações lido pelo servidor,
 * com desfechos, taxa de resolução, áreas, regiões e a ficha de qualquer empresa (2016–2019).
 */

const YEARS = [2019, 2018, 2017, 2016];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ProconPage() {
  const [ano, setAno] = useState(2019);
  const [draft, setDraft] = useState("");
  const [company, setCompany] = useState("");
  const p = useProcon(ano);
  const ficha = useProconCompany(company);
  const fichaRef = useRef<HTMLDivElement>(null);
  useCityActivity("procon", "explore", p.isSuccess ? `panorama:${ano}` : null, "PROCON");
  const open = (name: string) => {
    setDraft(name);
    setCompany(name);
  };
  useEffect(() => {
    if (company) fichaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [company]);
  const d = p.data;

  return (
    <div className="space-y-4">
      <CityBanner domain="consumo" eyebrow="Cidadania e Consumo" title="Balcão do Consumidor" subtitle="Antes de comprar, consulte a empresa. O LifeOS lê todas as reclamações do PROCON Paulistano no ano e mostra como os casos terminaram — por área, região e empresa.">
        <RPGBadge tone="purple">PROCON 2016–2019</RPGBadge>
      </CityBanner>

      {/* Consulta de empresa: a ferramenta principal da tela */}
      <section className="relative overflow-hidden border-2 border-purple-400/50 bg-gradient-to-br from-purple-950/70 via-rpg-panel to-rpg-panel p-4" style={R} aria-label="Consultar empresa">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
              <Store size={20} className="text-purple-300" aria-hidden /> Consultar empresa
            </p>
            <p className="text-sm text-rpg-text/80">Procura nas quatro bases (2016–2019) e junta as várias grafias do mesmo nome.</p>
          </div>
          <form
            className="flex w-full gap-2 lg:max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              setCompany(draft.trim());
            }}
          >
            <label className="sr-only" htmlFor="procon-empresa">
              Nome da empresa
            </label>
            <input id="procon-empresa" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 80))} placeholder="Ex.: Sptrans, Vivo, Casas Bahia…" className={`${FIELD} flex-1`} style={R} />
            <RPGButton type="submit" variant="primary" disabled={draft.trim().length < 3}>
              <Search size={14} aria-hidden /> Consultar
            </RPGButton>
          </form>
        </div>
        {!!d?.companies.length && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-rpg-muted">Mais citadas em {ano}:</span>
            {d.companies.slice(0, 6).map((c) => (
              <button key={c.key} type="button" onClick={() => open(c.name)} className="border border-rpg-border px-2 py-1 text-rpg-text/90 hover:border-purple-300" style={R}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <div ref={fichaRef} className="scroll-mt-24">
        {company.trim().length >= 3 && (ficha.isLoading ? <LoadingBlock label="Lendo as quatro bases do PROCON…" rows={3} /> : ficha.isError ? <CityError error={ficha.error} onRetry={() => void ficha.refetch()} /> : ficha.data && <CompanySheet f={ficha.data} />)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pills items={YEARS} value={ano} onChange={setAno} label="Ano da base" />
        {d && (
          <RPGBadge tone={d.complete ? "green" : "orange"}>
            {d.complete ? `Ano completo: ${fmtInt(d.loaded)} reclamações` : `Lidas ${fmtInt(d.loaded)} de ${fmtInt(d.total)}`}
          </RPGBadge>
        )}
      </div>

      {p.isLoading ? (
        <LoadingBlock label={`Lendo todas as reclamações de ${ano}…`} rows={5} />
      ) : p.isError ? (
        <CityError error={p.error} onRetry={() => void p.refetch()} />
      ) : !d || !d.loaded ? (
        <EmptyBox title={`O PROCON não publicou reclamações para ${ano}.`} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <BigStat label={`Reclamações em ${ano}`} value={fmtInt(d.total ?? d.loaded)} hint="total oficial da base" accent="bg-purple-500" icon={<Gavel size={20} />} />
            <BigStat label="Taxa de resolução" value={fmtPct(d.resolution.rate, 0)} hint={`entre ${fmtInt(d.resolution.base)} casos com decisão sobre a empresa`} accent="bg-emerald-500" icon={<ShieldCheck size={20} />} />
            <BigStat label="Empresas citadas" value={fmtInt(d.companiesDistinct)} hint="nomes agrupados pelo LifeOS" accent="bg-sky-500" icon={<Building size={20} />} />
            <BigStat label="Área com mais casos" value={d.areas[0]?.label ?? "—"} hint={d.areas[0] ? `${fmtInt(d.areas[0].count)} reclamações` : undefined} accent="bg-amber-500" icon={<Layers size={20} />} />
          </div>

          <Notice>Quantidade de reclamações não prova sozinha que uma empresa é ruim: empresas maiores atendem mais pessoas. Compare a taxa de resolução e quantos casos ela tem.</Notice>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel title="Como os casos terminaram" icon={<Scale size={16} />} subtitle="Desfecho publicado pelo PROCON, agrupado pelo LifeOS">
              <StackedBar parts={d.outcomes} styles={OUTCOME_STYLE} label="Desfechos" />
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-rpg-blue">Ver os desfechos como o PROCON escreve</summary>
                <ul className="mt-2 space-y-1">
                  {d.detailedOutcomes.map((o) => (
                    <li key={o.label} className="flex justify-between gap-2">
                      <span className="truncate text-rpg-text/85">{o.label}</span>
                      <span className="tabular-nums text-rpg-muted">{fmtInt(o.count)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Panel>
            <Panel title="Regiões da cidade" icon={<MapPinned size={16} />} subtitle="Onde o consumidor registrou a reclamação">
              <RegionMap regions={d.regions} />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Empresas mais citadas" icon={<Building size={16} />} subtitle="Clique para abrir a ficha da empresa">
              <RankList items={d.companies.map((c) => ({ label: c.name, value: `${fmtInt(c.count)} casos`, extra: <RatePill rate={c.rate} base={c.base} />, onClick: () => open(c.name) }))} />
            </Panel>
            <Panel title="Áreas de consumo" icon={<Layers size={16} />} subtitle="Volume e taxa de resolução por área">
              <RankList items={d.areas.map((a) => ({ label: a.label, value: fmtInt(a.count), extra: <RatePill rate={a.rate} base={a.base} /> }))} />
            </Panel>
          </div>

          {d.months.length >= 2 && (
            <Panel title="Reclamações por mês" icon={<LineChart size={16} />}>
              <AnimatedLineChart labels={d.months.map((m) => `${MONTHS[Number(m.x.slice(5, 7)) - 1]}/${m.x.slice(2, 4)}`)} series={[{ key: "m", label: "Reclamações", color: "#a855f7", values: d.months.map((m) => m.y) }]} ariaLabel="Reclamações por mês" />
            </Panel>
          )}
        </>
      )}

      <SourceStrip apiId="procon" meta={d ?? null} reference={`Ano ${ano}`} />

      <Collapsible title="Todos os registros e Oráculo" icon={<Table2 size={16} className="text-purple-300" aria-hidden />}>
        <DatasetExplorer
          apiId="procon"
          domain="consumo"
          resources={[{ id: "reclamacoes", label: "Reclamações" }]}
          initial={{ ano: String(ano) }}
          prefer={[/razao social/, /^(area|area de atuacao)$/, /motivo de baixa|status da reclamacao/, /^regiao$/, /entrada/]}
          titleField={/razao social/}
          csvName="procon"
          totalLabel="Reclamações no ano"
          oracleSuggestions={["Quais áreas concentram mais reclamações?", "Qual a proporção de casos com resolução total?"]}
        />
      </Collapsible>
    </div>
  );
}

function CompanySheet({ f }: { f: ProconCompany }) {
  if (!f.count)
    return (
      <EmptyBox title={`Nenhuma reclamação encontrada para “${f.query}” em 2016–2019.`}>
        Isso não garante nada sobre a empresa: o PROCON municipal é só um dos canais (há também o PROCON-SP estadual e o consumidor.gov.br).
      </EmptyBox>
    );
  const maxYear = Math.max(1, ...f.byYear.map((y) => y.count));
  const main = f.matches[0];
  return (
    <section className="space-y-3 border-2 border-purple-400/60 bg-rpg-panel p-4" style={R} aria-label="Ficha da empresa">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase text-purple-300">Ficha da empresa · 2016–2019</p>
          <h2 className="font-rpg text-2xl font-bold text-rpg-text">{main?.name ?? f.query}</h2>
          {f.matches.length > 1 && <p className="text-xs text-rpg-muted">Inclui também: {f.matches.slice(1).map((m) => `${m.name} (${m.count})`).join(", ")}</p>}
        </div>
        {!!f.yearsFailed.length && <RPGBadge tone="orange">Sem dados de {f.yearsFailed.join(", ")}</RPGBadge>}
      </header>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <BigStat label="Reclamações" value={fmtInt(f.count)} hint={f.shareOfAll != null ? `${fmtPct(f.shareOfAll)} de todas as reclamações` : undefined} accent="bg-purple-500" />
        <BigStat label="Taxa de resolução" value={fmtPct(f.resolution.rate, 0)} hint={`${fmtInt(f.resolution.base)} caso(s) com decisão`} accent="bg-emerald-500" />
        <BigStat label="Média da cidade" value={fmtPct(f.cityResolution.rate, 0)} hint="todas as empresas, mesmo período" accent="bg-sky-500" />
        <BigStat
          label="Comparação"
          value={f.resolution.rate == null || f.resolution.base < 5 || f.cityResolution.rate == null ? "Poucos casos" : f.resolution.rate >= f.cityResolution.rate ? "Acima da média" : "Abaixo da média"}
          hint="leitura do LifeOS, não é nota oficial"
          accent={f.resolution.rate != null && f.cityResolution.rate != null && f.resolution.base >= 5 && f.resolution.rate < f.cityResolution.rate ? "bg-rose-500" : "bg-amber-500"}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-1.5 font-pixel text-[10px] uppercase text-rpg-gold">Como os casos terminaram</p>
          <StackedBar parts={f.outcomes} styles={OUTCOME_STYLE} label="Desfechos da empresa" />
        </div>
        <div className="min-w-0">
          <p className="mb-1.5 font-pixel text-[10px] uppercase text-rpg-gold">Por ano</p>
          <div className="flex h-28 items-end gap-2" role="img" aria-label={f.byYear.map((y) => `${y.ano}: ${y.count}`).join(", ")}>
            {f.byYear.map((y) => (
              <div key={y.ano} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-rpg-text">{y.count}</span>
                <div className="w-full bg-purple-500/80" style={{ ...R, height: `${Math.max(4, (y.count / maxYear) * 80)}px` }} />
                <span className="font-pixel text-[10px] text-rpg-muted">{y.ano}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <BarList title="Áreas" items={f.areas.map((a) => ({ label: a.label, value: a.count }))} format={(v) => fmtInt(v)} tone="purple" />
        </div>
      </div>
      <div>
        <p className="mb-1.5 font-pixel text-[10px] uppercase text-rpg-gold">Casos mais recentes</p>
        <ul className="grid gap-1.5 md:grid-cols-2">
          {f.recent.map((r, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 px-2 py-1.5 text-xs" style={R}>
              <span className={`h-2.5 w-2.5 shrink-0 ${OUTCOME_STYLE[r.outcome].bg}`} style={{ borderRadius: 2 }} aria-hidden />
              <span className="w-16 shrink-0 tabular-nums text-rpg-muted">{dayBR(r.date)}</span>
              <span className="min-w-0 flex-1 truncate text-rpg-text/90" title={r.outcomeRaw ?? r.outcomeLabel}>
                {r.outcomeLabel}
              </span>
              <span className="hidden shrink-0 truncate text-rpg-muted sm:inline">{[r.area, r.region].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-rpg-muted">
        <BarChart3 size={12} aria-hidden /> Taxa de resolução = resolvidos (parciais contam metade) ÷ casos com decisão (resolvido, parcial ou não resolvido). Desistências, orientações e arquivados ficam fora da conta.
      </p>
    </section>
  );
}
