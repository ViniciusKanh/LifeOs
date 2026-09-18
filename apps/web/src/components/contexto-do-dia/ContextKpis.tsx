import { Thermometer, CloudRain, Leaf, SunMedium } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { ContextTodayDashboard } from "@/types";

function KpiCard({ icon, tone, label, value, caption }: { icon: React.ReactNode; tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber"; label: string; value: string; caption: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5 mb-2.5">
        <IconBadge tone={tone} icon={icon} size={36} />
        <span className="text-xs text-slate">{label}</span>
      </div>
      <p className="font-display font-bold text-2xl leading-none">{value}</p>
      <p className="text-[11px] text-slate mt-1.5">{caption}</p>
    </Card>
  );
}

export function ContextKpis({ data }: { data: ContextTodayDashboard }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={<Thermometer size={18} />}
        tone="amber"
        label="Temperatura atual"
        value={`${data.kpis.temperature.value}°C`}
        caption={`Sensação ${data.kpis.temperature.apparentTemperature}°C`}
      />
      <KpiCard icon={<CloudRain size={18} />} tone="blue" label="Chance de chuva" value={`${data.kpis.rainChance.value}%`} caption={data.kpis.rainChance.note} />
      <KpiCard
        icon={<Leaf size={18} />}
        tone="green"
        label="Qualidade do ar"
        value={data.kpis.airQuality?.level ?? "—"}
        caption={data.kpis.airQuality ? `AQI ${data.kpis.airQuality.aqi}` : "Indisponível"}
      />
      <KpiCard
        icon={<SunMedium size={18} />}
        tone="purple"
        label="Luz do dia"
        value={`${Math.floor(data.kpis.daylight.durationMinutes / 60)}h ${data.kpis.daylight.durationMinutes % 60}min`}
        caption={`Nascer ${data.kpis.daylight.sunrise} · Pôr ${data.kpis.daylight.sunset}`}
      />
    </div>
  );
}
