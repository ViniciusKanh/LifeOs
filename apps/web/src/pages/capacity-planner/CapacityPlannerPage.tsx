import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gauge, Wand2 } from "lucide-react";
import { PageHeader, Button } from "@/components/ui/primitives";
import {
  useCapacityDay,
  useCapacityPlanPreview,
  useApplyCapacityPlan,
  useCreateCapacityBlock,
  useDeleteCapacityBlock,
} from "@/hooks/useCapacityPlanner";
import { useTasks } from "@/hooks/useTasks";
import { DateNavigator } from "@/components/capacity-planner/DateNavigator";
import { CapacitySummaryCard } from "@/components/capacity-planner/CapacitySummaryCard";
import { EnergyForecastCard, FocusForecastCard } from "@/components/capacity-planner/ForecastCards";
import { ContextCard } from "@/components/capacity-planner/ContextCard";
import { DayTimeline } from "@/components/capacity-planner/DayTimeline";
import { DayTasksCard } from "@/components/capacity-planner/DayTasksCard";
import { AreaDistributionCard } from "@/components/capacity-planner/AreaDistributionCard";
import { LoadAnalysisCard } from "@/components/capacity-planner/LoadAnalysisCard";
import { InsightsAndSuggestionsCard } from "@/components/capacity-planner/InsightsAndSuggestionsCard";
import { AdjustPlanModal } from "@/components/capacity-planner/AdjustPlanModal";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CapacityPlannerPage() {
  const [date, setDate] = useState(todayISO());
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading, isError } = useCapacityDay(date);
  const { data: suggestion, isLoading: previewLoading } = useCapacityPlanPreview(date, modalOpen);
  const applyPlan = useApplyCapacityPlan(date);
  const createBlock = useCreateCapacityBlock(date);
  const deleteBlock = useDeleteCapacityBlock(date);
  const { updateTask } = useTasks();
  const queryClient = useQueryClient();

  async function handleToggleDone(taskId: string) {
    await updateTask({ id: taskId, patch: { status: "Concluído" } });
    queryClient.invalidateQueries({ queryKey: ["capacity", "day", date] });
  }

  function handleSchedule(taskId: string, startTime: string, endTime: string) {
    createBlock.mutate({ date, startTime, endTime, entityType: "task", entityId: taskId, blockType: "normal" });
  }

  function handleRemoveBlock(blockId: string) {
    deleteBlock.mutate(blockId);
  }

  async function handleConfirm() {
    if (!suggestion || suggestion.proposed.length === 0) return;
    await applyPlan.mutateAsync(suggestion.proposed.map((p) => ({ taskId: p.taskId, startTime: p.startTime, endTime: p.endTime, blockType: p.blockType })));
    setModalOpen(false);
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<Gauge size={22} />}
        title="Capacity Planner"
        subtitle="Planeje seu dia com base na sua agenda, energia e foco."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DateNavigator date={date} onChange={setDate} />
            <Button onClick={() => setModalOpen(true)}>
              <Wand2 size={16} /> ✨ Ajustar plano automaticamente
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-2xl border border-paper-border dark:border-ink-border p-8 text-center text-sm text-slate">
          Não foi possível carregar o Capacity Planner agora. Tente novamente em instantes.
        </div>
      ) : (
        <>
          <CapacitySummaryCard summary={data.summary} overloadMessage={data.overloadMessage} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <EnergyForecastCard energy={data.energy} />
            <FocusForecastCard focus={data.focus} />
            <ContextCard context={data.context} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 items-start">
            <DayTimeline blocks={data.blocks} conflicts={data.conflicts} onRemoveBlock={handleRemoveBlock} />
            <DayTasksCard
              tasks={data.tasks}
              blocks={data.blocks}
              bestFocusStart={data.focus.bestPeriod ? data.focus.bestPeriod.split("–")[0].replace("h", ":00") : null}
              onToggleDone={handleToggleDone}
              onSchedule={handleSchedule}
              onRemoveSchedule={handleRemoveBlock}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <AreaDistributionCard areas={data.areas} />
            <LoadAnalysisCard summary={data.summary} />
          </div>

          <InsightsAndSuggestionsCard dashboard={data} />
        </>
      )}

      {modalOpen && (
        <AdjustPlanModal
          suggestion={suggestion}
          loading={previewLoading}
          applying={applyPlan.isPending}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
