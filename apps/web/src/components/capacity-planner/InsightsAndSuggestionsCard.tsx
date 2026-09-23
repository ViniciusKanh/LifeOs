import { Sparkles, Lightbulb, TrendingUp } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { CapacityDayDashboard } from "@/types";

/**
 * Melhores horários / sugestões / insights — tudo derivado apenas do
 * que já veio do backend (tarefas, energia, contexto, áreas,
 * sobrecarga). Nunca inventa dado: quando não há base suficiente, o
 * bloco correspondente fica vazio.
 */

/** Converte "09h–11h" em minutos [inicio, fim]; retorna null se o formato não bater (nunca assume). */
function parsePeriod(period: string | null): [number, number] | null {
  if (!period) return null;
  const m = period.match(/^(\d{1,2})h.*?(\d{1,2})h/);
  if (!m) return null;
  return [Number(m[1]) * 60, Number(m[2]) * 60];
}

export function InsightsAndSuggestionsCard({ dashboard }: { dashboard: CapacityDayDashboard }) {
  const { energy, context, summary, tasks, areas } = dashboard;

  const bestTimes: Array<{ label: string; period: string; emoji: string }> = [];
  if (energy.bestPeriod) bestTimes.push({ label: "Trabalho profundo (energia alta)", period: energy.bestPeriod, emoji: "🧠" });

  const pending = tasks.filter((t) => !t.done);
  const highPriorityUnscheduled = pending.filter((t) => t.priority === "Alta" && !t.plannedStart);
  const withoutEstimate = pending.filter((t) => t.estimateMinutes == null);
  const focusWindow = parsePeriod(energy.bestPeriod);
  const deepWorkOffPeak = focusWindow
    ? pending.filter((t) => {
        if (t.effortType !== "deep_work" || !t.plannedStart) return false;
        const [h, m] = t.plannedStart.split(":").map(Number);
        const start = h * 60 + m;
        return start < focusWindow[0] || start >= focusWindow[1];
      })
    : [];
  const dominantArea = areas[0];
  const dominantAreaOverloaded = dominantArea && dominantArea.pct >= 55 && areas.length > 1;

  const suggestions: Array<{ text: string; emoji: string }> = [];
  if (summary.overloadMinutes > 0) suggestions.push({ emoji: "🧩", text: "Use \"Ajustar plano automaticamente\" para reorganizar tarefas dentro da sua capacidade." });
  if (highPriorityUnscheduled.length > 0)
    suggestions.push({
      emoji: "🔥",
      text: `${highPriorityUnscheduled.length} tarefa${highPriorityUnscheduled.length > 1 ? "s" : ""} de alta prioridade sem horário definido: ${highPriorityUnscheduled.slice(0, 3).map((t) => t.title).join(", ")}${highPriorityUnscheduled.length > 3 ? "…" : ""}.`,
    });
  if (deepWorkOffPeak.length > 0)
    suggestions.push({ emoji: "🧠", text: `${deepWorkOffPeak.length} tarefa${deepWorkOffPeak.length > 1 ? "s" : ""} de trabalho profundo fora do seu horário de maior energia (${energy.bestPeriod}).` });
  if (dominantAreaOverloaded) suggestions.push({ emoji: "⚖️", text: `"${dominantArea.label}" concentra ${dominantArea.pct}% da carga do dia — considere distribuir entre outras áreas.` });
  if (context.favorable === false) suggestions.push({ emoji: "🌧️", text: "O clima de hoje pode reduzir seu rendimento fora de casa — priorize tarefas internas." });
  if (energy.level === "Baixa") suggestions.push({ emoji: "🪫", text: "Energia prevista baixa — reserve tarefas leves e evite trabalho profundo no período de menor energia." });

  const insights: Array<{ text: string; emoji: string }> = [];
  if (summary.workloadLevel === "sobrecarga") insights.push({ emoji: "🔴", text: `Ocupação de ${Math.round(summary.occupancyRate * 100)}% da capacidade disponível hoje.` });
  if (withoutEstimate.length > 0) insights.push({ emoji: "⚠️", text: `${withoutEstimate.length} tarefa${withoutEstimate.length > 1 ? "s" : ""} sem estimativa de duração — não entram no cálculo de carga.` });
  if (pending.length > 0) {
    const scheduledPct = Math.round((pending.filter((t) => t.plannedStart).length / pending.length) * 100);
    insights.push({ emoji: "📌", text: `${scheduledPct}% das tarefas pendentes de hoje já têm horário definido.` });
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <IconBadge tone="purple" icon={<Sparkles size={18} />} size={32} />
          <p className="text-sm font-semibold">✨ Melhores horários</p>
        </div>
        {bestTimes.length === 0 ? (
          <p className="text-xs text-slate">Dados insuficientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {bestTimes.map((b) => (
              <li key={b.label} className="flex items-center justify-between text-xs">
                <span className="text-slate">
                  {b.emoji} {b.label}
                </span>
                <span className="font-semibold">{b.period}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <IconBadge tone="amber" icon={<Lightbulb size={18} />} size={32} />
          <p className="text-sm font-semibold">💡 Sugestões do LifeOS</p>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-slate">Nenhuma sugestão no momento — seu dia está equilibrado. ✅</p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="text-xs text-slate flex gap-1.5">
                <span className="shrink-0">{s.emoji}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <IconBadge tone="blue" icon={<TrendingUp size={18} />} size={32} />
            <p className="text-sm font-semibold">📈 Insights de planejamento</p>
          </div>
          <ul className="space-y-1.5">
            {insights.map((s, i) => (
              <li key={i} className="text-xs text-slate flex gap-1.5">
                <span className="shrink-0">{s.emoji}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
