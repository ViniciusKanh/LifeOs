import { motion } from "motion/react";
import clsx from "clsx";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { formatMetricValue } from "./ExperimentComparison";
import type { ExperimentAnalysis } from "@/types";

/**
 * Pulso diário da métrica principal: valor de cada dia, média acumulada do
 * experimento (como a leitura vai se estabilizando) e a média do período
 * anterior como referência. Abaixo, a faixa de dias cumpridos/não cumpridos
 * alinhada ao gráfico — dá para ver se os dias "bons" coincidem com o
 * comportamento.
 */
export function ExperimentPulse({ analysis, label, unit }: { analysis: ExperimentAnalysis; label: string; unit: string | null }) {
  const { points, beforeMean, latest } = analysis.pulse;
  if (points.length === 0) return null;
  const labels = points.map((p) => p.date.slice(8, 10) + "/" + p.date.slice(5, 7));
  const series = [
    { key: "cumulative", label: "Média acumulada", color: "#7C4DFF", values: points.map((p) => p.cumulativeMean) },
    { key: "daily", label: "Valor do dia", color: "#2F80FF", values: points.map((p) => p.value) },
    ...(beforeMean !== null ? [{ key: "before", label: "Média antes", color: "#94A3B8", values: points.map(() => beforeMean) }] : []),
  ];
  const fmt = (v: number) => formatMetricValue(v, unit);

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity size={15} className="text-cat-purple" /> Pulso de {label.toLowerCase()}
          </p>
          <p className="text-[11px] text-slate">Cada dia do experimento, com a média se formando ao longo do tempo.</p>
        </div>
        {latest && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-right">
            <p className="text-[10px] text-slate">Último registro ({latest.date.split("-").reverse().slice(0, 2).join("/")})</p>
            <p className="font-display font-bold text-xl leading-none">{formatMetricValue(latest.value, unit)}</p>
            {latest.vsBeforePct !== null && (
              <span
                className={clsx(
                  "inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  latest.vsBeforePct === 0 ? "bg-slate/12 text-slate" : latest.vsBeforePct > 0 ? "bg-cat-blue/12 text-cat-blue" : "bg-signal/15 text-signal-deep dark:text-signal"
                )}
              >
                {latest.vsBeforePct > 0 ? "+" : ""}
                {latest.vsBeforePct}% vs média antes
              </span>
            )}
          </motion.div>
        )}
      </div>
      <div className="pb-7">
        <AnimatedLineChart ariaLabel={`Pulso diário de ${label}`} labels={labels} series={series} height={200} formatValue={fmt} />
      </div>
      <div className="flex gap-[3px] mt-1" aria-label="Dias cumpridos e não cumpridos">
        {points.map((p, i) => (
          <motion.span
            key={p.date}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.02 }}
            title={`${labels[i]}: ${p.status === "done" ? "cumprido" : p.status === "missed" ? "não cumprido" : "sem check-in"}`}
            className={clsx("flex-1 h-2 rounded-sm origin-bottom", p.status === "done" ? "bg-cat-green" : p.status === "missed" ? "bg-drop/60" : "bg-paper-border dark:bg-ink-border")}
          />
        ))}
      </div>
      <p className="text-[10px] text-slate mt-1.5">Faixa: verde = comportamento cumprido · vermelho = não cumprido · cinza = sem check-in.</p>
    </Card>
  );
}
