import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { DataHealthHistoryPoint } from "@/types";

export function DataHealthTrend({ history }: { history: DataHealthHistoryPoint[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">📉 Evolução da saúde dos dados</p>
      </div>
      <p className="text-xs text-slate mb-4">Score calculado a cada verificação — clique em "Verificar novamente" para registrar um novo ponto.</p>
      {history.length < 2 ? (
        <p className="text-xs text-slate py-10 text-center">
          Ainda não há histórico suficiente. Use "Verificar novamente" ao longo dos próximos dias para começar a ver a evolução aqui.
        </p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="score" stroke="#7C4DFF" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
