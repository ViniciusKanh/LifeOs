import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, FileSearch, Gavel, Landmark, PhoneCall, PowerOff, Radar, Settings2, Sparkles } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityCatalog, useCityOverview } from "@/hooks/useCity";
import type { Block, CityDomain, Overview, RadarData } from "@/services/cityService";
import { CityBanner, DOMAIN, EmptyBox, LoadingBlock, R, STATE_META, StateBadge, formatValue } from "@/components/city/CityKit";
import { BarList, Kpi } from "@/components/city/InsightsPanel";
import { CityConfigPanel } from "@/components/city/CityConfigPanel";
import { FavoritesPanel, HistoryPanel } from "@/components/city/PersonalPanels";

/** Grupos da categoria "Cidade Inteligente" — os mesmos do menu lateral. */
const GROUPS: Array<{ label: string; apis: string[] }> = [
  { label: "Oportunidades", apis: ["licitacoes"] },
  { label: "Educação", apis: ["escolas", "prato"] },
  { label: "Cidadania e Consumo", apis: ["procon", "sp156", "esic"] },
  { label: "Território", apis: ["lentidao"] },
  { label: "Finanças Públicas", apis: ["sof"] },
];

/** Fontes retiradas por estarem fora do ar ou bloqueadas pela Prefeitura (27/11/2026). */
const OFFLINE = [
  { name: "Diário Oficial", why: "sistema suspenso no APILIB (303001)" },
  { name: "De Olho na Fila", why: "sistema suspenso no APILIB (303001)" },
  { name: "IDHM", why: "conjunto bloqueado no Portal de Dados Abertos" },
  { name: "Censo Demográfico", why: "conjunto bloqueado no Portal de Dados Abertos" },
];

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type Tab = "radar" | "pessoal" | "config";

