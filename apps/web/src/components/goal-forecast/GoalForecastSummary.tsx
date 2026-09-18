import { Target, BarChart3, CalendarCheck2, Gauge, Trophy } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { GoalForecastSummary as Summary } from "@/types";

export function GoalForecastSummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card className="p-4">
        <IconBadge tone="pink" icon={<Target size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.activeGoals}</p>
        <p className="text-xs text-slate mt-1">🎯 Metas ativas</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="green" icon={<Trophy size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.completedGoals}</p>
        <p className="text-xs text-slate mt-1">✅ Concluídas</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="blue" icon={<BarChart3 size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.avgProgress != null ? `${summary.avgProgress}%` : "—"}</p>
        <p className="text-xs text-slate mt-1">📊 Progresso médio</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="amber" icon={<CalendarCheck2 size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.projectedCompletions3Months}</p>
        <p className="text-xs text-slate mt-1">🔮 Previstas em 3 meses</p>
      </Card>
      <Card className="p-4">
        <IconBadge tone="purple" icon={<Gauge size={18} />} size={36} />
        <p className="font-display font-bold text-2xl mt-2.5 leading-none">{summary.paceMultiplier != null ? `${summary.paceMultiplier.toFixed(1)}x` : "—"}</p>
        <p className="text-xs text-slate mt-1">⚡ Ritmo {summary.paceMultiplier == null && "— dados insuficientes"}</p>
      </Card>
    </div>
  );
}
