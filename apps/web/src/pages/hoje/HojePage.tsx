import { CheckCircle2, Circle } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";

export function HojePage() {
  const { tasks, moveTask } = useTasks();

  // "Prioridades de hoje" = tarefas de prioridade Alta que ainda não
  // foram concluídas, mais as já concluídas hoje — reaproveitando o
  // mesmo dado de tasks em vez de criar um conceito paralelo.
  const priorities = tasks.filter((t) => t.priority === "Alta").slice(0, 6);
  const donePct =
    priorities.length > 0
      ? Math.round((priorities.filter((t) => t.status === "Concluído").length / priorities.length) * 100)
      : 0;

  const toggle = (id: string, currentStatus: string) => {
    moveTask({ id, status: currentStatus === "Concluído" ? "A Fazer" : "Concluído" });
  };

  return (
    <div className="px-5 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
      <p className="font-display font-medium text-2xl">Hoje</p>
      <p className="text-sm mt-1 mb-6 text-slate">{donePct}% das prioridades concluídas</p>

      <div className="rounded-2xl p-6 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised">
        <p className="text-sm font-semibold mb-4">Prioridades</p>
        {priorities.length === 0 ? (
          <p className="text-sm text-slate">
            Nenhuma tarefa de prioridade alta por aqui ainda. Crie uma em Tarefas para vê-la neste painel.
          </p>
        ) : (
          <div className="space-y-1">
            {priorities.map((t, i) => {
              const done = t.status === "Concluído";
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id, t.status)}
                  className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-left hover:opacity-80"
                >
                  {done ? <CheckCircle2 size={18} className="text-growth" /> : <Circle size={18} className="text-slate" />}
                  <span className="w-5 text-xs text-slate">{i + 1}.</span>
                  <span className={done ? "line-through text-slate" : ""}>{t.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
