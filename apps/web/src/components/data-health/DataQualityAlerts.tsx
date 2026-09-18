import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { DataHealthIssue } from "@/types";
import { SEVERITY_TONE, SEVERITY_LABEL } from "./dataHealthColors";

export function DataQualityAlerts({ issues }: { issues: DataHealthIssue[] }) {
  const relevant = issues.filter((i) => i.severity !== "info").slice(0, 6);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">🚨 Alertas de qualidade</p>
      </div>
      <p className="text-xs text-slate mb-4">Itens que precisam de atenção para melhorar a qualidade dos dados.</p>
      {relevant.length === 0 ? (
        <p className="text-xs text-slate py-6 text-center">Nenhum alerta ativo — seus dados estão em bom estado.</p>
      ) : (
        <ul className="space-y-2">
          {relevant.map((i) => (
            <li key={i.id}>
              <Link
                to={i.actionPath}
                className="flex items-start gap-2.5 rounded-xl border border-paper-border dark:border-ink-border p-3 hover:bg-paper dark:hover:bg-ink transition-colors"
              >
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${SEVERITY_TONE[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{i.title}</p>
                  <p className="text-[11px] text-slate mt-0.5">{i.description}</p>
                </div>
                <ChevronRight size={14} className="text-slate shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
