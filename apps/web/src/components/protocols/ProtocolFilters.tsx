import { Search } from "lucide-react";
import clsx from "clsx";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import type { ProtocolFilter, ProtocolSort } from "@/utils/protocolDisplay";

const FILTERS: Array<{ id: ProtocolFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Meus Protocolos" },
  { id: "templates", label: "Templates" },
  { id: "used", label: "Mais usados" },
  { id: "recent", label: "Recentes" },
  { id: "favorites", label: "Favoritos" },
];
const SORTS: Array<{ id: ProtocolSort; label: string }> = [
  { id: "relevance", label: "Mais relevantes" },
  { id: "used", label: "Mais usados" },
  { id: "recent", label: "Usados recentemente" },
  { id: "az", label: "Nome (A–Z)" },
];

/** Filtros dos Protocolos: abas de origem + situação (categoria), ordenação e busca. */
export function ProtocolFilters({
  filter,
  onFilter,
  counts,
  category,
  onCategory,
  categories,
  sort,
  onSort,
  query,
  onQuery,
}: {
  filter: ProtocolFilter;
  onFilter: (f: ProtocolFilter) => void;
  counts: Record<ProtocolFilter, number>;
  category: string;
  onCategory: (c: string) => void;
  categories: Array<{ id: string; label: string }>;
  sort: ProtocolSort;
  onSort: (s: ProtocolSort) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="rpg-panel p-2">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar protocolos">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => onFilter(f.id)}
              className={clsx("shrink-0 border-2 px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", filter === f.id ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")}
              style={{ borderRadius: 3 }}
            >
              {f.label} <span className="tabular-nums text-rpg-muted">({counts[f.id]})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="relative col-span-2 md:col-span-1">
          <span className="sr-only">Buscar protocolos</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input type="search" className={`${rpgFieldClass} pl-8`} style={{ borderRadius: 3 }} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar protocolos…" />
        </label>
        <label>
          <span className="sr-only">Situação</span>
          <select className={rpgFieldClass} style={{ borderRadius: 3 }} value={category} onChange={(e) => onCategory(e.target.value)}>
            <option value="all">Situação: todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Ordenar por</span>
          <select className={rpgFieldClass} style={{ borderRadius: 3 }} value={sort} onChange={(e) => onSort(e.target.value as ProtocolSort)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Ordenar: {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
