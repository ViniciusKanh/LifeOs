import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, Check, CheckCheck, ChevronDown, Wand2 } from "lucide-react";
import { useState } from "react";
import { AiThinking, ProvenanceBadge } from "./AiThinking";
import { CATEGORY_METRIC_LABEL } from "./experimentDisplay";
import { formatMetricValue } from "./ExperimentComparison";
import type { ExperimentMetricKey, ExperimentTailorField, ExperimentTailoring } from "@/types";

/**
 * "O Copilot personalizou para você": mostra cada ajuste proposto como
 * antes → depois, com o motivo, e deixa aplicar um por um ou todos.
 */

const FIELD_LABEL: Record<ExperimentTailorField, string> = {
  title: "Nome",
  hypothesis: "Hipótese",
  verificationConfig: "Meta diária",
  durationDays: "Duração",
  successCriteriaValue: "Critério de sucesso",
  secondaryMetrics: "Métricas secundárias",
};

export function formatTailorValue(field: ExperimentTailorField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "durationDays") return `${value} dias`;
  if (field === "successCriteriaValue") return `${value}%`;
  if (field === "secondaryMetrics") return Array.isArray(value) && value.length ? value.map((k) => CATEGORY_METRIC_LABEL[k as ExperimentMetricKey] ?? k).join(", ") : "nenhuma";
  if (field === "verificationConfig" && typeof value === "object") {
    const c = value as Record<string, unknown>;
    if (c.beforeTime) return `antes das ${c.beforeTime}`;
    if (c.targetMl) return `${(Number(c.targetMl) / 1000).toLocaleString("pt-BR")} L de água`;
    if (c.minPages) return `${c.minPages} páginas`;
    if (c.minMinutes) return `${c.minMinutes} min`;
    return "—";
  }
  return String(value);
}

export function ExperimentTailorPanel({
  tailoring,
  isLoading,
  error,
  currentValue,
  applied,
  onApply,
  onApplyAll,
  onUseEmoji,
}: {
  tailoring: ExperimentTailoring | null;
  isLoading: boolean;
  error: string | null;
  currentValue: (field: ExperimentTailorField) => unknown;
  applied: Set<number>;
  onApply: (index: number) => void;
  onApplyAll: () => void;
  onUseEmoji?: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!isLoading && !tailoring && !error) return null;
  const pending = tailoring ? tailoring.changes.filter((_, i) => !applied.has(i)).length : 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cat-purple/30 bg-gradient-to-br from-cat-purple/[0.08] via-cat-blue/[0.04] to-transparent overflow-hidden"
    >
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <Wand2 size={15} className="text-cat-purple" />
        <span className="text-sm font-semibold flex-1">
          {isLoading ? "O Copilot está personalizando para você…" : tailoring ? `O Copilot personalizou para você${pending ? ` · ${pending} ajuste(s)` : ""}` : "Personalização indisponível"}
        </span>
        {tailoring && tailoring.emoji && onUseEmoji && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onUseEmoji(tailoring.emoji!);
            }}
            className="text-xl leading-none hover:scale-125 transition-transform"
            title="Usar este emoji"
          >
            {tailoring.emoji}
          </span>
        )}
        <ChevronDown size={16} className={clsx("text-slate transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-2.5">
              {isLoading && <AiThinking messages={["Lendo suas médias dos últimos 30 dias…", "Ajustando metas ao seu ritmo…", "Montando dicas de registro…"]} />}
              {error && <p className="text-xs text-drop">{error}</p>}
              {tailoring && (
                <>
                  {tailoring.baseline.daysWithData > 0 ? (
                    <p className="flex items-start gap-2 text-[11px] text-slate">
                      <ProvenanceBadge kind="dado" />
                      Sua média atual na métrica principal: {formatMetricValue(tailoring.baseline.mean, tailoring.baseline.unit)} em {tailoring.baseline.daysWithData} dia(s) com registro.
                    </p>
                  ) : (
                    <p className="flex items-start gap-2 text-[11px] text-slate">
                      <ProvenanceBadge kind="dado" /> Você ainda não tem registros da métrica principal nos últimos 30 dias.
                    </p>
                  )}
                  {tailoring.changes.length === 0 ? (
                    <p className="text-xs text-slate">O modelo já combina com seus dados — nenhum ajuste necessário.</p>
                  ) : (
                    <ul className="space-y-2">
                      {tailoring.changes.map((c, i) => {
                        const done = applied.has(i);
                        return (
                          <motion.li
                            key={`${c.field}-${i}`}
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className={clsx("rounded-xl border p-3 bg-paper-raised/80 dark:bg-ink-raised/80", done ? "border-cat-green/40" : "border-paper-border dark:border-ink-border")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate">{FIELD_LABEL[c.field]}</p>
                                <p className="text-xs mt-0.5">
                                  <span className="text-slate line-through decoration-slate/40">{formatTailorValue(c.field, currentValue(c.field))}</span>
                                  <span className="mx-1.5 text-cat-purple">→</span>
                                  <span className="font-semibold">{formatTailorValue(c.field, c.value)}</span>
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={done}
                                onClick={() => onApply(i)}
                                className={clsx(
                                  "shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                  done ? "bg-cat-green/12 text-cat-green" : "bg-cat-purple text-white hover:brightness-110"
                                )}
                              >
                                <Check size={11} /> {done ? "Aplicado" : "Aplicar"}
                              </button>
                            </div>
                            {c.reason && (
                              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate">
                                <ProvenanceBadge kind="sugestao" /> {c.reason}
                              </p>
                            )}
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}
                  {pending > 1 && (
                    <button type="button" onClick={onApplyAll} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cat-purple hover:underline">
                      <CheckCheck size={14} /> Aplicar todos os ajustes
                    </button>
                  )}
                  {tailoring.pitfalls.length > 0 && (
                    <div className="rounded-xl bg-signal/10 border border-signal/25 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold mb-1">
                        <AlertTriangle size={12} className="text-signal-deep" /> Cuidado com
                      </p>
                      {tailoring.pitfalls.map((p) => (
                        <p key={p} className="text-xs">• {p}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
