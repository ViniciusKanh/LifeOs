import { Sun, CloudSun, Moon, ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ContextTodayDashboard } from "@/types";

const PERIOD_ICON: Record<string, LucideIcon> = {
  manha: Sun,
  tarde: CloudSun,
  noite: Moon,
};

export function AgendaRecomendadaCard({ agenda }: { agenda: ContextTodayDashboard["agendaRecomendada"] }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Agenda recomendada para hoje</p>
      <p className="text-xs text-slate mb-3">Sugestões com base nas condições previstas — nada é alterado automaticamente no Calendário.</p>
      <div className="space-y-2">
        {agenda.map((item) => {
          const Icon = PERIOD_ICON[item.period] ?? Sun;
          return (
            <div key={item.period} className="flex items-center gap-3 rounded-xl border border-paper-border dark:border-ink-border p-2.5">
              <Icon size={16} className="text-signal-deep shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{item.label}</p>
                <p className="text-[11px] text-slate leading-snug">{item.text}</p>
              </div>
              <ChevronRight size={14} className="text-slate shrink-0" />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
