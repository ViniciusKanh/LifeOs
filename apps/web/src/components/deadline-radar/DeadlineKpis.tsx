import { AlertTriangle, Clock, CalendarClock, CheckCircle2 } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { DeadlineSummary } from "@/types";

export function DeadlineKpis({ summary }: { summary: DeadlineSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card className="p-4">
        <IconBadge tone="amber" icon={<AlertTriangle size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.overdue}</p>
        <p className="text-xs text-slate mt-1">Atrasados</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="pink" icon={<Clock size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.dueToday + summary.due7d}</p>
        <p className="text-xs text-slate mt-1">Vencem em 7 dias</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="blue" icon={<CalendarClock size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.due8to30}</p>
        <p className="text-xs text-slate mt-1">Em 8–30 dias</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="green" icon={<CheckCircle2 size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.onTrack}</p>
        <p className="text-xs text-slate mt-1">No prazo</p>
      </Card>
      <Card className="p-4">
        {summary.onTimeRate ? (
          <>
            <p className="font-display font-bold text-2xl leading-none text-cat-purple">{summary.onTimeRate.pct}%</p>
            <p className="text-xs text-slate mt-1">
              Taxa de prazos em dia · {summary.onTimeRate.completedOnTime} de {summary.onTimeRate.completedWithDeadline}
            </p>
          </>
        ) : (
          <>
            <p className="font-display font-bold text-2xl leading-none text-slate">—</p>
            <p className="text-xs text-slate mt-1">Taxa de prazos em dia — dados insuficientes</p>
          </>
        )}
      </Card>
    </div>
  );
}
