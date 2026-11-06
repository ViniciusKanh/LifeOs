import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Activity, AlertTriangle, BarChart3, Crown, Database, FileText, FlaskConical, Gauge, Gem, Hammer, LayoutDashboard, Plus, Sparkles, Swords, Telescope, TrendingDown, Workflow, BookMarked, Award } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { useUrlTab } from "@/components/hero/HeroShared";
import { useForgeActions, useForgeOverview } from "@/hooks/useForge";
import type { ForgeOverview } from "@/services/forgeService";
import { FORGE_ART, R, errMsg, type Notify } from "./ForgeShared";
import { OverviewTab } from "./ForgeOverview";
import { ArtifactsTab, ModelWizard, ModelsTab } from "./ForgeModels";
import { ArenaTab, MonitorTab, PredictionsTab, ReportsTab, RunesTab } from "./ForgeAnalysis";
import { BottlenecksTab, ExperimentsTab, LabTab, ProtocolsTab } from "./ForgeLab";

const TABS = ["visao", "artefatos", "modelos", "arena", "previsoes", "runas", "experimentos", "protocolos", "gargalos", "laboratorio", "monitoramento", "relatorios"] as const;
type Tab = (typeof TABS)[number];
const TAB_META: Array<[Tab, string, ReactNode]> = [
  ["visao", "Visão Geral", <LayoutDashboard key="i" size={14} />],
  ["artefatos", "Artefatos", <Sparkles key="i" size={14} />],
  ["modelos", "Modelos", <Hammer key="i" size={14} />],
  ["arena", "Arena", <Swords key="i" size={14} />],
  ["previsoes", "Previsões", <Telescope key="i" size={14} />],
  ["runas", "Runas", <Gem key="i" size={14} />],
  ["experimentos", "Experimentos", <FlaskConical key="i" size={14} />],
  ["protocolos", "Protocolos", <Workflow key="i" size={14} />],
  ["gargalos", "Gargalos", <TrendingDown key="i" size={14} />],
  ["laboratorio", "Laboratório", <BookMarked key="i" size={14} />],
  ["monitoramento", "Monitoramento", <Activity key="i" size={14} />],
  ["relatorios", "Relatórios", <FileText key="i" size={14} />],
];

