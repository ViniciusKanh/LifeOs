import { BatteryCharging, Timer } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import type { CapacityEnergyForecast, CapacityFocusForecast } from "@/types";

export function EnergyForecastCard({ energy }: { energy: CapacityEnergyForecast }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="amber" icon={<BatteryCharging size={18} />} size={36} />
        <p className="text-sm font-semibold">Energia prevista</p>
      </div>
      {energy.level ? (
        <>
          <p className="font-display font-bold text-xl">{energy.level}</p>
          {energy.bestPeriod ? (
            <p className="text-xs text-slate mt-1">Melhor período: {energy.bestPeriod}</p>
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

export function FocusForecastCard({ focus }: { focus: CapacityFocusForecast }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="purple" icon={<Timer size={18} />} size={36} />
        <p className="text-sm font-semibold">Focus previsto</p>
      </div>
      {focus.level ? (
        <>
          <p className="font-display font-bold text-xl">{focus.level}</p>
          {focus.bestPeriod && <p className="text-xs text-slate mt-1">Melhor período: {focus.bestPeriod}</p>}
        </>
      ) : (
        <p className="text-sm text-slate">Dados insuficientes.</p>
      )}
    </Card>
  );
}
