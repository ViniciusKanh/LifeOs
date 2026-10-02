import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Activity, ArrowLeft, BarChart3, CalendarCheck, Flame, LineChart, Pencil, Quote, Sparkles, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { RingProgress } from "@/components/charts/motion/RingProgress";
import { AnimatedNumber } from "@/components/charts/motion/AnimatedNumber";
import { useExperiment } from "@/hooks/useExperiment";
import { useExperiments } from "@/hooks/useExperiments";
import { ExperimentAnalysisPanel } from "@/components/experiments/ExperimentAnalysisPanel";
import { ExperimentPulse } from "@/components/experiments/ExperimentPulse";
import { ExperimentCalendar } from "@/components/experiments/ExperimentCalendar";
import { ExperimentTodayCheckin } from "@/components/experiments/ExperimentTodayCheckin";
import { ExperimentObservations } from "@/components/experiments/ExperimentObservations";
import { ExperimentLogModal } from "@/components/experiments/ExperimentLogModal";
import { ExperimentTimelineChart } from "@/components/experiments/ExperimentTimelineChart";
import { ExperimentAIPanel } from "@/components/experiments/ExperimentAIPanel";
import { ExperimentAIInsights } from "@/components/experiments/ExperimentAIInsights";
import { ExperimentConcludeModal } from "@/components/experiments/ExperimentConcludeModal";
import { ExperimentEditModal } from "@/components/experiments/ExperimentEditModal";
import { STATUS_LABEL_PT, CATEGORY_LABEL, CATEGORY_ICON, experimentEmoji } from "@/components/experiments/experimentDisplay";

/**
 * Detalhe do experimento em quatro abas:
 *  - Visão geral: veredito, evidência por métrica e pulso diário;
 *  - Acompanhamento: check-in de hoje (inclusive por relato livre), calendário e observações;
 *  - Copilot IA: insights salvos (dado real / inferência / sugestão) e perguntas livres;
 *  - Gráficos: série temporal antes × durante de cada métrica.
 */

type Tab = "overview" | "tracking" | "ai" | "charts";

const TABS: Array<{ key: Tab; label: string; icon: JSX.Element }> = [
  { key: "overview", label: "Visão geral", icon: <BarChart3 size={14} /> },
  { key: "tracking", label: "Acompanhamento", icon: <CalendarCheck size={14} /> },
  { key: "ai", label: "Copilot IA", icon: <Sparkles size={14} /> },
  { key: "charts", label: "Gráficos", icon: <LineChart size={14} /> },
];

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate/12 text-slate",
  active: "bg-cat-purple/12 text-cat-purple",
  paused: "bg-signal/15 text-signal-deep",
  completed: "bg-cat-green/12 text-cat-green",
  cancelled: "bg-drop/10 text-drop",
};

