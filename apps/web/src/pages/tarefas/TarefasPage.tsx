import { useMemo, useState } from "react";
import { Plus, GripVertical } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { Button } from "@/components/ui/primitives";
import type { Task } from "@/types";

const COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];
const PRIORITY_COLOR: Record<Task["priority"], string> = {
  Alta: "#C75146",
  Média: "#E8A33D",
  Baixa: "#5B6B7A",
};

export function TarefasPage() {
  const { tasks, createTask, moveTask } = useTasks();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = {};
    COLUMNS.forEach((col) => (g[col] = tasks.filter((t) => t.status === col)));
    return g;
  }, [tasks]);

  const drop = (col: string) => {
    if (!dragId) return;
    moveTask({ id: dragId, status: col });
    setDragId(null);
    setOverCol(null);
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await createTask({ title, status: "Backlog", priority: "Média" });
    setNewTitle("");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between mb-5 max-w-6xl mx-auto gap-3 flex-wrap">
        <p className="font-display font-medium text-2xl">Tarefas</p>
        <div className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Nova tarefa..."
            className="rounded-lg px-3 py-2 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
          />
          <Button onClick={handleCreate}>
            <Plus size={15} /> Adicionar
          </Button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 max-w-6xl mx-auto">
        {COLUMNS.map((col) => (
          <div
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col);
            }}
            onDrop={() => drop(col)}
            className={`rounded-2xl p-3 shrink-0 w-[260px] md:w-[240px] bg-paper-raised dark:bg-ink-raised ${
              overCol === col ? "border-[1.5px] border-dashed border-signal" : "border border-paper-border dark:border-ink-border"
            }`}
          >
            <div className="flex items-center justify-between px-1 mb-3">
              <span className="text-xs font-semibold text-slate">{col}</span>
              <span className="text-[11px] rounded-full px-1.5 py-0.5 text-slate border border-paper-border dark:border-ink-border">
                {grouped[col]?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2 min-h-[40px]">
              {grouped[col]?.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setOverCol(null)}
                  className="rounded-xl p-3 cursor-grab active:cursor-grabbing text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="leading-snug">{t.title}</span>
                    <GripVertical size={13} className="shrink-0 mt-0.5 text-slate" />
                  </div>
                  <div className="flex items-center justify-end mt-2.5">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}1A` }}
                    >
                      {t.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
