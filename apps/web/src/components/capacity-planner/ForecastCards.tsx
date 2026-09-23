import { BatteryCharging } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { ENERGY_EMOJI } from "./capacityColors";
import type { CapacityEnergyForecast } from "@/types";

export function EnergyForecastCard({ energy }: { energy: CapacityEnergyForecast }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="amber" icon={<BatteryCharging size={18} />} size={36} />
        <p className="text-sm font-semibold">🔋 Energia prevista</p>
      </div>
      {energy.level ? (
        <>
          <p className="font-display font-bold text-xl">
            {ENERGY_EMOJI[energy.level]} {energy.level}
          </p>
          {energy.bestPeriod ? (
            <p className="text-xs text-slate mt-1">⏰ Melhor período: {energy.bestPeriod}</p>
          ) : (
            <p className="text-xs text-slate mt-1">Sem horário de pico identificado ainda.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate">Dados insuficientes.</p>
      )}
    </Card>
  );
}
