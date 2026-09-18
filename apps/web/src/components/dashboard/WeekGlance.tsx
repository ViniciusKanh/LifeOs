import { Card } from "@/components/ui/primitives";
import type { DailySeriesPoint } from "@/types";

const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Classificação simples e determinística — nunca aprendida/estimada — só para dar um emoji ao dia. */
function dayEmoji(total: number): string {
  if (total <= 0) return "⚪";
  if (total <= 2) return "🙂";
  return "🌟";
}

/**
 * "Sua semana em emojis" (novo componente) — glance rápido dos últimos 7 dias
 * de tarefas concluídas, reaproveitando `dailySeries.tasks` que o backend já
 * calcula para Analytics. Sem meta configurável ainda, os limiares (0 / 1-2 / 3+)
 * são só uma leitura visual, nunca uma nota de desempenho.
 */
export function WeekGlance({ series }: { series: DailySeriesPoint[] }) {
  const last7 = series.slice(-7);

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">📅</span>
        <p className="text-sm font-semibold">Sua semana em emojis</p>
      </div>
      {last7.length === 0 ? (
        <p className="text-xs text-slate">Ainda sem tarefas concluídas registradas.</p>
      ) : (
        <div className="flex items-center justify-between gap-1">
          {last7.map((d) => {
            const date = new Date(`${d.day}T00:00:00Z`);
            const weekday = WEEKDAY_LABEL[date.getUTCDay()];
            return (
              <div key={d.day} className="flex flex-col items-center gap-1.5" title={`${d.day} — ${d.total} tarefa(s) concluída(s)`}>
                <span className="text-[10px] text-slate">{weekday}</span>
                <span className="text-lg leading-none">{dayEmoji(d.total)}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-slate mt-3 pt-3 border-t border-paper-border dark:border-ink-border">
        ⚪ sem tarefas · 🙂 até 2 · 🌟 3 ou mais concluídas no dia.
      </p>
    </Card>
  );
}
