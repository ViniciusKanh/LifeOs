import { TrendingUp, TrendingDown, AlertTriangle, Link2, Repeat, type LucideIcon } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { DetectedPattern } from "@/types";

const PATTERN_ICON: Record<DetectedPattern["type"], LucideIcon> = {
  trend: TrendingUp,
  attention: AlertTriangle,
  positive_association: Link2,
  negative_association: TrendingDown,
  change: TrendingUp,
  consistency: Repeat,
};

const PATTERN_TONE: Record<DetectedPattern["type"], "blue" | "purple" | "green" | "pink" | "teal" | "amber"> = {
  trend: "green",
  attention: "amber",
  positive_association: "purple",
  negative_association: "amber",
  change: "blue",
  consistency: "teal",
};

function PatternCard({ pattern }: { pattern: DetectedPattern }) {
  const Icon = PATTERN_ICON[pattern.type];
  return (
    <Card className="p-4 flex gap-3">
      <IconBadge tone={PATTERN_TONE[pattern.type]} icon={<Icon size={18} />} size={36} />
      <div>
        <p className="text-sm font-semibold">{pattern.title}</p>
        <p className="text-xs text-slate mt-1 leading-snug">{pattern.description}</p>
        <p className="text-[11px] text-slate mt-1.5">{pattern.sampleSize} observações consideradas</p>
      </div>
    </Card>
  );
}

export function DetectedPatterns({ patterns }: { patterns: DetectedPattern[] }) {
  if (patterns.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm font-medium">Sem padrões detectados</p>
        <p className="text-xs text-slate mt-1.5 max-w-sm mx-auto">
          Ainda não há dados suficientes neste período para identificar tendências ou associações. Continue registrando sono, humor, foco e outros sinais.
        </p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {patterns.map((p, i) => (
        <PatternCard key={`${p.signal}-${p.type}-${i}`} pattern={p} />
      ))}
    </div>
  );
}
