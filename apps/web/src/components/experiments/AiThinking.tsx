import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * Indicador "a IA está pensando": três órbitas pulsando e mensagens que
 * descrevem o que realmente está acontecendo (leitura de dados reais).
 */
export function AiThinking({ messages, className }: { messages: string[]; className?: string }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % messages.length), 1800);
    return () => window.clearInterval(t);
  }, [messages.length]);

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`} role="status" aria-live="polite">
      <div className="relative w-10 h-10 shrink-0">
        <motion.span
          className="absolute inset-0 rounded-full bg-gradient-to-br from-cat-purple to-cat-blue"
          animate={reduce ? undefined : { scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        {!reduce &&
          [0, 1, 2].map((k) => (
            <motion.span
              key={k}
              className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-white"
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear", delay: k * 0.8 }}
              style={{ transformOrigin: "3px 18px" }}
            />
          ))}
        <Sparkles size={16} className="absolute inset-0 m-auto text-white" />
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-slate"
        >
          {messages[i]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** Rótulo de procedência exigido pelo produto: dado real × inferência × sugestão. */
export const PROVENANCE_META = {
  dado: { label: "Dado real", className: "bg-cat-blue/12 text-cat-blue" },
  inferencia: { label: "Inferência", className: "bg-cat-purple/12 text-cat-purple" },
  sugestao: { label: "Sugestão", className: "bg-signal/15 text-signal-deep dark:text-signal" },
} as const;

export function ProvenanceBadge({ kind }: { kind: keyof typeof PROVENANCE_META }) {
  const m = PROVENANCE_META[kind];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.className}`}>{m.label}</span>;
}
