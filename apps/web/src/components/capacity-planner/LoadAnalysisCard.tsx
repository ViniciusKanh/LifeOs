import { Card } from "@/components/ui/primitives";
import type { CapacitySummary } from "@/types";

function fmt(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

function Bar({ label, minutes, max, color }: { label: string; minutes: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(minutes) / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate">{label}</span>
        <span className="font-semibold">{fmt(minutes)}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function LoadAnalysisCard({ summary }: { summary: CapacitySummary }) {
  const max = Math.max(summary.freeMinutes, summary.plannedMinutes, 1);
  return (
    <Card className="p-5 space-y-3.5">
      <p className="text-sm font-semibold">Análise de carga</p>
      <Bar label="Capacidade" minutes={summary.freeMinutes} max={max} color="#3B6FE0" />
      <Bar label="Carga" minutes={summary.plannedMinutes} max={max} color="#8B5CF6" />
      {summary.overloadMinutes > 0 && <Bar label="Sobrecarga" minutes={summary.overloadMinutes} max={max} color="#D64545" />}
    </Card>
  );
}
