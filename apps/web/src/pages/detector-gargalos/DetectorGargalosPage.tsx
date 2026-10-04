import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Compass, RefreshCw, Search, Telescope } from "lucide-react";
import { RPGButton, RPGTabs, RPGToast, rpgButtonClass } from "@/components/rpg";
import { BottleneckHero } from "@/components/bottlenecks/BottleneckHero";
import { PrimaryBottleneckCard } from "@/components/bottlenecks/PrimaryBottleneckCard";
import { BottleneckCauseList, BottleneckPotentialList, BottleneckRanking, BottleneckRelatedList } from "@/components/bottlenecks/BottleneckLists";
import { BottleneckDependencyGraph } from "@/components/bottlenecks/BottleneckDependencyGraph";
import { BottleneckRecommendedAction, FocusScheduleModal } from "@/components/bottlenecks/BottleneckRecommendedAction";
import { BottleneckImpactForecast } from "@/components/bottlenecks/BottleneckImpactForecast";
import { BottleneckOraclePanel } from "@/components/bottlenecks/BottleneckOraclePanel";
import { BottleneckAllModal, BottleneckDetailModal, BottleneckMapModal } from "@/components/bottlenecks/BottleneckDetailModal";
import { useBottlenecks } from "@/hooks/useBottlenecks";
import { useWide } from "@/hooks/useWide";
import type { AnalysisPeriod, BottleneckAnalysis, FocusInput, RecommendedAction } from "@/services/bottlenecksService";

const PERIODS: Array<{ value: AnalysisPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

function StatePanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rpg-panel rpg-panel-gold flex flex-col items-center text-center gap-3 py-10 px-4">
      <span className="text-rpg-gold" aria-hidden>
        {icon}
      </span>
      <p className="font-pixel text-xs uppercase tracking-[0.16em] text-rpg-gold">{title}</p>
      {children}
    </div>
  );
}

/**
 * Detector de Gargalos: o que mais impede o progresso agora. A engine
 * determinística (servidor) decide o gargalo; o Oráculo (IA) só explica.
 * Nada aqui altera dados — criar o Focus exige prévia e confirmação.
 */
