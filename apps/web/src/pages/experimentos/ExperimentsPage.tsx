import { useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { PageHeader, Button, Card } from "@/components/ui/primitives";
import { useExperiments } from "@/hooks/useExperiments";
import { useExperiment } from "@/hooks/useExperiment";
import { ExperimentSummaryCards } from "@/components/experiments/ExperimentSummaryCards";
import { ActiveExperimentCard } from "@/components/experiments/ActiveExperimentCard";
import { ExperimentComparisonCard } from "@/components/experiments/ExperimentComparison";
import { ExperimentCheckins } from "@/components/experiments/ExperimentCheckins";
import { ExperimentObservations } from "@/components/experiments/ExperimentObservations";
import { ExperimentLogModal } from "@/components/experiments/ExperimentLogModal";
import { ExperimentList } from "@/components/experiments/ExperimentList";
import { ExperimentInsightsCard, ExperimentAISuggestionCard, ExperimentsEmptyState } from "@/components/experiments/ExperimentInsights";
import { ExperimentWizard } from "@/components/experiments/ExperimentWizard";
import type { ExperimentAISuggestion } from "@/types";

export function ExperimentsPage() {
  const { experiments, isLoading, summary, insights, createExperiment, isCreating, setStatus } = useExperiments();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSuggestion, setWizardSuggestion] = useState<ExperimentAISuggestion | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const featured = experiments.find((e) => e.status === "active") ?? null;
  const featuredDetail = useExperiment(featured?.id);

  const openWizard = (suggestion?: ExperimentAISuggestion) => {
    setWizardSuggestion(suggestion ?? null);
    setWizardOpen(true);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
        <div className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="Experimentos Pessoais"
        subtitle="Teste mudanças na sua rotina e acompanhe os efeitos nos seus próprios dados."
        actions={
          <Button onClick={() => openWizard()}>
            <Plus size={15} /> Novo experimento
          </Button>
        }
      />
      <p className="text-xs text-slate italic -mt-3">"Mudanças pequenas ficam mais claras quando são medidas."</p>

      {summary && <ExperimentSummaryCards summary={summary} />}

      {experiments.length === 0 ? (
        <ExperimentsEmptyState onCreate={() => openWizard()} onAskCopilot={() => openWizard()} />
      ) : (
        <>
          {featured && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-1">
                <ActiveExperimentCard
                  experiment={featured}
                  onRegisterObservation={() => setLogModalOpen(true)}
                  onChangeStatus={(status) => setStatus({ id: featured.id, status })}
                />
              </div>
              <div className="lg:col-span-1">
                {featuredDetail.detail ? (
                  <ExperimentComparisonCard
                    comparison={featuredDetail.detail.comparison}
                    beforeDays={featuredDetail.detail.comparison[0]?.beforeDays ?? 0}
                    duringDays={featuredDetail.detail.comparison[0]?.duringDays ?? 0}
                  />
                ) : (
                  <Card className="p-5 h-40 animate-pulse" />
                )}
              </div>
              <div className="lg:col-span-1 space-y-4">
                <ExperimentCheckins checkins={featuredDetail.detail?.checkins ?? []} title="Check-ins da semana" />
                <ExperimentObservations logs={featuredDetail.detail?.logs ?? []} onNewObservation={() => setLogModalOpen(true)} limit={3} />
              </div>
            </div>
          )}

          <ExperimentList experiments={experiments} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExperimentInsightsCard insights={insights} />
            <ExperimentAISuggestionCard onUseSuggestion={(s) => openWizard(s)} />
          </div>
        </>
      )}

      {wizardOpen && (
        <ExperimentWizard
          onClose={() => setWizardOpen(false)}
          onSubmit={(input) => createExperiment(input)}
          isSubmitting={isCreating}
          initialSuggestion={wizardSuggestion}
        />
      )}

      {logModalOpen && featured && (
        <ExperimentLogModal
          experiment={featured}
          checkins={featuredDetail.detail?.checkins}
          logs={featuredDetail.detail?.logs}
          onClose={() => setLogModalOpen(false)}
          onSave={(input) => featuredDetail.upsertLog(input)}
          isSaving={featuredDetail.isSavingLog}
        />
      )}
    </div>
  );
}
