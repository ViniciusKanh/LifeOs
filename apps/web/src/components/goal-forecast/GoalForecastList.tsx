import { Link } from "react-router-dom";
import { ChevronRight, Target } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { STATUS_TONE } from "./goalForecastColors";
import { formatPace, formatDate } from "./formatPace";
import type { GoalForecastItem } from "@/types";

export function GoalForecastList({ goals }: { goals: GoalForecastItem[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Suas metas em destaque</p>
      <p className="text-xs text-slate mb-4">Previsão de conclusão, progresso e status de cada meta.</p>
      {goals.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">Nenhuma meta ativa no período selecionado.</p>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-xl border border-paper-border dark:border-ink-border p-3">
              <div className="w-10 h-10 rounded-xl bg-cat-pink/10 text-cat-pink flex items-center justify-center shrink-0">
                <Target size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{g.title}</p>
                <p className="text-[11px] text-slate">
                  {g.kind === "numeric" && g.targetValue != null
                    ? `${g.currentValue} / ${g.targetValue} ${g.unit ?? ""}`.trim()
                    : g.progressPct != null
                      ? `${g.progressPct}%`
                      : "Sem métrica"}
                </p>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-1.5">
                  <div className="h-full rounded-full bg-cat-purple" style={{ width: `${g.progressPct ?? 0}%` }} />
                </div>
              </div>
              <div className="hidden sm:block text-right shrink-0 w-32">
                <p className="text-[11px] text-slate">Previsão</p>
                <p className="text-xs font-semibold">{g.forecastDate ? formatDate(g.forecastDate) : g.forecastReason ? "Indisponível" : "—"}</p>
              </div>
              <div className="hidden lg:block text-right shrink-0 w-40">
                <p className="text-[11px] text-slate">Ritmo atual: {formatPace(g.currentPace, g.unit, g.kind)}</p>
                {g.requiredPace != null && <p className="text-[11px] text-slate">Necessário: {formatPace(g.requiredPace, g.unit, g.kind)}</p>}
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_TONE[g.status]}`}>{g.statusLabel}</span>
              <Link to="/metas" className="p-1 shrink-0" aria-label={`Ver meta ${g.title}`}>
                <ChevronRight size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
