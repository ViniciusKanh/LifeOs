import { HeartPulse, Database, AlertTriangle, BarChart3, Brain } from "lucide-react";
import { StatTile } from "@/components/ui/primitives";
import type { DataHealthSummary } from "@/types";

export function DataHealthSummaryCards({ summary }: { summary: DataHealthSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatTile
        icon={<HeartPulse size={18} />}
        label="💚 Saúde geral dos dados"
        value={`${summary.score}%`}
        tone="green"
        progressPct={summary.score}
        caption={summary.label}
      />
      <StatTile icon={<Database size={18} />} label="🗂️ Fontes monitoradas" value={String(summary.monitoredSourcesCount)} tone="blue" caption="Módulos com verificação ativa" />
      <StatTile icon={<AlertTriangle size={18} />} label="🚨 Alertas ativos" value={String(summary.activeAlertsCount)} tone="amber" caption="Requerem sua atenção" />
      <StatTile icon={<BarChart3 size={18} />} label="📊 Cobertura analítica" value={`${summary.analyticsCoveragePct}%`} tone="purple" progressPct={summary.analyticsCoveragePct} />
      <StatTile
        icon={<Brain size={18} />}
        label="🧠 Módulos prontos para IA"
        value={`${summary.aiReadyModulesCount} / ${summary.aiReadyModulesTotal}`}
        tone="teal"
        caption="Com dados suficientes"
      />
    </div>
  );
}
