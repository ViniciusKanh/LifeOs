import { Droplets, Wind, Sun } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { WeatherIcon } from "./WeatherIcon";
import type { ContextTodayDashboard } from "@/types";

export function ClimaDeHojeCard({ data }: { data: ContextTodayDashboard }) {
  const blocks = [...data.todayPeriods];
  if (data.tomorrow) blocks.push({ key: "amanha", label: "Amanhã", temperature: data.tomorrow.temperature, condition: data.tomorrow.condition, icon: data.tomorrow.icon, rainProbability: null });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">Clima de hoje</p>
        {data.location.city && <span className="text-[11px] text-slate">{data.location.city}{data.location.region ? `, ${data.location.region}` : ""}</span>}
      </div>
      <p className="text-xs text-slate mb-3">Previsão e variação das condições ao longo do dia.</p>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {blocks.map((b) => (
          <div key={b.key} className="rounded-xl border border-paper-border dark:border-ink-border p-2.5 text-center">
            <p className="text-[11px] text-slate mb-1">{b.label}</p>
            <WeatherIcon icon={b.icon} className="mx-auto text-brand-500" />
            <p className="font-semibold text-sm mt-1">{b.temperature}°</p>
            <p className="text-[10px] text-slate leading-tight mt-0.5">{b.condition}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2">
          <Droplets size={16} className="text-cat-blue" />
          <div>
            <p className="text-[10px] text-slate">Umidade</p>
            <p className="text-sm font-semibold">{data.summary.humidity ?? "—"}%</p>
          </div>
        </div>
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2">
          <Wind size={16} className="text-cat-teal" />
          <div>
            <p className="text-[10px] text-slate">Vento</p>
            <p className="text-sm font-semibold">{data.summary.windSpeedKmh ?? "—"} km/h</p>
          </div>
        </div>
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2">
          <Sun size={16} className="text-signal-deep" />
          <div>
            <p className="text-[10px] text-slate">UV</p>
            <p className="text-sm font-semibold">{data.summary.uv ? `${data.summary.uv.value} — ${data.summary.uv.level}` : "—"}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
