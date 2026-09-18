import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { IntegrityMetric } from "@/types";

const SEVERITY_TONE: Record<IntegrityMetric["severity"], string> = {
  baixo: "bg-cat-green/10 text-cat-green",
  atenção: "bg-signal/15 text-signal-deep dark:text-signal",
  médio: "bg-signal/20 text-signal-deep dark:text-signal",
  alto: "bg-drop/10 text-drop",
};

export function IntegrityOverview({ integrity }: { integrity: IntegrityMetric[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">🛡️ Integridade e consistência</p>
      </div>
      <p className="text-xs text-slate mb-4">Verificações automáticas para garantir a confiabilidade dos seus dados.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {integrity.map((m) => (
          <div key={m.key} className="rounded-xl border border-paper-border dark:border-ink-border p-3">
            <div className="flex items-center justify-between gap-1 mb-1">
              <p className="font-display font-bold text-lg leading-none">{m.count}</p>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${SEVERITY_TONE[m.severity]}`}>{m.severity}</span>
            </div>
            <p className="text-[11px] text-slate leading-tight">{m.label}</p>
            <p className="text-[10px] text-slate/70 mt-1">{m.pctOfUniverse}% do universo</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
