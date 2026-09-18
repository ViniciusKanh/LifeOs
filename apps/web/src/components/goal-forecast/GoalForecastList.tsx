import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Target } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { STATUS_TONE, STATUS_EMOJI, AREA_EMOJI } from "./goalForecastColors";
import { formatPace, formatDate } from "./formatPace";
import type { GoalForecastItem } from "@/types";

const STATUS_RANK: Record<string, number> = {
  overdue: 0,
  at_risk: 1,
  attention: 2,
  on_track: 3,
  ahead: 4,
  insufficient_data: 5,
  completed: 6,
};

export function GoalForecastList({ goals }: { goals: GoalForecastItem[] }) {
  // Mais urgente primeiro (atrasada > em risco > atenção > no ritmo > adiantada); concluídas sempre por último, como troféu.
  const sorted = useMemo(() => [...goals].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]), [goals]);

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">🎯 Suas metas em destaque</p>
      <p className="text-xs text-slate mb-4">Previsão de conclusão, progresso e status de cada meta.</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">Nenhuma meta no período selecionado.</p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((g) => {
            const completed = g.status === "completed";
            return (
              <li
                key={g.id}
                className={`rounded-xl border border-paper-border dark:border-ink-border px-3.5 py-3 transition-colors hover:border-brand-300 dark:hover:border-brand-700 ${completed ? "opacity-70" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cat-pink/10 text-cat-pink flex items-center justify-center shrink-0">
                    <Target size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{g.title}</p>
                    <p className="text-[11px] text-slate truncate">
                      {AREA_EMOJI[g.area]} {g.area}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_TONE[g.status]}`}>
                    {STATUS_EMOJI[g.status]} {g.statusLabel}
                  </span>
                  <Link to="/metas" className="p-1.5 rounded-lg hover:bg-paper dark:hover:bg-ink shrink-0" aria-label={`Ver meta ${g.title}`}>
                    <ChevronRight size={16} />
                  </Link>
                </div>

                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-2.5">
                  <div className="h-full rounded-full bg-cat-purple" style={{ width: `${g.progressPct ?? 0}%` }} />
                </div>

                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate">
                  <span>
                    {g.kind === "numeric" && g.targetValue != null
                      ? `${g.currentValue} / ${g.targetValue} ${g.unit ?? ""}`.trim()
                      : g.progressPct != null
                        ? `${g.progressPct}%`
                        : "Sem métrica"}
                  </span>
                  {!completed && (
                    <>
                      <span>🔮 {g.forecastDate ? formatDate(g.forecastDate) : g.forecastReason ? "Sem previsão" : "—"}</span>
                      {g.currentPace != null && <span>⚡ {formatPace(g.currentPace, g.unit, g.kind)}</span>}
                      {g.requiredPace != null && <span>🎯 necessário: {formatPace(g.requiredPace, g.unit, g.kind)}</span>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
