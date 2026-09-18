import clsx from "clsx";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ExperimentCheckinDay } from "@/types";

const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Grade "Eu segui o comportamento hoje?" (seção 14) — automática quando o LifeOS já sabe pelo dado real, manual quando não. */
export function ExperimentCheckins({ checkins, title = "Check-ins recentes" }: { checkins: ExperimentCheckinDay[]; title?: string }) {
  const last7 = checkins.slice(-7);

  return (
    <Card className="p-4 md:p-5">
      <p className="text-sm font-semibold mb-3">{title}</p>
      <div className="flex items-center justify-between gap-1">
        {last7.map((day) => {
          const d = new Date(`${day.date}T00:00:00Z`);
          const weekday = WEEKDAY_LABEL[d.getUTCDay()];
          return (
            <div key={day.date} className="flex flex-col items-center gap-1.5" title={day.date}>
              <span className="text-[10px] text-slate">{weekday}</span>
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
            </div>
          );
        })}
      </div>
    </Card>
  );
}
