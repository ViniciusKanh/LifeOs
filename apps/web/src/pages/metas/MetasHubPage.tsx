import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, Bot, Crown, Flag, LayoutGrid, Target, Zap } from "lucide-react";
import { useGoals } from "@/hooks/useGoals";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useGoalsAnalytics, useGoalsHub, useGoalsHubActions, useGoalsInsights } from "@/hooks/useGoalsHub";
import type { HubGoal } from "@/services/goalsHubService";
import { RPGToast } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import {
  ActiveGoals,
  AutomationMini,
  BreakdownModal,
  CampaignsColumn,
  EvolutionChart,
  GoalIndicators,
  GoalsAnalyticsView,
  GoalsBanner,
  GoalsCopilot,
  PlanSuggestionsPanel,
  PlannerLevelCard,
  RewardsStrip,
  RewardsView,
} from "@/components/goals/GoalsHub";
import { MetasPage } from "./MetasPage";

type Tab = "visao" | "metas" | "campanhas" | "automacoes" | "copiloto" | "analises" | "recompensas";
const TABS: Array<{ value: Tab; label: string; icon: typeof Target }> = [
  { value: "visao", label: "Visão Geral", icon: LayoutGrid },
  { value: "metas", label: "Minhas Metas", icon: Target },
  { value: "campanhas", label: "Campanhas", icon: Flag },
  { value: "automacoes", label: "Automações", icon: Zap },
  { value: "copiloto", label: "IA Copiloto", icon: Bot },
  { value: "analises", label: "Análises", icon: BarChart3 },
  { value: "recompensas", label: "Recompensas", icon: Crown },
];

/**
 * Metas 2.0 — central de planejamento gamificada. "Minhas Metas" é a tela
 * completa anterior (criar, editar, progresso, submetas, renovação), sem
 * perda de funcionalidade; as demais abas leem o /api/goals-hub.
 * A aba ativa fica na URL (?aba=) — o voltar do navegador funciona.
 */
export function MetasHubPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("aba") as Tab | null;
  const tab: Tab = tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "visao";
  const setTab = (t: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (t === "visao") p.delete("aba");
      else p.set("aba", t);
      p.delete("nova");
      return p;
    });
  const hubQ = useGoalsHub();
  const analyticsQ = useGoalsAnalytics(tab === "visao" || tab === "analises");
  const insightsQ = useGoalsInsights(tab === "copiloto" || tab === "visao");
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { updateGoal } = useGoals();
  const { replan, weeklyPlan } = useGoalsHubActions();
  const [planGoal, setPlanGoal] = useState<HubGoal | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const hub = hubQ.data;

  const newGoal = () =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("aba", "metas");
      p.set("nova", "1");
      return p;
    });

  const complete = (g: HubGoal) => {
    // Progresso ≠ conclusão: concluir é sempre uma decisão do usuário.
    if (g.progressPct < 100 && !confirm(`"${g.title}" está em ${g.progressPct}%. Marcar como concluída mesmo assim?`)) return;
    updateGoal({ id: g.id, patch: { status: "done" } });
    setToast({ msg: "Meta concluída! 🏆", tone: "success" });
  };

  const doReplan = (g: HubGoal) =>
    replan.mutate(g.id, {
      onSuccess: () => {
        setToast({ msg: "Replanejamento sugerido — revise em Automações.", tone: "success" });
        setTab("automacoes");
      },
      onError: (e) => setToast({ msg: e instanceof Error ? e.message : "Não foi possível replanejar.", tone: "error" }),
    });

  const doWeekly = () =>
    weeklyPlan.mutate(undefined, {
      onSuccess: () => {
        setToast({ msg: "Plano da semana sugerido — revise e aplique.", tone: "success" });
        setTab("automacoes");
      },
      onError: (e) => setToast({ msg: e instanceof Error ? e.message : "Sem tarefas para planejar.", tone: "error" }),
    });

  return (
    <div className="w-full px-4 py-5 md:px-6 lg:px-8 md:py-6 space-y-4">
      <GoalsBanner onNew={newGoal} />

      <div role="tablist" aria-label="Seções de Metas" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:px-0">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx(
              "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 border-2 px-3 text-sm font-semibold transition-colors",
              tab === value ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light shadow-[0_0_14px_-4px_rgb(var(--rpg-gold)/0.7)]" : "border-rpg-border bg-rpg-bg-2/70 text-rpg-muted hover:text-rpg-text",
            )}
            style={{ borderRadius: 4 }}
          >
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab !== "metas" && hubQ.isLoading && <div className="rpg-panel h-48 animate-pulse" aria-busy aria-label="Carregando metas" />}
      {tab !== "metas" && hubQ.isError && (
        <div className="rpg-panel p-4" role="alert">
          <p className="text-sm">Não foi possível carregar a central de metas.</p>
          <button type="button" className="rpg-btn rpg-btn-secondary mt-2" onClick={() => void hubQ.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}

      {tab === "visao" && hub && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
              <PlannerLevelCard hub={hub} />
              <GoalIndicators hub={hub} />
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
              <CampaignsColumn campaigns={campaigns} loading={campaignsLoading} compact />
              <ActiveGoals hub={hub} onNew={newGoal} onEdit={() => setTab("metas")} onPlanAi={setPlanGoal} onReplan={doReplan} onComplete={complete} />
            </div>
          </div>
          <aside className="min-w-0 space-y-4" aria-label="Automação, recompensas e evolução">
            <AutomationMini onOpenAll={() => setTab("automacoes")} onAi={() => setTab("copiloto")} />
            <RewardsStrip hub={hub} onOpen={() => setTab("recompensas")} />
            <EvolutionChart analytics={analyticsQ.data} compact />
          </aside>
        </div>
      )}

      {/* Tela completa anterior (CRUD, progresso manual, submetas, renovação, parceiros). */}
      {tab === "metas" && <MetasPage embedded />}

      {tab === "campanhas" && (
        <div className="space-y-3">
          <p className="text-sm text-rpg-muted">
            Campanhas agrupam metas, projetos, missões e marcos. Elas são criadas e evoluídas na{" "}
            <Link to="/forja-campanhas" className="text-rpg-gold-light underline">
              Forja de Campanhas
            </Link>{" "}
            — aqui você acompanha o progresso de cada uma.
          </p>
          <CampaignsColumn campaigns={campaigns} loading={campaignsLoading} />
        </div>
      )}

      {tab === "automacoes" && (
        <div className="space-y-3">
          <PlanSuggestionsPanel />
          <AutomationsPanel module="goals" title="Automações de metas" intro="Cada automação tem configuração, histórico e execução manual. Mudanças de planejamento sempre esperam sua aprovação." />
        </div>
      )}

      {tab === "copiloto" && (
        <GoalsCopilot insights={insightsQ.data?.insights ?? []} nextActions={insightsQ.data?.nextActions ?? []} loading={insightsQ.isLoading} onWeekly={doWeekly} weeklyPending={weeklyPlan.isPending} />
      )}

      {tab === "analises" && <GoalsAnalyticsView analytics={analyticsQ.data} />}

      {tab === "recompensas" && hub && <RewardsView hub={hub} />}

      <BreakdownModal goal={planGoal} onClose={() => setPlanGoal(null)} onDone={(m) => setToast({ msg: m, tone: "success" })} />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default MetasHubPage;
