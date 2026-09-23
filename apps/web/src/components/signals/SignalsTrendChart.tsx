import { useState } from "react";
import clsx from "clsx";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/primitives";
import { useSignalTrend } from "@/hooks/useSignals";
import type { SignalPeriod, TrendSignalKey } from "@/types";

const SIGNAL_CHIPS: { key: TrendSignalKey; label: string }[] = [
  { key: "sleep", label: "Sono" },
  { key: "mood", label: "Humor" },
  { key: "energy", label: "Energia" },
  { key: "exercise", label: "Exercício" },
  { key: "reading", label: "Leitura" },
];

export function SignalsTrendChart({ period }: { period: SignalPeriod }) {
  const [signal, setSignal] = useState<TrendSignalKey>("sleep");
  const { data, isLoading } = useSignalTrend(period, signal);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-semibold">Variação dos sinais</p>
        <div className="flex flex-wrap gap-1.5">
          {SIGNAL_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setSignal(chip.key)}
              className={clsx(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                signal === chip.key
                  ? "bg-brand-500 text-white border-brand-500"
                  : "border-paper-border dark:border-ink-border text-slate hover:bg-paper dark:hover:bg-ink"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        {isLoading ? (
          <div className="h-full rounded-xl bg-paper dark:bg-ink animate-pulse" />
        ) : !data || data.series.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate">
            Sem dados registrados para este sinal no período selecionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" className="text-paper-border dark:text-ink-border" stroke="currentColor" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} />
              <Tooltip labelFormatter={(d: string) => d} formatter={(v: number) => [`${v}/100`, "Nível normalizado"]} />
              <Line type="monotone" dataKey="value" stroke="#7C5CFC" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-slate mt-2">Escala normalizada de 0 a 100 para permitir comparar sinais de unidades diferentes lado a lado.</p>
    </Card>
  );
}
