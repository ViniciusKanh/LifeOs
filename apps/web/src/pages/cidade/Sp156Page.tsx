import { useState } from "react";
import { Clock3, Headphones, Hourglass, LayoutGrid, LineChart, ListChecks, MapPinned, PhoneCall, Radio, Table2 } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { CityBanner, CityError, EmptyBox, LoadingBlock, SourceStrip, duration, useCityActivity } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";
import { BarList } from "@/components/city/InsightsPanel";
import { ProtocolsPanel } from "@/components/city/PersonalPanels";
import { BigStat, Collapsible, HeatGrid, Panel, Pills, RankList, fmtCompact, fmtInt, fmtPct } from "@/components/city/civic/CivicKit";
import { useCityActions, useSp156 } from "@/hooks/useCity";

/**
 * Central do Cidadão (SP156): o que a cidade pede, onde, por qual canal e quanto demora —
 * e como a central telefônica atendeu no semestre. Protocolos pessoais ao final.
 */

const NOW = new Date();
const LAST = NOW.getMonth() >= 6 ? { ano: NOW.getFullYear(), semestre: 1 } : { ano: NOW.getFullYear() - 1, semestre: 2 };
/** Semestres oferecidos: os 8 mais recentes já fechados. */
const SEMESTERS = Array.from({ length: 8 }, (_, i) => {
  const idx = LAST.ano * 2 + (LAST.semestre - 1) - i;
  return `${Math.floor(idx / 2)}-${(idx % 2) + 1}`;
});
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const days = (n: number | null) => (n == null ? "—" : n < 1 ? "menos de 1 dia" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${n >= 2 ? "s" : ""}`);

export function Sp156Page() {
  const [notify, toast] = useLocalToast();
  const [sem, setSem] = useState(`${LAST.ano}-${LAST.semestre}`);
  const [ano, semestre] = sem.split("-").map(Number) as [number, number];
  const q = useSp156(ano, semestre);
  const a = useCityActions();
  useCityActivity("sp156", "explore", q.isSuccess ? `panorama:${sem}` : null, "SP156");
  const territory = (name: string) =>
    a.activity.mutate({ api: "sp156", action: "territory", ref: name.slice(0, 120), label: name.slice(0, 150) }, { onSuccess: (r) => notify(r.recorded ? `Território explorado: ${name}` : `${name} já explorado hoje.`) });
  const s = q.data?.solicitacoes;
  const l = q.data?.ligacoes;

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="cidadania" eyebrow="Cidadania e Consumo" title="Central do Cidadão" subtitle="O que os paulistanos pedem à Prefeitura pelo SP156 — temas, serviços, subprefeituras e quanto tempo leva para resolver — e como a central 156 atendeu as ligações.">
        <RPGBadge tone="cyan">SP156 · somente leitura</RPGBadge>
      </CityBanner>

      <Pills items={SEMESTERS} value={sem} onChange={setSem} label="Semestre" render={(v) => `${v.split("-")[1]}º sem/${v.split("-")[0]}`} />

      {q.isLoading ? (
        <LoadingBlock label="Lendo as solicitações e a central 156…" rows={5} />
      ) : q.isError ? (
        <CityError error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? null : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <BigStat label="Solicitações no semestre" value={fmtInt(s?.total ?? s?.loaded)} hint={s ? "total oficial da base" : (q.data.solicitacoesError ?? "sem base de solicitações")} accent="bg-cyan-500" icon={<ListChecks size={20} />} />
            <BigStat label="Tempo até finalizar" value={days(s?.medianDays ?? null)} hint={s?.daysBase ? `mediana de ${fmtInt(s.daysBase)} solicitações com as duas datas` : "a base não traz as datas"} accent="bg-amber-500" icon={<Hourglass size={20} />} />
            <BigStat label="Ligações recebidas" value={fmtInt(l?.entrantes)} hint={l ? `${fmtInt(l.days)} dias da central 156` : "sem dados da central"} accent="bg-sky-500" icon={<PhoneCall size={20} />} />
            <BigStat label="Ligações atendidas" value={fmtPct(l?.taxaAtendimento)} hint={l?.esperaMediaSeg != null ? `espera média de ${duration(l.esperaMediaSeg)}` : undefined} accent="bg-emerald-500" icon={<Headphones size={20} />} />
          </div>

          {s ? (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                <Panel title="O que a cidade mais pede" icon={<LayoutGrid size={16} />} subtitle={`Temas nas ${fmtInt(s.loaded)} solicitações lidas`}>
                  <BarList title="Temas" items={s.temas.map((t) => ({ label: t.label, value: t.count }))} format={fmtInt} tone="cyan" />
                </Panel>
                <Panel title="Serviços mais solicitados" icon={<ListChecks size={16} />}>
                  <RankList items={s.servicos.map((x) => ({ label: x.label, value: fmtInt(x.count) }))} />
                </Panel>
              </div>
              <Panel title="Onde: subprefeituras" icon={<MapPinned size={16} />} subtitle="Clique numa subprefeitura para marcá-la como território explorado">
                {s.subprefeituras.length ? <HeatGrid items={s.subprefeituras} onPick={territory} label="Solicitações por subprefeitura" /> : <p className="text-sm text-rpg-muted">A base deste semestre não traz a subprefeitura.</p>}
              </Panel>
              <div className="grid gap-3 lg:grid-cols-3">
                <Panel title="Situação" icon={<Clock3 size={16} />}>
                  <BarList title="Status da solicitação" items={s.status.map((x) => ({ label: x.label, value: x.count }))} format={fmtInt} tone="cyan" />
                </Panel>
                <Panel title="Canais de entrada" icon={<Radio size={16} />}>
                  <BarList title="Canal" items={s.canais.map((x) => ({ label: x.label, value: x.count }))} format={fmtInt} tone="blue" />
                </Panel>
                <Panel title="Temas mais demorados" icon={<Hourglass size={16} />} subtitle="Mediana de dias até finalizar (mín. 5 casos)">
                  {s.slowestThemes.length ? <RankList items={s.slowestThemes.map((t) => ({ label: t.label, value: days(t.medianDays) }))} /> : <p className="text-sm text-rpg-muted">Sem datas suficientes neste semestre.</p>}
                </Panel>
              </div>
            </>
          ) : (
            <EmptyBox title="As solicitações deste semestre não estão disponíveis.">{q.data.solicitacoesError}</EmptyBox>
          )}

          {l && (
            <Panel title="Central 156 — ligações por dia" icon={<LineChart size={16} />} subtitle={`Nível de serviço médio ${fmtPct(l.nivelServico)} · atendimento médio ${l.atendimentoMedioSeg != null ? duration(l.atendimentoMedioSeg) : "—"} · ${fmtInt(l.abandonadas)} abandonadas`}>
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
          )}
        </>
      )}

      <ProtocolsPanel kind="sp156" notify={notify} officialUrl="https://sp156.prefeitura.sp.gov.br/" />

      <SourceStrip apiId="sp156" meta={s ?? null} reference={`${semestre}º semestre de ${ano}`} />

      <Collapsible title="Todos os registros e Oráculo" icon={<Table2 size={16} className="text-cyan-300" aria-hidden />}>
        <DatasetExplorer
          apiId="sp156"
          domain="cidadania"
          resources={[
            { id: "solicitacoes", label: "Solicitações" },
            { id: "ligacoes", label: "Ligações (central 156)" },
            { id: "avaliacao", label: "Avaliação do atendimento" },
          ]}
          initial={{ ano: String(ano), semestre: String(semestre) }}
          prefer={[/^servico$/, /^tema$/, /^assunto$/, /^subprefeitura$/, /status/, /data de abertura/, /^data$/, /entrantes/, /ligacoes atendidas$/, /nivel de servico/, /tempo medio/]}
          titleField={/^servico$|^data$/}
          csvName="sp156"
          totalLabel="Registros no semestre"
          oracleSuggestions={["Quais serviços são mais pedidos?", "Em quais subprefeituras há mais solicitações?"]}
        />
      </Collapsible>
    </div>
  );
}
