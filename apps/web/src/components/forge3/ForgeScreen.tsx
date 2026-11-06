import { useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Award, BarChart3, BookMarked, Crown, FileText, FlaskConical, Gauge, Gem, Hammer, LayoutDashboard, Loader2, Play, Settings2, Sparkles, Swords, Telescope, TrendingDown, Workflow } from "lucide-react";
import { RPGButton, RPGStatCard, RPGTabs, RPGToast } from "@/components/rpg";
import { useUrlTab } from "@/components/hero/HeroShared";
import { useForgeActions, useForgeOverview } from "@/hooks/useForge";
import type { ForgeOverview } from "@/services/forgeService";
import { FORGE_ART, errMsg, type Notify } from "./ForgeShared";
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

function Banner({ o, notify, onWizard, onModels }: { o: ForgeOverview; notify: Notify; onWizard: () => void; onModels: () => void }) {
  const { analyze } = useForgeActions();
  const chips = ["Machine Learning", "Validação temporal", "Previsões", "Explicabilidade"];
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative grid items-stretch lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_auto]">
        <div className="relative h-36 overflow-hidden sm:h-44 lg:h-auto lg:min-h-[210px]" aria-hidden>
          <img src={`${FORGE_ART}/banner-crystal.webp`} alt="" decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover object-[50%_45%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-rpg-panel via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:from-70% lg:to-rpg-panel" />
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-2 px-4 py-4 sm:px-6 lg:py-5">
          <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl xl:text-5xl">Forja da Inteligência</h1>
          <p className="max-w-2xl text-base text-rpg-text sm:text-lg">Transforme seus dados em previsões, modelos e estratégias para evoluir sua jornada.</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-rpg-gold-light/90" aria-label="Recursos da Forja">
            {chips.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rotate-45 bg-rpg-gold" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <RPGButton variant="primary" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Dados analisados: o núcleo foi atualizado."), onError: (e) => notify(errMsg(e, "Falha na análise."), "error") })}>
              {analyze.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />} Analisar meus dados
            </RPGButton>
            <RPGButton variant="secondary" onClick={onModels}>
              <Settings2 size={15} aria-hidden /> Configurar modelos
            </RPGButton>
            <RPGButton variant="secondary" onClick={onWizard}>
              <FlaskConical size={15} aria-hidden /> Novo modelo
            </RPGButton>
          </div>
        </div>
        <div className="relative hidden items-start pr-6 xl:flex" aria-hidden>
          <img src={`${FORGE_ART}/emblem.webp`} alt="" className="pixelated -mt-1 h-40 w-auto drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)]" />
        </div>
      </div>
    </header>
  );
}

/** HUD de indicadores — cada um com significado próprio, nenhuma média entre métricas de escalas diferentes. */
function Indicators({ o }: { o: ForgeOverview }) {
  const i = o.indicators;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      <RPGStatCard layout="wide" dense tone="green" icon={<Sparkles size={22} />} value={String(i.artifactsActive)} label="Artefatos ativos" caption="em produção" />
      <RPGStatCard layout="wide" dense tone="purple" icon={<Hammer size={22} />} value={`${i.modelsTrained}/${i.models}`} label="Modelos treinados" caption="com versão registrada" />
      <RPGStatCard layout="wide" dense tone="blue" icon={<FlaskConical size={22} />} value={String(i.experiments)} label="Experimentos" caption="treinos executados" />
      <RPGStatCard layout="wide" dense tone="cyan" icon={<Gauge size={22} />} value={i.dataQuality == null ? "—" : String(i.dataQuality)} label="Qualidade dos dados" caption={i.dataQuality == null ? "analise o núcleo" : "de 100"} />
      <RPGStatCard layout="wide" dense tone="gold" icon={<Crown size={22} />} value={String(i.beatBaseline)} label="Acima da base" caption="venceram no teste final" />
      <RPGStatCard layout="wide" dense tone="pink" icon={<Telescope size={22} />} value={String(i.predictionsToday)} label="Profecias" caption="hoje e amanhã" />
      <RPGStatCard layout="wide" dense tone={i.alerts ? "red" : "muted"} icon={<AlertTriangle size={22} />} value={String(i.alerts)} label="Alertas" caption={i.alerts ? "ver recomendações" : "tudo em ordem"} />
      <RPGStatCard layout="wide" dense tone="gold" icon={<Award size={22} />} value={`Nv ${o.researcher.level}`} label="Pesquisador" caption={o.researcher.title} />
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
    <div className="w-full space-y-4 px-4 py-6 md:px-6 lg:px-8">
      {isLoading && (
        <div className="space-y-4" aria-busy="true" aria-label="Acendendo a Forja">
          <div className="rpg-panel h-52 animate-pulse motion-reduce:animate-none" />
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rpg-panel h-60 animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      )}
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
          <Banner o={o} notify={notify} onWizard={() => setWizard(true)} onModels={() => setTab("modelos")} />
          <Indicators o={o} />
          <RPGTabs label="Seções da Forja" tabs={TAB_META.map(([value, label, icon]) => ({ value, label, icon }))} value={tab} onChange={setTab} className="max-w-full" />
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
