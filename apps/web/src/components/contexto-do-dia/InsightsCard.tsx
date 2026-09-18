import { Sparkles, Thermometer, CloudRain, Sun } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { ContextInsight } from "@/types";

const ICONS = [Thermometer, CloudRain, Sun];

export function InsightsCard({ insights }: { insights: ContextInsight[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">Insights do LifeOS</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-cat-purple/10 text-cat-purple font-medium">Com IA</span>
      </div>
      {insights.length === 0 ? (
        <p className="text-xs text-slate">Ainda não há insights com dados suficientes para este período.</p>
      ) : (
        <div className="space-y-2.5">
          {insights.map((insight, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={i} className="flex items-start gap-2.5">
                <IconBadge tone="purple" icon={<Icon size={14} />} size={28} />
                <p className="text-xs leading-snug pt-1">{insight.text}</p>
              </div>
            );
          })}
        </div>
      )}
      <button className="text-xs font-medium text-brand-600 dark:text-brand-400 mt-3 flex items-center gap-1">
        <Sparkles size={12} /> Ver análise completa →
      </button>
    </Card>
  );
}
