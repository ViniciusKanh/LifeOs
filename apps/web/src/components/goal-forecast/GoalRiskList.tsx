import { Link } from "react-router-dom";
import { AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { RISK_LABEL, RISK_TONE } from "./goalForecastColors";
import type { GoalForecastItem } from "@/types";

export function GoalRiskList({ risks }: { risks: GoalForecastItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">🚨 Metas em risco</p>
      </div>
      <p className="text-xs text-slate mb-4">Podem não ser concluídas no prazo atual.</p>
      {risks.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhuma meta em risco no momento.</p>
      ) : (
        <ul className="space-y-2.5">
          {risks.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5">
              <AlertOctagon size={16} className="text-slate shrink-0" />
              <span className="text-sm truncate flex-1">{r.title}</span>
              <span className="text-xs font-semibold shrink-0">{r.progressPct != null ? `${r.progressPct}%` : "—"}</span>
              {r.risk && <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${RISK_TONE[r.risk]}`}>{RISK_LABEL[r.risk]}</span>}
            </li>
          ))}
        </ul>
      )}
      <Link to="/metas" className="inline-block text-xs font-semibold text-brand-600 dark:text-brand-400 mt-4">
        Ver todas as metas em risco →
      </Link>
    </Card>
  );
}
