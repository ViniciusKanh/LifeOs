import { Lightbulb } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";

export function GoalForecastInsights({ suggestions, insights }: { suggestions: string[]; insights: string[] }) {
  const all = [...suggestions, ...insights];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <IconBadge tone="purple" icon={<Lightbulb size={18} />} size={32} />
        <p className="text-sm font-semibold">Insights do LifeOS</p>
      </div>
      <p className="text-xs text-slate mb-3">Padrões encontrados nas suas metas.</p>
      {all.length === 0 ? (
        <p className="text-xs text-slate">Sem dados suficientes para gerar insights ainda.</p>
      ) : (
        <ul className="space-y-1.5 list-disc list-inside">
          {all.map((s, i) => (
            <li key={i} className="text-xs text-slate">
              {s}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