const brDate = (iso: string) => iso.split("-").reverse().join("/");

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    detail,
    analysis,
    isAnalysisLoading,
    isLoading,
    isError,
    setStatus,
    upsertLog,
    isSavingLog,
    conclude,
    isConcluding,
    analyze,
    isAnalyzing,
    analysisText,
    analysisError,
    updateExperiment,
    aiReports,
    isLoadingReports,
    generateInsights,
    isGeneratingInsights,
    insightsError,
  } = useExperiment(id);
  const { removeExperiment } = useExperiments();

  const [tab, setTab] = useState<Tab>("overview");
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logDate, setLogDate] = useState<string | undefined>(undefined);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
        <div className="h-8 w-40 rounded-lg bg-paper dark:bg-ink animate-pulse" />
        <div className="h-48 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 w-full">
        <Button variant="ghost" onClick={() => navigate("/experimentos")}>
          <ArrowLeft size={15} /> Voltar
        </Button>
        <p className="text-sm text-slate mt-4">Experimento não encontrado.</p>
      </div>
    );
  }

  const { experiment, progressPct, daysElapsed, durationDays, checkins, consistencyPct, logs } = detail;
  const CategoryIcon = CATEGORY_ICON[experiment.category];
  const primary = analysis?.metrics.find((m) => m.isPrimary) ?? null;
  const isFinished = experiment.status === "completed" || (analysis?.daysRemaining ?? 1) === 0;

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
    <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={() => navigate("/experimentos")}>
          <ArrowLeft size={15} /> Voltar
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {experiment.status === "draft" && (
            <Button variant="secondary" onClick={() => setStatus("active")}>
              Iniciar agora
            </Button>
          )}
          {experiment.status === "active" && (
            <Button variant="secondary" onClick={() => setStatus("paused")}>
              Pausar
            </Button>
          )}
          {experiment.status === "paused" && (
            <Button variant="secondary" onClick={() => setStatus("active")}>
              Retomar
            </Button>
          )}
          {(experiment.status === "active" || experiment.status === "paused") && <Button onClick={() => setConcludeOpen(true)}>Encerrar experimento</Button>}
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Editar
          </Button>
          <button
            onClick={handleDelete}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-paper-border dark:border-ink-border text-drop hover:bg-drop/5"
            aria-label="Excluir experimento"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Cabeçalho */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 26 }}>
        <Card className="relative overflow-hidden p-5 md:p-6">
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-gradient-to-br from-cat-purple/25 via-cat-blue/10 to-transparent blur-3xl"
            animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("text-[11px] font-semibold px-2.5 py-1 rounded-full", STATUS_TONE[experiment.status])}>{STATUS_LABEL_PT[experiment.status]}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate">
                  <CategoryIcon size={12} /> {CATEGORY_LABEL[experiment.category]}
                </span>
                <span className="text-[11px] text-slate">
                  {brDate(experiment.start_date)} → {brDate(experiment.end_date)}
                </span>
              </div>
              <h1 className="flex items-center gap-3 font-display font-bold text-2xl md:text-3xl mt-2 leading-tight">
                <motion.span
                  className="text-4xl md:text-5xl leading-none"
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  whileHover={{ scale: 1.15, rotate: [0, -10, 10, 0] }}
                  transition={{ type: "spring", stiffness: 300, damping: 14 }}
                  aria-hidden
                >
                  {experimentEmoji(experiment)}
                </motion.span>
                <span>{experiment.title}</span>
              </h1>
              {experiment.description && <p className="text-sm text-slate mt-1.5">{experiment.description}</p>}
              {experiment.hypothesis && (
                <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-cat-purple/5 border border-cat-purple/15 text-sm">
                  <Quote size={14} className="text-cat-purple shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold">Hipótese: </span>
                    {experiment.hypothesis}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 md:flex-col md:items-end shrink-0">
              <RingProgress pct={progressPct} size={104} stroke={9} color="#7C4DFF">
                <div className="text-center leading-none">
                  <AnimatedNumber value={progressPct} suffix="%" className="font-display font-bold text-xl" />
                  <p className="text-[10px] text-slate mt-1">
                    dia {daysElapsed}/{durationDays}
                  </p>
                </div>
              </RingProgress>
              <div className="grid grid-cols-3 md:grid-cols-1 gap-1.5 md:w-44">
                {[
                  { icon: <CalendarCheck size={12} className="text-cat-green" />, label: "Consistência", value: consistencyPct === null ? "—" : `${consistencyPct}%` },
                  { icon: <Flame size={12} className="text-signal" />, label: "Sequência", value: analysis ? `${analysis.streak.current} dia(s)` : "—" },
                  { icon: <Activity size={12} className="text-cat-purple" />, label: "Evidência", value: primary ? EVIDENCE_SHORT[primary.effect.evidence] : "—" },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.07 }}
                    className="rounded-xl bg-paper dark:bg-ink px-2.5 py-1.5"
                  >
                    <p className="flex items-center gap-1 text-[10px] text-slate">
                      {s.icon} {s.label}
                    </p>
                    <p className="text-xs font-semibold">{s.value}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Abas */}
      <div role="tablist" aria-label="Seções do experimento" className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5 sticky top-0 z-10 bg-paper/80 dark:bg-ink/80 backdrop-blur py-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx("relative shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors", tab === t.key ? "text-cat-purple" : "text-slate hover:text-inherit")}
          >
            {tab === t.key && (
              <motion.span layoutId="experiment-tab" className="absolute inset-0 rounded-xl bg-paper-raised dark:bg-ink-raised shadow-card border border-cat-purple/25" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {t.icon} {t.label}
              {t.key === "ai" && aiReports.length > 0 && aiReports[0].logsCount !== logs.length && !isFinished && (
                <span className="w-1.5 h-1.5 rounded-full bg-signal" aria-label="Há dados novos para analisar" />
              )}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }} role="tabpanel">
          {tab === "overview" && (
            <div className="space-y-4">
              {analysis && primary && <ExperimentPulse analysis={analysis} label={primary.label} unit={primary.unit} />}
              <ExperimentAnalysisPanel analysis={analysis} consistencyPct={consistencyPct} isLoading={isAnalysisLoading} />
            </div>
          )}

          {tab === "tracking" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="space-y-4">
                {experiment.status === "active" && (
                  <ExperimentTodayCheckin experiments={[{ ...experiment, progressPct, daysElapsed, durationDays, resultLabel: null }]} question={question} />
                )}
                <ExperimentCalendar startDate={experiment.start_date} endDate={experiment.end_date} checkins={checkins} logs={logs} onSelectDay={(d) => openLog(d)} />
              </div>
              <ExperimentObservations logs={logs} onNewObservation={() => openLog()} />
            </div>
          )}

          {tab === "ai" && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
              <ExperimentAIInsights
                reports={aiReports}
                isLoading={isLoadingReports}
                logsCount={logs.length}
                isFinished={isFinished}
                onGenerate={(opts) => generateInsights(opts)}
                isGenerating={isGeneratingInsights}
                error={insightsError}
                onAnswerQuestion={(q) => {
                  setQuestion(q);
                  setTab("tracking");
                }}
              />
              <ExperimentAIPanel onAnalyze={(q) => analyze(q)} isAnalyzing={isAnalyzing} text={analysisText} error={analysisError} />
            </div>
          )}

          {tab === "charts" && <ExperimentTimelineChart experiment={experiment} />}
        </motion.div>
      </AnimatePresence>

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
      {concludeOpen && <ExperimentConcludeModal onClose={() => setConcludeOpen(false)} onConfirm={(input) => conclude(input)} isSaving={isConcluding} />}
      {editOpen && <ExperimentEditModal experiment={experiment} onClose={() => setEditOpen(false)} onSave={(patch) => updateExperiment(patch)} />}
    </div>
  );
}

const EVIDENCE_SHORT = {
  strong: "Forte",
  moderate: "Moderada",
  weak: "Fraca",
  none: "Sem diferença",
  insufficient: "Coletando",
} as const;
