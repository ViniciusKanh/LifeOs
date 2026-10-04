import { ArrowRight, Sparkles } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { TreasureSidePanel } from "@/components/treasure/TreasureSidePanel";
import type { InventoryRecent as Recent } from "@/services/inventoryService";
import { ITEM_RARITY, itemArtUrl, timeAgo } from "@/utils/inventoryDisplay";

/** Últimas aquisições (ledger real do inventário). */
export function InventoryRecent({ items, loading, onSelect, onViewAll }: { items: Recent[]; loading: boolean; onSelect: (key: string) => void; onViewAll: () => void }) {
  return (
    <TreasureSidePanel
      id="aquisicoes"
      title="Últimas aquisições"
      icon={<Sparkles size={16} />}
      actions={
        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
          Ver todas <ArrowRight size={12} aria-hidden />
        </button>
      }
    >
      {loading && <div className="h-20 rpg-bar animate-pulse" />}
      {!loading && items.length === 0 && <p className="text-sm text-rpg-muted py-2">Nenhuma aquisição ainda.</p>}
      <ul className="divide-y divide-rpg-border/50">
        {items.slice(0, 5).map((r, i) => (
          <li key={`${r.key}-${r.at}-${i}`}>
            <button type="button" onClick={() => onSelect(r.key)} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-rpg-panel-hover/40">
              <img src={itemArtUrl(r.art, r.artSet)} alt="" aria-hidden className="pixelated w-9 h-9 object-cover border border-rpg-bronze shrink-0" style={{ borderRadius: 2 }} />
              <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{r.name}</span>
              <RPGBadge tone={ITEM_RARITY[r.rarity].tone}>{ITEM_RARITY[r.rarity].label}</RPGBadge>
              <time className="w-[84px] shrink-0 text-right text-[11px] text-rpg-muted" dateTime={r.at}>
                {timeAgo(r.at)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </TreasureSidePanel>
  );
}
