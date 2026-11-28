import { useState } from "react";
import { Clock3, Headphones, Hourglass, LayoutGrid, LineChart, ListChecks, MapPinned, PhoneCall, Radio, Smile, ThumbsUp } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { CityBanner, CityError, EmptyBox, LoadingBlock, PublicSourceStrip, duration, useCityActivity } from "@/components/city/CityKit";
import { BarList } from "@/components/city/InsightsPanel";
import { ProtocolsPanel } from "@/components/city/PersonalPanels";
import { BigStat, HeatGrid, Panel, Pills, RankList, StackedBar, fmtCompact, fmtInt, fmtPct } from "@/components/city/civic/CivicKit";
import { useCityActions, useSp156 } from "@/hooks/useCity";

/**
 * Central do Cidadão (SP156): o que a cidade pede, onde, por qual canal, quanto demora e como o
 * cidadão avaliou — no trimestre mais recente publicado no Portal de Dados Abertos — e como a
 * central telefônica atendeu no semestre. Protocolos pessoais ao final.
 */

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const days = (n: number | null) => (n == null ? "—" : n < 1 ? "menos de 1 dia" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${n >= 2 ? "s" : ""}`);

/** Escala de satisfação publicada pelo SP156, da melhor para a pior. */
const SAT_STYLE: Record<string, { bg: string; dot: string }> = {
  Excelente: { bg: "bg-emerald-500", dot: "bg-emerald-400" },
  Ótimo: { bg: "bg-green-500", dot: "bg-green-400" },
  Bom: { bg: "bg-lime-500", dot: "bg-lime-400" },
  Razoável: { bg: "bg-amber-500", dot: "bg-amber-400" },
  Ruim: { bg: "bg-orange-600", dot: "bg-orange-500" },
  Péssimo: { bg: "bg-rose-600", dot: "bg-rose-500" },
};

export function Sp156Page() {
  const [notify, toast] = useLocalToast();
  // null = trimestre mais recente publicado.
  const [sel, setSel] = useState<string | null>(null);
  const q = useSp156(sel);
  const a = useCityActions();
  const d = q.data;
  useCityActivity("sp156", "explore", q.isSuccess && d ? `panorama:${d.periodo}` : null, "SP156");
  const territory = (name: string) =>
    a.activity.mutate({ api: "sp156", action: "territory", ref: name.slice(0, 120), label: name.slice(0, 150) }, { onSuccess: (r) => notify(r.recorded ? `Território explorado: ${name}` : `${name} já explorado hoje.`) });
  const s = d?.solicitacoes;
  const l = d?.ligacoes;
  const sat = (s?.satisfacao ?? []).filter((x) => SAT_STYLE[x.label]);

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="cidadania" eyebrow="Cidadania e Consumo" title="Central do Cidadão" subtitle="O que os paulistanos pedem à Prefeitura pelo SP156 — temas, serviços, subprefeituras, quanto tempo leva e como o atendimento foi avaliado — e como a central 156 atendeu as ligações.">
        <RPGBadge tone="cyan">{d ? `SP156 · ${d.periodLabel}` : "SP156 · somente leitura"}</RPGBadge>
      </CityBanner>

      {!!d?.periods.length && <Pills items={d.periods.slice(0, 10).map((p) => p.key)} value={d.periodo} onChange={setSel} label="Período" render={(v) => d.periods.find((p) => p.key === v)?.label ?? v} />}

      {q.isLoading ? (
        <LoadingBlock label="Somando as solicitações do período mais recente e a central 156…" rows={5} />
      ) : q.isError ? (
        <CityError error={q.error} onRetry={() => void q.refetch()} />
      ) : !d || !s ? null : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <BigStat label={`Solicitações · ${d.periodLabel}`} value={fmtInt(s.total)} hint="base inteira do período" accent="bg-cyan-500" icon={<ListChecks size={20} />} />
            <BigStat label="Tempo até finalizar" value={days(s.medianDays)} hint={s.daysBase ? `mediana de ${fmtInt(s.daysBase)} solicitações com as duas datas` : "a base deste período não traz as duas datas"} accent="bg-amber-500" icon={<Hourglass size={20} />} />
            <BigStat label="Avaliações boas" value={fmtPct(s.satisfacaoBoaPct)} hint={s.avaliadas ? `excelente, ótimo ou bom em ${fmtInt(s.avaliadas)} avaliações` : "sem avaliações neste período"} accent="bg-emerald-500" icon={<Smile size={20} />} />
            <BigStat label="Ligações atendidas" value={fmtPct(l?.taxaAtendimento)} hint={l ? `${fmtInt(l.entrantes)} recebidas · ${l.periodLabel}` : (d.ligacoesNote ?? "sem dados da central")} accent="bg-sky-500" icon={<Headphones size={20} />} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="O que a cidade mais pede" icon={<LayoutGrid size={16} />} subtitle={`Temas em ${fmtInt(s.total)} solicitações`}>
              <BarList title="Temas" items={s.temas.map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="cyan" />
            </Panel>
            <Panel title="Serviços mais solicitados" icon={<ListChecks size={16} />}>
              <RankList items={s.servicos.map((x) => ({ label: x.label, value: fmtInt(x.count) }))} />
            </Panel>
          </div>

          {sat.length > 0 && (
            <Panel title="Como o cidadão avaliou o atendimento" icon={<ThumbsUp size={16} />} subtitle={`${fmtInt(s.avaliadas)} solicitações avaliadas no período`}>
              <StackedBar parts={sat.map((x) => ({ key: x.label, label: x.label, count: x.count }))} styles={SAT_STYLE} label="Nível de satisfação" />
              {!!s.atendeu.length && (
                <p className="mt-2 text-xs text-rpg-muted">
                  “A solicitação foi atendida?” — {s.atendeu.map((x) => `${x.label}: ${fmtInt(x.count)}`).join(" · ")}
                </p>
              )}
            </Panel>
          )}

          <Panel title="Onde: subprefeituras" icon={<MapPinned size={16} />} subtitle="Clique numa subprefeitura para marcá-la como território explorado">
            {s.subprefeituras.length ? <HeatGrid items={s.subprefeituras} onPick={territory} label="Solicitações por subprefeitura" /> : <p className="text-sm text-rpg-muted">A base deste período não traz a subprefeitura.</p>}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Situação" icon={<Clock3 size={16} />}>
              {s.status.length ? <BarList title="Status da solicitação" items={s.status.map((x) => ({ label: x.label, value: x.count }))} format={fmtInt} tone="cyan" /> : <p className="text-sm text-rpg-muted">O período não traz o status.</p>}
            </Panel>
            <Panel title="Canais de entrada" icon={<Radio size={16} />}>
              {s.canais.length ? <BarList title="Canal" items={s.canais.map((x) => ({ label: x.label, value: x.count }))} format={fmtInt} tone="blue" /> : <p className="text-sm text-rpg-muted">O período não traz o canal.</p>}
            </Panel>
            <Panel title="Temas mais demorados" icon={<Hourglass size={16} />} subtitle="Mediana de dias até finalizar (mín. 20 casos)">
              {s.slowestThemes.length ? <RankList items={s.slowestThemes.map((t) => ({ label: t.label, value: days(t.medianDays) }))} /> : <p className="text-sm text-rpg-muted">Sem datas suficientes neste período.</p>}
            </Panel>
          </div>

          {s.months.length >= 2 && (
            <Panel title="Solicitações por mês" icon={<LineChart size={16} />} subtitle="Pela data de abertura (registros sem data ficam fora da série)">
              <div className="pb-6">
                <AnimatedLineChart labels={s.months.map((m) => `${MONTHS[Number(m.x.slice(5, 7)) - 1]}/${m.x.slice(2, 4)}`)} series={[{ key: "s", label: "Solicitações", color: "#06b6d4", values: s.months.map((m) => m.y) }]} formatValue={fmtCompact} padLeft={52} ariaLabel="Solicitações por mês" />
              </div>
            </Panel>
          )}

          {l ? (
            <Panel title={`Central 156 — ligações por dia · ${l.periodLabel}`} icon={<PhoneCall size={16} />} subtitle={`Nível de serviço médio ${fmtPct(l.nivelServico)} · espera média ${l.esperaMediaSeg != null ? duration(l.esperaMediaSeg) : "—"} · atendimento médio ${l.atendimentoMedioSeg != null ? duration(l.atendimentoMedioSeg) : "—"} · ${fmtInt(l.abandonadas)} abandonadas`}>
              {l.series.length >= 2 ? (
                <div className="pb-6">
                  <AnimatedLineChart
                    labels={l.series.map((p) => `${p.x.slice(8, 10)}/${MONTHS[Number(p.x.slice(5, 7)) - 1]}`)}
                    series={[
                      { key: "e", label: "Recebidas", color: "#06b6d4", values: l.series.map((p) => p.entrantes) },
                      { key: "a", label: "Atendidas", color: "#10b981", values: l.series.map((p) => p.atendidas) },
                    ]}
                    formatValue={fmtCompact}
                    padLeft={52}
                    ariaLabel="Ligações recebidas e atendidas por dia"
                  />
                </div>
              ) : (
                <p className="text-sm text-rpg-muted">Poucos dias publicados para desenhar a série.</p>
              )}
            </Panel>
          ) : (
            d.ligacoesNote && <EmptyBox title="Central 156">{d.ligacoesNote}</EmptyBox>
          )}
        </>
      )}

      <ProtocolsPanel kind="sp156" notify={notify} officialUrl="https://sp156.prefeitura.sp.gov.br/" />

      {d && (
        <PublicSourceStrip
          source={d.source}
          fetchedAt={s?.fetchedAt}
          stale={s?.stale}
          reference={d.periodLabel}
          warnings={d.warnings}
          method="Contagens somadas no Portal de Dados Abertos sobre todas as solicitações do período (sem amostra). Tempo até finalizar = mediana dos dias entre abertura e finalização/parecer. Avaliações boas = excelente, ótimo ou bom entre as solicitações avaliadas."
          limitations={["Quantidade de pedidos não mede sozinha a qualidade de um serviço.", "Nem todo registro traz data, canal ou avaliação — cada painel usa só os que trazem.", "As ligações da central saem por semestre e podem atrasar em relação às solicitações."]}
        />
      )}
    </div>
  );
}
