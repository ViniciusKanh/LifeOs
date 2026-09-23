import { useState } from "react";
import clsx from "clsx";
import { Activity } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/primitives";
import { useSignals } from "@/hooks/useSignals";
import { SignalsGrid } from "@/components/signals/SignalCard";
import { DetectedPatterns } from "@/components/signals/DetectedPatterns";
import { SignalsRadar } from "@/components/signals/SignalsRadar";
import { SignalsTrendChart } from "@/components/signals/SignalsTrendChart";
import { LifeOSSuggestionCard } from "@/components/signals/LifeOSSuggestionCard";
import type { SignalPeriod } from "@/types";

const PERIODS: { key: SignalPeriod; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export function SignalsPage() {
  const [period, setPeriod] = useState<SignalPeriod>("7d");
  const { data, isLoading } = useSignals(period);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<Activity size={22} />}
        title="Signals"
        subtitle="Camada analítica que consolida seus sinais reais — sono, humor, energia, exercício, leitura e agenda — para detectar padrões e sugerir ajustes."
        actions={
          <div className="flex gap-1.5 bg-paper dark:bg-ink rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={clsx(
                  "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                  period === p.key ? "bg-brand-500 text-white" : "text-slate hover:bg-paper-border/60 dark:hover:bg-ink-border/40"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        </div>
      ) : (
        <>
          <SignalsGrid signals={data.signals} />

          <div>
            <p className="text-sm font-semibold mb-2">Padrões detectados</p>
            <DetectedPatterns patterns={data.patterns} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SignalsRadar radar={data.radar} dayClassification={data.dayClassification} />
            <SignalsTrendChart period={period} />
          </div>

          <LifeOSSuggestionCard period={period} recommendation={data.recommendation} />

          <Card className="p-3 text-[11px] text-slate">
            Signals consolida dados que já existem em outros módulos do LifeOS — não é uma fonte de dado nova. Padrões mostrados são
            observações estatísticas sobre seus próprios registros ("sugerem", "tendência", "associação"), nunca diagnóstico ou causa
            comprovada.
          </Card>
        </>
      )}
    </div>
  );
}
