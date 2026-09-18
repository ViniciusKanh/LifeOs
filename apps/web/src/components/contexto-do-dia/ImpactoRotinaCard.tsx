import clsx from "clsx";
import { Brain, Footprints, Smile, Moon, type LucideIcon } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { RoutineImpact } from "@/types";

const ICON: Record<string, LucideIcon> = {
  focus_mild_days: Brain,
  walk_dry_days: Footprints,
  mood_sunny_days: Smile,
  sleep_warm_nights: Moon,
};

function ImpactRow({ impact }: { impact: RoutineImpact }) {
  const Icon = ICON[impact.key] ?? Brain;
  const pct = impact.comparisonPct;
  const barWidth = pct == null ? 50 : Math.min(100, Math.abs(pct) * 2 + 20);
  const barColor = impact.favorable === "positive" ? "bg-cat-green" : impact.favorable === "negative" ? "bg-drop" : "bg-slate/40";

  return (
    <div className="flex gap-3">
      <IconBadge tone="purple" icon={<Icon size={16} />} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{impact.label}</p>
          <span className={clsx("text-xs font-semibold", impact.favorable === "positive" && "text-cat-green", impact.favorable === "negative" && "text-drop")}>
            {pct == null ? "Estável" : `${pct > 0 ? "+" : ""}${pct}%`}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-1.5">
          <div className={clsx("h-full rounded-full", barColor)} style={{ width: `${barWidth}%` }} />
        </div>
        <p className="text-[11px] text-slate mt-1">{impact.groupLabel}</p>
      </div>
    </div>
  );
}

export function ImpactoRotinaCard({ impacts }: { impacts: RoutineImpact[] }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Impacto percebido na rotina</p>
      <p className="text-xs text-slate mb-3">Como as condições externas parecem se relacionar com seus registros.</p>
      {impacts.length === 0 ? (
        <p className="text-xs text-slate">Ainda não há dados suficientes no histórico para comparar grupos de dias.</p>
      ) : (
        <div className="space-y-4">
          {impacts.map((i) => (
            <ImpactRow key={i.key} impact={i} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate mt-4 pt-3 border-t border-paper-border dark:border-ink-border">
        São tendências observadas no seu histórico, não conclusões causais.
      </p>
    </Card>
  );
}
