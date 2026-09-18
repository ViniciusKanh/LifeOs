import clsx from "clsx";
import { CloudRain, Sun, Thermometer, Moon, type LucideIcon } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { RoutineImpact } from "@/types";

const ICON: Record<string, LucideIcon> = {
  focus_mild_days: Thermometer,
  walk_dry_days: CloudRain,
  mood_sunny_days: Sun,
  sleep_warm_nights: Moon,
};

const TONE: Record<string, "blue" | "purple" | "green" | "pink" | "teal" | "amber"> = {
  focus_mild_days: "amber",
  walk_dry_days: "blue",
  mood_sunny_days: "amber",
  sleep_warm_nights: "purple",
};

export function CorrelacaoContextoCard({ impacts, disclaimer }: { impacts: RoutineImpact[]; disclaimer: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Correlação do contexto com sua rotina</p>
      <p className="text-xs text-slate mb-3">Padrões observados no seu histórico dos últimos meses.</p>
      {impacts.length === 0 ? (
        <p className="text-xs text-slate">Ainda não há histórico suficiente para calcular estas comparações.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {impacts.map((impact) => {
            const Icon = ICON[impact.key] ?? Thermometer;
            return (
              <div key={impact.key} className="rounded-xl border border-paper-border dark:border-ink-border p-3">
                <IconBadge tone={TONE[impact.key] ?? "blue"} icon={<Icon size={16} />} size={32} />
                <p className="text-xs text-slate mt-2">{impact.label}</p>
                <p className="font-display font-bold text-lg leading-tight mt-0.5">
                  {impact.value}
                  <span className="text-xs font-normal text-slate ml-1">{impact.unit}</span>
                </p>
                {impact.comparisonPct != null && (
                  <p className={clsx("text-[11px] font-medium mt-0.5", impact.favorable === "positive" && "text-cat-green", impact.favorable === "negative" && "text-drop", impact.favorable === "neutral" && "text-slate")}>
                    {impact.comparisonPct > 0 ? "+" : ""}
                    {impact.comparisonPct}% {impact.groupLabel}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate mt-3 pt-3 border-t border-paper-border dark:border-ink-border">{disclaimer}</p>
    </Card>
  );
}
