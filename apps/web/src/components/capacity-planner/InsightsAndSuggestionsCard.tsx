import { Sparkles, Lightbulb } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { CapacityDayDashboard } from "@/types";

/**
 * Melhores horários / sugestões / insights — tudo derivado apenas do
 * que já veio do backend (energia, focus, contexto, sobrecarga).
 * Nunca inventa dado: quando não há base suficiente, o card fica vazio.
 */
export function InsightsAndSuggestionsCard({ dashboard }: { dashboard: CapacityDayDashboard }) {
  const { energy, focus, context, summary } = dashboard;

  const bestTimes: Array<{ label: string; period: string }> = [];
  if (focus.bestPeriod) bestTimes.push({ label: "Trabalho profundo", period: focus.bestPeriod });
  if (energy.bestPeriod && energy.bestPeriod !== focus.bestPeriod) bestTimes.push({ label: "Energia alta", period: energy.bestPeriod });

  const suggestions: string[] = [];
  if (summary.overloadMinutes > 0) suggestions.push("Considere usar \"Ajustar plano automaticamente\" para reorganizar tarefas dentro da sua capacidade.");
  if (context.favorable === false) suggestions.push("O clima de hoje pode reduzir seu rendimento fora de casa — priorize tarefas internas.");
  if (energy.level === "Baixa") suggestions.push("Energia prevista baixa — reserve tarefas leves e evite trabalho profundo no período de menor energia.");

  const insights: string[] = [];
  if (summary.workloadLevel === "sobrecarga") insights.push(`Ocupação de ${Math.round(summary.occupancyRate * 100)}% da capacidade disponível hoje.`);
  if (focus.level) insights.push(`Seu padrão histórico de Focus está classificado como "${focus.level}".`);

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <IconBadge tone="purple" icon={<Sparkles size={18} />} size={32} />
          <p className="text-sm font-semibold">Melhores horários</p>
        </div>
        {bestTimes.length === 0 ? (
          <p className="text-xs text-slate">Dados insuficientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {bestTimes.map((b) => (
              <li key={b.label} className="flex items-center justify-between text-xs">
                <span className="text-slate">{b.label}</span>
                <span className="font-semibold">{b.period}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <IconBadge tone="amber" icon={<Lightbulb size={18} />} size={32} />
          <p className="text-sm font-semibold">Sugestões do LifeOS</p>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-slate">Nenhuma sugestão no momento — seu dia está equilibrado.</p>
        ) : (
          <ul className="space-y-1.5 list-disc list-inside">
            {suggestions.map((s, i) => (
              <li key={i} className="text-xs text-slate">
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {insights.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Insights de planejamento</p>
          <ul className="space-y-1.5 list-disc list-inside">
            {insights.map((s, i) => (
              <li key={i} className="text-xs text-slate">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
