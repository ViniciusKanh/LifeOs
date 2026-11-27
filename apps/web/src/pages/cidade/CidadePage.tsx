import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, Building2, CalendarClock, Gavel, Newspaper, Radar, Settings2, Sparkles, Syringe } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { IndicatorCard, KitSection, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityCatalog, useCityOverview } from "@/hooks/useCity";
import type { Block, CityDomain, Overview } from "@/services/cityService";
import { CityBanner, DOMAIN, EmptyBox, LoadingBlock, R, STATE_META, StateBadge, dateTimeBR, dayBR } from "@/components/city/CityKit";
import { CityConfigPanel } from "@/components/city/CityConfigPanel";
import { AlertsPanel, FavoritesPanel, HistoryPanel } from "@/components/city/PersonalPanels";

/** Grupos da categoria "Cidade Inteligente" — os mesmos do menu lateral. */
const GROUPS: Array<{ label: string; apis: string[] }> = [
  { label: "Notícias e Oportunidades", apis: ["dom", "licitacoes"] },
  { label: "Saúde e Educação", apis: ["fila", "escolas", "prato"] },
  { label: "Cidadania e Consumo", apis: ["procon", "sp156", "esic"] },
  { label: "Inteligência Territorial", apis: ["idhm", "censo", "lentidao"] },
  { label: "Finanças Públicas", apis: ["sof"] },
];

const LEVEL_LABEL: Record<string, string> = { sem_fila: "Sem fila", pequena: "Fila pequena", media: "Fila média", grande: "Fila grande", fechado: "Fechado", desconhecida: "Sem informação" };

type Tab = "radar" | "pessoal" | "config";

