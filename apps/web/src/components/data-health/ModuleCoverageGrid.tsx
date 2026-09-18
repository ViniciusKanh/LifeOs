import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ModuleCoverage } from "@/types";
import { MODULE_EMOJI, COVERAGE_TONE, COVERAGE_BAR_COLOR } from "./dataHealthColors";

export function ModuleCoverageGrid({ modules }: { modules: ModuleCoverage[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Layers size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">📦 Cobertura por módulo</p>
      </div>
      <p className="text-xs text-slate mb-4">Completude e qualidade dos dados em cada área do seu LifeOS.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map((m) => (
          <Link
            key={m.key}
            to={m.openPath}
            className="rounded-xl border border-paper-border dark:border-ink-border p-3.5 hover:bg-paper dark:hover:bg-ink transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <span>{MODULE_EMOJI[m.key] ?? "📌"}</span>
                {m.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${COVERAGE_TONE[m.status]}`}>{m.status}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${m.coveragePct}%`, background: COVERAGE_BAR_COLOR[m.status] }} />
              </div>
              <span className="text-xs font-semibold shrink-0">{m.coveragePct}%</span>
            </div>
            {m.mainIssue && <p className="text-[11px] text-slate mt-1.5 truncate">{m.mainIssue}</p>}
          </Link>
        ))}
      </div>
    </Card>
  );
}
