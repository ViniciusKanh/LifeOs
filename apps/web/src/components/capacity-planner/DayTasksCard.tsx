import { useMemo, useState } from "react";
import { Card, Button } from "@/components/ui/primitives";
import type { CapacityDayTask } from "@/types";

const FILTERS: Array<{ value: "Todas" | "Alta" | "Média" | "Baixa" }> = [
  { value: "Todas" },
  { value: "Alta" },
  { value: "Média" },
  { value: "Baixa" },
];

export function DayTasksCard({ tasks }: { tasks: CapacityDayTask[] }) {
  const [filter, setFilter] = useState<"Todas" | "Alta" | "Média" | "Baixa">("Todas");
  const filtered = useMemo(() => (filter === "Todas" ? tasks : tasks.filter((t) => t.priority === filter)), [tasks, filter]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm font-semibold">Tarefas do dia</p>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "primary" : "secondary"}
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => setFilter(f.value)}
            >
              {f.value}
            </Button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nenhuma tarefa para hoje.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2.5">
              <input type="checkbox" checked={t.done} readOnly className="w-4 h-4 rounded accent-brand-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-[11px] text-slate truncate">
                  {t.estimateMinutes != null ? `${t.estimateMinutes}min` : "Sem estimativa"}
                  {t.projectName ? ` · ${t.projectName}` : ""}
                  {t.plannedStart ? ` · ${t.plannedStart}` : ""}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate shrink-0">{t.priority}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
