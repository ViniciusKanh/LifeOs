import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, CalendarDays, CalendarRange, LayoutGrid, Repeat, Zap } from "lucide-react";
import { useAgendaHub } from "@/hooks/usePlanningHub";
import { RPGToast } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { AdvisorPanel, MODULE_ART, ModuleBanner, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { AgendaCalendar, AgendaIndicators, AgendaRankPanel, ConflictsPanel, SuggestionsPanel, TimeDistribution, TimeTower } from "@/components/agenda/AgendaRPG";
import { IcsSubscribeCard } from "./CalendarioPage";

const TABS = ["visao", "calendario", "semana", "rotina", "automacoes", "ia"] as const;
type Tab = (typeof TABS)[number];

/**
 * Agenda da Jornada — Central Temporal. A aba fica na URL (?aba=).
 * A assinatura .ics (somente leitura) continua no fim da página.
 */
export function AgendaRpgPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("aba") as Tab) ? (params.get("aba") as Tab) : "visao";
  const setTab = (t: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (t === "visao") p.delete("aba");
      else p.set("aba", t);
      return p;
    });
  const hubQ = useAgendaHub();
  const hub = hubQ.data;
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const today = hub?.today ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full space-y-4 px-4 py-5 md:px-6 md:py-6 lg:px-8">
      <ModuleBanner
        eyebrow="Central temporal"
        title="Agenda da Jornada"
        subtitle="Organize seu tempo, compromissos e missões. Equilíbrio entre rotina, estudos e descanso."
        mage={`${MODULE_ART}/agenda/banner-mage.webp`}
        scene={`${MODULE_ART}/agenda/banner-scene.webp`}
        aside={hub ? <AgendaRankPanel hub={hub} /> : <div className="rpg-panel h-40 animate-pulse" aria-busy aria-label="Carregando rank" />}
      />

      {hubQ.isError && (
        <div className="rpg-panel p-3 text-sm" role="alert">
          Não foi possível carregar os indicadores da Agenda.{" "}
          <button type="button" className="underline" onClick={() => void hubQ.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}
      {hub ? <AgendaIndicators hub={hub} /> : <div className="h-24 animate-pulse rpg-panel" aria-busy aria-label="Carregando indicadores" />}

      <ModuleTabs
        label="Seções da Agenda"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "visao", label: "Visão Geral", icon: <LayoutGrid size={15} /> },
          { value: "calendario", label: "Calendário", icon: <CalendarDays size={15} /> },
          { value: "semana", label: "Semana", icon: <CalendarRange size={15} /> },
          { value: "rotina", label: "Rotina", icon: <Repeat size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} />, badge: hub?.pendingSuggestions.length ?? 0 },
          { value: "ia", label: "IA Copiloto", icon: <Bot size={15} /> },
        ]}
      />

      {tab === "visao" && hub && (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <TimeTower hub={hub} onToast={notify} />
          <AgendaCalendar today={today} onToast={notify} />
          <div className="min-w-0 space-y-3">
            <ConflictsPanel hub={hub} onToast={notify} />
            <SuggestionsPanel hub={hub} onToast={notify} />
          </div>
          <div className="xl:col-span-3">
            <TimeDistribution hub={hub} />
          </div>
        </div>
      )}
      {tab === "calendario" && <AgendaCalendar today={today} onToast={notify} />}
      {tab === "semana" && <AgendaCalendar today={today} onToast={notify} initialView="semana" />}
      {tab === "rotina" && hub && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <TimeTower hub={hub} onToast={notify} />
          <div className="space-y-3">
            <AgendaCalendar today={today} onToast={notify} initialView="dia" />
            <TimeDistribution hub={hub} />
          </div>
        </div>
      )}
      {tab === "automacoes" && (
        <div className="space-y-3">
          {hub && <SuggestionsPanel hub={hub} onToast={notify} />}
          <AutomationsPanel module="agenda" title="Automações da Agenda" intro="Alterar horários existentes sempre passa pela sua aprovação. Alertas e resumos rodam uma vez por dia." />
        </div>
      )}
      {tab === "ia" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <AdvisorPanel module="agenda" title="Planejador Arcano" avatar={`${MODULE_ART}/agenda/advisor.webp`} />
          {hub && <ConflictsPanel hub={hub} onToast={notify} />}
        </div>
      )}

      <IcsSubscribeCard />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
