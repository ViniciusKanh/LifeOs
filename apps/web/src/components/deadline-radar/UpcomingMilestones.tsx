import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { DeadlineItem } from "@/types";

function formatMarker(dueDate: string): { day: string; month: string } {
  const d = new Date(`${dueDate}T00:00:00`);
  const month = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  return { day: String(d.getDate()).padStart(2, "0"), month };
}

export function UpcomingMilestones({ items }: { items: DeadlineItem[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">Próximos marcos</p>
      <p className="text-xs text-slate mb-4">Eventos importantes no seu horizonte.</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhum marco futuro registrado.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const marker = formatMarker(item.dueDate);
            return (
              <li key={item.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-paper dark:bg-ink shrink-0">
                  <span className="text-xs font-bold leading-none">{marker.day}</span>
                  <span className="text-[9px] text-slate leading-none mt-0.5">{marker.month}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-[11px] text-slate truncate">{item.projectName ?? item.area}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/timeline" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 mt-4">
        Ver linha do tempo completa <ChevronRight size={14} />
      </Link>
    </Card>
  );
}
