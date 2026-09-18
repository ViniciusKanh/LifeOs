import { useState } from "react";
import clsx from "clsx";
import { CloudSun } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/primitives";
import { useContextToday } from "@/hooks/useContextOfDay";
import { ContextEmptyState } from "@/components/contexto-do-dia/ContextEmptyState";
import { LocationChip } from "@/components/contexto-do-dia/LocationChip";
import { ContextKpis } from "@/components/contexto-do-dia/ContextKpis";
import { ClimaDeHojeCard } from "@/components/contexto-do-dia/ClimaDeHojeCard";
import { TemperatureChart } from "@/components/contexto-do-dia/TemperatureChart";
import { ImpactoRotinaCard } from "@/components/contexto-do-dia/ImpactoRotinaCard";
import { ResumoAmbientalCard } from "@/components/contexto-do-dia/ResumoAmbientalCard";
import { DicaDoDiaCard } from "@/components/contexto-do-dia/DicaDoDiaCard";
import { CorrelacaoContextoCard } from "@/components/contexto-do-dia/CorrelacaoContextoCard";
import { AgendaRecomendadaCard } from "@/components/contexto-do-dia/AgendaRecomendadaCard";
import { ComparativoCard } from "@/components/contexto-do-dia/ComparativoCard";
import { InsightsCard } from "@/components/contexto-do-dia/InsightsCard";
import type { ContextPeriod } from "@/types";

const PERIODS: { key: ContextPeriod; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export function ContextoDoDiaPage() {
  const [period, setPeriod] = useState<ContextPeriod>("today");
  const { data, isLoading } = useContextToday(period);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={<CloudSun size={22} />}
        title="Contexto do Dia"
        subtitle="Clima, ambiente e sinais externos que ajudam a interpretar sua rotina."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {data?.configured && <LocationChip city={data.location.city} region={data.location.region} />}
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
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        </div>
      ) : !data?.configured ? (
        <ContextEmptyState />
      ) : (
        <>
          <ContextKpis data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr] gap-4 items-start">
            <ClimaDeHojeCard data={data} />
            <ImpactoRotinaCard impacts={data.impacts} />
            <ResumoAmbientalCard data={data} />
          </div>

          <TemperatureChart data={data} />

          <CorrelacaoContextoCard impacts={data.impacts} disclaimer={data.disclaimer} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AgendaRecomendadaCard agenda={data.agendaRecomendada} />
            <ComparativoCard comparativo={data.comparativo} />
            <InsightsCard insights={data.insights} />
          </div>

          <DicaDoDiaCard text={data.dicaDoDia} />

          <Card className="p-3 text-[11px] text-slate flex items-center justify-between flex-wrap gap-2">
            <span>{data.attribution} · Atualizado às {new Date(data.lastUpdated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          </Card>
        </>
      )}
    </div>
  );
}
