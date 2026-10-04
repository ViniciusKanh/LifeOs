import clsx from "clsx";
import { ArrowRight, Check, Shield } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import { TreasureSidePanel } from "@/components/treasure/TreasureSidePanel";
import type { InventorySet } from "@/services/inventoryService";
import { itemArtUrl } from "@/utils/inventoryDisplay";

/** Conjuntos / Coleções: progresso real e bônus sempre cosmético (emblema). */
export function InventoryCollections({ sets, loading, onViewAll }: { sets: InventorySet[]; loading: boolean; onViewAll?: () => void }) {
  return (
    <TreasureSidePanel
      id="conjuntos"
      title="Conjuntos / Coleções"
      icon={<Shield size={16} />}
      actions={
        onViewAll && (
          <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
            Ver todos <ArrowRight size={12} aria-hidden />
          </button>
        )
      }
    >
      {loading && <div className="h-24 rpg-bar animate-pulse" />}
      <ul className="space-y-2">
        {sets.map((s) => (
          <li key={s.id} className={clsx("border bg-rpg-bg-2/60 p-2", s.complete ? "border-rpg-gold" : "border-rpg-border/70")} style={{ borderRadius: 3 }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-rpg-text truncate">{s.name}</p>
              {s.complete && (
                <span className="inline-flex items-center gap-1 text-[10px] text-rpg-green">
                  <Check size={11} aria-hidden /> Completo
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {s.items.map((i) => (
                <span key={i.key} title={`${i.name}${i.owned ? "" : " (ainda não obtido)"}`} className={clsx("w-9 h-9 shrink-0 border overflow-hidden", i.owned ? "border-rpg-gold" : "border-rpg-border opacity-35 grayscale")} style={{ borderRadius: 2 }}>
                  <img src={itemArtUrl(i.art, i.artSet)} alt={i.name} className="pixelated w-full h-full object-cover" />
                </span>
              ))}
              <RPGProgressBar className="flex-1 min-w-0 ml-1" value={s.owned} max={s.total} tone={s.complete ? "green" : "purple"} label="Progresso" valueLabel={`${s.owned}/${s.total}`} />
            </div>
            <p className="mt-1 text-[10px] text-rpg-muted">Bônus: {s.bonus}</p>
          </li>
        ))}
      </ul>
    </TreasureSidePanel>
  );
}
