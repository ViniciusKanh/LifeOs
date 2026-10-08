import { useMemo, useState } from "react";
import { BookMarked, Box, FlaskConical, Gem, Hammer, LayoutGrid, Swords, Target, Zap } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel, RPGStatCard, RPGTabs, RPGToast } from "@/components/rpg";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import { IntelligenceHero } from "@/components/intelligence/IntelligenceHero";
import { IntelligenceCorePanel } from "@/components/intelligence/IntelligenceCorePanel";
import { ProphecyModal, ProphecyPanel } from "@/components/intelligence/ProphecyPanel";
import { CoreAlertsPanel } from "@/components/intelligence/CoreAlertsPanel";
import { ArtifactGrid, ArtifactsPanel } from "@/components/intelligence/ArtifactPanels";
import { ArenaHistory, ArenaPanel } from "@/components/intelligence/ArenaPanel";
import { GrimoireFull, GrimoirePanel } from "@/components/intelligence/GrimoirePanel";
import { RuneList, RunesPanel } from "@/components/intelligence/RunesPanel";
import { ForgeModal } from "@/components/intelligence/ForgeModal";
import { ArtifactDetailModal } from "@/components/intelligence/ArtifactDetailModal";
import { useArtifactDetail, useExperiments, useIntelligence } from "@/hooks/useIntelligence";
import type { ArtifactSummary, IntelligenceOverview, ObjectiveKey } from "@/services/intelligenceService";
import { STATUS_UI, pct } from "@/utils/intelligenceDisplay";

type Tab = "overview" | "artifacts" | "arena" | "runes" | "grimoire" | "reforge";
const TABS: Array<{ value: Tab; label: string; icon: JSX.Element }> = [
  { value: "overview", label: "Visão geral", icon: <LayoutGrid size={14} /> },
  { value: "artifacts", label: "Artefatos", icon: <Box size={14} /> },
  { value: "arena", label: "Arena", icon: <Swords size={14} /> },
  { value: "runes", label: "Runas", icon: <Gem size={14} /> },
  { value: "grimoire", label: "Grimório", icon: <BookMarked size={14} /> },
  { value: "reforge", label: "Reforja", icon: <Hammer size={14} /> },
];
type Sort = "recent" | "level" | "accuracy";

function RunesTab({ data }: { data: IntelligenceOverview }) {
  const [id, setId] = useState<string | null>(data.runes?.artifactId ?? data.artifacts[0]?.id ?? null);
  const { data: detail, isLoading } = useArtifactDetail(id);
  if (!data.artifacts.length) return <div className="rpg-panel p-6 text-center text-sm text-rpg-muted">Forje um artefato para descobrir as runas que mais influenciam suas previsões.</div>;
  return (
    <RPGPanel
      title="Runas (importância das features)"
      icon={<Gem size={15} />}
      actions={
        <select className={`${rpgFieldClass} !py-1 text-xs w-auto`} value={id ?? ""} onChange={(e) => setId(e.target.value)} aria-label="Artefato">
          {data.artifacts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      }
    >
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">Quanto cada runa pesa nas previsões (importância por permutação na validação). A seta indica se a relação com o alvo é positiva ou negativa.</p>
      {isLoading || !detail ? <div className="h-40 rpg-bar animate-pulse motion-reduce:animate-none" /> : <RuneList items={detail.importance} showDirection />}
    </RPGPanel>
  );
}

function ReforgeTab({ data, onReforge, onForge }: { data: IntelligenceOverview; onReforge: (k: ObjectiveKey) => void; onForge: (k: ObjectiveKey) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.artifacts.map((a) => (
        <RPGPanel key={a.id} title={a.name} icon={<Hammer size={15} />}>
          <dl className="grid grid-cols-2 gap-1 text-xs">
            <dt className="text-rpg-muted">Último treino</dt>
            <dd className={a.daysSinceTraining >= 30 ? "text-rpg-orange" : "text-rpg-text"}>há {a.daysSinceTraining} dia(s)</dd>
            <dt className="text-rpg-muted">Dias no treino</dt>
            <dd className="text-rpg-text">{a.samples}</dd>
            <dt className="text-rpg-muted">Equilíbrio</dt>
            <dd className="text-rpg-text">
              {pct(a.metrics.cvMean)} ± {pct(a.metrics.cvStd)}
            </dd>
            <dt className="text-rpg-muted">Status</dt>
            <dd>
              <RPGBadge tone={STATUS_UI[a.status].tone}>{STATUS_UI[a.status].label}</RPGBadge>
            </dd>
          </dl>
          <p className="mt-2 text-[11px] text-rpg-muted">A reforja inclui os dias novos, confere profecias passadas e rende XP ao artefato.</p>
          <RPGButton variant="secondary" className="mt-2 w-full justify-center" onClick={() => onReforge(a.objective)}>
            <Hammer size={14} aria-hidden /> Reforjar
          </RPGButton>
        </RPGPanel>
      ))}
      {data.objectives
        .filter((o) => !o.forged)
        .map((o) => (
          <RPGPanel key={o.key} title={o.name}>
            <p className="text-xs text-rpg-muted">{o.description}</p>
            <RPGButton variant="ghost" className="mt-2" onClick={() => onForge(o.key)}>
              Forjar pela primeira vez
            </RPGButton>
          </RPGPanel>
        ))}
    </div>
  );
}

/**
 * Forja da Inteligência: Machine Learning sobre os dados reais do usuário,
 * apresentado como artefatos de RPG. Nenhuma métrica é inventada — sem forja,
 * os painéis mostram estados vazios com o próximo passo.
 */
