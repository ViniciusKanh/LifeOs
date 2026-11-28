import { useState } from "react";
import { Archive, Building2, FileQuestion, Hourglass, LineChart, Search, ThumbsUp } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { CityBanner, CityError, EmptyBox, FIELD, LoadingBlock, PublicSourceStrip, R, useCityActivity } from "@/components/city/CityKit";
import { ProtocolsPanel } from "@/components/city/PersonalPanels";
import { BigStat, ESIC_STYLE, Panel, Pills, QACard, RankList, StackedBar, fmtInt, fmtPct } from "@/components/city/civic/CivicKit";
import { useCityActions, useEsic } from "@/hooks/useCity";
import type { EsicStatus } from "@/services/cityService";

/**
 * Arquivo da Transparência (e-SIC): busca nas perguntas e respostas já publicadas — para não
 * repetir um pedido —, taxa de atendimento e órgãos mais acionados no ano.
 */

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SUGGESTIONS = ["creche", "ônibus", "poda de árvore", "contrato", "obra", "saúde mental"];

export function EsicPage() {
  const [notify, toast] = useLocalToast();
  // null = ano mais recente publicado no Portal de Dados Abertos.
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const e = useEsic(sel, query);
  const ano = e.data?.ano ?? sel;
  const a = useCityActions();
  useCityActivity("esic", "explore", e.isSuccess ? `panorama:${ano}` : null, "e-SIC");
  const read = (id: string, title: string) => a.activity.mutate({ api: "esic", action: "read", ref: id || title.slice(0, 60), label: title.slice(0, 150) }, { onSuccess: (r) => r.xp && notify(`Leitura registrada. +${r.xp} XP`) });
  const search = (q: string) => {
    setDraft(q);
    setQuery(q.trim().length >= 3 ? q.trim() : null);
  };
  const d = e.data;
  const statusParts = d ? (Object.keys(ESIC_STYLE) as EsicStatus[]).map((k) => ({ key: k, label: ESIC_STYLE[k].label, count: d.status[k] })).filter((p) => p.count > 0) : [];

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="cidadania" eyebrow="Cidadania e Consumo" title="Arquivo da Transparência" subtitle="Tudo o que já foi perguntado à Prefeitura pela Lei de Acesso à Informação, com as respostas. Pesquise antes de abrir um pedido novo — e veja quais órgãos respondem melhor.">
        <RPGBadge tone="cyan">e-SIC · LAI</RPGBadge>
      </CityBanner>

      <section className="border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-950/60 via-rpg-panel to-rpg-panel p-4" style={R} aria-label="Pesquisar pedidos">
        <p className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
          <Search size={20} className="text-cyan-300" aria-hidden /> Antes de perguntar, veja se já responderam
        </p>
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            search(draft);
          }}
        >
          <label className="sr-only" htmlFor="esic-busca">
            Palavras da pergunta
          </label>
          <input id="esic-busca" value={draft} onChange={(ev) => setDraft(ev.target.value.slice(0, 80))} placeholder="Ex.: vagas em creche no Grajaú" className={`${FIELD} flex-1`} style={R} />
          <RPGButton type="submit" variant="primary" disabled={draft.trim().length < 3}>
            <Search size={14} aria-hidden /> Pesquisar
          </RPGButton>
          {query && (
            <RPGButton type="button" variant="ghost" onClick={() => search("")}>
              Limpar
            </RPGButton>
          )}
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => search(s)} className="border border-rpg-border px-2 py-1 text-rpg-text/85 hover:border-cyan-300" style={R}>
              {s}
            </button>
          ))}
        </div>
      </section>

      {!!e.data?.periods.length && <Pills items={e.data.periods.map((p) => Number(p.key))} value={e.data.ano} onChange={(v) => setSel(v)} label="Ano dos pedidos" />}

      {e.isLoading ? (
        <LoadingBlock label={`Somando os pedidos${ano ? ` de ${ano}` : " do ano mais recente"}…`} rows={5} />
      ) : e.isError ? (
        <CityError error={e.error} onRetry={() => void e.refetch()} />
      ) : !d || !d.loaded ? (
        <EmptyBox title={`Nenhum pedido publicado para ${ano}.`} />
      ) : (
        <>
          {d.query && (
            <Panel title={`Resultados para “${d.query}”`} icon={<FileQuestion size={16} />} subtitle={`Busca nas perguntas dos ${fmtInt(d.total)} pedidos de ${ano} (até 40 resultados)`}>
              {d.results.length ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {d.results.map((r, i) => (
                    <QACard key={`${r.id}-${i}`} item={r} highlight={d.query} onOpen={() => read(r.id, r.pedido)} />
                  ))}
                </div>
              ) : (
                <EmptyBox title="Nada encontrado com essas palavras neste ano.">Tente outro ano ou menos palavras. Se não existir, abra um pedido no portal oficial e registre o protocolo abaixo.</EmptyBox>
              )}
            </Panel>
          )}

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <BigStat label={`Pedidos em ${ano}`} value={fmtInt(d.total ?? d.loaded)} hint={`${fmtInt(d.atendimentos)} movimentações na base inteira`} accent="bg-cyan-500" icon={<Archive size={20} />} />
            <BigStat label="Atendidos" value={fmtPct(d.atendidoPct, 0)} hint={`entre ${fmtInt(d.decided)} pedidos com decisão explícita (atendido, em parte ou negado)`} accent="bg-emerald-500" icon={<ThumbsUp size={20} />} />
            <BigStat label="Finalizados sem detalhe" value={fmtInt(d.status.finalizado)} hint="encerrados sem dizer se foram atendidos" accent="bg-teal-500" icon={<Hourglass size={20} />} />
            <BigStat label="Em tramitação" value={fmtInt(d.status.tramitando)} hint={`situação mais recente de cada pedido`} accent="bg-sky-500" icon={<Building2 size={20} />} />
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Panel title="Situação dos pedidos" icon={<ThumbsUp size={16} />} subtitle="Situação publicada, agrupada pelo LifeOS">
              <StackedBar parts={statusParts} styles={ESIC_STYLE} label="Situação" />
            </Panel>
            <Panel title="Órgãos mais acionados" icon={<Building2 size={16} />} subtitle="Pedidos · % atendidos entre os decididos · % negados">
              <RankList items={d.orgaos.map((o) => ({ label: o.label, value: fmtInt(o.count), extra: (
                    <span className="inline-flex w-24 justify-end gap-2 text-[11px] tabular-nums">
                      <span className="text-emerald-300" title="Atendidos entre os decididos">{fmtPct(o.atendidoPct, 0)}</span>
                      <span className="text-rose-300" title="Negados">{fmtPct(o.negadoPct, 0)}</span>
                    </span>
                  ) }))} />
            </Panel>
          </div>

          {d.months.length >= 2 && (
            <Panel title="Pedidos por mês" icon={<LineChart size={16} />} subtitle="Pela primeira movimentação de cada pedido">
              <AnimatedLineChart labels={d.months.map((m) => `${MONTHS[Number(m.x.slice(5, 7)) - 1]}/${m.x.slice(2, 4)}`)} series={[{ key: "m", label: "Pedidos", color: "#06b6d4", values: d.months.map((m) => m.y) }]} ariaLabel="Pedidos por mês" />
            </Panel>
          )}

          {!d.query && !!d.recent.length && (
            <Panel title="Perguntas respondidas recentemente" icon={<FileQuestion size={16} />}>
              <div className="grid gap-2 lg:grid-cols-2">
                {d.recent.map((r, i) => (
                  <QACard key={`${r.id}-${i}`} item={r} onOpen={() => read(r.id, r.pedido)} />
                ))}
              </div>
            </Panel>
          )}
          <p className="text-[11px] text-rpg-muted">Contagens sobre todos os pedidos de {ano}. Os textos foram anonimizados pela Prefeitura e o LifeOS ainda oculta e-mails, CPFs, telefones e números longos.</p>
        </>
      )}

      <ProtocolsPanel kind="esic" notify={notify} officialUrl="https://esic.prefeitura.sp.gov.br/" />

      {d && (
        <PublicSourceStrip
          source={d.source}
          fetchedAt={d.fetchedAt}
          stale={d.stale}
          reference={`Ano ${d.ano}`}
          warnings={d.warnings}
          method="Cada pedido tem várias movimentações (registro, prorrogação, resposta, recurso): o LifeOS usa a mais recente de cada pedido e soma no Portal de Dados Abertos, sobre a base inteira do ano. “Atendidos” considera só pedidos com decisão explícita."
          limitations={["“Finalizado” não diz se o pedido foi atendido — fica separado.", "O portal publica o e-SIC com atraso; o ano mais recente pode estar incompleto.", "Nomes citados nos textos não são detectáveis com segurança; por isso os trechos são curtos."]}
        />
      )}

    </div>
  );
}
