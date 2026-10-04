import clsx from "clsx";
import { Archive, ArchiveRestore, Clock, Lock, Star, Zap } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { InventoryItem } from "@/services/inventoryService";
import { ITEM_RARITY, ITEM_TYPE_LABEL, artFit, itemArtUrl, primaryAction } from "@/utils/inventoryDisplay";
import { ITEM_TYPE_ICON } from "./itemIcons";

export interface ItemCardHandlers {
  onSelect: (item: InventoryItem) => void;
  onPrimary: (item: InventoryItem) => void;
  onFavorite: (item: InventoryItem) => void;
  onArchive?: (item: InventoryItem) => void;
}

/**
 * Card de item (grade) ou linha (lista). Mostra só ações válidas — o
 * servidor decide quais são (item.actions). Selecionar abre o detalhe.
 */
export function InventoryItemCard({ item, selected, variant = "grid", organizing, ...h }: { item: InventoryItem; selected: boolean; variant?: "grid" | "list"; organizing?: boolean } & ItemCardHandlers) {
  const rarity = ITEM_RARITY[item.rarity];
  const TypeIcon = ITEM_TYPE_ICON[item.type];
  const action = primaryAction(item);
  const glow = item.rarity === "legendary" || item.rarity === "epic";

  const favorite = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        h.onFavorite(item);
      }}
      aria-pressed={item.favorite}
      aria-label={item.favorite ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`}
      className={clsx("w-9 h-9 shrink-0 flex items-center justify-center border border-rpg-border hover:text-rpg-gold-light", item.favorite ? "text-rpg-gold-light" : "text-rpg-muted")}
      style={{ borderRadius: 3 }}
    >
      <Star size={15} fill={item.favorite ? "currentColor" : "none"} />
    </button>
  );
  const archive = organizing && h.onArchive && !item.locked && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        h.onArchive?.(item);
      }}
      aria-label={item.archived ? `Desarquivar ${item.name}` : `Arquivar ${item.name}`}
      title={item.archived ? "Desarquivar" : "Arquivar (some da visão padrão)"}
      className="w-9 h-9 shrink-0 flex items-center justify-center border border-rpg-border text-rpg-muted hover:text-rpg-gold-light"
      style={{ borderRadius: 3 }}
    >
      {item.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
    </button>
  );
  const primary = (
    <RPGButton
      variant={action.kind === "use" || action.kind === "equip" ? "primary" : "secondary"}
      className="!py-1.5 flex-1 justify-center"
      onClick={(e) => {
        e.stopPropagation();
        h.onPrimary(item);
      }}
      aria-label={`${action.label}: ${item.name}`}
    >
      {action.label}
    </RPGButton>
  );
  const effect = item.effectText && (
    <p className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px]">
      <span className="inline-flex items-center gap-1 text-rpg-green min-w-0">
        <Zap size={11} aria-hidden /> <span className="truncate">{item.effectText}</span>
      </span>
      {item.durationText && (
        <span className="inline-flex items-center gap-1 text-rpg-muted">
          <Clock size={11} aria-hidden /> {item.durationText}
        </span>
      )}
    </p>
  );

  if (variant === "list") {
    return (
      <article
        onClick={() => h.onSelect(item)}
        className={clsx("rpg-panel flex items-center gap-3 p-2 cursor-pointer min-w-0", selected && "rpg-panel-gold", item.archived && "opacity-60")}
        aria-current={selected || undefined}
      >
        <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden loading="lazy" className={clsx("pixelated w-16 h-10 border border-rpg-bronze shrink-0 bg-rpg-bg-2", artFit(item.artSet))} style={{ borderRadius: 2 }} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => h.onSelect(item)} className="font-rpg font-bold text-rpg-text text-left truncate block max-w-full focus-visible:underline">
            {item.name}
          </button>
          <p className="flex items-center gap-1.5 text-[11px] text-rpg-muted">
            <RPGBadge tone={rarity.tone}>{rarity.label}</RPGBadge> {ITEM_TYPE_LABEL[item.type]}
            {item.equipped && <RPGBadge tone="green">Equipado</RPGBadge>}
          </p>
        </div>
        <span className="font-pixel text-sm text-rpg-gold-light tabular-nums shrink-0">x{item.quantity}</span>
        <div className="hidden sm:flex items-center gap-1.5 w-40 shrink-0">{primary}</div>
        {archive}
        {favorite}
      </article>
    );
  }

  return (
    <article
      onClick={() => h.onSelect(item)}
      className={clsx(
        "rpg-panel group flex flex-col min-w-0 overflow-hidden cursor-pointer transition-transform motion-safe:hover:-translate-y-0.5",
        selected ? "rpg-panel-gold ring-1 ring-rpg-gold" : glow && "rpg-panel-gold",
        item.archived && "opacity-60",
      )}
      aria-current={selected || undefined}
    >
      <div className="relative aspect-[2/1] sm:aspect-[8/5] bg-rpg-bg-2 overflow-hidden">
        <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden loading="lazy" decoding="async" className={clsx("pixelated w-full h-full", artFit(item.artSet))} />
        <RPGBadge tone={rarity.tone} className="absolute top-2 left-2 bg-rpg-bg/85">
          {rarity.label}
        </RPGBadge>
        {item.locked && (
          <span className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-rpg-bg/85 text-rpg-orange border border-rpg-border" style={{ borderRadius: 3 }} title="Item de missão: não pode ser descartado">
            <Lock size={12} aria-label="Item de missão bloqueado" />
          </span>
        )}
        <span className="absolute bottom-1.5 right-2 font-pixel text-lg text-rpg-text tabular-nums [text-shadow:0_1px_0_rgb(var(--rpg-bg)),0_0_4px_rgb(var(--rpg-bg))]">x{item.quantity}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <button type="button" onClick={() => h.onSelect(item)} className="font-rpg font-bold text-rpg-text leading-tight text-left focus-visible:underline">
          {item.name}
        </button>
        <p className="flex items-center gap-1.5 flex-wrap">
          <RPGBadge tone={rarity.tone} icon={<TypeIcon size={10} aria-hidden />}>
            {ITEM_TYPE_LABEL[item.type]}
          </RPGBadge>
          {item.equipped && <RPGBadge tone="green">Equipado</RPGBadge>}
        </p>
        <p className="text-xs text-rpg-muted line-clamp-2">{item.description}</p>
        {effect}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          {primary}
          {archive}
          {favorite}
        </div>
      </div>
    </article>
  );
}
