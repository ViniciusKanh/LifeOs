import { useEffect, useRef, useState } from "react";
import { ArrowRight, Backpack, MoreVertical } from "lucide-react";
import type { InventoryItem } from "@/services/gamificationService";
import { rewardArtUrl } from "@/utils/treasureDisplay";
import { TreasureSidePanel } from "./TreasureSidePanel";

export type InventoryAction = "use" | "details" | "history" | "cancel";

/** Menu ⋮ de um item (teclado: Esc fecha; foco vai para a 1ª opção). */
function ItemMenu({ item, onAction }: { item: InventoryItem; onAction: (a: InventoryAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  const options: Array<[InventoryAction, string]> = [
    ["use", "Usar"],
    ["details", "Detalhes"],
    ["history", "Histórico"],
    ["cancel", "Devolver (estornar)"],
  ];
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={`Ações de ${item.name}`} className="w-8 h-8 flex items-center justify-center text-rpg-muted hover:text-rpg-gold-light">
        <MoreVertical size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rpg-panel py-1 shadow-xl">
          {options.map(([id, label]) => (
            <button
              key={id}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onAction(id);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-rpg-panel-hover focus:bg-rpg-panel-hover outline-none ${id === "cancel" ? "text-rpg-orange" : "text-rpg-text"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inventário: recompensas resgatadas ainda não usadas, agrupadas. */
export function RewardInventory({ items, loading, onAction, onViewAll }: { items: InventoryItem[]; loading: boolean; onAction: (item: InventoryItem, a: InventoryAction) => void; onViewAll: () => void }) {
  return (
    <TreasureSidePanel
      id="inventario"
      title="Inventário"
      icon={<Backpack size={16} />}
      actions={
        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
          Ver todos <ArrowRight size={12} aria-hidden />
        </button>
      }
    >
      {loading && <div className="h-24 rpg-bar animate-pulse" />}
      {!loading && items.length === 0 && (
        <div className="py-3 text-center">
          <p className="text-sm text-rpg-text">Nenhuma recompensa guardada.</p>
          <p className="mt-1 text-xs text-rpg-muted">Resgate uma recompensa para adicioná-la ao inventário.</p>
        </div>
      )}
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((it) => (
            <li key={it.rewardId} className="flex items-center gap-2.5 border border-rpg-border/70 bg-rpg-bg-2/60 px-2 py-1.5" style={{ borderRadius: 3 }}>
              <img src={rewardArtUrl(it.art)} alt="" aria-hidden className="pixelated w-10 h-8 object-cover border border-rpg-bronze shrink-0" style={{ borderRadius: 2 }} />
              <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{it.name}</span>
              <span className="font-pixel text-xs text-rpg-gold-light tabular-nums" aria-label={`${it.quantity} unidade(s)`}>
                x{it.quantity}
              </span>
              <ItemMenu item={it} onAction={(a) => onAction(it, a)} />
            </li>
          ))}
        </ul>
      )}
    </TreasureSidePanel>
  );
}
