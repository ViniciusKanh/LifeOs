import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";

export interface KanbanDragProps {
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}

export interface KanbanBoardProps<T> {
  columns: string[];
  items: T[];
  getId: (item: T) => string;
  getStatus: (item: T) => string;
  onMove: (id: string, status: string) => void;
  renderCard: (item: T, dragProps: KanbanDragProps) => ReactNode;
  renderColumnFooter?: (column: string) => ReactNode;
  emptyHint?: string;
  /** Cor de destaque (hex) de cada coluna — faixa no topo e contador. */
  columnAccent?: Record<string, string>;
  /** Chave para lembrar (neste navegador) quais colunas o usuário recolheu. */
  storageKey?: string;
}

const DEFAULT_ACCENT = "#7C4DFF";

function readCollapsed(key?: string): string[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Kanban genérico (Tarefas e projetos acadêmicos em Educação). Quem chama
 * decide como o card é desenhado.
 *
 * - Desktop/tablet: as colunas dividem a largura disponível (sem rolagem
 *   lateral na maioria das telas); cada coluna rola por dentro, então todas
 *   as tarefas ficam à vista. Colunas podem ser recolhidas para uma faixa.
 * - Celular: abas por status (uma coluna por vez, em largura total), porque
 *   arrastar com o dedo entre colunas estreitas é impraticável — os cards
 *   oferecem "mover para" no próprio card.
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
  columnAccent,
  storageKey,
}: KanbanBoardProps<T>) {
  const reduce = useReducedMotion();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>(() => readCollapsed(storageKey));
  const [mobileCol, setMobileCol] = useState(columns[0]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(collapsed));
    } catch {
      // armazenamento indisponível: só não lembra a preferência
    }
  }, [collapsed, storageKey]);

  const grouped = useMemo(() => {
    const g: Record<string, T[]> = {};
    columns.forEach((col) => (g[col] = []));
    for (const item of items) g[getStatus(item)]?.push(item);
    return g;
  }, [columns, items, getStatus]);

  const drop = (col: string) => {
    if (dragId) onMove(dragId, col);
    setDragId(null);
    setOverCol(null);
  };

  const toggleCollapse = (col: string) =>
    setCollapsed((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));

  const accent = (col: string) => columnAccent?.[col] ?? DEFAULT_ACCENT;

  const cardList = (col: string) => (
    <motion.div layout={!reduce} className="space-y-2 min-h-[48px]">
      {grouped[col]?.length === 0 && (
        <p className="text-[11px] text-slate px-1 py-3 text-center rounded-xl border border-dashed border-paper-border dark:border-ink-border">
          {emptyHint ?? "Solte uma tarefa aqui"}
        </p>
      )}
      <AnimatePresence initial={false}>
        {grouped[col]?.map((item) => {
          const id = getId(item);
          return (
            <motion.div
              key={id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: dragId === id ? 0.45 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
            >
              {renderCard(item, {
                draggable: true,
                onDragStart: () => setDragId(id),
                onDragEnd: () => {
                  setDragId(null);
                  setOverCol(null);
                },
                isDragging: dragId === id,
              })}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );

  const gridTemplate = columns.map((c) => (collapsed.includes(c) ? "52px" : "minmax(210px, 1fr)")).join(" ");

  return (
    <>
      {/* Celular: abas por status */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Colunas" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-2 mb-2">
          {columns.map((col) => {
            const active = mobileCol === col;
            return (
              <button
                key={col}
                role="tab"
                aria-selected={active}
                onClick={() => setMobileCol(col)}
                className={`shrink-0 flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 text-xs font-semibold border transition-colors ${
                  active ? "text-white border-transparent" : "border-paper-border dark:border-ink-border text-slate"
                }`}
                style={active ? { background: accent(col) } : undefined}
              >
                {col}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-black/[0.05] dark:bg-white/[0.08]"}`}>
                  {grouped[col]?.length ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <div>
          {cardList(mobileCol)}
          {renderColumnFooter?.(mobileCol)}
        </div>
      </div>

      {/* Desktop/tablet: colunas dividindo a largura */}
      <div className="hidden md:block overflow-x-auto pb-2 -mx-1 px-1">
        <div className="grid gap-3 items-start" style={{ gridTemplateColumns: gridTemplate }}>
          {columns.map((col) => {
            const isCollapsed = collapsed.includes(col);
            const count = grouped[col]?.length ?? 0;
            const isOver = overCol === col && dragId !== null;
            const common = {
              onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                if (overCol !== col) setOverCol(col);
              },
              onDragLeave: (e: React.DragEvent) => {
                if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOverCol((c) => (c === col ? null : c));
              },
              onDrop: () => drop(col),
            };

            if (isCollapsed) {
              return (
                <button
                  key={col}
                  {...common}
                  onClick={() => toggleCollapse(col)}
                  aria-label={`Expandir coluna ${col} (${count})`}
                  title={`Expandir ${col}`}
                  className={`h-[min(70dvh,560px)] rounded-2xl border flex flex-col items-center gap-3 py-3 transition-colors ${
                    isOver ? "border-dashed border-brand-500 bg-brand-500/5" : "border-paper-border dark:border-ink-border bg-paper dark:bg-ink hover:bg-black/[0.02]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: accent(col) }} />
                  <span className="text-[11px] font-bold rounded-full px-1.5 py-0.5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border">
                    {count}
                  </span>
                  <span className="text-xs font-semibold text-slate [writing-mode:vertical-rl] rotate-180">{col}</span>
                  <ChevronsLeftRight size={14} className="mt-auto text-slate" />
                </button>
              );
            }

            return (
              <section
                key={col}
                {...common}
                aria-label={`${col}: ${count} ${count === 1 ? "item" : "itens"}`}
                className={`relative rounded-2xl flex flex-col min-w-0 transition-colors ${
                  isOver ? "ring-2 ring-brand-500/60 bg-brand-500/[0.04]" : "bg-paper dark:bg-ink"
                } border border-paper-border dark:border-ink-border`}
              >
                <span className="absolute inset-x-4 top-0 h-[3px] rounded-b-full" style={{ background: accent(col) }} aria-hidden />
                <header className="flex items-center gap-2 px-3 pt-3.5 pb-2.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent(col) }} />
                  <span className="text-sm font-semibold truncate">{col}</span>
                  <span
                    className="text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums"
                    style={{ background: `${accent(col)}1A`, color: accent(col) }}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(col)}
                    className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    aria-label={`Recolher coluna ${col}`}
                    title="Recolher coluna"
                  >
                    <ChevronsRightLeft size={14} />
                  </button>
                </header>
                {/* Cada coluna rola por dentro: todas as colunas cabem na tela ao mesmo tempo. */}
                <div className="px-2.5 pb-2.5 max-h-[min(70dvh,680px)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                  {cardList(col)}
                  {renderColumnFooter?.(col)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
