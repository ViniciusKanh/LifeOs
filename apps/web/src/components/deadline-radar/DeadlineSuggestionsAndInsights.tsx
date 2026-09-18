import { Lightbulb, BarChart3 } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";

export function DeadlineSuggestions({ suggestions }: { suggestions: string[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <IconBadge tone="amber" icon={<Lightbulb size={18} />} size={32} />
        <p className="text-sm font-semibold">Sugestões do LifeOS</p>
      </div>
      <p className="text-xs text-slate mb-3">Recomendações com base nos seus prazos e rotina.</p>
      {suggestions.length === 0 ? (
        <p className="text-xs text-slate">Nenhuma sugestão no momento — seus prazos estão sob controle.</p>
      ) : (
        <ul className="space-y-1.5 list-disc list-inside">
          {suggestions.map((s, i) => (
            <li key={i} className="text-xs text-slate">
              {s}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DeadlineInsights({ insights }: { insights: string[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <IconBadge tone="purple" icon={<BarChart3 size={18} />} size={32} />
        <p className="text-sm font-semibold">Insights</p>
      </div>
      <p className="text-xs text-slate mb-3">Padrões encontrados nos seus prazos.</p>
      {insights.length === 0 ? (
        <p className="text-xs text-slate">Sem dados suficientes para gerar insights ainda.</p>
      ) : (
        <ul className="space-y-1.5 list-disc list-inside">
          {insights.map((s, i) => (
            <li key={i} className="text-xs text-slate">
              {s}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
