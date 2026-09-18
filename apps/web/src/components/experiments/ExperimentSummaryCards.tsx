import { CalendarClock, CheckCircle2, FlaskConical, TrendingUp } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { ExperimentSummary } from "@/types";

function formatSinceDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

/** Quatro cartões de KPI do topo (seção 5) — tudo derivado de personal_experiments reais, nada hardcoded. */
export function ExperimentSummaryCards({ summary }: { summary: ExperimentSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2.5">
          <IconBadge tone="green" icon={<FlaskConical size={18} />} size={36} />
        </div>
        <p className="font-display font-bold text-xl leading-none">{summary.activeCount}</p>
        <p className="text-xs text-slate mt-1">Experimentos ativos</p>
        <p className="text-[11px] text-slate mt-0.5">de {summary.totalCount} no total</p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2.5">
          <IconBadge tone="purple" icon={<CheckCircle2 size={18} />} size={36} />
        </div>
        <p className="font-display font-bold text-xl leading-none">{summary.completedCount}</p>
        <p className="text-xs text-slate mt-1">Experimentos concluídos</p>
        <p className="text-[11px] text-slate mt-0.5">
          {summary.completionRatePct !== null ? `${summary.completionRatePct}% de taxa de conclusão` : "Ainda sem experimentos encerrados"}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2.5">
          <IconBadge tone="amber" icon={<TrendingUp size={18} />} size={36} />
        </div>
        <p className="font-display font-bold text-xl leading-none">{summary.bestImpact ? `+${summary.bestImpact.diffPct}%` : "—"}</p>
        <p className="text-xs text-slate mt-1">Melhor impacto observado</p>
        <p className="text-[11px] text-slate mt-0.5">{summary.bestImpact ? summary.bestImpact.label : "Ainda sem dados suficientes"}</p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2.5">
          <IconBadge tone="blue" icon={<CalendarClock size={18} />} size={36} />
        </div>
        <p className="font-display font-bold text-xl leading-none">{summary.weeksExperimenting} semanas</p>
        <p className="text-xs text-slate mt-1">Tempo total experimentando</p>
        <p className="text-[11px] text-slate mt-0.5">{summary.experimentingSinceDate ? `Desde ${formatSinceDate(summary.experimentingSinceDate)}` : "Comece seu primeiro experimento"}</p>
      </Card>
    </div>
  );
}
