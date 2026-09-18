import { Card } from "@/components/ui/primitives";
import type { DeadlineStatusBars } from "@/types";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function DeadlineStatusOverview({ bars }: { bars: DeadlineStatusBars }) {
  const max = Math.max(bars.atrasados, bars.vence7d, bars.em8a30, bars.noPrazo, 1);
  return (
    <Card className="p-5 space-y-3.5">
      <p className="text-sm font-semibold">📊 Itens por status</p>
      <p className="text-xs text-slate -mt-2">Visão geral da sua situação atual.</p>
      <Bar label="🔴 Atrasados" value={bars.atrasados} max={max} color="#D64545" />
      <Bar label="🟡 Vencem em 7 dias" value={bars.vence7d} max={max} color="#C9821E" />
      <Bar label="🔵 Em 8–30 dias" value={bars.em8a30} max={max} color="#8B5CF6" />
      <Bar label="🟢 No prazo" value={bars.noPrazo} max={max} color="#2E7D6B" />
    </Card>
  );
}
