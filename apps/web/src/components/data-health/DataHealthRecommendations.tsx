import { Link } from "react-router-dom";
import { Lightbulb, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { DataHealthRecommendation } from "@/types";

export function DataHealthRecommendations({ recommendations }: { recommendations: DataHealthRecommendation[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={15} className="text-signal-deep dark:text-signal" />
        <p className="text-sm font-semibold">💡 Ações recomendadas</p>
      </div>
      <p className="text-xs text-slate mb-4">Sugestões para melhorar a qualidade dos seus dados.</p>
      {recommendations.length === 0 ? (
        <p className="text-xs text-slate py-6 text-center">Nenhuma ação pendente — continue assim.</p>
      ) : (
        <ul className="space-y-2">
          {recommendations.map((r) => (
            <li key={r.id}>
              <Link
                to={r.actionPath}
                className="flex items-center gap-2.5 rounded-xl border border-paper-border dark:border-ink-border p-3 hover:bg-paper dark:hover:bg-ink transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{r.title}</p>
                  <p className="text-[11px] text-slate mt-0.5">{r.description}</p>
                </div>
                <ChevronRight size={14} className="text-slate shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
