import { Lock, Unlock } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import type { Readiness } from "@/services/intelligenceService";

const MIN_SAMPLES = 30;
const MIN_PER_CLASS = 6;

/**
 * Ritual de desbloqueio: mostra, com dados reais do grimório, o que falta
 * registrar para o artefato poder ser forjado (dias, exemplos positivos e
 * negativos) e o próximo passo concreto.
 */
export function UnlockRitual({ r, compact = false }: { r: Readiness; compact?: boolean }) {
  if (r.ready) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-rpg-green">
        <Unlock size={12} aria-hidden /> Pronto para forjar · {r.samples} dias ({r.positives} × {r.negatives})
      </p>
    );
  }
  const bars = [
    { label: "Dias com registro", value: r.samples, max: MIN_SAMPLES, tone: "blue" as const },
    { label: "Dias positivos", value: r.positives, max: MIN_PER_CLASS, tone: "green" as const },
    { label: "Dias negativos", value: r.negatives, max: MIN_PER_CLASS, tone: "orange" as const },
  ];
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-rpg-gold-light">
        <Lock size={12} aria-hidden /> Ritual de desbloqueio
      </p>
      {!compact &&
        bars.map((b) => (
          <RPGProgressBar key={b.label} tone={b.tone} label={b.label} value={Math.min(b.value, b.max)} max={b.max} valueLabel={`${b.value}/${b.max}`} />
        ))}
      <p className="text-[11px] text-rpg-orange leading-snug">{r.hint ?? r.reason}</p>
    </div>
  );
}