export function CidadePage() {
  const [params, setParams] = useSearchParams();
  const [notify, toast] = useLocalToast();
  const o = useCityOverview();
  const catalog = useCityCatalog();
  const tab: Tab = params.get("config") ? "config" : ((params.get("aba") as Tab | null) ?? "radar");
  const setTab = (t: Tab) => setParams(t === "radar" ? {} : t === "config" ? { config: "1" } : { aba: t }, { replace: true });
  const connected = o.data?.apis.filter((a) => a.state === "conectada").length ?? 0;
  const total = o.data?.apis.length ?? 8;

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="oportunidades" eyebrow="São Paulo" title="Visão Geral da Cidade" subtitle="Um retrato da Prefeitura com dados oficiais: orçamento do mês, pedidos de informação, atendimento do SP156 e contratos — e os seus registros.">
        <RPGBadge tone={connected ? "green" : "muted"}>
          {connected}/{total} fontes conectadas
        </RPGBadge>
      </CityBanner>

      <ModuleTabs<Tab>
        label="Seções da Cidade Inteligente"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "radar", label: "Radar da Cidade", icon: <Radar size={15} aria-hidden /> },
          { value: "pessoal", label: "Meus registros", icon: <Sparkles size={15} aria-hidden />, badge: o.data?.favoritesTotal || undefined },
          { value: "config", label: "Conexão APILIB", icon: <Settings2 size={15} aria-hidden /> },
        ]}
      />

      {tab === "config" ? (
        <CityConfigPanel notify={notify} />
      ) : o.isLoading ? (
        <LoadingBlock label="Montando o Radar da Cidade…" rows={5} />
      ) : o.isError || !o.data ? (
        <EmptyBox title="Não foi possível carregar a visão geral.">
          <RPGButton variant="secondary" onClick={() => void o.refetch()}>
            Tentar de novo
          </RPGButton>
        </EmptyBox>
      ) : tab === "pessoal" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <FavoritesPanel notify={notify} />
          <HistoryPanel />
        </div>
      ) : (
        <>
          {!o.data.credential.source && (
            <section className="flex flex-col gap-3 border-2 border-rpg-gold/60 bg-rpg-gold/10 p-4 sm:flex-row sm:items-center" style={R}>
              <Settings2 size={28} className="text-rpg-gold" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-rpg font-bold text-rpg-text">Conecte o APILIB da Prefeitura</p>
                <p className="text-sm text-rpg-text/85">As fontes exigem uma credencial gratuita do Store do APILIB. Sem ela, nenhuma tela mostra dados — o LifeOS não inventa números.</p>
              </div>
              <RPGButton variant="gold" onClick={() => setTab("config")}>
                Configurar agora
              </RPGButton>
            </section>
          )}
          <CityRadar o={o.data} />
          <div className="grid gap-3 lg:grid-cols-2">
            <FavoritesPanel notify={notify} compact />
            <Interests o={o.data} notify={notify} />
          </div>
          <KitSection title="Mapa do módulo" icon={<Building2 size={16} aria-hidden />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {GROUPS.map((g) => (
                <div key={g.label} className="min-w-0">
                  <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-gold">{g.label}</p>
                  <ul className="space-y-1">
                    {g.apis.map((id) => {
                      const c = catalog.data?.find((x) => x.id === id);
                      const st = o.data.apis.find((x) => x.api === id);
                      if (!c) return null;
                      return (
                        <li key={id}>
                          <Link to={c.route} className="flex min-h-[40px] min-w-0 items-center gap-2 border-2 border-rpg-border bg-rpg-bg-2/60 px-2 hover:border-rpg-gold" style={R}>
                            <span className="h-6 w-1.5 shrink-0" style={{ background: DOMAIN[c.domain].to }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{c.name}</span>
                            {st && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.state === "conectada" ? "bg-rpg-green" : ["nao_configurada", "configurada", "desativada"].includes(st.state) ? "bg-rpg-muted" : "bg-rpg-orange"}`} title={STATE_META[st.state].label} aria-label={STATE_META[st.state].label} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-rpg-border pt-2 text-xs text-rpg-muted">
              <PowerOff size={13} aria-hidden /> Fora do ar na Prefeitura (voltam quando forem reativadas):
              {OFFLINE.map((x) => (
                <span key={x.name} title={x.why} className="border border-rpg-border px-1.5 py-0.5" style={R}>
                  {x.name}
                </span>
              ))}
            </p>
          </KitSection>
        </>
      )}
    </div>
  );
}

function RadarCard({ title, icon, to, b, off, children }: { title: string; icon: ReactNode; to: string; b: Block<RadarData>; off: string; children: (d: RadarData) => ReactNode }) {
  return (
    <KitSection
      title={title}
      icon={icon}
      action={
        <Link to={to} className="text-xs text-rpg-blue">
          abrir
        </Link>
      }
    >
      {b === null ? (
        <p className="text-sm text-rpg-muted">{off}</p>
      ) : !b.ok ? (
        <div className="space-y-1 text-sm">
          {b.state && <StateBadge state={b.state} />}
          <p className="text-rpg-muted">{b.error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {b.stale && <p className="text-xs text-amber-300">Dados desatualizados — última cópia salva.</p>}
          {children(b.data)}
          <p className="text-[11px] text-rpg-muted">Leituras sobre {b.data.sample.toLocaleString("pt-BR")} registro(s){b.data.truncated ? " (amostra parcial)" : ""}.</p>
        </div>
      )}
    </KitSection>
  );
}

const measure = (d: RadarData, label: string) => d.insights?.measures.find((m) => m.label === label);

function CityRadar({ o }: { o: Overview }) {
  const r = o.radar;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <RadarCard title="Orçamento da cidade" icon={<Landmark size={16} aria-hidden />} to="/cidade/sof" b={r.orcamento} off="Ative o tema “Finanças públicas” para ver o orçamento no radar.">
        {(d) => {
          const orc = measure(d, "Orçado atualizado");
          const pago = measure(d, "Pago no exercício");
          const emp = measure(d, "Empenhado líquido");
          return (
            <>
              <p className="text-xs text-rpg-muted">
                Acumulado até {MONTHS[Number(d.params.mesDotacao) - 1]} de {d.params.anoDotacao}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Kpi label="Orçado atualizado" value={orc ? formatValue("money", orc.value, { short: true }) : "—"} tone="gold" />
                <Kpi label="Empenhado" value={emp ? formatValue("money", emp.value, { short: true }) : "—"} tone="gold" />
                <Kpi label="Pago" value={pago ? formatValue("money", pago.value, { short: true }) : "—"} hint={orc && pago && orc.value > 0 ? `${((pago.value / orc.value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do orçado` : undefined} tone="green" />
              </div>
              {d.insights?.ranking && <BarList title={d.insights.ranking.label} items={d.insights.ranking.items.slice(0, 5)} format={(v) => formatValue("money", v, { short: true })} tone="gold" />}
            </>
          );
        }}
      </RadarCard>
      <RadarCard title="Transparência (e-SIC)" icon={<FileSearch size={16} aria-hidden />} to="/cidade/e-sic" b={r.transparencia} off="Ative o tema “Cidadania” para ver o e-SIC no radar.">
        {(d) => (
          <>
            <Kpi label={`Pedidos de informação em ${d.params.ano}`} value={d.total?.toLocaleString("pt-BR") ?? "—"} hint="total oficial da base" tone="cyan" />
            {d.insights?.dims.map((dim) => (
              <BarList key={dim.label} title={dim.label} items={dim.items.slice(0, 5).map((i) => ({ label: i.label, value: i.count }))} format={(v) => v.toLocaleString("pt-BR")} tone="cyan" />
            ))}
          </>
        )}
      </RadarCard>
      <RadarCard title="Atendimento SP156" icon={<PhoneCall size={16} aria-hidden />} to="/cidade/sp156" b={r.atendimento} off="Ative o tema “Cidadania” para ver o SP156 no radar.">
        {(d) => (
          <>
            <Kpi label={`Solicitações no ${d.params.semestre}º semestre de ${d.params.ano}`} value={d.total?.toLocaleString("pt-BR") ?? "—"} hint="total oficial da base" tone="cyan" />
            {d.insights?.dims.slice(0, 2).map((dim) => (
              <BarList key={dim.label} title={dim.label} items={dim.items.slice(0, 5).map((i) => ({ label: i.label, value: i.count }))} format={(v) => v.toLocaleString("pt-BR")} tone="cyan" />
            ))}
          </>
        )}
      </RadarCard>
      <RadarCard title="Contratos públicos" icon={<Gavel size={16} aria-hidden />} to="/cidade/licitacoes" b={r.contratos} off="Ative o tema “Oportunidades” para ver os contratos no radar.">
        {(d) => {
          const soma = measure(d, "Valor contratado (soma)");
          return (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Kpi label={`Extratos em ${d.params.ano}`} value={d.total?.toLocaleString("pt-BR") ?? "—"} hint="total oficial da base" tone="green" />
                <Kpi label="Valor contratado" value={soma ? formatValue("money", soma.value, { short: true }) : "—"} hint="soma da amostra" tone="gold" />
              </div>
              {d.insights?.ranking && <BarList title={d.insights.ranking.label} items={d.insights.ranking.items.slice(0, 5)} format={(v) => formatValue("money", v, { short: true })} tone="green" />}
            </>
          );
        }}
      </RadarCard>
    </div>
  );
}

function Interests({ o, notify }: { o: Overview; notify: (m: string, t?: "success" | "error") => void }) {
  const a = useCityActions();
  const [sel, setSel] = useState<CityDomain[]>(o.prefs.interests);
  const all = Object.keys(DOMAIN) as CityDomain[];
  return (
    <KitSection title="Personalizar o radar" icon={<Sparkles size={16} aria-hidden />}>
      <p className="mb-2 text-xs text-rpg-muted">Escolha os temas que entram no Radar. Menos temas, radar mais rápido.</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Interesses">
        {all.map((d) => {
          const on = sel.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== d) : [...s, d]))} className={`min-h-[36px] border-2 px-2.5 text-xs font-semibold ${on ? `${DOMAIN[d].border} ${DOMAIN[d].text} bg-white/5` : "border-rpg-border text-rpg-muted"}`} style={R}>
              {DOMAIN[d].label}
            </button>
          );
        })}
      </div>
      <RPGButton className="mt-3" variant="primary" disabled={a.savePrefs.isPending || !sel.length} onClick={() => a.savePrefs.mutate({ interests: sel, widgets: o.prefs.widgets }, { onSuccess: () => notify("Radar personalizado."), onError: (e) => notify(e instanceof Error ? e.message : "Falha ao salvar.", "error") })}>
        Salvar interesses
      </RPGButton>
    </KitSection>
  );
}
