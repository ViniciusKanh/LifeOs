import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/primitives";
import type { RadarDimension, DayClassification } from "@/types";

export function SignalsRadar({ radar, dayClassification }: { radar: RadarDimension[]; dayClassification: DayClassification | null }) {
  const chartData = radar.map((d) => ({ dim: d.label, value: d.value ?? 0 }));
  const missing = radar.filter((d) => d.value == null);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <p className="text-sm font-semibold">Radar do dia</p>
        {dayClassification && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-brand-500/10 text-brand-600 dark:text-brand-400">
            {dayClassification.label}
          </span>
        )}
      </div>
      {dayClassification && <p className="text-xs text-slate mb-2">{dayClassification.description}</p>}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="currentColor" className="text-paper-border dark:text-ink-border" />
            <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10, fill: "currentColor" }} className="text-slate" />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="#7C5CFC" fill="#7C5CFC" fillOpacity={0.3} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {missing.length > 0 && (
        <p className="text-[11px] text-slate mt-2">
          Sem dado suficiente no período para: {missing.map((d) => d.label).join(", ")} (exibido como 0 no gráfico, não é um valor real).
        </p>
      )}
    </Card>
  );
}
