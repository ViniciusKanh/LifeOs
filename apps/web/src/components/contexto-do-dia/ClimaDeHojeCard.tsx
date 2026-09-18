import { Droplets, Wind, Sun } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { WeatherIcon } from "./WeatherIcon";
import type { ContextTodayDashboard } from "@/types";

export function ClimaDeHojeCard({ data }: { data: ContextTodayDashboard }) {
  const blocks = [...data.todayPeriods];
  if (data.tomorrow) blocks.push({ key: "amanha", label: "Amanhã", temperature: data.tomorrow.temperature, condition: data.tomorrow.condition, icon: data.tomorrow.icon, rainProbability: null });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-sm font-semibold">Clima de hoje</p>
        {data.location.city && (
          <span className="text-[11px] text-slate shrink-0 truncate max-w-[45%]">
            {data.location.city}
            {data.location.region ? `, ${data.location.region}` : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-slate mb-4">Previsão e variação das condições ao longo do dia.</p>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {blocks.map((b) => (
          <div
            key={b.key}
            className="rounded-xl border border-paper-border dark:border-ink-border bg-paper/60 dark:bg-ink/40 p-3 text-center flex flex-col items-center gap-1"
          >
            <p className="text-[11px] text-slate truncate w-full">{b.label}</p>
            <WeatherIcon icon={b.icon} className="text-brand-500" />
            <p className="font-display font-bold text-base leading-none">{b.temperature}°</p>
            <p className="text-[10px] text-slate leading-tight truncate w-full">{b.condition}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2.5">
          <Droplets size={16} className="text-cat-blue shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-slate">Umidade</p>
            <p className="text-sm font-semibold truncate">{data.summary.humidity ?? "—"}%</p>
          </div>
        </div>
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2.5">
          <Wind size={16} className="text-cat-teal shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-slate">Vento</p>
            <p className="text-sm font-semibold truncate">{data.summary.windSpeedKmh ?? "—"} km/h</p>
          </div>
        </div>
        <div className="rounded-xl bg-paper dark:bg-ink p-3 flex items-center gap-2.5">
          <Sun size={16} className="text-signal-deep shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-slate">UV</p>
            <p className="text-sm font-semibold truncate">{data.summary.uv ? `${data.summary.uv.value} — ${data.summary.uv.level}` : "—"}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
