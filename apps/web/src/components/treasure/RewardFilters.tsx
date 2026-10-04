import clsx from "clsx";
import { BedDouble, Crown, Gamepad2, Heart, LayoutGrid, Lock, Search, Sparkles, Star, Unlock, Users, type LucideIcon } from "lucide-react";
import { CATEGORY_GROUPS, SORTS, type CategoryGroup, type SortKey } from "@/utils/treasureDisplay";

export type StateFilter = "all" | "favorites" | "available" | "locked";

const GROUP_ICON: Record<CategoryGroup | "all", LucideIcon> = {
  all: LayoutGrid,
  descanso: BedDouble,
  diversao: Gamepad2,
  autocuidado: Heart,
  social: Users,
  premium: Crown,
  personalizado: Sparkles,
};

const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

/** Barra de filtros do Tesouro: categorias, ordenação, estado e busca. */
export function RewardFilters({
  group,
  onGroup,
  counts,
  sort,
  onSort,
  state,
  onState,
  query,
  onQuery,
}: {
  group: CategoryGroup | "all";
  onGroup: (g: CategoryGroup | "all") => void;
  counts: Partial<Record<CategoryGroup, number>>;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  state: StateFilter;
  onState: (s: StateFilter) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  // "Personalizado" só aparece quando existe alguma recompensa nele.
  const groups = CATEGORY_GROUPS.filter((g) => g.id !== "personalizado" || (counts.personalizado ?? 0) > 0);
  const STATES: Array<{ id: StateFilter; label: string; icon: LucideIcon }> = [
    { id: "favorites", label: "Favoritos", icon: Star },
    { id: "available", label: "Disponíveis", icon: Unlock },
    { id: "locked", label: "Bloqueados", icon: Lock },
  ];
  return (
    <div className="rpg-panel p-2.5 space-y-2.5">
      <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 lg:pb-0 flex-1 min-w-0" role="tablist" aria-label="Filtrar por categoria">
          {[{ id: "all" as const, label: "Todos" }, ...groups].map((g) => {
            const Icon = GROUP_ICON[g.id];
            const active = group === g.id;
            return (
              <button
                key={g.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onGroup(g.id)}
                className={clsx(
                  "shrink-0 inline-flex items-center gap-2 px-3 py-2 text-sm border-2 transition-colors",
                  active ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-text/85 bg-rpg-bg-2/60 hover:border-rpg-bronze",
                )}
                style={{ borderRadius: 3 }}
              >
                <Icon size={15} aria-hidden />
                {g.label}
                {g.id !== "all" && (counts[g.id] ?? 0) > 0 && <span className="text-[10px] text-rpg-muted tabular-nums">{counts[g.id]}</span>}
              </button>
            );
          })}
        </div>
        <label className="lg:w-52 shrink-0">
          <span className="sr-only">Ordenar recompensas</span>
          <select className={field} style={{ borderRadius: 3 }} value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Buscar recompensas</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input type="search" className={`${field} pl-8`} style={{ borderRadius: 3 }} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar recompensas…" />
        </label>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filtrar por estado">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={state === s.id}
              onClick={() => onState(state === s.id ? "all" : s.id)}
              className={clsx("shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs border", state === s.id ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted")}
              style={{ borderRadius: 3 }}
            >
              <s.icon size={13} aria-hidden /> {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
