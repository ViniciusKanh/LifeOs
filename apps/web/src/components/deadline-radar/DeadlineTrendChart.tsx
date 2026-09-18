import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/primitives";
import type { DeadlineTrendPoint } from "@/types";

export function DeadlineTrendChart({ trend }: { trend: DeadlineTrendPoint[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Tendência de prazos</p>
      <p className="text-xs text-slate mb-4">Quantidade de itens com prazo nos próximos meses.</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
