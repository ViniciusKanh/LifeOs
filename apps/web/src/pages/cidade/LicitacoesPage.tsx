import { useMemo, useState } from "react";
import { CalendarClock, Gavel, History, ScrollText } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { IndicatorCard, KitSection, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityFavorites, useDomTenders } from "@/hooks/useCity";
import type { Row, TenderEvent, TenderPhase } from "@/services/cityService";
import { CityBanner, CityError, EmptyBox, FavoriteButton, LoadingBlock, OracleBox, R, Select, SourceStrip, TextInput, dateTimeBR, dayBR, money } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";
import { lastBusinessDay, todayInSaoPaulo } from "./cityDates";

const PHASE: Record<TenderPhase, { label: string; tone: "green" | "orange" | "muted" | "red" }> = {
  aberta: { label: "Aberta — prazo futuro", tone: "green" },
  em_andamento: { label: "Em andamento", tone: "orange" },
  sem_data: { label: "Sem data informada", tone: "muted" },
  encerrada: { label: "Encerrada", tone: "red" },
};
const VALUE_LABEL = { estimado: "Estimado", homologado: "Homologado", contratado: "Contratado" } as const;

type Tab = "eventos" | "historico";

export function LicitacoesPage() {
  const [tab, setTab] = useState<Tab>("eventos");
  return (
    <div className="space-y-3">
      <CityBanner domain="oportunidades" eyebrow="Notícias e Oportunidades" title="Licitações" subtitle="Eventos de licitação publicados no Diário Oficial (o que ainda está aberto) e a série histórica de contratos assinados (2005–2019).">
        <RPGBadge tone="green">Encerradas nunca aparecem como abertas</RPGBadge>
      </CityBanner>
      <ModuleTabs<Tab>
        label="Fontes de licitações"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "eventos", label: "Eventos do Diário", icon: <Gavel size={15} aria-hidden /> },
          { value: "historico", label: "Contratos 2005–2019", icon: <History size={15} aria-hidden /> },
        ]}
      />
      {tab === "eventos" ? (
        <TenderEvents />
      ) : (
        <DatasetExplorer
          apiId="licitacoes"
          domain="oportunidades"
          resources={[{ id: "contratos", label: "Extratos de contratos" }]}
          initial={{ ano: "2019" }}
          prefer={["Objeto", "Orgao", "Fornecedor", "ValorContrato", "Modalidade", "DataAssinaturaExtrato", "NumeroProcesso"]}
          csvName="licitacoes-contratos"
          oracleSuggestions={["Quais modalidades aparecem mais?", "Quais órgãos têm mais contratos nesta amostra?"]}
          insights={(rows) => <ContractInsights rows={rows} />}
        />
      )}
    </div>
  );
}

function ContractInsights({ rows }: { rows: Row[] }) {
  const values = rows.map((r) => Number(String(r.ValorContrato ?? r.valorcontrato ?? "").replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0);
  const sum = values.reduce((s, n) => s + n, 0);
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <IndicatorCard icon={<ScrollText size={22} />} label="Contratos na amostra" value={rows.length} tone="gold" />
      <IndicatorCard icon={<Gavel size={22} />} label="Valor contratado (soma)" value={values.length ? money(sum) : "—"} tone="green" hint={`${values.length} com valor · só a amostra`} />
      <IndicatorCard icon={<History size={22} />} label="Natureza" value="Contratos assinados" tone="orange" hint="não são oportunidades abertas" />
    </div>
  );
}

