import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Clock, History, MessageCircleQuestion, RefreshCw, Sparkles, Target, Trophy } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { AiThinking, ProvenanceBadge } from "./AiThinking";
import type { ExperimentInsightReport } from "@/types";

/**
 * Insights do LifeOS Copilot sobre o experimento. Cada item vem rotulado como
 * Dado real, Inferência ou Sugestão (validado no servidor). Os relatórios
 * ficam salvos: dá para ver como a leitura evoluiu ao longo dos dias.
 */

const THINKING = ["Lendo a análise do experimento…", "Comparando com o período anterior…", "Olhando suas observações…", "Separando fatos, leituras e sugestões…"];

function formatWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ExperimentAIInsights({
  reports,
  isLoading,
  logsCount,
  isFinished,
  onGenerate,
  isGenerating,
  error,
  onAnswerQuestion,
}: {
  reports: ExperimentInsightReport[];
  isLoading: boolean;
  logsCount: number;
  isFinished: boolean;
  onGenerate: (opts: { refresh?: boolean; final?: boolean }) => Promise<unknown>;
  isGenerating: boolean;
  error: string | null;
  onAnswerQuestion?: (question: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const report = reports.find((r) => r.id === selectedId) ?? reports[0] ?? null;
  const hasNewData = report ? logsCount !== report.logsCount : false;
  const counts = report
    ? { dado: report.content.items.filter((i) => i.kind === "dado").length, inferencia: report.content.items.filter((i) => i.kind === "inferencia").length, sugestao: report.content.items.filter((i) => i.kind === "sugestao").length }
    : null;

  return (
    <Card className="p-4 md:p-5 overflow-hidden relative">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br from-cat-purple/20 to-cat-blue/10 blur-3xl"
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="flex items-center gap-2 font-display font-semibold">
            <Sparkles size={16} className="text-cat-purple" /> Insights do Copilot
          </p>
          <p className="text-xs text-slate">Leitura dos seus dados deste experimento, separando fato, interpretação e sugestão.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reports.length > 1 && (
            <Button variant="ghost" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
              <History size={14} /> Histórico ({reports.length})
            </Button>
          )}
          {isFinished ? (
            <Button onClick={() => onGenerate({ final: true, refresh: true }).catch(() => undefined)} disabled={isGenerating}>
              <Trophy size={14} /> Relatório final
            </Button>
          ) : (
            <Button onClick={() => onGenerate({ refresh: !!report }).catch(() => undefined)} disabled={isGenerating}>
              {report ? <RefreshCw size={14} /> : <Sparkles size={14} />} {report ? "Atualizar" : "Gerar insights"}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {historyOpen && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden mb-3 flex flex-wrap gap-1.5">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-[11px] border transition-colors",
                    report?.id === r.id ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border text-slate"
                  )}
                >
                  {r.kind === "final" ? "🏁 " : ""}
                  {formatWhen(r.createdAt)}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="relative">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 flex justify-center">
              <AiThinking messages={THINKING} />
            </motion.div>
          ) : isLoading ? (
            <motion.div key="loading" className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-xl bg-paper-border/50 dark:bg-ink-border/50 animate-pulse" />
              ))}
            </motion.div>
          ) : !report ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-paper-border dark:border-ink-border p-6 text-center">
              <Sparkles size={22} className="mx-auto text-cat-purple" />
              <p className="text-sm font-semibold mt-2">Peça a primeira leitura do Copilot</p>
              <p className="text-xs text-slate mt-1">Ele usa só os números da análise e as suas observações — e diz quando ainda não há dado suficiente.</p>
            </motion.div>
          ) : (
            <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {hasNewData && !isFinished && (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-signal/15 px-2.5 py-1 text-[11px] font-semibold text-signal-deep dark:text-signal">
                  <Clock size={12} /> Há registros novos desde esta leitura — toque em Atualizar.
                </p>
              )}
              <p className="font-display font-bold text-lg leading-tight">{report.content.headline}</p>
              <p className="text-sm text-slate mt-1 leading-relaxed">{report.content.summary}</p>
              {counts && (
                <p className="text-[10px] text-slate mt-2">
                  {counts.dado} dado(s) real(is) · {counts.inferencia} inferência(s) · {counts.sugestao} sugestão(ões) · {formatWhen(report.createdAt)}
                </p>
              )}

              <ul className="mt-3 space-y-2">
                {report.content.items.map((item, i) => (
                  <motion.li
                    key={`${report.id}-${i}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i, type: "spring", stiffness: 260, damping: 26 }}
                    className="flex items-start gap-2.5 rounded-xl border border-paper-border/80 dark:border-ink-border/80 bg-paper/60 dark:bg-ink/60 px-3 py-2.5"
                  >
                    <ProvenanceBadge kind={item.kind} />
                    <p className="text-sm leading-snug">{item.text}</p>
                  </motion.li>
                ))}
              </ul>

              {(report.content.todayFocus || report.content.question) && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.content.todayFocus && (
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="rounded-xl bg-gradient-to-br from-cat-green/15 to-transparent border border-cat-green/30 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cat-green"><Target size={12} /> Foco de hoje <ProvenanceBadge kind="sugestao" /></p>
                      <p className="text-sm mt-1">{report.content.todayFocus}</p>
                    </motion.div>
                  )}
                  {report.content.question && (
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} className="rounded-xl bg-gradient-to-br from-cat-pink/15 to-transparent border border-cat-pink/30 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cat-pink"><MessageCircleQuestion size={12} /> Para refletir</p>
                      <p className="text-sm mt-1">{report.content.question}</p>
                      {onAnswerQuestion && !isFinished && (
                        <button type="button" onClick={() => onAnswerQuestion(report.content.question!)} className="mt-1.5 text-[11px] font-semibold text-cat-pink hover:underline">
                          Responder no check-in de hoje →
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {error && !isGenerating && <p className="mt-3 text-xs text-drop bg-drop/10 rounded-xl px-3 py-2">{error}</p>}
        <p className="text-[10px] text-slate mt-3">Gerado por IA a partir dos seus registros. Não é diagnóstico nem orientação médica.</p>
      </div>
    </Card>
  );
}
