import { Link } from "react-router-dom";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { RISK_LABEL, RISK_TONE, RISK_BAR_COLOR } from "./deadlineColors";
import type { ProjectRiskItem } from "@/types";

export function DeadlineRiskList({ risks }: { risks: ProjectRiskItem[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Risco de não concluir</p>
      <p className="text-xs text-slate mb-4">Baseado no seu ritmo atual de progresso.</p>
      {risks.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhum projeto com tarefas datadas para avaliar risco ainda.</p>
      ) : (
        <ul className="space-y-3">
          {risks.map((r) => (
            <li key={r.projectId} className="flex items-center gap-3">
              <TrendingUp size={16} className="text-slate shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.projectName}</p>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-1.5 w-full">
                  <div className="h-full rounded-full" style={{ width: `${r.progressPct}%`, background: RISK_BAR_COLOR[r.risk] }} />
                </div>
              </div>
              <span className="text-xs font-semibold shrink-0">{r.progressPct}%</span>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${RISK_TONE[r.risk]}`}>{RISK_LABEL[r.risk]}</span>
              <Link to="/projetos" className="p-1 shrink-0" aria-label={`Ver projeto ${r.projectName}`}>
                <ChevronRight size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
