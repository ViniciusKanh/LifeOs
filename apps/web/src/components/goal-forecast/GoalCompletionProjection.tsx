import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/primitives";
import type { GoalMonthlyProjectionPoint } from "@/types";

export function GoalCompletionProjection({ points }: { points: GoalMonthlyProjectionPoint[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">📈 Projeção de conclusão</p>
      <p className="text-xs text-slate mb-4">Quantas metas podem ser concluídas em cada período.</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
