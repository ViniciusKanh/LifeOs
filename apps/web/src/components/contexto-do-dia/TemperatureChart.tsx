import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/primitives";
import type { ContextTodayDashboard } from "@/types";

export function TemperatureChart({ data }: { data: ContextTodayDashboard }) {
  const chartData = data.hourlyChart.map((h) => ({ ...h, hour: h.time.slice(11, 16) }));

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold mb-3">Temperatura ao longo do dia</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="text-paper-border dark:text-ink-border" stroke="currentColor" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
            <YAxis tick={{ fontSize: 10 }} width={32} unit="°" />
            <Tooltip
              labelFormatter={(hour: string) => hour}
              formatter={(value: number, name: string) => {
                if (name === "temperature") return [`${value}°C`, "Temperatura"];
                return [`${value}°C`, "Sensação térmica"];
              }}
            />
            <Line type="monotone" dataKey="temperature" stroke="#F59E0B" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="apparentTemperature" stroke="#7C5CFC" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
