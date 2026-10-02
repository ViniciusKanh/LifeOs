import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, Layers, Lightbulb, RefreshCw, Search, Share2, Target, Unlink, X } from "lucide-react";
import { useLifeMap } from "@/hooks/useLifeMap";
import { Card, IconBadge, PageHeader } from "@/components/ui/primitives";
import { LifeMapGraph, AREA_COLOR, AREA_ICON } from "@/components/lifemap/LifeMapGraph";
import { LifeMapDetailPanel } from "@/components/lifemap/LifeMapDetailPanel";
import { LifeMapAreaDistribution } from "@/components/lifemap/LifeMapAreaDistribution";
import { LifeMapAlerts } from "@/components/lifemap/LifeMapAlerts";
import type { LifeMapAreaId } from "@/types";

const AREA_LABEL: Record<LifeMapAreaId, string> = {
  metas: "Metas",
  projetos: "Projetos",
  habitos: "Hábitos",
  educacao: "Educação",
  leitura: "Leitura",
  saude: "Saúde",
  profissional: "Profissional",
};
const ALL_AREAS = Object.keys(AREA_LABEL) as LifeMapAreaId[];

interface ViewOption {
  id: string;
  label: string;
  areas: LifeMapAreaId[];
}

const VIEWS: ViewOption[] = [
  { id: "geral", label: "Mapa geral", areas: ALL_AREAS },
  { id: "metas_projetos", label: "Metas → Projetos", areas: ["metas", "projetos"] },
  { id: "habitos_objetivos", label: "Hábitos → Objetivos", areas: ["habitos", "metas"] },
  { id: "conhecimento", label: "Conhecimento", areas: ["educacao", "leitura"] },
  { id: "saude", label: "Saúde", areas: ["saude", "habitos"] },
  { id: "profissional", label: "Profissional", areas: ["profissional", "projetos"] },
];

