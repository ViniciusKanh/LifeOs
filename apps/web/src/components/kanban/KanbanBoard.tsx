import { useState, type ReactNode } from "react";

export interface KanbanBoardProps<T> {
  columns: string[];
  items: T[];
  getId: (item: T) => string;
  getStatus: (item: T) => string;
  onMove: (id: string, status: string) => void;
  renderCard: (item: T, dragProps: { draggable: boolean; onDragStart: () => void; onDragEnd: () => void }) => ReactNode;
  renderColumnFooter?: (column: string) => ReactNode;
  emptyHint?: string;
}

/**
 * Kanban genérico reaproveitado por Tarefas e pelos projetos
 * acadêmicos (Educação) — mesma UX de arrastar-e-soltar, cabeçalho
 * de coluna com contagem e realce da coluna alvo, mas sem nenhum
 * conhecimento do formato do item: quem chama decide como o card
 * é desenhado.
 */
export function KanbanBoard<T>({
  columns,
  items,
  getId,
  getStatus,
  onMove,
  renderCard,
  renderColumnFooter,
  emptyHint,
}: KanbanBoardProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const grouped: Record<string, T[]> = {};
  columns.forEach((col) => (grouped[col] = items.filter((item) => getStatus(item) === col)));

  const drop = (col: string) => {
    if (dragId) onMove(dragId, col);
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col}
          onDragOver={(e) => {
            e.preventDefault();
            setOverCol(col);
          }}
          onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
          onDrop={() => drop(col)}
          className={`rounded-2xl p-3 shrink-0 w-[270px] md:w-[260px] bg-paper dark:bg-ink transition-colors ${
            overCol === col ? "border-[1.5px] border-dashed border-brand-500" : "border border-paper-border dark:border-ink-border"
          }`}
        >
          <div className="flex items-center justify-between px-1 mb-3">
            <span className="text-sm font-semibold">{col}</span>
            <span className="text-[11px] rounded-full px-1.5 py-0.5 text-slate bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border">
              {grouped[col]?.length ?? 0}
            </span>
          </div>
          <div className="space-y-2 min-h-[40px]">
            {grouped[col]?.length === 0 && emptyHint && (
              <p className="text-[11px] text-slate px-1 py-2">{emptyHint}</p>
            )}
            {grouped[col]?.map((item) => {
              const id = getId(item);
              return (
                <div key={id}>
                  {renderCard(item, {
                    draggable: true,
                    onDragStart: () => setDragId(id),
                    onDragEnd: () => setOverCol(null),
                  })}
                </div>
              );
            })}
          </div>
          {renderColumnFooter?.(col)}
        </div>
      ))}
    </div>
  );
}
