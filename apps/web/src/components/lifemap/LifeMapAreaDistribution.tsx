import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { LifeMapDistributionItem } from "@/types";
import { AREA_COLOR } from "./LifeMapGraph";

/**
 * "Distribuição por área" — barra horizontal segmentada mostrando
 * onde estão concentrados os itens ativos do usuário. Os percentuais
 * vêm prontos do backend (calculados a partir dos nós ativos reais),
 * o componente só desenha.
 */
export function LifeMapAreaDistribution({ distribution }: { distribution: LifeMapDistributionItem[] }) {
  if (distribution.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={15} className="text-slate" />
          <p className="text-sm font-semibold">Distribuição por área</p>
        </div>
        <p className="text-xs text-slate">Sem itens ativos suficientes para calcular a distribuição ainda.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={15} className="text-slate" />
        <p className="text-sm font-semibold">Distribuição por área</p>
      </div>

      <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border" title="Distribuição por área">
        {distribution.map((d) => (
          <div
            key={d.area}
            style={{ width: `${d.pct}%`, background: AREA_COLOR[d.area] }}
            title={`${d.label}: ${d.pct}% (${d.count} ${d.count === 1 ? "item" : "itens"})`}
          />
        ))}
      </div>

      <ul className="mt-3.5 space-y-2">
        {distribution.map((d) => (
          <li key={d.area} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AREA_COLOR[d.area] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="font-semibold shrink-0">{d.pct}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