function Banner({ o, notify, onWizard }: { o: ForgeOverview; notify: Notify; onWizard: () => void }) {
  const { analyze } = useForgeActions();
  return (
    <header className="relative min-h-[190px] overflow-hidden border-2 border-rpg-purple/60 bg-rpg-bg-2" style={R}>
      <img src={`${FORGE_ART}/banner-crystal.webp`} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-90 md:w-[55%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-transparent" aria-hidden />
      <div className="relative flex h-full flex-col justify-center gap-2 p-4 sm:p-5">
        <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-rpg-purple">Machine Learning pessoal · {o.researcher.title}</p>
        <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">Forja da Inteligência</h1>
        <p className="max-w-md text-sm text-rpg-text/90">Transforme seus registros em modelos que aprendem com o seu passado — e provam o que sabem antes de prever o futuro.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <RPGButton variant="gold" onClick={onWizard}>
            <Plus size={14} aria-hidden /> Forjar modelo
          </RPGButton>
          <RPGButton variant="secondary" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Dados analisados."), onError: (e) => notify(errMsg(e, "Falha na análise."), "error") })}>
            <Database size={14} aria-hidden /> Analisar meus dados
          </RPGButton>
        </div>
      </div>
    </header>
  );
}

/** Indicadores com significado próprio — nenhuma média entre métricas de escalas diferentes. */
function Indicators({ o }: { o: ForgeOverview }) {
  const i = o.indicators;
  const items: Array<[ReactNode, ReactNode, string, string, string]> = [
    [<Sparkles key="i" />, i.artifactsActive, "Artefatos ativos", "text-rpg-green", "Modelos com versão ativa gerando previsões."],
    [<Hammer key="i" />, `${i.modelsTrained}/${i.models}`, "Modelos treinados", "text-rpg-purple", "Modelos com ao menos uma versão registrada / total."],
    [<FlaskConical key="i" />, i.experiments, "Experimentos", "text-rpg-blue", "Execuções de treino registradas."],
    [<Gauge key="i" />, i.dataQuality == null ? "—" : `${i.dataQuality}`, "Qualidade dos dados", "text-rpg-cyan", "Completude × validade × (1 − outliers), 0–100. Requer análise."],
    [<Crown key="i" />, i.beatBaseline, "Acima da base", "text-rpg-gold", "Modelos cuja versão superou a linha de base no teste final."],
    [<Telescope key="i" />, i.predictionsToday, "Previsões hoje/amanhã", "text-rpg-pink", "Previsões geradas para hoje e amanhã."],
    [<AlertTriangle key="i" />, i.alerts, "Alertas", i.alerts ? "text-rpg-red" : "text-rpg-muted", "Degradação, drift, falhas e dados insuficientes."],
    [<Award key="i" />, `Nv ${o.researcher.level}`, "Pesquisador", "text-rpg-gold", o.researcher.rule],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {items.map(([icon, v, l, tone, hint]) => (
        <div key={l} className="flex min-w-0 flex-col items-center gap-0.5 border-2 border-rpg-border bg-rpg-panel px-2 py-2.5 text-center" style={R} title={hint}>
          <span className={clsx("[&>svg]:h-5 [&>svg]:w-5", tone)} aria-hidden>
            {icon}
          </span>
          <span className="font-rpg text-xl font-bold tabular-nums text-rpg-text">{v}</span>
          <span className="truncate text-[10px] text-rpg-muted">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function ForgeScreen() {
  const { data: o, isLoading, isError, refetch } = useForgeOverview();
  const [tab, setTab] = useUrlTab(TABS, "visao");
  const [wizard, setWizard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify: Notify = (msg, tone = "success") => setToast({ msg, tone });
  const props = o ? { o, notify, selected, onSelect: setSelected } : null;
  return (
    <div className="space-y-3 px-3 py-4 sm:px-4 md:px-6 md:py-6">
      {isLoading && <div className="rpg-panel h-48 animate-pulse" aria-busy="true" aria-label="Acendendo a Forja" />}
      {isError && (
        <div className="rpg-panel p-3" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir a Forja.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      )}
      {o && props && (
        <>
          <Banner o={o} notify={notify} onWizard={() => setWizard(true)} />
          <Indicators o={o} />
          <div role="tablist" aria-label="Seções da Forja" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {TAB_META.map(([v, l, icon]) => (
              <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={clsx("flex min-h-[40px] shrink-0 items-center gap-1.5 border-2 px-3 text-sm font-semibold", tab === v ? "border-rpg-purple bg-rpg-purple/15 text-rpg-text" : "border-rpg-border bg-rpg-panel text-rpg-muted hover:text-rpg-text")} style={R}>
                {icon} {l}
              </button>
            ))}
          </div>
          {tab === "visao" && <OverviewTab o={o} notify={notify} goTab={setTab} />}
          {tab === "artefatos" && <ArtifactsTab o={o} notify={notify} onWizard={() => setWizard(true)} onOpenVersions={(id) => { setSelected(id); setTab("modelos"); }} />}
          {tab === "modelos" && <ModelsTab {...props} onWizard={() => setWizard(true)} />}
          {tab === "arena" && <ArenaTab {...props} />}
          {tab === "previsoes" && <PredictionsTab {...props} />}
          {tab === "runas" && <RunesTab {...props} />}
          {tab === "experimentos" && <ExperimentsTab o={o} notify={notify} />}
          {tab === "protocolos" && <ProtocolsTab />}
          {tab === "gargalos" && <BottlenecksTab o={o} notify={notify} />}
          {tab === "laboratorio" && <LabTab o={o} notify={notify} />}
          {tab === "monitoramento" && <MonitorTab {...props} />}
          {tab === "relatorios" && <ReportsTab {...props} />}
          <ModelWizard open={wizard} onClose={() => setWizard(false)} notify={notify} />
          <p className="flex items-center gap-1.5 text-[10px] text-rpg-muted">
            <BarChart3 size={12} aria-hidden /> Todo número desta tela vem de cálculos sobre os seus registros. Modelos estimam padrões — não são diagnósticos nem certezas.
          </p>
        </>
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