export function DetectorGargalosPage() {
  const [period, setPeriod] = useState<AnalysisPeriod>("7d");
  const { data, isLoading, isError, refetch, reanalyze, scheduleFocus } = useBottlenecks(period);
  const desktop = useWide("(min-width: 1024px)");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [focus, setFocus] = useState<{ input: FocusInput; title: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  const openFocus = (action: RecommendedAction, title: string) => {
    if (!action.targetId || !action.preview || !action.estimatedMinutes) return;
    setDetailKey(null);
    setFocus({ input: { taskId: action.targetId, date: action.preview.date, start: action.preview.start, minutes: action.estimatedMinutes }, title });
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <RPGTabs size="sm" label="Período da análise" tabs={PERIODS} value={period} onChange={setPeriod} />
      <RPGButton variant="secondary" className="!py-1 text-xs" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending}>
        <RefreshCw size={13} className={reanalyze.isPending ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Reanalisar
      </RPGButton>
      {data && (
        <span className="text-[11px] text-rpg-muted">
          Análise de {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {data.cached ? " (sem mudanças nos dados)" : ""} · o ranking considera o estado atual
        </span>
      )}
    </div>
  );

  const body = (a: BottleneckAnalysis) => {
    const p = a.primary;
    const open = (c: { key: string }) => setDetailKey(c.key);
    const ranking = <BottleneckRanking ranking={a.ranking} selectedKey={p?.candidate.key ?? null} onSelect={open} onViewAll={() => setAllOpen(true)} />;
    const potential = <BottleneckPotentialList potential={a.potential} onSelect={open} onViewAll={() => setAllOpen(true)} />;
    const oracle = <BottleneckOraclePanel key={p?.candidate.key ?? "none"} text={p?.oracleText ?? null} targetKey={p?.candidate.key ?? null} period={period} questions={a.questions} />;

    if (a.status === "insufficient")
      return (
        <StatePanel icon={<Search size={36} />} title="Precisamos de mais pistas">
          <p className="text-sm text-rpg-muted max-w-lg">Registre tarefas, projetos, prazos e progresso para que o LifeOS consiga identificar gargalos reais.</p>
          <ul className="text-sm text-rpg-text text-left list-disc pl-5 max-w-lg">
            {a.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/tarefas?nova=1" className={rpgButtonClass("primary")}>
              Criar tarefa
            </Link>
            <Link to="/projetos" className={rpgButtonClass("secondary")}>
              Ver projetos
            </Link>
          </div>
        </StatePanel>
      );

    if (!p)
      return (
        <div className="space-y-4">
          <StatePanel icon={<Compass size={36} />} title="Caminho livre">
            <p className="text-sm text-rpg-muted">Nenhum gargalo significativo foi detectado neste momento.</p>
            <ul className="space-y-1 text-sm text-left">
              {(
                [
                  [a.checks.deadlines, "prazos sob controle"],
                  [a.checks.capacity, "carga equilibrada"],
                  [a.checks.blocks, "nenhum bloqueio crítico"],
                ] as const
              ).map(([ok, label]) => (
                <li key={label} className={ok ? "text-rpg-green" : "text-rpg-muted"}>
                  <CheckCircle2 size={14} className="inline mr-1.5" aria-hidden />
                  {ok ? label : `${label} — verifique`}
                </li>
              ))}
            </ul>
            <a href="#gargalos-potenciais" className={rpgButtonClass("secondary")}>
              <Telescope size={14} aria-hidden /> Ver próximos riscos
            </a>
          </StatePanel>
          <div id="gargalos-potenciais" className="grid gap-4 lg:grid-cols-2">
            {ranking}
            {potential}
          </div>
        </div>
      );

    const primary = <PrimaryBottleneckCard candidate={p.candidate} onDetail={() => open(p.candidate)} />;
    const causes = <BottleneckCauseList causes={p.causes} />;
    const graph = <BottleneckDependencyGraph graph={p.graph} onOpenMap={() => setMapKey(p.candidate.key)} />;
    const action = <BottleneckRecommendedAction action={p.action} secondary={p.secondaryActions} today={a.today} onSchedule={() => openFocus(p.action, p.candidate.title)} />;
    const impact = <BottleneckImpactForecast impact={p.impact} />;
    const related = <BottleneckRelatedList related={p.related} />;

    if (!desktop)
      // Celular/tablet: ordem pensada para decidir rápido.
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">{primary}</div>
          <div className="md:col-span-2">{action}</div>
          {ranking}
          {causes}
          <div className="md:col-span-2">{graph}</div>
          <div className="md:col-span-2">{impact}</div>
          <div className="md:col-span-2">{oracle}</div>
          {related}
          <div id="gargalos-potenciais">{potential}</div>
        </div>
      );

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-stretch">
            {primary}
            {ranking}
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] items-stretch">
            {causes}
            <div className="lg:col-span-2 2xl:col-span-1 lg:order-last 2xl:order-none">{graph}</div>
            {action}
          </div>
          {impact}
        </div>
        <aside className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 min-w-0" aria-label="Oráculo e gargalos relacionados">
          {oracle}
          {related}
          <div id="gargalos-potenciais">{potential}</div>
        </aside>
      </div>
    );
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <BottleneckHero />
      {toolbar}
      {isError ? (
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível analisar seus dados agora.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      ) : isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-label="Analisando gargalos">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rpg-panel h-64 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        body(data)
      )}

      {data && (
        <>
          <BottleneckDetailModal itemKey={detailKey} period={period} today={data.today} onClose={() => setDetailKey(null)} onSchedule={openFocus} />
          <BottleneckAllModal
            open={allOpen}
            onClose={() => setAllOpen(false)}
            all={data.all}
            onSelect={(c) => {
              setAllOpen(false);
              setDetailKey(c.key);
            }}
          />
          <BottleneckMapModal itemKey={mapKey} period={period} onClose={() => setMapKey(null)} />
        </>
      )}
      <FocusScheduleModal
        open={!!focus}
        onClose={() => setFocus(null)}
        initial={focus?.input ?? null}
        taskTitle={focus?.title ?? ""}
        saving={scheduleFocus.isPending}
        onConfirm={async (input) => {
          const r = await scheduleFocus.mutateAsync(input);
          setFocus(null);
          setToast({ msg: r.created ? `Sessão Focus reservada: ${r.date.split("-").reverse().join("/")} às ${r.start} (Capacity Planner).` : "Essa sessão já estava reservada.", tone: "success" });
        }}
      />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
