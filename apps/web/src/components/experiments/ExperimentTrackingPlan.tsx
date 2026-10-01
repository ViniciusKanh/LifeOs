import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlarmClock, ChevronRight, Lightbulb } from "lucide-react";
import { ProvenanceBadge } from "./AiThinking";
import type { TrackingStep } from "@/utils/experimentTrackingPlan";

/** Linha do tempo animada "Como você vai registrar" (+ dicas da IA quando houver). */
export function ExperimentTrackingPlan({
  steps,
  aiTips = [],
  reminderTime,
  linkable = false,
}: {
  steps: TrackingStep[];
  aiTips?: string[];
  reminderTime?: string | null;
  linkable?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-paper-border dark:border-ink-border p-4">
      <p className="text-sm font-semibold">Como você vai registrar</p>
      <p className="text-[11px] text-slate mb-3">Cada dado é registrado no módulo de origem — o experimento só lê, nunca duplica.</p>
      <ol className="relative space-y-3">
        <span className="absolute left-[17px] top-2 bottom-2 w-px bg-gradient-to-b from-cat-purple/50 via-cat-blue/40 to-transparent" aria-hidden />
        {steps.map((s, i) => (
          <motion.li
            key={s.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.09, type: "spring", stiffness: 260, damping: 24 }}
            className="relative flex gap-3"
          >
            <motion.span
              className="relative z-[1] w-9 h-9 rounded-full bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border flex items-center justify-center text-lg shrink-0 shadow-sm"
              whileHover={{ scale: 1.12, rotate: -6 }}
            >
              {s.emoji}
            </motion.span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{s.title}</p>
                <span className="rounded-full bg-cat-purple/10 text-cat-purple px-2 py-0.5 text-[10px] font-semibold">{s.when}</span>
              </div>
              <p className="text-[11px] text-slate mt-0.5">{s.detail}</p>
              {linkable && s.path && (
                <Link to={s.path} className="mt-1 inline-flex items-center text-[11px] font-semibold text-brand-600 dark:text-brand-100 hover:underline">
                  Abrir <ChevronRight size={12} />
                </Link>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
      {(aiTips.length > 0 || reminderTime) && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-3 rounded-xl bg-signal/10 border border-signal/25 p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold">
            <Lightbulb size={12} className="text-signal-deep" /> Dicas do Copilot <ProvenanceBadge kind="sugestao" />
          </p>
          {aiTips.map((t) => (
            <p key={t} className="text-xs">• {t}</p>
          ))}
          {reminderTime && (
            <p className="flex items-center gap-1.5 text-xs">
              <AlarmClock size={12} /> Bom horário para o check-in: <strong>{reminderTime}</strong>
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
