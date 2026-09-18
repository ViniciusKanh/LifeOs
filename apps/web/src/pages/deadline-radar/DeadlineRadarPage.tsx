import { useState } from "react";
import clsx from "clsx";
import { Radar } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { useDeadlineRadar } from "@/hooks/useDeadlineRadar";
import { DeadlineStatusBanner } from "@/components/deadline-radar/DeadlineStatusBanner";
import { DeadlineKpis } from "@/components/deadline-radar/DeadlineKpis";
import { CriticalDeadlineList } from "@/components/deadline-radar/CriticalDeadlineList";
import { DeadlineAreaChart } from "@/components/deadline-radar/DeadlineAreaChart";
import { UpcomingMilestones } from "@/components/deadline-radar/UpcomingMilestones";
import { DeadlineStatusOverview } from "@/components/deadline-radar/DeadlineStatusOverview";
import { DeadlineRiskList } from "@/components/deadline-radar/DeadlineRiskList";
import { DeadlineTrendChart } from "@/components/deadline-radar/DeadlineTrendChart";
import { DeadlineInsightsCard } from "@/components/deadline-radar/DeadlineSuggestionsAndInsights";
import { DeadlineQuickActions } from "@/components/deadline-radar/DeadlineQuickActions";
import { EmptyState } from "@/components/ui/primitives";
import type { DeadlinePeriodFilter } from "@/types";

const PERIODS: { key: DeadlinePeriodFilter; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "all", label: "Todos" },
];

export function DeadlineRadarPage() {
  const [period, setPeriod] = useState<DeadlinePeriodFilter>("7d");
  const { data, isLoading, isError } = useDeadlineRadar(period);

  const isEmpty = !isLoading && data && data.items.length === 0;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<Radar size={22} />}
        title="🛰️ Deadline Radar"
        subtitle="Todos os seus prazos em um só lugar. Priorize o que realmente importa."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
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
            <span className="text-xs text-slate italic hidden lg:inline">"Antecipar é criar mais liberdade."</span>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-16 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-2xl border border-paper-border dark:border-ink-border p-8 text-center text-sm text-slate">
          Não foi possível carregar o Deadline Radar agora. Tente novamente em instantes.
        </div>
      ) : isEmpty ? (
        <EmptyState title="Tudo tranquilo por aqui. 🌿" description="Você não possui prazos pendentes no momento." ctaLabel="Adicionar tarefa" />
      ) : (
        <>
          <DeadlineStatusBanner dayStatus={data.dayStatus} focusItem={data.focusItem} summary={data.summary} />

          <DeadlineKpis summary={data.summary} />

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
            <CriticalDeadlineList items={data.critical} />
            <div className="space-y-4">
              <DeadlineAreaChart areas={data.areas} />
              <DeadlineQuickActions />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <DeadlineRiskList risks={data.risks} />
            <DeadlineTrendChart trend={data.trend} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <UpcomingMilestones items={data.upcomingMilestones} />
            <DeadlineStatusOverview bars={data.statusBars} />
          </div>

          <DeadlineInsightsCard suggestions={data.suggestions} insights={data.insights} />
        </>
      )}
    </div>
  );
}
