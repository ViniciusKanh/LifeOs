import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ReadinessResult } from "@/types";
import { READINESS_TONE, READINESS_LABEL } from "./dataHealthColors";

export function PredictionReadiness({ readiness }: { readiness: ReadinessResult[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">📈 Prontidão para previsões</p>
      </div>
      <p className="text-xs text-slate mb-4">Status dos módulos analíticos para uso confiável.</p>
      <ul className="space-y-2.5">
        {readiness.map((r) => (
          <li key={r.tool} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold">{r.tool}</p>
              <p className="text-[11px] text-slate mt-0.5">{r.reason}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${READINESS_TONE[r.status]}`}>{READINESS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