export function CidadePage() {
  const [params, setParams] = useSearchParams();
  const [notify, toast] = useLocalToast();
  const o = useCityOverview();
  const catalog = useCityCatalog();
  const tab: Tab = params.get("config") ? "config" : ((params.get("aba") as Tab | null) ?? "radar");
  const setTab = (t: Tab) => setParams(t === "radar" ? {} : t === "config" ? { config: "1" } : { aba: t }, { replace: true });

  const connected = o.data?.apis.filter((a) => a.state === "conectada").length ?? 0;
  const configured = !!o.data?.credential.source;

  return (
    <div className="space-y-4">
      {toast}
      <CityBanner domain="oportunidades" eyebrow="São Paulo" title="Visão Geral da Cidade" subtitle="O Radar da Cidade junta o que a Prefeitura publicou hoje com os seus interesses: Diário Oficial, licitações abertas e a fila dos postos de vacinação.">
        <RPGBadge tone={connected ? "green" : "muted"}>{connected}/12 APIs conectadas</RPGBadge>
        {o.data && <RPGBadge tone="gold">Referência {dayBR(o.data.referenceDay)}</RPGBadge>}
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
          <div className="space-y-3">
            <AlertsPanel notify={notify} />
            <HistoryPanel />
          </div>
        </div>
      ) : (
        <>
          {!configured && (
            <section className="flex flex-col gap-3 border-2 border-rpg-gold/60 bg-rpg-gold/10 p-4 sm:flex-row sm:items-center" style={R}>
              <Settings2 size={28} className="text-rpg-gold" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-rpg font-bold text-rpg-text">Conecte o APILIB da Prefeitura</p>
                <p className="text-sm text-rpg-text/85">As 12 APIs exigem uma credencial gratuita do Store do APILIB. Sem ela, nenhuma tela mostra dados — o LifeOS não inventa números.</p>
              </div>
              <RPGButton variant="gold" onClick={() => setTab("config")}>
                Configurar agora
              </RPGButton>
            </section>
          )}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <IndicatorCard icon={<Activity size={22} />} label="APIs conectadas" value={`${connected}/12`} tone="green" hint="após consulta real" />
            <IndicatorCard icon={<Newspaper size={22} />} label="Publicações no dia" value={o.data.radar.publications?.ok ? o.data.radar.publications.data.total : "—"} tone="gold" hint={dayBR(o.data.referenceDay)} />
            <IndicatorCard icon={<Gavel size={22} />} label="Licitações abertas" value={o.data.radar.tenders?.ok ? o.data.radar.tenders.data.open.length : "—"} tone="orange" hint="nos eventos do dia" />
            <IndicatorCard icon={<Syringe size={22} />} label="Postos na lista" value={o.data.radar.queue?.ok ? o.data.radar.queue.data.total : "—"} tone="green" hint="De Olho na Fila" />
          </div>
          <CityRadar o={o.data} />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                            {st && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.state === "conectada" ? "bg-rpg-green" : st.state === "nao_configurada" || st.state === "configurada" || st.state === "desativada" ? "bg-rpg-muted" : "bg-rpg-orange"}`} title={STATE_META[st.state].label} aria-label={STATE_META[st.state].label} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </KitSection>
        </>
      )}
    </div>
  );
}

function BlockState<T>({ b, children, off }: { b: Block<T>; children: (d: T) => ReactNode; off: string }) {
  if (b === null) return <p className="text-sm text-rpg-muted">{off}</p>;
  if (!b.ok)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {b.state && <StateBadge state={b.state} />}
        <span className="text-rpg-muted">{b.error}</span>
      </div>
    );
  return (
    <>
      {b.stale && <p className="mb-1 text-xs text-amber-300">Dados desatualizados — última cópia salva.</p>}
      {children(b.data)}
    </>
  );
}

function CityRadar({ o }: { o: Overview }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <KitSection title="Diário Oficial" icon={<Newspaper size={16} aria-hidden />} action={<Link to="/cidade/diario-oficial" className="text-xs text-rpg-blue">abrir</Link>}>
        <BlockState b={o.radar.publications} off="Ative o interesse “Oportunidades” para ver o Diário no radar.">
          {(d) =>
            d.matched.length ? (
              <ul className="space-y-1.5">
                {d.matched.map((p) => (
                  <li key={p.key} className="border-l-4 border-rpg-gold bg-rpg-bg-2/60 px-2 py-1">
                    <p className="line-clamp-2 text-sm text-rpg-text">{p.title}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {p.kind ?? "—"} · casou: {p.matches.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-rpg-muted">{d.total ? "Nada casou com seus alertas neste dia." : "Sem publicações no caderno principal neste dia."}</p>
                {d.byKind.map((k) => (
                  <p key={k.label} className="flex justify-between text-xs">
                    <span className="truncate text-rpg-text/90">{k.label}</span>
                    <span className="tabular-nums text-rpg-muted">{k.count}</span>
                  </p>
                ))}
              </div>
            )
          }
        </BlockState>
      </KitSection>
      <KitSection title="Licitações abertas" icon={<Gavel size={16} aria-hidden />} action={<Link to="/cidade/licitacoes" className="text-xs text-rpg-blue">abrir</Link>}>
        <BlockState b={o.radar.tenders} off="Ative o interesse “Oportunidades” para ver licitações no radar.">
          {(d) =>
            d.open.length ? (
              <ul className="space-y-1.5">
                {d.open.map((t) => (
                  <li key={t.key} className="border-l-4 border-rpg-green bg-rpg-bg-2/60 px-2 py-1">
                    <p className="line-clamp-2 text-sm text-rpg-text">{t.object}</p>
                    <p className="flex items-center gap-1 text-[11px] text-rpg-muted">
                      <CalendarClock size={11} aria-hidden /> {t.nextDeadline ? `${t.nextDeadline.label}: ${dateTimeBR(t.nextDeadline.at)}` : "sem data"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-rpg-muted">Nenhum evento com prazo futuro publicado em {dayBR(d.day)}.</p>
            )
          }
        </BlockState>
      </KitSection>
      <KitSection title="Fila da vacinação" icon={<Syringe size={16} aria-hidden />} action={<Link to="/cidade/de-olho-na-fila" className="text-xs text-rpg-blue">abrir</Link>}>
        <BlockState b={o.radar.queue} off="Ative o interesse “Saúde” para ver a fila no radar.">
          {(d) => (
            <div className="space-y-1">
              {d.byLevel.map((l) => (
                <p key={l.label} className="flex justify-between text-sm">
                  <span className="text-rpg-text/90">{LEVEL_LABEL[l.label] ?? l.label}</span>
                  <span className="tabular-nums text-rpg-muted">{l.count} posto(s)</span>
                </p>
              ))}
              {d.outdated > 0 && <p className="text-xs text-amber-300">{d.outdated} posto(s) sem atualização nas últimas 3 h.</p>}
            </div>
          )}
        </BlockState>
      </KitSection>
    </div>
  );
}

function Interests({ o, notify }: { o: Overview; notify: (m: string, t?: "success" | "error") => void }) {
  const a = useCityActions();
  const [sel, setSel] = useState<CityDomain[]>(o.prefs.interests);
  const all = Object.keys(DOMAIN) as CityDomain[];
  return (
    <KitSection title="Personalizar o radar" icon={<Sparkles size={16} aria-hidden />}>
      <p className="mb-2 text-xs text-rpg-muted">Escolha os temas que entram no Radar. Os alertas por palavra-chave ficam em “Meus registros”.</p>
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
