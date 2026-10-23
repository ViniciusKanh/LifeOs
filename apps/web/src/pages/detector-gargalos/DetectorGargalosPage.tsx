import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Compass, Footprints, RefreshCw, ScanSearch, Search, Telescope } from "lucide-react";
import { RPGButton, RPGTabs, RPGToast, rpgButtonClass } from "@/components/rpg";
import { BottleneckHero } from "@/components/bottlenecks/BottleneckHero";
import { PrimaryBottleneckCard } from "@/components/bottlenecks/PrimaryBottleneckCard";
import { BottleneckCauseList, BottleneckPotentialList, BottleneckRanking, BottleneckRelatedList } from "@/components/bottlenecks/BottleneckLists";
import { BottleneckDependencyGraph } from "@/components/bottlenecks/BottleneckDependencyGraph";
import { BottleneckRecommendedAction, ScheduleBlockModal } from "@/components/bottlenecks/BottleneckRecommendedAction";
import { RPGHowItWorks, type HowItWorksStep } from "@/components/rpg/RPGHowItWorks";
import { BottleneckImpactForecast } from "@/components/bottlenecks/BottleneckImpactForecast";
import { BottleneckOraclePanel } from "@/components/bottlenecks/BottleneckOraclePanel";
import { BottleneckAllModal, BottleneckDetailModal, BottleneckMapModal } from "@/components/bottlenecks/BottleneckDetailModal";
import { useBottlenecks } from "@/hooks/useBottlenecks";
import { useWide } from "@/hooks/useWide";
import { HeroRhythmPanel } from "@/components/rhythm/HeroRhythmPanel";
import type { AnalysisPeriod, BottleneckAnalysis, FocusInput, RecommendedAction } from "@/services/bottlenecksService";

const HOW_IT_WORKS: HowItWorksStep[] = [
  { icon: ClipboardList, tone: "blue", title: "Você registra sua rotina", text: "Tarefas com prazo e tempo estimado, projetos, campanhas, hábitos e agenda — o que você já usa no LifeOS." },
  { icon: ScanSearch, tone: "purple", title: "O LifeOS procura o que trava", text: "Cada item ganha uma nota de 0 a 100. Sobe quando outras coisas esperam por ele, o prazo aperta ou ele está parado há dias." },
  { icon: Footprints, tone: "green", title: "Você dá um passo", text: "Mostramos o item que mais trava e UMA ação para destravá-lo agora. Nada muda sem você confirmar." },
];

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
 * Nada aqui altera dados — reservar horário na agenda exige prévia e confirmação.
 */
export function DetectorGargalosPage() {
  const [period, setPeriod] = useState<AnalysisPeriod>("7d");
  const { data, isLoading, isError, refetch, reanalyze, scheduleFocus } = useBottlenecks(period);
  const desktop = useWide("(min-width: 1024px)");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [reserve, setReserve] = useState<{ input: FocusInput; title: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  const openReserve = (action: RecommendedAction, title: string) => {
    if (!action.targetId || !action.preview || !action.estimatedMinutes) return;
    setDetailKey(null);
    setReserve({ input: { taskId: action.targetId, date: action.preview.date, start: action.preview.start, minutes: action.estimatedMinutes }, title });
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-rpg-muted">Olhar para:</span>
      <RPGTabs size="sm" label="Período da análise" tabs={PERIODS} value={period} onChange={setPeriod} />
      <RPGButton variant="secondary" className="!py-1 text-xs" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending}>
        <RefreshCw size={13} className={reanalyze.isPending ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Reanalisar
      </RPGButton>
      {data && (
        <span className="text-[11px] text-rpg-muted">
          Atualizado às {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {data.cached ? " (nada mudou nos seus dados desde então)" : ""}
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
          <p className="text-sm text-rpg-muted max-w-lg">
            Para descobrir o que trava sua rotina, o detector precisa de alguns registros reais. Quanto mais completo, mais certeira a análise. Falta:
          </p>
          <ul className="text-sm text-rpg-text text-left list-disc pl-5 max-w-lg space-y-0.5">
            {a.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-xs text-rpg-muted max-w-lg">Dica: ao criar uma tarefa, preencha o prazo, o tempo estimado e, se ela só puder começar depois de outra, marque “depende de”.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/tarefas?nova=1" className={rpgButtonClass("gold")}>
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
            <p className="text-sm text-rpg-muted max-w-lg">Nada está travando sua rotina agora: nenhum item tem nota alta o suficiente para virar gargalo. Veja o que foi conferido:</p>
            <ul className="space-y-1 text-sm text-left">
              {(
                [
                  [a.checks.deadlines, "prazos sob controle", "há prazos vencidos"],
                  [a.checks.capacity, "agenda dentro do seu tempo disponível", "agenda mais cheia que o tempo disponível"],
                  [a.checks.blocks, "nenhuma tarefa segurando outras", "há tarefas segurando outras"],
                ] as const
              ).map(([ok, good, bad]) => (
                <li key={good} className={ok ? "text-rpg-green" : "text-rpg-orange"}>
                  {ok ? <CheckCircle2 size={14} className="inline mr-1.5" aria-hidden /> : <AlertTriangle size={14} className="inline mr-1.5" aria-hidden />}
                  {ok ? good : bad}
                </li>
              ))}
            </ul>
            <a href="#gargalos-potenciais" className={rpgButtonClass("secondary")}>
              <Telescope size={14} aria-hidden /> Ver o que pode travar em breve
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
    const action = <BottleneckRecommendedAction action={p.action} secondary={p.secondaryActions} today={a.today} onSchedule={() => openReserve(p.action, p.candidate.title)} />;
    const impact = <BottleneckImpactForecast impact={p.impact} />;
    const related = <BottleneckRelatedList related={p.related} />;

    if (!desktop)
      // Celular/tablet: ordem pensada para decidir rápido.
      return (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)] md:grid-cols-[repeat(2,minmax(0,1fr))] [&>*]:min-w-0">
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-stretch [&>*]:min-w-0">
            {primary}
            {ranking}
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] items-stretch [&>*]:min-w-0">
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
      <RPGHowItWorks storageKey="lifeos:gargalos:como-funciona" steps={HOW_IT_WORKS} />
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

      {/* Ritmo do herói: quando o progresso real acontece (independe do período da análise). */}
      <HeroRhythmPanel />

      {data && (
        <>
          <BottleneckDetailModal itemKey={detailKey} period={period} today={data.today} onClose={() => setDetailKey(null)} onSchedule={openReserve} />
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
      <ScheduleBlockModal
        open={!!reserve}
        onClose={() => setReserve(null)}
        initial={reserve?.input ?? null}
        taskTitle={reserve?.title ?? ""}
        saving={scheduleFocus.isPending}
        onConfirm={async (input) => {
          const r = await scheduleFocus.mutateAsync(input);
          setReserve(null);
          setToast({ msg: r.created ? `Horário reservado na agenda: ${r.date.split("-").reverse().join("/")} às ${r.start} (veja no Capacity Planner).` : "Esse horário já estava reservado.", tone: "success" });
        }}
      />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
