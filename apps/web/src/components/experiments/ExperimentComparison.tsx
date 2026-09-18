import clsx from "clsx";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ExperimentMetricComparison } from "@/types";

/** Formata o valor de uma métrica no padrão de cada unidade (ex.: sono em "6h58" em vez de "6.97h"). */
function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  if (unit === "h") {
    const totalMinutes = Math.round(value * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
  }
  if (unit === "ml") return value >= 1000 ? `${(value / 1000).toFixed(1)}L` : `${Math.round(value)}ml`;
  if (unit === "/5") return value.toFixed(1);
  if (unit === "%") return `${Math.round(value)}%`;
  if (unit) return `${Math.round(value * 10) / 10} ${unit}`;
  return `${Math.round(value * 10) / 10}`;
}

function formatDiff(c: ExperimentMetricComparison): string {
  if (c.diffAbs === null) return "";
  if (c.unit === "h") {
    const totalMinutes = Math.round(c.diffAbs * 60);
    const sign = totalMinutes >= 0 ? "+" : "-";
    return `${sign}${Math.abs(totalMinutes)}min`;
  }
  if (c.diffPct === null) return "";
  const sign = c.diffPct >= 0 ? "+" : "";
  return `${sign}${c.diffPct}%`;
}

const TREND_TONE: Record<ExperimentMetricComparison["trend"], string> = {
  positive: "text-cat-green",
  negative: "text-drop",
  neutral: "text-slate",
  insufficient_data: "text-slate",
};

/**
 * "Antes x Durante" — o componente central dos Experimentos Pessoais
 * (seção 11 do briefing). Barra cinza = período anterior (baseline
 * real, mesma duração, imediatamente antes do início); barra roxa =
 * período do experimento. Escala é por linha (cada métrica tem sua
 * própria unidade), nunca global.
 */
export function ExperimentComparison({ comparison, compact = false }: { comparison: ExperimentMetricComparison[]; compact?: boolean }) {
  if (comparison.length === 0) {
    return <p className="text-sm text-slate py-6 text-center">Nenhuma métrica configurada para comparação.</p>;
  }

  return (
    <div className={clsx("space-y-4", compact && "space-y-3")}>
      {comparison.map((c) => {
        if (c.trend === "insufficient_data") {
          return (
            <div key={c.metric} className="flex items-start gap-2 text-xs text-slate bg-paper dark:bg-ink rounded-xl p-3">
              <Info size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-inherit">{c.label}</p>
                <p className="mt-0.5">{c.insufficientDataReason ?? "Dados insuficientes para comparação."}</p>
              </div>
            </div>
          );
        }

        const max = Math.max(Math.abs(c.beforeAvg ?? 0), Math.abs(c.duringAvg ?? 0), 0.001);
        const beforePct = Math.min(100, (Math.abs(c.beforeAvg ?? 0) / max) * 100);
        const duringPct = Math.min(100, (Math.abs(c.duringAvg ?? 0) / max) * 100);

        return (
          <div key={c.metric}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{c.label}</span>
              {c.diffAbs !== null && <span className={clsx("font-semibold", TREND_TONE[c.trend])}>{formatDiff(c)}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 text-[11px] text-slate text-right shrink-0">{formatMetricValue(c.beforeAvg, c.unit)}</span>
              <div className="flex-1 space-y-1">
                <div className="h-2 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                  <div className="h-full rounded-full bg-slate/40" style={{ width: `${beforePct}%` }} />
                </div>
                <div className="h-2 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                  <div className="h-full rounded-full bg-cat-purple" style={{ width: `${duringPct}%` }} />
                </div>
              </div>
              <span className="w-14 text-[11px] font-medium text-right shrink-0">{formatMetricValue(c.duringAvg, c.unit)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ExperimentComparisonCard({ comparison, beforeDays, duringDays }: { comparison: ExperimentMetricComparison[]; beforeDays: number; duringDays: number }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          Antes x Durante
          <Info size={13} className="text-slate" aria-hidden />
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate/40" /> Antes ({beforeDays}d)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cat-purple" /> Durante ({duringDays}d)</span>
        </div>
      </div>
      <ExperimentComparison comparison={comparison} />
    </Card>
  );
}
