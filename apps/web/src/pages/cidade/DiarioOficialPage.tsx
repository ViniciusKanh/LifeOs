import { useMemo, useState } from "react";
import { BookOpenCheck, FileText, Newspaper, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { useLocalToast } from "@/components/integrations/PublicApiKit";
import { useCityActions, useCityFavorites, useDom } from "@/hooks/useCity";
import { cityService, type Publication } from "@/services/cityService";
import { CityBanner, CityError, EmptyBox, FavoriteButton, LoadingBlock, OracleBox, R, Select, SourceStrip, TextInput, dayBR } from "@/components/city/CityKit";
import { AlertsPanel } from "@/components/city/PersonalPanels";
import { todayInSaoPaulo, lastBusinessDay } from "./cityDates";

const STATUS_TONE = { publicado: "green", recebido: "blue", cancelado: "red", teste: "muted", outro: "muted" } as const;

export function DiarioOficialPage() {
  const [notify, toast] = useLocalToast();
  const qc = useQueryClient();
  const [day, setDay] = useState(lastBusinessDay(todayInSaoPaulo()));
  const [caderno, setCaderno] = useState("11");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const cad = Math.max(1, Math.min(999, Number(caderno) || 11));
  const dom = useDom(day, cad);
  const favs = useCityFavorites("dom");
  const a = useCityActions();
  const [read, setRead] = useState<Set<string>>(new Set());
  const saved = useMemo(() => new Set((favs.data ?? []).map((f) => f.itemKey)), [favs.data]);

  const pubs = dom.data?.publications ?? [];
  const kinds = useMemo(() => [...new Set(pubs.map((p) => p.kind ?? "Sem tipo"))].sort(), [pubs]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pubs
      .filter((p) => showHidden || (p.status !== "cancelado" && p.status !== "teste"))
      .filter((p) => !kind || (p.kind ?? "Sem tipo") === kind)
      .filter((p) => !t || [p.title, p.kind, p.advertiser, p.section, ...p.files].some((x) => x?.toLowerCase().includes(t)))
      .sort((x, y) => y.matches.length - x.matches.length);
  }, [pubs, q, kind, showHidden]);

  const markRead = (p: Publication) => {
    if (read.has(p.key)) return;
    setRead((s) => new Set(s).add(p.key));
    a.activity.mutate({ api: "dom", action: "read", ref: p.key.slice(0, 120), label: p.title.slice(0, 150) }, { onSuccess: (r) => r.xp && notify(`Leitura registrada. +${r.xp} XP`) });
  };

  const refresh = async () => {
    try {
      const fresh = await cityService.dom(day, cad, true);
      qc.setQueryData(["city", "dom", day, cad], fresh);
      notify(fresh.stale ? "A Prefeitura não respondeu; mantida a última cópia." : "Diário atualizado.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar.", "error");
    }
  };

  return (
    <div className="space-y-3">
      {toast}
      <CityBanner domain="oportunidades" eyebrow="Notícias e Oportunidades" title="Diário Oficial da Cidade" subtitle="O que a Prefeitura publicou no dia, com os seus alertas destacados. A API traz metadados e arquivos — o texto integral fica no PDF oficial.">
        <RPGBadge tone="gold">{dayBR(day)}</RPGBadge>
      </CityBanner>

      <section className="rpg-panel p-3" aria-label="Filtros">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
          <TextInput label="Data" type="date" value={day} onChange={(v) => v && setDay(v)} />
          <TextInput label="Caderno (11 = Cidade de SP)" value={caderno} onChange={(v) => setCaderno(v.replace(/\D/g, "").slice(0, 3))} />
          <Select label="Tipo de matéria" value={kind} onChange={setKind} options={[{ value: "", label: "Todos" }, ...kinds.map((k) => ({ value: k, label: k }))]} />
          <TextInput label="Buscar nos metadados" value={q} onChange={setQ} placeholder="secretaria, retranca…" className="col-span-2 sm:col-span-1" />
          <label className="col-span-2 flex min-h-[40px] items-center gap-2 text-xs text-rpg-muted sm:col-span-1">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Mostrar canceladas e testes
          </label>
          <RPGButton variant="secondary" onClick={refresh} disabled={!dom.isSuccess}>
            <RefreshCw size={14} aria-hidden /> Atualizar
          </RPGButton>
        </div>
      </section>

      <SourceStrip apiId="dom" meta={dom.data} reference={`Publicação de ${dayBR(day)} · caderno ${cad}`} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <KitSection title={`Publicações (${list.length})`} icon={<Newspaper size={16} aria-hidden />}>
          {dom.isLoading ? (
            <LoadingBlock />
          ) : dom.isError ? (
            <CityError error={dom.error} onRetry={() => void dom.refetch()} />
          ) : !list.length ? (
            <EmptyBox title={pubs.length ? "Nada com esses filtros." : "Nenhuma publicação neste dia e caderno."}>Fins de semana e feriados não têm edição.</EmptyBox>
          ) : (
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.key} className={`min-w-0 border-2 bg-rpg-bg-2/60 p-2.5 ${p.matches.length ? "border-rpg-gold/70" : "border-rpg-border"}`} style={R}>
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap gap-1">
                        <RPGBadge tone={STATUS_TONE[p.status]}>{p.statusLabel ?? p.status}</RPGBadge>
                        {p.kind && <RPGBadge tone="muted">{p.kind}</RPGBadge>}
                        {p.matches.map((m) => (
                          <RPGBadge key={m} tone="gold">
                            alerta: {m}
                          </RPGBadge>
                        ))}
                      </div>
                      <p className="text-sm font-semibold text-rpg-text">{p.title}</p>
                      <p className="mt-0.5 text-xs text-rpg-muted">{[p.advertiser, p.section, p.notebook].filter(Boolean).join(" · ")}</p>
                      {!!p.files.length && (
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-rpg-muted">
                          <FileText size={12} aria-hidden /> {p.files.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <FavoriteButton apiId="dom" itemKey={p.key} title={p.title} subtitle={[p.kind, p.advertiser, dayBR(p.date)].filter(Boolean).join(" · ")} payload={{ tipo: p.kind, anunciante: p.advertiser, data: p.date }} saved={saved.has(p.key)} notify={notify} />
                      <button type="button" onClick={() => markRead(p)} disabled={read.has(p.key)} className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center border-2 ${read.has(p.key) ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted hover:text-rpg-green"}`} style={R} aria-label={read.has(p.key) ? "Lida" : `Marcar ${p.title} como lida`}>
                        <BookOpenCheck size={15} aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </KitSection>
        <aside className="min-w-0 space-y-3">
          <AlertsPanel notify={notify} />
          <OracleBox apiId="dom" resource="publicacoes" params={{ dataPublicacao: day, caderno: cad }} disabled={!pubs.length} suggestions={["Quais secretarias mais publicaram?", "Há chamamentos ou editais?"]} />
        </aside>
      </div>
    </div>
  );
}
