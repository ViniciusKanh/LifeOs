import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Quote, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { useExperiment } from "@/hooks/useExperiment";
import { ExperimentAnalysisPanel } from "@/components/experiments/ExperimentAnalysisPanel";
import { ExperimentCalendar } from "@/components/experiments/ExperimentCalendar";
import { ExperimentTodayCheckin } from "@/components/experiments/ExperimentTodayCheckin";
import { ExperimentObservations } from "@/components/experiments/ExperimentObservations";
import { ExperimentLogModal } from "@/components/experiments/ExperimentLogModal";
import { ExperimentTimelineChart } from "@/components/experiments/ExperimentTimelineChart";
import { ExperimentAIPanel } from "@/components/experiments/ExperimentAIPanel";
import { ExperimentConcludeModal } from "@/components/experiments/ExperimentConcludeModal";
import { ExperimentEditModal } from "@/components/experiments/ExperimentEditModal";
import { STATUS_LABEL_PT, CATEGORY_LABEL } from "@/components/experiments/experimentDisplay";
import { useExperiments } from "@/hooks/useExperiments";

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { detail, analysis, isAnalysisLoading, isLoading, isError, setStatus, upsertLog, isSavingLog, conclude, isConcluding, analyze, isAnalyzing, analysisText, analysisError, updateExperiment } = useExperiment(id);
  const { removeExperiment } = useExperiments();

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logDate, setLogDate] = useState<string | undefined>(undefined);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-40 rounded-lg bg-paper dark:bg-ink animate-pulse" />
        <div className="h-48 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/experimentos")}><ArrowLeft size={15} /> Voltar</Button>
        <p className="text-sm text-slate mt-4">Experimento não encontrado.</p>
      </div>
    );
  }

  const { experiment, progressPct, daysElapsed, durationDays, checkins, consistencyPct, logs } = detail;
  const openLog = (date?: string) => {
    setLogDate(date);
    setLogModalOpen(true);
  };

  const handleDelete = async () => {
    if (!confirm("Excluir este experimento e todo o seu histórico de observações? Essa ação não pode ser desfeita.")) return;
    await removeExperiment(experiment.id);
    navigate("/experimentos");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={() => navigate("/experimentos")}><ArrowLeft size={15} /> Voltar</Button>
        <div className="flex items-center gap-2 flex-wrap">
          {experiment.status === "draft" && (
            <Button variant="secondary" onClick={() => setStatus("active")}>Iniciar agora</Button>
          )}
          {experiment.status === "active" && (
            <Button variant="secondary" onClick={() => setStatus("paused")}>Pausar</Button>
          )}
          {experiment.status === "paused" && (
            <Button variant="secondary" onClick={() => setStatus("active")}>Retomar</Button>
          )}
          {(experiment.status === "active" || experiment.status === "paused") && (
            <Button onClick={() => setConcludeOpen(true)}>Encerrar experimento</Button>
          )}
          <Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={14} /> Editar</Button>
          <button onClick={handleDelete} className="w-9 h-9 rounded-xl flex items-center justify-center border border-paper-border dark:border-ink-border text-drop hover:bg-drop/5" aria-label="Excluir experimento">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <Card className="p-4 md:p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cat-purple/10 text-cat-purple">{STATUS_LABEL_PT[experiment.status]}</span>
            <p className="font-display font-bold text-2xl mt-2">{experiment.title}</p>
            <p className="text-xs text-slate mt-1">{CATEGORY_LABEL[experiment.category]} · {experiment.start_date} → {experiment.end_date}</p>
            {experiment.description && <p className="text-sm text-slate mt-2">{experiment.description}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate">Dia {daysElapsed} de {durationDays}</p>
            <p className="text-2xl font-bold text-cat-purple">{progressPct}%</p>
            {consistencyPct !== null && <p className="text-[11px] text-slate mt-1">Consistência: {consistencyPct}%</p>}
          </div>
        </div>
        <div className="h-2 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden mt-4">
          <div className="h-full rounded-full bg-gradient-to-r from-cat-purple to-brand-500" style={{ width: `${progressPct}%` }} />
        </div>
        {experiment.hypothesis && (
          <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-cat-purple/5 border border-cat-purple/10 text-sm">
            <Quote size={14} className="text-cat-purple shrink-0 mt-0.5" />
            <p><span className="font-semibold">Hipótese: </span>{experiment.hypothesis}</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <ExperimentAnalysisPanel analysis={analysis} consistencyPct={consistencyPct} isLoading={isAnalysisLoading} />
        </div>
        <div className="space-y-4">
          {experiment.status === "active" && (
            <ExperimentTodayCheckin experiments={[{ ...experiment, progressPct, daysElapsed, durationDays, resultLabel: null }]} />
          )}
          <ExperimentCalendar startDate={experiment.start_date} endDate={experiment.end_date} checkins={checkins} logs={logs} onSelectDay={(d) => openLog(d)} />
          <ExperimentObservations logs={logs} onNewObservation={() => openLog()} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ExperimentTimelineChart experiment={experiment} />
        <ExperimentAIPanel onAnalyze={(q) => analyze(q)} isAnalyzing={isAnalyzing} text={analysisText} error={analysisError} />
      </div>

      {experiment.personal_conclusion && (
        <Card className="p-4 md:p-5">
          <p className="text-sm font-semibold mb-1">Conclusão pessoal</p>
          <p className="text-sm text-slate">{experiment.personal_conclusion}</p>
        </Card>
      )}

      {logModalOpen && (
        <ExperimentLogModal
          experiment={experiment}
          checkins={checkins}
          logs={logs}
          onClose={() => setLogModalOpen(false)}
          onSave={(input) => upsertLog(input)}
          isSaving={isSavingLog}
          initialDate={logDate}
        />
      )}
      {concludeOpen && (
        <ExperimentConcludeModal onClose={() => setConcludeOpen(false)} onConfirm={(input) => conclude(input)} isSaving={isConcluding} />
      )}
      {editOpen && (
        <ExperimentEditModal experiment={experiment} onClose={() => setEditOpen(false)} onSave={(patch) => updateExperiment(patch)} />
      )}
    </div>
  );
}
