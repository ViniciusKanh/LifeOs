import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FlaskConical, Plus, Wand2 } from "lucide-react";
import { PageHeader, Button, Card } from "@/components/ui/primitives";
import { useExperiments } from "@/hooks/useExperiments";
import { useExperiment } from "@/hooks/useExperiment";
import { ExperimentSummaryCards } from "@/components/experiments/ExperimentSummaryCards";
import { ActiveExperimentCard } from "@/components/experiments/ActiveExperimentCard";
import { ExperimentComparisonCard } from "@/components/experiments/ExperimentComparison";
import { ExperimentCheckins } from "@/components/experiments/ExperimentCheckins";
import { ExperimentObservations } from "@/components/experiments/ExperimentObservations";
import { ExperimentLogModal } from "@/components/experiments/ExperimentLogModal";
import { ExperimentBoard } from "@/components/experiments/ExperimentBoard";
import { ExperimentInsightsCard, ExperimentAISuggestionCard, ExperimentsEmptyState } from "@/components/experiments/ExperimentInsights";
import { ExperimentWizard } from "@/components/experiments/ExperimentWizard";
import { ExperimentTodayCheckin } from "@/components/experiments/ExperimentTodayCheckin";
import { ExperimentAIDesigner } from "@/components/experiments/ExperimentAIDesigner";
import type { ExperimentAISuggestion, ExperimentProposal } from "@/types";

export function ExperimentsPage() {
  const { experiments, isLoading, summary, insights, createExperiment, isCreating, setStatus } = useExperiments();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSuggestion, setWizardSuggestion] = useState<ExperimentAISuggestion | null>(null);
  const [wizardProposal, setWizardProposal] = useState<ExperimentProposal | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);

  // Com vários experimentos ativos, o usuário escolhe qual fica em destaque (antes só o 1º aparecia).
  const activeExperiments = experiments.filter((e) => e.status === "active");
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const featured = activeExperiments.find((e) => e.id === featuredId) ?? activeExperiments[0] ?? null;
  const featuredDetail = useExperiment(featured?.id);

  const openWizard = (suggestion?: ExperimentAISuggestion, proposal?: ExperimentProposal) => {
    setWizardSuggestion(suggestion ?? null);
    setWizardProposal(proposal ?? null);
    setWizardOpen(true);
  };

  // Bloco "Desenhe com IA": aberto por padrão quando ainda não há experimento nenhum.
  const designerVisible = designerOpen || experiments.length === 0;
  const designer = (
    <section className="relative overflow-hidden rounded-2xl border border-cat-purple/25 bg-paper-raised dark:bg-ink-raised shadow-card dark:shadow-card-dark">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-28 right-0 w-96 h-96 rounded-full bg-gradient-to-br from-cat-purple/25 via-cat-blue/15 to-cat-pink/10 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 25, 0], rotate: [0, 20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <button
        type="button"
        onClick={() => setDesignerOpen((v) => !v)}
        aria-expanded={designerVisible}
        className="relative w-full flex items-center gap-3 p-4 md:p-5 text-left"
      >
        <motion.span
          className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cat-purple to-cat-blue text-white flex items-center justify-center shrink-0 shadow-lg shadow-cat-purple/30"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}
        >
          <Wand2 size={20} />
        </motion.span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-lg leading-tight">Desenhe um experimento com IA</span>
          <span className="block text-xs text-slate">Diga o que quer melhorar. O Copilot lê seus registros reais e propõe testes já configurados para medir.</span>
        </span>
        {experiments.length > 0 && <ChevronDown size={18} className={`text-slate shrink-0 transition-transform ${designerVisible ? "rotate-180" : ""}`} />}
      </button>
      <AnimatePresence initial={false}>
        {designerVisible && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <ExperimentAIDesigner onPick={(p) => openWizard(undefined, p)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );

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

      {designer}

      {experiments.length === 0 ? (
        <ExperimentsEmptyState onCreate={() => openWizard()} onAskCopilot={() => setDesignerOpen(true)} />
      ) : (
        <>
          <ExperimentTodayCheckin experiments={experiments} />

          {activeExperiments.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist" aria-label="Experimento em destaque">
              {activeExperiments.map((e) => (
                <button
                  key={e.id}
                  role="tab"
                  aria-selected={featured?.id === e.id}
                  onClick={() => setFeaturedId(e.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${featured?.id === e.id ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border text-slate hover:text-inherit"}`}
                >
                  {e.title}
                </button>
              ))}
            </div>
          )}

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

          <ExperimentBoard experiments={experiments} />

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
          initialProposal={wizardProposal}
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