export function LifeMapPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, createLink, isCreatingLink, deleteLink, isDeletingLink } = useLifeMap();
  const [viewId, setViewId] = useState("geral");
  const [hidden, setHidden] = useState<Set<LifeMapAreaId>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const activeView = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];
  const visibleAreas = useMemo(() => activeView.areas.filter((a) => !hidden.has(a)), [activeView, hidden]);

  const countByArea = useMemo(() => {
    const m = new Map<LifeMapAreaId, number>();
    for (const n of data?.nodes ?? []) if (n.area && n.kind !== "area") m.set(n.area, (m.get(n.area) ?? 0) + 1);
    return m;
  }, [data]);

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || !data) return [];
    return data.nodes.filter((n) => n.kind !== "center" && n.kind !== "area" && n.label.toLowerCase().includes(term)).slice(0, 8);
  }, [data, searchTerm]);

  /** Seleciona um nó garantindo que a área dele esteja visível (busca, alertas). */
  const locate = (nodeId: string) => {
    const node = data?.nodes.find((n) => n.id === nodeId);
    if (node?.area && !visibleAreas.includes(node.area)) {
      setViewId("geral");
      setHidden(new Set());
    }
    setSelectedId(nodeId);
  };

  const changeView = (id: string) => {
    setViewId(id);
    setHidden(new Set());
    setSelectedId(null);
  };

  const toggleArea = (area: LifeMapAreaId) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4" aria-busy="true">
        <div className="h-10 w-56 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-black/[0.05] dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="h-[60dvh] rounded-2xl bg-black/[0.05] dark:bg-white/[0.06] animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8">
        <PageHeader icon={<Share2 size={20} />} title="Life Map" subtitle="Veja como suas metas, hábitos, projetos e áreas da vida se conectam." />
        <Card className="p-5 border-drop/40 bg-drop/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-drop shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Não foi possível carregar o Life Map agora</p>
            <p className="text-xs text-slate mt-0.5">Tente novamente em alguns segundos.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 shrink-0 hover:bg-paper dark:hover:bg-ink"
          >
            <RefreshCw size={13} /> Tentar de novo
          </button>
        </Card>
      </div>
    );
  }

  const { summary, suggestions } = data;
  const isEmpty = data.nodes.filter((n) => n.kind !== "center" && n.kind !== "area").length === 0;

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
      <PageHeader icon={<Share2 size={20} />} title="Life Map" subtitle="Veja como suas metas, hábitos, projetos e áreas da vida se conectam." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <SummaryTile tone="purple" icon={<Layers size={14} />} label="Áreas ativas" value={`${summary.areasActiveCount} / ${summary.areasCount}`} />
        <SummaryTile tone="blue" icon={<Target size={14} />} label="Conexões de metas" value={String(summary.goalsConnectedCount)} />
        <SummaryTile tone="amber" icon={<Unlink size={14} />} label="Pontos soltos" value={String(summary.orphanItemsCount)} />
        <SummaryTile tone="green" icon={<Activity size={14} />} label="Força estrutural" value={`${summary.structuralScorePct}%`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card className="p-3 sm:p-4">
          {/* Barra do mapa: visões + busca */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-3">
            <div role="tablist" aria-label="Visões do mapa" className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 lg:pb-0 flex-1 min-w-0">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={v.id === viewId}
                  onClick={() => changeView(v.id)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    v.id === viewId ? "bg-brand-500 text-white shadow-sm" : "text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="relative lg:w-64 shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Buscar no mapa…"
                aria-label="Buscar no mapa"
                className="w-full text-xs rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink pl-8 pr-8 py-2 outline-none focus:border-brand-500"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate" aria-label="Limpar busca">
                  <X size={13} />
                </button>
              )}
              {searchOpen && searchTerm.trim().length > 0 && (
                <div className="absolute right-0 left-0 mt-1 max-h-64 overflow-y-auto rounded-xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised z-30">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-slate p-3">Nenhum item encontrado.</p>
                  ) : (
                    searchResults.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          locate(n.id);
                          setSearchTerm(n.label);
                          setSearchOpen(false);
                        }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: n.area ? AREA_COLOR[n.area] : "#98A2B3" }} />
                        <span className="truncate">{n.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative h-[58dvh] min-h-[380px] max-h-[780px] lg:h-[66dvh]">
            {isEmpty ? (
              <div className="h-full rounded-xl border border-dashed border-paper-border dark:border-ink-border flex flex-col items-center justify-center text-center px-6">
                <Share2 size={28} className="text-brand-500 mb-2" />
                <p className="text-sm font-semibold">Seu mapa ainda está vazio</p>
                <p className="text-xs text-slate mt-1 max-w-sm">Crie uma meta, um hábito ou um projeto — eles aparecem aqui ligados às áreas da sua vida.</p>
              </div>
            ) : (
              <LifeMapGraph
                nodes={data.nodes}
                edges={data.edges}
                visibleAreas={visibleAreas}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onOpen={(n) => n.openPath && navigate(n.openPath)}
                resetToken={resetToken}
              />
            )}
          </div>

          {/* Legenda = filtro: tocar numa área mostra/esconde no mapa */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {activeView.areas.map((a) => {
              const on = !hidden.has(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleArea(a)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1 text-[11px] font-medium border transition-all ${
                    on ? "border-transparent text-inherit" : "border-dashed border-paper-border dark:border-ink-border text-slate opacity-60"
                  }`}
                  style={on ? { background: `${AREA_COLOR[a]}1A` } : undefined}
                >
                  <span className="text-xs leading-none">{AREA_ICON[a]}</span>
                  {AREA_LABEL[a]}
                  <span className="tabular-nums text-slate">{countByArea.get(a) ?? 0}</span>
                </button>
              );
            })}
            {hidden.size > 0 && (
              <button onClick={() => setHidden(new Set())} className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 px-1">
                Mostrar todas
              </button>
            )}
            <button onClick={() => setResetToken((t) => t + 1)} className="ml-auto text-[11px] text-slate hover:text-brand-600 hidden sm:inline">
              Recentralizar
            </button>
          </div>
          <p className="text-[10.5px] text-slate/80 mt-2">
            Linha contínua: Você → área → item. Tracejada: relação por categoria ou tarefa em comum. Pontilhada: vínculo manual. Arraste para mover, role ou use a pinça para zoom e dê duplo clique para abrir.
          </p>
        </Card>

        <div className="space-y-4">
          <LifeMapDetailPanel
            data={data}
            selectedId={selectedId}
            onCreateLink={createLink}
            onDeleteLink={deleteLink}
            isMutatingLink={isCreatingLink || isDeletingLink}
          />
          <LifeMapAlerts data={data} onLocate={locate} />
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={15} className="text-signal-deep dark:text-signal" />
              <p className="text-sm font-semibold">Sugestões</p>
            </div>
            {suggestions.length === 0 ? (
              <p className="text-xs text-slate">Sem sugestões novas por agora.</p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-xs leading-relaxed rounded-xl bg-signal/[0.07] px-3 py-2">
                    {s.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <LifeMapAreaDistribution distribution={data.distribution} />
    </div>
  );
}

function SummaryTile({ tone, icon, label, value }: { tone: "purple" | "blue" | "amber" | "green"; icon: JSX.Element; label: string; value: string }) {
  return (
    <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
      <IconBadge tone={tone} size={32} icon={icon} />
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-slate leading-tight">{label}</p>
        <p className="font-display font-semibold text-base leading-tight">{value}</p>
      </div>
    </Card>
  );
}
