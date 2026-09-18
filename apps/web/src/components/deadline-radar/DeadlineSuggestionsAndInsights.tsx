import { Lightbulb, BarChart3 } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";

/** Card único de sugestões + insights — mesmo padrão visual do Capacity Planner, menos fragmentado que dois cards separados. */
export function DeadlineInsightsCard({ suggestions, insights }: { suggestions: string[]; insights: string[] }) {
  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <IconBadge tone="amber" icon={<Lightbulb size={18} />} size={32} />
          <p className="text-sm font-semibold">💡 Sugestões do LifeOS</p>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-slate">Nenhuma sugestão no momento — seus prazos estão sob controle. ✅</p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="text-xs text-slate flex gap-1.5">
                <span className="shrink-0">📌</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <IconBadge tone="purple" icon={<BarChart3 size={18} />} size={32} />
            <p className="text-sm font-semibold">📈 Insights</p>
          </div>
          <ul className="space-y-1.5">
            {insights.map((s, i) => (
              <li key={i} className="text-xs text-slate flex gap-1.5">
                <span className="shrink-0">🔎</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
