import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/primitives";
import { experimentService } from "@/services/experimentService";
import { CATEGORY_METRIC_LABEL } from "./experimentDisplay";
import type { Experiment, ExperimentMetricKey } from "@/types";

function formatDateShort(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

/** Gráfico temporal da métrica escolhida (seção 21/22) — linha cinza no período anterior, roxa no experimento, com marca do início. */
export function ExperimentTimelineChart({ experiment }: { experiment: Experiment }) {
  const metrics = [experiment.primary_metric, ...experiment.secondary_metrics];
  const [selected, setSelected] = useState<ExperimentMetricKey>(experiment.primary_metric);

  const { data, isLoading } = useQuery({
    queryKey: ["experiments", "series", experiment.id, selected],
    queryFn: () => experimentService.series(experiment.id, selected),
  });

  const chartData = (data?.points ?? []).map((p) => ({
    date: formatDateShort(p.date),
    before: p.phase === "before" ? p.value : null,
    during: p.phase === "during" ? p.value : null,
  }));
  const startIndex = chartData.findIndex((_, i) => (data?.points[i]?.phase ?? "before") === "during");

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-semibold">{CATEGORY_METRIC_LABEL[selected] ?? selected} ao longo do tempo</p>
        <div className="flex flex-wrap gap-1.5">
          {metrics.map((m) => (
            <button
              key={m}
              onClick={() => setSelected(m)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${selected === m ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border text-slate"}`}
            >
              {CATEGORY_METRIC_LABEL[m] ?? m}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-56 animate-pulse bg-paper dark:bg-ink rounded-xl" />
      ) : chartData.length === 0 ? (
        <p className="text-xs text-slate py-10 text-center">Sem dados suficientes para desenhar o gráfico ainda.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {startIndex > 0 && <ReferenceLine x={chartData[startIndex]?.date} stroke="#8B5CF6" strokeDasharray="4 4" label={{ value: "Início", fontSize: 10, position: "top" }} />}
              <Line type="monotone" dataKey="before" name="Antes" stroke="#94A3B8" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="during" name="Durante" stroke="#8B5CF6" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