function TenderEvents() {
  const [notify, toast] = useLocalToast();
  const [day, setDay] = useState(lastBusinessDay(todayInSaoPaulo()));
  const [phase, setPhase] = useState<"ativas" | TenderPhase>("ativas");
  const [q, setQ] = useState("");
  const t = useDomTenders(day, 11);
  const favs = useCityFavorites("dom");
  const saved = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);
  const all = t.data?.tenders ?? [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((x) => (phase === "ativas" ? x.phase === "aberta" || x.phase === "em_andamento" : x.phase === phase))
      .filter((x) => !s || [x.object, x.agency, x.segment, x.modality, x.process].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => (a.nextDeadline?.at ?? "9").localeCompare(b.nextDeadline?.at ?? "9"));
  }, [all, phase, q]);
  const count = (p: TenderPhase) => all.filter((x) => x.phase === p).length;

  return (
    <div className="space-y-3">
      {toast}
      <section className="rpg-panel p-3" aria-label="Filtros">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <TextInput label="Data de publicação" type="date" value={day} onChange={(v) => v && setDay(v)} />
          <Select
            label="Fase"
            value={phase}
            onChange={(v) => setPhase(v as typeof phase)}
            options={[
              { value: "ativas", label: `Abertas e em andamento (${count("aberta") + count("em_andamento")})` },
              { value: "aberta", label: `Só abertas (${count("aberta")})` },
              { value: "sem_data", label: `Sem data (${count("sem_data")})` },
              { value: "encerrada", label: `Encerradas (${count("encerrada")})` },
            ]}
          />
          <TextInput label="Buscar" value={q} onChange={setQ} placeholder="objeto, órgão, segmento…" className="col-span-2 sm:col-span-1" />
        </div>
      </section>
      <SourceStrip apiId="dom" meta={t.data} reference={`Eventos publicados em ${dayBR(day)} · caderno 11`} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <KitSection title={`Eventos (${list.length})`} icon={<Gavel size={16} aria-hidden />}>
          {t.isLoading ? (
            <LoadingBlock />
          ) : t.isError ? (
            <CityError error={t.error} onRetry={() => void t.refetch()} />
          ) : !list.length ? (
            <EmptyBox title={all.length ? "Nenhum evento nesta fase." : "Nenhum evento de licitação publicado neste dia."} />
          ) : (
            <ul className="space-y-2">
              {list.map((x) => (
                <TenderCard key={x.key} t={x} saved={saved.has(x.key)} notify={notify} />
              ))}
            </ul>
          )}
        </KitSection>
        <OracleBox apiId="dom" resource="licitacoes" params={{ dataPublicacao: day, caderno: 11 }} disabled={!all.length} suggestions={["Quais segmentos aparecem?", "Quais prazos vencem primeiro?"]} />
      </div>
    </div>
  );
}

function TenderCard({ t, saved, notify }: { t: TenderEvent; saved: boolean; notify: (m: string, tone?: "success" | "error") => void }) {
  const p = PHASE[t.phase];
  return (
    <li className="min-w-0 border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1">
            <RPGBadge tone={p.tone}>{p.label}</RPGBadge>
            {t.modality && <RPGBadge tone="muted">{t.modality}</RPGBadge>}
            {t.event && <RPGBadge tone="muted">{t.event}</RPGBadge>}
          </div>
          <p className="text-sm font-semibold text-rpg-text">{t.object}</p>
          <p className="mt-0.5 text-xs text-rpg-muted">{[t.agency, t.segment, t.place, t.process && `Processo ${t.process}`].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {t.nextDeadline && (
              <span className="inline-flex items-center gap-1 text-rpg-green">
                <CalendarClock size={12} aria-hidden /> {t.nextDeadline.label}: {dateTimeBR(t.nextDeadline.at)}
              </span>
            )}
            {t.values.map((v) => (
              <span key={v.kind} className="text-rpg-text/90">
                {VALUE_LABEL[v.kind]}: <strong className="tabular-nums">{money(v.value)}</strong>
              </span>
            ))}
            {!t.values.length && <span className="text-rpg-muted">Valor não informado no evento</span>}
            {t.contractor && <span className="text-rpg-muted">Contratado: {t.contractor}</span>}
          </div>
        </div>
        <FavoriteButton
          apiId="dom"
          itemKey={t.key}
          title={t.object.slice(0, 280)}
          subtitle={[p.label, t.nextDeadline ? `${t.nextDeadline.label} ${dateTimeBR(t.nextDeadline.at)}` : null, t.agency].filter(Boolean).join(" · ")}
          payload={{ fase: t.phase, prazo: t.nextDeadline?.at ?? null, orgao: t.agency, processo: t.process }}
          saved={saved}
          notify={notify}
        />
      </div>
    </li>
  );
}