export function ForjaInteligenciaPage() {
  const { data, isLoading, isError, refetch, forge, refreshGrimoire } = useIntelligence();
  const [tab, setTab] = useState<Tab>("overview");
  const [sort, setSort] = useState<Sort>("recent");
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeInitial, setForgeInitial] = useState<ObjectiveKey | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [prophecyOpen, setProphecyOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const experiments = useExperiments(tab === "arena");

  const openForge = (k: ObjectiveKey | null = null) => {
    setDetailId(null);
    setForgeInitial(k ?? data?.objectives.find((o) => !o.forged)?.key ?? data?.objectives[0]?.key ?? null);
    setForgeOpen(true);
  };
  const reforgeById = (id: string) => {
    const a = data?.artifacts.find((x) => x.id === id);
    if (a) openForge(a.objective);
  };
  const doRefresh = () =>
    refreshGrimoire.mutate(undefined, {
      onSuccess: () => setToast({ msg: "Grimório atualizado com seus registros.", tone: "success" }),
      onError: (e) => setToast({ msg: e instanceof Error ? e.message : "Não foi possível atualizar o grimório.", tone: "error" }),
    });

  const sorted = useMemo(() => {
    const list = [...(data?.artifacts ?? [])];
    const by: Record<Sort, (a: ArtifactSummary, b: ArtifactSummary) => number> = {
      recent: (a, b) => b.trainedAt.localeCompare(a.trainedAt),
      level: (a, b) => b.level - a.level || b.xp - a.xp,
      accuracy: (a, b) => b.metrics.accuracy - a.metrics.accuracy,
    };
    return list.sort(by[sort]);
  }, [data?.artifacts, sort]);

  const s = data?.summary;
  const stats = (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <RPGStatCard layout="wide" tone="purple" icon={<Box size={26} />} value={s ? String(s.artifactsActive) : "—"} label="Artefatos ativos" caption="modelos em produção" />
      <RPGStatCard layout="wide" tone="purple" icon={<FlaskConical size={26} />} value={s ? String(s.experiments) : "—"} label="Experimentos" caption="arenas realizadas" />
      <RPGStatCard layout="wide" tone="purple" icon={<Target size={26} />} value={s?.avgAccuracy != null ? pct(s.avgAccuracy) : "—"} label="Precisão média" caption={s?.avgAccuracy != null ? "média dos artefatos ativos" : "sem artefatos ativos"} />
      <RPGStatCard layout="wide" tone="purple" icon={<Zap size={26} />} value={s?.corePower != null ? `${s.corePower}%` : "—"} label="Poder do núcleo" caption={s?.corePower != null ? "áreas com dados para aprender" : "atualize o grimório"} />
    </div>
  );

  const body = (d: IntelligenceOverview) => {
    switch (tab) {
      case "overview":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-stretch [&>*]:min-w-0">
              <div className="md:col-span-2 xl:col-span-1">
                <IntelligenceCorePanel core={d.core} hasGrimoire={!!d.grimoire} />
              </div>
              <ProphecyPanel prophecy={d.prophecy} onAnalyze={() => setProphecyOpen(true)} onForge={() => openForge("productivity")} />
              <CoreAlertsPanel alerts={d.alerts} onInspect={setDetailId} onReforge={reforgeById} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 min-[1800px]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.85fr)] items-stretch [&>*]:min-w-0">
              <div className="md:col-span-2 xl:col-span-1">
                <ArtifactsPanel artifacts={d.artifacts} objectives={d.objectives} onInspect={setDetailId} onForge={openForge} onViewAll={() => setTab("artifacts")} />
              </div>
              <ArenaPanel experiment={d.arena} onDetails={() => setTab("arena")} />
              <GrimoirePanel grimoire={d.grimoire} onRefresh={doRefresh} refreshing={refreshGrimoire.isPending} />
              <div className="md:col-span-2 xl:col-span-1">
                <RunesPanel runes={d.runes} onViewAll={() => setTab("runes")} />
              </div>
            </div>
          </div>
        );
      case "artifacts":
        return <ArtifactGrid artifacts={sorted} objectives={d.objectives} onInspect={setDetailId} onForge={openForge} className="lg:grid-cols-3 2xl:grid-cols-4" />;
      case "arena":
        return <ArenaHistory experiments={experiments.data} isLoading={experiments.isLoading} />;
      case "runes":
        return <RunesTab data={d} />;
      case "grimoire":
        return <GrimoireFull grimoire={d.grimoire} objectives={d.objectives} onRefresh={doRefresh} refreshing={refreshGrimoire.isPending} />;
      case "reforge":
        return <ReforgeTab data={d} onReforge={openForge} onForge={openForge} />;
    }
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <IntelligenceHero onNew={() => openForge()} />
      {stats}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RPGTabs label="Seções da Forja" tabs={TABS} value={tab} onChange={setTab} className="max-w-full" />
        {tab === "artifacts" && (
          <select className={`${rpgFieldClass} !py-1.5 text-sm w-auto`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar artefatos">
            <option value="recent">Mais recentes</option>
            <option value="level">Maior nível</option>
            <option value="accuracy">Maior precisão</option>
          </select>
        )}
      </div>
      {isError ? (
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível abrir a forja agora.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      ) : isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Carregando a forja">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rpg-panel h-60 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        body(data)
      )}

      {data && (
        <>
          <ForgeModal
            open={forgeOpen}
            onClose={() => setForgeOpen(false)}
            objectives={data.objectives}
            grimoire={data.grimoire}
            initial={forgeInitial}
            refresh={refreshGrimoire}
            forge={forge}
            onInspect={setDetailId}
          />
          <ProphecyModal prophecy={data.prophecy} open={prophecyOpen} onClose={() => setProphecyOpen(false)} />
        </>
      )}
      <ArtifactDetailModal id={detailId} onClose={() => setDetailId(null)} onReforge={(k) => openForge(k)} />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
