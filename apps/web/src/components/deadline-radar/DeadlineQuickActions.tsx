import { Link } from "react-router-dom";
import { Plus, CalendarDays, Target, Gauge } from "lucide-react";
import { Card } from "@/components/ui/primitives";

const ACTIONS = [
  { to: "/tarefas", label: "Adicionar nova tarefa", icon: Plus },
  { to: "/calendario", label: "Ver no Calendário", icon: CalendarDays },
  { to: "/metas", label: "Revisar metas relacionadas", icon: Target },
  { to: "/capacity-planner", label: "Abrir Capacity Planner", icon: Gauge },
];

export function DeadlineQuickActions() {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-1">⚡ Ações rápidas</p>
      <p className="text-xs text-slate mb-3">Organize seus prazos com um clique.</p>
      <ul className="space-y-1">
        {ACTIONS.map((a) => (
          <li key={a.to}>
            <Link
              to={a.to}
              className="flex items-center gap-2.5 text-sm rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-paper dark:hover:bg-ink transition-colors"
            >
              <a.icon size={16} className="text-brand-600 dark:text-brand-400 shrink-0" />
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
