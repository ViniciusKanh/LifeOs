import clsx from "clsx";
import { Check, Bot, PenLine } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ExperimentCheckinDay } from "@/types";

const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function sourceTitle(day: ExperimentCheckinDay): string {
  const statusLabel = day.status === "done" ? "cumprido" : day.status === "missed" ? "não cumprido" : "pendente";
  const sourceLabel = day.source === "automatic" ? "verificado automaticamente" : day.source === "manual" ? "confirmado manualmente" : "sem registro";
  return `${day.date} — ${statusLabel} (${sourceLabel})`;
}

/**
 * Grade "Eu segui o comportamento hoje?" (seção 14) — automática quando o
 * LifeOS já sabe pelo dado real, manual quando não. O selo 🤖/✍️ no canto
 * mostra de onde veio cada dia, para não parecer que sumiu um registro.
 */
export function ExperimentCheckins({ checkins, title = "Check-ins recentes" }: { checkins: ExperimentCheckinDay[]; title?: string }) {
  const last7 = checkins.slice(-7);
  const hasAutomatic = last7.some((d) => d.source === "automatic");
  const hasManual = last7.some((d) => d.source === "manual");

  return (
    <Card className="p-4 md:p-5">
      <p className="text-sm font-semibold mb-3">{title}</p>
      <div className="flex items-center justify-between gap-1">
        {last7.map((day) => {
          const d = new Date(`${day.date}T00:00:00Z`);
          const weekday = WEEKDAY_LABEL[d.getUTCDay()];
          return (
            <div key={day.date} className="flex flex-col items-center gap-1.5" title={sourceTitle(day)}>
              <span className="text-[10px] text-slate">{weekday}</span>
              <span className="relative">
                <span
                  className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center border transition-colors",
                    day.status === "done" && "bg-cat-green/15 border-cat-green text-cat-green",
                    day.status === "missed" && "bg-drop/10 border-drop/40 text-drop",
                    day.status === "pending" && "border-paper-border dark:border-ink-border text-slate"
                  )}
                >
                  {day.status === "done" ? <Check size={14} /> : day.status === "missed" ? <span className="text-[10px]">✕</span> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                </span>
                {day.source !== "none" && (
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border flex items-center justify-center text-slate">
                    {day.source === "automatic" ? <Bot size={8} /> : <PenLine size={8} />}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {(hasAutomatic || hasManual) && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-paper-border dark:border-ink-border">
          {hasAutomatic && (
            <span className="flex items-center gap-1 text-[10px] text-slate"><Bot size={10} /> Automático</span>
          )}
          {hasManual && (
            <span className="flex items-center gap-1 text-[10px] text-slate"><PenLine size={10} /> Manual</span>
          )}
        </div>
      )}
    </Card>
  );
}
