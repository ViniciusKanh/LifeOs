import { useState } from "react";
import clsx from "clsx";
import { TrendingUp } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { useGoalForecast } from "@/hooks/useGoalForecast";
import { GoalForecastSummaryCards } from "@/components/goal-forecast/GoalForecastSummary";
import { GoalForecastList } from "@/components/goal-forecast/GoalForecastList";
import { GoalTimeline } from "@/components/goal-forecast/GoalTimeline";
import { GoalAreaDistribution } from "@/components/goal-forecast/GoalAreaDistribution";
import { GoalCompletionProjection } from "@/components/goal-forecast/GoalCompletionProjection";
import { GoalRiskList } from "@/components/goal-forecast/GoalRiskList";
import { GoalForecastInsights } from "@/components/goal-forecast/GoalForecastInsights";
import type { GoalForecastPeriodFilter } from "@/types";

const PERIODS: { key: GoalForecastPeriodFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "this_year", label: "Este ano" },
  { key: "next_year", label: "Próximo ano" },
];

export function GoalForecastPage() {
  const [period, setPeriod] = useState<GoalForecastPeriodFilter>("all");
  const { data, isLoading, isError } = useGoalForecast(period);
  const isEmpty = !isLoading && data && data.goals.length === 0 && period === "all";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<TrendingUp size={22} />}
        title="Goal Forecast"
        subtitle="Veja quando suas metas podem ser alcançadas com base no seu ritmo atual."
        actions={
          <div className="flex gap-1.5 bg-paper dark:bg-ink rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={clsx(
                  "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                  period === p.key ? "bg-brand-500 text-white" : "text-slate hover:bg-paper-border/60 dark:hover:bg-ink-border/40"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-2xl border border-paper-border dark:border-ink-border p-8 text-center text-sm text-slate">
          Não foi possível carregar o Goal Forecast agora. Tente novamente em instantes.
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="Você ainda não possui metas para projetar."
          description="Crie uma meta para que o LifeOS acompanhe seu ritmo e estime sua conclusão."
          ctaLabel="Criar meta"
        />
      ) : (
        <>
          <GoalForecastSummaryCards summary={data.summary} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <GoalForecastList goals={data.goals} />
            <GoalTimeline entries={data.timeline} today={data.today} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <GoalAreaDistribution areas={data.areas} />
            <GoalCompletionProjection points={data.monthlyProjection} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <GoalRiskList risks={data.risks} />
            <GoalForecastInsights suggestions={data.suggestions} insights={data.insights} />
          </div>
        </>
      )}
    </div>
  );
}
