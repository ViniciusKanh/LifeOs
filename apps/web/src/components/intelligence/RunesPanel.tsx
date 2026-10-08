import clsx from "clsx";
import { Gem, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { RPGPanel, RPGProgressBar } from "@/components/rpg";
import type { Importance } from "@/services/intelligenceService";
import { RUNE_ICON, SOURCE_ICON } from "@/utils/intelligenceDisplay";

/** Lista de runas (importância por permutação, em % do total). */
export function RuneList({ items, limit, showDirection = false }: { items: Importance[]; limit?: number; showDirection?: boolean }) {
  const list = items.filter((i) => i.importance > 0).slice(0, limit ?? items.length);
  if (!list.length) return <p className="text-sm text-rpg-muted">Nenhuma runa teve peso mensurável — o artefato ainda depende pouco dos seus dados.</p>;
  const max = Math.max(...list.map((i) => i.importance));
  return (
    <ul className="space-y-2">
      {list.map((r) => {
        const Icon = RUNE_ICON[r.key] ?? SOURCE_ICON[r.source] ?? Gem;
        const Dir = r.direction === "positive" ? TrendingUp : r.direction === "negative" ? TrendingDown : Minus;
        return (
          <li key={r.key} className="grid grid-cols-[18px_minmax(0,1fr)_minmax(60px,0.8fr)_44px] items-center gap-2 text-xs">
            <Icon size={15} className="text-rpg-purple" aria-hidden />
            <span className="truncate text-rpg-text/90" title={r.label}>
              {r.label}
              {showDirection && (
                <Dir size={12} className={clsx("inline ml-1", r.direction === "positive" ? "text-rpg-green" : r.direction === "negative" ? "text-rpg-red" : "text-rpg-muted")} aria-label={r.direction === "positive" ? "relação positiva" : r.direction === "negative" ? "relação negativa" : "sem direção clara"} />
              )}
            </span>
            <RPGProgressBar tone="purple" label={r.label} value={r.importance} max={max} showLabel={false} />
            <span className="text-right font-pixel tabular-nums text-rpg-text">{(r.importance * 100).toFixed(1).replace(".", ",")}%</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RunesPanel({ runes, onViewAll }: { runes: { artifactName: string; items: Importance[] } | null; onViewAll: () => void }) {
  return (
    <RPGPanel
      title="Runas Dominantes"
      icon={<Gem size={15} />}
      className="h-full"
      actions={
        runes ? (
          <button type="button" onClick={onViewAll} className="text-xs text-rpg-gold-light hover:underline">
            Ver todas →
          </button>
        ) : undefined
      }
    >
      {!runes ? (
        <p className="text-sm text-rpg-muted py-4">Os fatores que mais influenciam suas previsões aparecem aqui após a primeira forja.</p>
      ) : (
        <>
          <p className="-mt-1 mb-3 text-xs text-rpg-muted">Fatores que mais pesam no {runes.artifactName}.</p>
          <RuneList items={runes.items} limit={7} />
        </>
      )}
    </RPGPanel>
  );
}
