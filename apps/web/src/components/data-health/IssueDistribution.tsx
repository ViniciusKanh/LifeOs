import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { IssueDistributionItem } from "@/types";
import { DIMENSION_COLOR } from "./dataHealthColors";

export function IssueDistribution({ distribution }: { distribution: IssueDistributionItem[] }) {
  const data = distribution.map((d, i) => ({ ...d, color: DIMENSION_COLOR[i % DIMENSION_COLOR.length] }));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <PieIcon size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">🍩 Distribuição dos problemas</p>
      </div>
      <p className="text-xs text-slate mb-4">Principais categorias de issues encontradas nos dados.</p>
      {data.length === 0 ? (
        <p className="text-xs text-slate py-10 text-center">Nenhum problema encontrado nas últimas verificações.</p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="relative w-28 h-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="label" innerRadius={30} outerRadius={50} paddingAngle={2}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-display font-bold text-base leading-none">{total}</span>
              <span className="text-[9px] text-slate">problemas</span>
            </div>
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            {data.map((d) => (
              <div key={d.dimension} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="truncate">{d.label}</span>
                <span className="text-slate ml-auto shrink-0">
                  {d.count} · {d.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
