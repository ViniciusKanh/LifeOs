import clsx from "clsx";
import { LayoutGrid, List, Search } from "lucide-react";
import type { ItemRarity, ItemType } from "@/services/inventoryService";
import { ITEM_RARITY, ITEM_SORTS, ORIGIN_LABEL, RARITY_RANK, TYPE_TABS, type ItemSort } from "@/utils/inventoryDisplay";
import { ITEM_TYPE_ICON } from "./itemIcons";

export type ViewMode = "grid" | "list";

const field = "w-full min-w-0 px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

/** Abas por tipo (só as que têm itens) + busca, raridade, origem, ordenação e modo de exibição. */
export function InventoryFilters({
  type,
  onType,
  counts,
  query,
  onQuery,
  rarity,
  onRarity,
  origin,
  onOrigin,
  origins,
  sort,
  onSort,
  view,
  onView,
}: {
  type: ItemType | "all";
  onType: (t: ItemType | "all") => void;
  counts: Partial<Record<ItemType | "all", number>>;
  query: string;
  onQuery: (q: string) => void;
  rarity: ItemRarity | "all";
  onRarity: (r: ItemRarity | "all") => void;
  origin: string;
  onOrigin: (o: string) => void;
  origins: string[];
  sort: ItemSort;
  onSort: (s: ItemSort) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const tabs = [{ id: "all" as const, label: "Todos" }, ...TYPE_TABS.filter((t) => (counts[t.id] ?? 0) > 0)];
  return (
    <div className="space-y-2.5">
      <div className="rpg-panel p-2">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar por tipo">
          {tabs.map((t) => {
            const Icon = ITEM_TYPE_ICON[t.id];
            const active = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onType(t.id)}
                className={clsx(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border-2 transition-colors",
                  active ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-text/85 bg-rpg-bg-2/60 hover:border-rpg-bronze",
                )}
                style={{ borderRadius: 3 }}
              >
                <Icon size={14} aria-hidden />
                {t.label} <span className="tabular-nums text-rpg-muted">({counts[t.id] ?? 0})</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
        <label className="relative col-span-2 md:col-span-1">
          <span className="sr-only">Buscar no inventário</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input type="search" className={`${field} pl-8`} style={{ borderRadius: 3 }} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar no inventário…" />
        </label>
        <label>
          <span className="sr-only">Raridade</span>
          <select className={field} style={{ borderRadius: 3 }} value={rarity} onChange={(e) => onRarity(e.target.value as ItemRarity | "all")}>
            <option value="all">Raridade: Todas</option>
            {RARITY_RANK.map((r) => (
              <option key={r} value={r}>
                Raridade: {ITEM_RARITY[r].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Origem</span>
          <select className={field} style={{ borderRadius: 3 }} value={origin} onChange={(e) => onOrigin(e.target.value)}>
            <option value="all">Origem: Todas</option>
            {origins.map((o) => (
              <option key={o} value={o}>
                Origem: {ORIGIN_LABEL[o] ?? o}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Ordenar por</span>
          <select className={field} style={{ borderRadius: 3 }} value={sort} onChange={(e) => onSort(e.target.value as ItemSort)}>
            {ITEM_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Ordenar: {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1 justify-end" role="group" aria-label="Modo de exibição">
          {(
            [
              ["grid", LayoutGrid, "Grade"],
              ["list", List, "Lista"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              aria-label={label}
              title={label}
              onClick={() => onView(id)}
              className={clsx("w-10 h-10 flex items-center justify-center border-2", view === id ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted")}
              style={{ borderRadius: 3 }}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
