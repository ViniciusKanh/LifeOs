import { Card } from "@/components/ui/primitives";
import { STATUS_BAR_COLOR } from "./goalForecastColors";
import type { GoalTimelineEntry } from "@/types";

function toDays(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime() / 86_400_000;
}

/** Timeline simples (sem lib de Gantt): cada meta vira uma faixa proporcional entre início e previsão/prazo. */
export function GoalTimeline({ entries, today }: { entries: GoalTimelineEntry[]; today: string }) {
  if (entries.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold mb-1">Linha do tempo das metas</p>
        <p className="text-sm text-slate py-8 text-center">Sem previsões suficientes para montar a linha do tempo.</p>
      </Card>
    );
  }

  const todayDays = toDays(today);
  const starts = entries.map((e) => toDays(e.start));
  const ends = entries.map((e) => toDays(e.end ?? e.start));
  const min = Math.min(...starts, todayDays);
  const max = Math.max(...ends, todayDays);
  const span = Math.max(1, max - min);
  const todayPct = ((todayDays - min) / span) * 100;

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Linha do tempo das metas</p>
      <p className="text-xs text-slate mb-4">Previsão de conclusão das suas metas ao longo do tempo.</p>
      <div className="relative space-y-3">
        <div className="absolute top-0 bottom-0 w-px bg-brand-500 z-10" style={{ left: `${Math.min(100, Math.max(0, todayPct))}%` }}>
          <span className="absolute -top-1 -translate-x-1/2 text-[9px] font-semibold text-white bg-brand-500 rounded px-1.5 py-0.5 whitespace-nowrap">Hoje</span>
        </div>
        {entries.map((e) => {
          const s = ((toDays(e.start) - min) / span) * 100;
          const en = ((toDays(e.end ?? e.start) - min) / span) * 100;
          const width = Math.max(1.5, en - s);
          return (
            <div key={e.id} className="flex items-center gap-3">
              <span className="text-xs truncate w-28 shrink-0">{e.title}</span>
              <div className="relative h-3 flex-1 rounded-full bg-paper dark:bg-ink">
                <div className="absolute h-full rounded-full" style={{ left: `${s}%`, width: `${width}%`, background: STATUS_BAR_COLOR[e.status] }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
