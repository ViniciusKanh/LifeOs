import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGTabs } from "@/components/rpg";
import { useInventoryHistory } from "@/hooks/useInventory";
import type { InventoryHistoryType } from "@/services/inventoryService";
import { ORIGIN_LABEL } from "@/utils/inventoryDisplay";

type Filter = "all" | InventoryHistoryType;
const ACTION: Record<string, { label: string; tone: "green" | "purple" | "blue" | "muted" | "orange" }> = {
  acquire: { label: "Aquisição", tone: "green" },
  use: { label: "Uso", tone: "purple" },
  equip: { label: "Equipado", tone: "blue" },
  unequip: { label: "Removido", tone: "muted" },
  remove: { label: "Removido", tone: "orange" },
  adjustment: { label: "Ajuste", tone: "muted" },
};

/** Histórico do inventário (ledger) com filtros. */
export function InventoryHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const q = useInventoryHistory(filter === "all" ? undefined : filter, open);
  return (
    <Modal open={open} onClose={onClose} title="Histórico do inventário" size="lg">
      <RPGTabs
        label="Filtrar histórico"
        size="sm"
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "Todos" },
          { value: "acquire", label: "Aquisições" },
          { value: "use", label: "Usos" },
          { value: "equip", label: "Equipamentos" },
        ]}
      />
      <div className="mt-3">
        {q.isLoading && <div className="h-24 rpg-bar animate-pulse" />}
        {q.isError && <p className="text-sm text-rpg-red">Não foi possível carregar o histórico.</p>}
        {q.data && q.data.length === 0 && <p className="text-sm text-rpg-muted py-4">Nada por aqui com este filtro.</p>}
        {q.data && q.data.length > 0 && (
          <ul className="divide-y divide-rpg-border/50">
            {q.data.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <time className="text-[11px] text-rpg-muted sm:order-none order-last col-span-2 sm:col-span-1" dateTime={r.at}>
                  {new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </time>
                <span className="min-w-0 truncate text-rpg-text">
                  {r.itemName}
                  <span className="block text-[11px] text-rpg-muted truncate">{r.label ?? ORIGIN_LABEL[r.sourceType] ?? r.sourceType}</span>
                </span>
                <RPGBadge tone={ACTION[r.type]?.tone ?? "muted"}>{ACTION[r.type]?.label ?? r.type}</RPGBadge>
                <span className="hidden sm:block font-pixel text-xs text-rpg-gold-light tabular-nums w-10 text-right">{r.type === "acquire" ? `+${r.quantity}` : r.type === "use" ? `-${r.quantity}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
