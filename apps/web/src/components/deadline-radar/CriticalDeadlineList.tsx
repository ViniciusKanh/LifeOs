import { Link } from "react-router-dom";
import { ChevronRight, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { STATUS_LABEL, STATUS_TONE, STATUS_EMOJI, STATUS_BORDER_COLOR, AREA_EMOJI } from "./deadlineColors";
import type { DeadlineItem } from "@/types";

function daysLabel(days: number): string {
  if (days < 0) return `Atrasado há ${Math.abs(days)} dia${Math.abs(days) > 1 ? "s" : ""}`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `${days} dias`;
}

export function CriticalDeadlineList({ items }: { items: DeadlineItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">🎯 Itens críticos</p>
        <span className="text-[11px] font-semibold text-slate">{items.length}</span>
      </div>
      <p className="text-xs text-slate mb-4">Atrasados ou vencendo em até 7 dias — o que exige sua atenção agora.</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhum item crítico no momento. 🎉</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-paper-border dark:border-ink-border px-3.5 py-3 border-l-4 transition-colors hover:border-brand-300 dark:hover:border-brand-700"
              style={{ borderLeftColor: STATUS_BORDER_COLOR[item.status] }}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-[11px] text-slate truncate">
                    {AREA_EMOJI[item.area]} {item.projectName ?? item.area}
                  </p>
                </div>
                <span className="text-xs text-slate shrink-0 hidden sm:inline">{daysLabel(item.daysRemaining)}</span>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${STATUS_TONE[item.status]}`}>
                  {STATUS_EMOJI[item.status]} {STATUS_LABEL[item.status]}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Link to={item.sourceModule} className="p-1.5 rounded-lg hover:bg-paper dark:hover:bg-ink" aria-label={`Abrir ${item.title}`} title="Abrir">
                    <ChevronRight size={16} />
                  </Link>
                  {item.entityType === "task" && (
                    <Link
                      to="/capacity-planner"
                      className="p-1.5 rounded-lg hover:bg-paper dark:hover:bg-ink text-brand-600 dark:text-brand-400"
                      aria-label={`Planejar ${item.title} no Capacity Planner`}
                      title="Planejar no Capacity Planner"
                    >
                      <Wand2 size={16} />
                    </Link>
                  )}
                </div>
              </div>
              {item.progress != null && (
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-2.5">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${item.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
