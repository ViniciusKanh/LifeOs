import { CloudSun, Leaf, SunMedium, Thermometer } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { ContextTodayDashboard } from "@/types";

export function ResumoAmbientalCard({ data }: { data: ContextTodayDashboard }) {
  const items = [
    { icon: CloudSun, tone: "blue" as const, label: "Condição do tempo", value: data.resumoAmbiental.condition },
    { icon: Leaf, tone: "green" as const, label: "Qualidade do ar", value: data.resumoAmbiental.airQuality ?? "Indisponível" },
    { icon: SunMedium, tone: "amber" as const, label: "Índice UV", value: data.resumoAmbiental.uv ?? "Indisponível" },
    { icon: Thermometer, tone: "purple" as const, label: "Conforto térmico", value: data.resumoAmbiental.thermalComfort ?? "Indisponível" },
  ];

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold mb-3">Resumo ambiental</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <IconBadge tone={item.tone} icon={<item.icon size={16} />} size={32} />
            <div>
              <p className="text-[11px] text-slate">{item.label}</p>
              <p className="text-sm font-medium">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
