import { useState } from "react";
import { Database, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { PageHeader, Card, Button } from "@/components/ui/primitives";
import { useDataHealth } from "@/hooks/useDataHealth";
import { DataHealthSummaryCards } from "@/components/data-health/DataHealthSummaryCards";
import { ModuleCoverageGrid } from "@/components/data-health/ModuleCoverageGrid";
import { DataQualityAlerts } from "@/components/data-health/DataQualityAlerts";
import { PredictionReadiness } from "@/components/data-health/PredictionReadiness";
import { IntegrityOverview } from "@/components/data-health/IntegrityOverview";
import { DataHealthTrend } from "@/components/data-health/DataHealthTrend";
import { IssueDistribution } from "@/components/data-health/IssueDistribution";
import { DataHealthRecommendations } from "@/components/data-health/DataHealthRecommendations";
import { DataHealthDiagnosis } from "@/components/data-health/DataHealthDiagnosis";

export function DataHealthPage() {
  const { data, isLoading, isError, refetch, recheck, isRechecking } = useDataHealth();
  const [showFormula, setShowFormula] = useState(false);

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-[1440px] mx-auto space-y-4">
        <div className="h-20 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-paper dark:bg-ink animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8">
        <PageHeader icon={<Database size={20} />} title="Data Health" subtitle="Monitore a qualidade, integridade e cobertura dos dados do seu LifeOS." />
        <Card className="p-5 border-drop/40 bg-drop/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-drop shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Não foi possível verificar seus dados agora</p>
            <p className="text-xs text-slate mt-0.5">Tente novamente em alguns segundos.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 shrink-0 hover:bg-paper dark:hover:bg-ink"
          >
            <RefreshCw size={13} /> Tentar de novo
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-[1440px] mx-auto space-y-4">
      <PageHeader
        icon={<Database size={20} />}
        title="Data Health"
        subtitle="Monitore a qualidade, integridade e cobertura dos dados do seu LifeOS."
        actions={
          <div className="flex items-center gap-3">
            <p className="hidden lg:block text-xs italic text-slate max-w-[220px] text-right">"Dados confiáveis geram decisões melhores."</p>
            <div className="relative">
              <button
                onMouseEnter={() => setShowFormula(true)}
                onMouseLeave={() => setShowFormula(false)}
                className="flex items-center gap-1 text-[11px] text-slate hover:text-inherit"
                type="button"
              >
                <Info size={13} /> Como calculamos?
              </button>
              {showFormula && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 text-[11px] text-slate z-30">
                  {data.scoreFormula}
                </div>
              )}
            </div>
            <Button onClick={() => recheck()} disabled={isRechecking}>
              <RefreshCw size={14} className={isRechecking ? "animate-spin" : ""} /> Verificar novamente
            </Button>
          </div>
        }
      />

      {data.isNewUser && (
        <Card className="p-4 border-brand-500/30 bg-brand-50/60 dark:bg-brand-700/10">
          <p className="text-sm font-semibold">O LifeOS ainda está construindo sua base de dados.</p>
          <p className="text-xs text-slate mt-0.5">Continue registrando sua rotina para aumentar a cobertura das análises.</p>
        </Card>
      )}

      <DataHealthSummaryCards summary={data} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <ModuleCoverageGrid modules={data.modules} />
        <div className="space-y-4">
          <DataQualityAlerts issues={data.issues} />
          <PredictionReadiness readiness={data.readiness} />
        </div>
      </div>

      <IntegrityOverview integrity={data.integrity} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <DataHealthTrend history={data.history} />
        <IssueDistribution distribution={data.distribution} />
      </div>

      <DataHealthRecommendations recommendations={data.recommendations} />
      <DataHealthDiagnosis diagnosis={data.diagnosis} />
    </div>
  );
}
