import { Clock, CalendarClock, Coffee, ListTree, AlertTriangle } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { WORKLOAD_TONE, STATUS_BAR_COLOR } from "./capacityColors";
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

export function CapacitySummaryCard({ summary, overloadMessage }: { summary: CapacitySummary; overloadMessage: string | null }) {
  const tone = WORKLOAD_TONE[summary.workloadLevel];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm font-semibold">Capacidade do dia</p>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tone.className}`}>{tone.label}</span>
      </div>
      <p className="text-xs text-slate mb-4">Janela útil: {summary.windowLabel}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2.5">
          <IconBadge tone="blue" icon={<Clock size={18} />} size={36} />
          <div className="min-w-0">
            <p className="font-display font-bold text-lg leading-none">{fmt(summary.totalMinutes)}</p>
            <p className="text-[11px] text-slate">disponíveis</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <IconBadge tone="purple" icon={<CalendarClock size={18} />} size={36} />
          <div className="min-w-0">
            <p className="font-display font-bold text-lg leading-none">{fmt(summary.busyMinutes)}</p>
            <p className="text-[11px] text-slate">agenda ocupada</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <IconBadge tone="green" icon={<Coffee size={18} />} size={36} />
          <div className="min-w-0">
            <p className="font-display font-bold text-lg leading-none">{fmt(summary.freeMinutes)}</p>
            <p className="text-[11px] text-slate">tempo livre</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <IconBadge tone="amber" icon={<ListTree size={18} />} size={36} />
          <div className="min-w-0">
            <p className="font-display font-bold text-lg leading-none">{fmt(summary.plannedMinutes)}</p>
            <p className="text-[11px] text-slate">carga planejada</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-slate mb-1">
          <span>Ocupação da capacidade</span>
          <span className="font-semibold">{Math.round(summary.occupancyRate * 100)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, summary.occupancyRate * 100)}%`, background: STATUS_BAR_COLOR[summary.workloadLevel] }}
          />
        </div>
      </div>
      {overloadMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-drop/10 text-drop px-3 py-2.5 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{overloadMessage}</p>
        </div>
      )}
    </Card>
  );
}
