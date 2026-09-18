import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { STATUS_LABEL } from "./deadlineColors";
import type { DeadlineDayStatus, DeadlineItem, DeadlineSummary } from "@/types";

const STATUS_CONFIG: Record<DeadlineDayStatus, { emoji: string; title: string; className: string }> = {
  critico: { emoji: "🚨", title: "Atenção: você tem prazos atrasados.", className: "bg-drop/10 border-drop/30 text-drop" },
  atencao: { emoji: "⏰", title: "Semana concorrida — vários prazos se aproximando.", className: "bg-signal/15 border-signal/30 text-signal-deep" },
  tranquilo: { emoji: "🌿", title: "Seus prazos estão sob controle.", className: "bg-cat-green/10 border-cat-green/30 text-cat-green" },
};

function daysLabel(days: number): string {
  if (days < 0) return `atrasado há ${Math.abs(days)} dia${Math.abs(days) > 1 ? "s" : ""}`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${days} dias`;
}

/** Banner de leitura rápida do dia — status e "por onde começar" derivados 100% do resumo já calculado no backend. */
export function DeadlineStatusBanner({ dayStatus, focusItem, summary }: { dayStatus: DeadlineDayStatus; focusItem: DeadlineItem | null; summary: DeadlineSummary }) {
  const cfg = STATUS_CONFIG[dayStatus];
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 flex items-center gap-4 flex-wrap ${cfg.className}`}>
      <span className="text-2xl leading-none shrink-0">{cfg.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{cfg.title}</p>
        {focusItem ? (
          <p className="text-xs mt-0.5 opacity-90 truncate">
            Comece por: <span className="font-medium">{focusItem.title}</span> · {STATUS_LABEL[focusItem.status]} ({daysLabel(focusItem.daysRemaining)})
          </p>
        ) : (
          <p className="text-xs mt-0.5 opacity-90">Nenhum item pedindo atenção imediata.</p>
        )}
      </div>
      {focusItem && (
        <Link
          to={focusItem.sourceModule}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-paper-raised dark:bg-ink-raised shrink-0 hover:opacity-80 transition-opacity"
        >
          Resolver agora <ArrowRight size={14} />
        </Link>
      )}
      {!focusItem && summary.overdue === 0 && summary.dueToday === 0 && <span className="text-xs opacity-70 shrink-0">Ótimo ritmo! ✨</span>}
    </div>
  );
}
