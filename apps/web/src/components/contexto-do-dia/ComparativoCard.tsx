import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card } from "@/components/ui/primitives";
import type { ContextTodayDashboard } from "@/types";

export function ComparativoCard({ comparativo }: { comparativo: ContextTodayDashboard["comparativo"] }) {
  const chartData = comparativo
    .filter((c) => c.current != null || c.previous != null)
    .map((c) => ({ label: `${c.label}\n(${c.unit})`, "Período atual": c.current ?? 0, "Período anterior": c.previous ?? 0 }));

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Comparativo de período</p>
      <p className="text-xs text-slate mb-3">Contexto e resultado lado a lado — período atual vs. período anterior de mesmo tamanho.</p>
      {chartData.length === 0 ? (
        <p className="text-xs text-slate">Dados insuficientes para montar o comparativo neste período.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="text-paper-border dark:text-ink-border" stroke="currentColor" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} width={28} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Período atual" fill="#7C5CFC" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Período anterior" fill="#C4B5FD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
