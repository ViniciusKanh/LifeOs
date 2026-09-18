import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/primitives";
import { AREA_PALETTE } from "./capacityColors";
import type { CapacityArea } from "@/types";

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function AreaDistributionCard({ areas }: { areas: CapacityArea[] }) {
  const data = areas.map((a, i) => ({ ...a, color: AREA_PALETTE[i % AREA_PALETTE.length] }));
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-4">Carga por área</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Sem carga planejada para calcular a distribuição.</p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="minutes" nameKey="label" innerRadius={34} outerRadius={56} paddingAngle={2}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 min-w-0 flex-1">
            {data.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="truncate">{d.label}</span>
                <span className="text-slate ml-auto shrink-0">
                  {fmt(d.minutes)} · {d.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
