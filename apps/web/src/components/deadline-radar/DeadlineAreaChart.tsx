import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/primitives";
import { AREA_PALETTE } from "./deadlineColors";
import type { DeadlineAreaBucket } from "@/types";

export function DeadlineAreaChart({ areas }: { areas: DeadlineAreaBucket[] }) {
  const data = areas.map((a, i) => ({ ...a, color: AREA_PALETTE[i % AREA_PALETTE.length] }));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Prazos por área</p>
      <p className="text-xs text-slate mb-4">Distribuição de todos os itens com prazo.</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Sem prazos ativos para distribuir.</p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="relative w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="area" innerRadius={34} outerRadius={56} paddingAngle={2}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-display font-bold text-lg leading-none">{total}</span>
              <span className="text-[10px] text-slate">no total</span>
            </div>
          </div>
          <div className="space-y-2 min-w-0 flex-1">
            {data.map((d) => (
              <div key={d.area} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="truncate">{d.area}</span>
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
