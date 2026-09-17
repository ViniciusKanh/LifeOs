import { useEffect, useMemo, useRef, useState } from "react";
import {
  Share2,
  Layers,
  Target,
  Unlink,
  Activity,
  Filter,
  ChevronDown,
  Crosshair,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { useLifeMap } from "@/hooks/useLifeMap";
import { Button, Card, IconBadge, PageHeader } from "@/components/ui/primitives";
import { LifeMapGraph, AREA_COLOR } from "@/components/lifemap/LifeMapGraph";
import { LifeMapDetailPanel } from "@/components/lifemap/LifeMapDetailPanel";
import type { LifeMapAreaId } from "@/types";

const AREA_LABEL: Record<LifeMapAreaId, string> = {
  metas: "Metas",
  projetos: "Projetos",
  habitos: "Hábitos",
  educacao: "Educação",
  leitura: "Leitura",
  saude: "Saúde e bem-estar",
};

interface ViewOption {
  id: string;
  label: string;
  areas: LifeMapAreaId[] | "all";
}

const VIEWS: ViewOption[] = [
  { id: "geral", label: "Mapa geral", areas: "all" },
  { id: "metas_projetos", label: "Metas → Projetos", areas: ["metas", "projetos"] },
  { id: "habitos_objetivos", label: "Hábitos → Objetivos", areas: ["habitos", "metas"] },
  { id: "educacao", label: "Educação", areas: ["educacao"] },
  { id: "saude", label: "Saúde e bem-estar", areas: ["saude"] },
  { id: "conhecimento", label: "Conhecimento", areas: ["educacao", "leitura"] },
];

export function LifeMapPage() {
  const { data, isLoading, isError, refetch } = useLifeMap();
  const [viewId, setViewId] = useState("geral");
  const [customAreas, setCustomAreas] = useState<LifeMapAreaId[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setFilterMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const activeView = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];
  const visibleAreas = customAreas ?? activeView.areas;

  const allAreaIds = Object.keys(AREA_LABEL) as LifeMapAreaId[];

  if (isLoading) {
    return (
      <div className="px-4 py-10 md:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8">
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

  const { summary, orphans, suggestions } = data;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-[1440px] mx-auto">
      <PageHeader
        icon={<Share2 size={20} />}
        title="Life Map"
        subtitle="Veja como suas metas, hábitos, projetos e áreas da vida se conectam."
        actions={
          <>
            <div className="relative" ref={filterMenuRef}>
              <Button variant="secondary" onClick={() => setFilterMenuOpen((v) => !v)}>
                <Filter size={14} /> Filtrar
              </Button>
              {filterMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 z-30">
                  <p className="text-[11px] text-slate mb-2 px-1">Mostrar apenas estas áreas:</p>
                  {allAreaIds.map((areaId) => {
                    const current = customAreas ?? (activeView.areas === "all" ? allAreaIds : activeView.areas);
                    const checked = current.includes(areaId);
                    return (
                      <label key={areaId} className="flex items-center gap-2 px-1 py-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const base = customAreas ?? (activeView.areas === "all" ? allAreaIds : [...activeView.areas]);
                            setCustomAreas(e.target.checked ? [...base, areaId] : base.filter((a) => a !== areaId));
                          }}
                        />
                        <span className="w-2 h-2 rounded-full" style={{ background: AREA_COLOR[areaId] }} />
                        {AREA_LABEL[areaId]}
                      </label>
                    );
                  })}
                  <button
                    onClick={() => {
                      setCustomAreas(null);
                      setFilterMenuOpen(false);
                    }}
                    className="mt-2 text-[11px] font-semibold text-brand-600 dark:text-brand-500 px-1"
                  >
                    Limpar filtro
                  </button>
                </div>
              )}
            </div>

            <div className="relative" ref={viewMenuRef}>
              <Button variant="secondary" onClick={() => setViewMenuOpen((v) => !v)}>
                <Layers size={14} /> Mudar visão <ChevronDown size={13} />
              </Button>
              {viewMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised overflow-hidden z-30">
                  {VIEWS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setViewId(v.id);
                        setCustomAreas(null);
                        setViewMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 ${
                        v.id === viewId ? "font-semibold text-brand-600 dark:text-brand-500" : ""
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={() => setResetToken((t) => t + 1)}>
              <Crosshair size={14} /> Centralizar mapa
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="purple" size={30} icon={<Layers size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Áreas da vida</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{summary.areasActiveCount} / {summary.areasCount}</p>
          </div>
        </Card>
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="blue" size={30} icon={<Target size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Metas conectadas</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{summary.goalsConnectedCount}</p>
          </div>
        </Card>
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="amber" size={30} icon={<Unlink size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Itens órfãos</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{summary.orphanItemsCount}</p>
          </div>
        </Card>
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="green" size={30} icon={<Activity size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Força estrutural</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{summary.structuralScorePct}%</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-semibold">Mapa da sua vida</p>
              <p className="text-xs text-slate">Clique em um nó para ver detalhes, arraste para explorar e use o scroll para zoom.</p>
            </div>
          </div>
          <div className="mt-3 h-[420px] sm:h-[520px] rounded-xl bg-paper dark:bg-ink">
            <LifeMapGraph
              nodes={data.nodes}
              edges={data.edges}
              visibleAreas={visibleAreas}
              selectedId={selectedId}
              onSelect={setSelectedId}
              resetToken={resetToken}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            {allAreaIds.map((a) => (
              <span key={a} className="flex items-center gap-1.5 text-[11px] text-slate">
                <span className="w-2 h-2 rounded-full" style={{ background: AREA_COLOR[a] }} />
                {AREA_LABEL[a]}
              </span>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <LifeMapDetailPanel data={data} selectedId={selectedId} />

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-signal-deep dark:text-signal" />
              <p className="text-sm font-semibold">Alertas estruturais</p>
            </div>
            <ul className="space-y-2.5">
              {orphans.tasksWithoutProject > 0 && (
                <AlertRow count={orphans.tasksWithoutProject} label="tarefas sem projeto" hint="Tarefas que podem ser vinculadas a um projeto." />
              )}
              {orphans.goalsWithoutHabit > 0 && (
                <AlertRow count={orphans.goalsWithoutHabit} label="metas sem hábito de apoio" hint="Adicione hábitos que sustentem essa meta." />
              )}
              {orphans.projectsWithoutDeadline > 0 && (
                <AlertRow count={orphans.projectsWithoutDeadline} label="projetos sem prazo" hint="Defina um prazo para manter o foco." />
              )}
              {orphans.habitsUnlinked > 0 && (
                <AlertRow count={orphans.habitsUnlinked} label="hábitos não vinculados" hint="Conecte seus hábitos a uma área da vida ou meta." />
              )}
              {summary.orphanItemsCount === 0 && <p className="text-xs text-slate">Nenhum alerta — sua estrutura está bem conectada.</p>}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={15} className="text-signal-deep dark:text-signal" />
              <p className="text-sm font-semibold">Sugestões do sistema</p>
            </div>
            {suggestions.length === 0 ? (
              <p className="text-xs text-slate">Sem sugestões novas por agora.</p>
            ) : (
              <ul className="space-y-2.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-slate leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-slate/50">
                    {s.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-4 mt-4">
        <p className="text-xs text-slate mb-3">Visões do mapa — explore diferentes perspectivas das suas conexões.</p>
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setViewId(v.id);
                setCustomAreas(null);
              }}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors ${
                v.id === viewId && !customAreas
                  ? "bg-brand-500 border-brand-500 text-white"
                  : "border-paper-border dark:border-ink-border text-slate hover:bg-paper dark:hover:bg-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AlertRow({ count, label, hint }: { count: number; label: string; hint: string }) {
  return (
    <li className="text-xs">
      <p className="font-medium">
        {count} {label}
      </p>
      <p className="text-slate mt-0.5">{hint}</p>
    </li>
  );
}
