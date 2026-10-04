import { Link } from "react-router-dom";
import { Clock, Compass, Lock, MapPin, Package, Star, Timer, Zap } from "lucide-react";
import { RPGBadge, RPGButton, rpgButtonClass } from "@/components/rpg";
import type { ActiveEffect, InventoryItem } from "@/services/inventoryService";
import { ITEM_RARITY, ITEM_TYPE_LABEL, ORIGIN_LABEL, formatDate, itemArtUrl, primaryAction } from "@/utils/inventoryDisplay";
import { ITEM_TYPE_ICON } from "./itemIcons";

function remaining(iso: string): string {
  const min = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

/** Detalhe do item selecionado (painel lateral no desktop, bottom sheet no celular). */
export function InventoryItemDetail({
  item,
  effects,
  onPrimary,
  onFavorite,
  busy,
}: {
  item: InventoryItem;
  effects: ActiveEffect[];
  onPrimary: (item: InventoryItem) => void;
  onFavorite: (item: InventoryItem) => void;
  busy?: boolean;
}) {
  const rarity = ITEM_RARITY[item.rarity];
  const TypeIcon = ITEM_TYPE_ICON[item.type];
  const action = primaryAction(item);
  const active = effects.find((e) => e.itemKey === item.key);
  const effectLines = [
    item.effectText && { icon: Zap, text: item.effectText },
    item.durationText && { icon: Clock, text: `Duração: ${item.durationText}` },
    item.type === "consumable" && { icon: Package, text: "Uso único (consome 1 unidade ao usar)" },
    item.locked && { icon: Lock, text: "Item de missão: fica guardado enquanto a campanha estiver ativa" },
  ].filter(Boolean) as Array<{ icon: typeof Zap; text: string }>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
        <div className="relative">
          <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden className="pixelated w-full aspect-square object-cover border-2 border-rpg-gold" style={{ borderRadius: 3 }} />
          <RPGBadge tone={rarity.tone} className="absolute top-1.5 left-1.5 bg-rpg-bg/85">
            {rarity.label}
          </RPGBadge>
        </div>
        <div className="min-w-0 space-y-1.5">
          <h3 className="font-rpg text-lg font-bold text-rpg-text leading-tight">{item.name}</h3>
          <RPGBadge tone={rarity.tone} icon={<TypeIcon size={10} aria-hidden />}>
            {ITEM_TYPE_LABEL[item.type]}
          </RPGBadge>
          <p className="text-xs text-rpg-muted">
            Quantidade: <span className="font-pixel text-rpg-text">{item.quantity}</span>
            {item.useCount > 0 && <> · usado {item.useCount}×</>}
          </p>
          <p className="text-xs text-rpg-text/85">{item.description}</p>
        </div>
      </div>

      {(effectLines.length > 0 || active) && (
        <section aria-label="Efeitos">
          <h4 className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">
            <Zap size={12} aria-hidden /> Efeitos
          </h4>
          <ul className="mt-1.5 space-y-1">
            {active && (
              <li className="flex items-center gap-2 border border-rpg-green/50 bg-rpg-green/10 px-2 py-1.5 text-xs text-rpg-green" style={{ borderRadius: 3 }}>
                <Timer size={13} aria-hidden /> Ativo agora: +{active.value}% {active.label} · resta {remaining(active.expiresAt)}
              </li>
            )}
            {effectLines.map((l) => (
              <li key={l.text} className="flex items-center gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 px-2 py-1.5 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
                <l.icon size={13} className="text-rpg-gold shrink-0" aria-hidden /> {l.text}
              </li>
            ))}
          </ul>
          {(item.type === "consumable" || item.type === "tool") && <p className="mt-1 text-[10px] text-rpg-muted">Efeitos valem só para XP do LifeOS — nunca alteram seus dados reais.</p>}
        </section>
      )}

      <section aria-label="Origem">
        <h4 className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">
          <MapPin size={12} aria-hidden /> Origem
        </h4>
        <div className="mt-1.5 border border-rpg-border/70 bg-rpg-bg-2/60 px-2.5 py-2 text-xs" style={{ borderRadius: 3 }}>
          <p className="text-rpg-text">{item.origin?.label ?? item.obtainedBy ?? "—"}</p>
          <p className="mt-0.5 text-rpg-muted">
            {item.origin ? `${ORIGIN_LABEL[item.origin.sourceType] ?? item.origin.sourceType} · ` : ""}Obtido em: {formatDate(item.acquiredAt)}
          </p>
          {item.obtainedBy && item.origin?.label !== item.obtainedBy && <p className="mt-0.5 text-rpg-muted">Como obter: {item.obtainedBy}</p>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {action.kind !== "details" && action.kind !== "origin" && (
          <RPGButton variant={action.kind === "unequip" ? "secondary" : "primary"} className="flex-1 justify-center" onClick={() => onPrimary(item)} disabled={busy}>
            {action.kind === "use" ? "Usar item" : action.kind === "equip" ? "Equipar" : "Remover do perfil"}
          </RPGButton>
        )}
        <RPGButton variant="secondary" onClick={() => onFavorite(item)} aria-pressed={item.favorite}>
          <Star size={14} fill={item.favorite ? "currentColor" : "none"} aria-hidden /> {item.favorite ? "Favorito" : "Favoritar"}
        </RPGButton>
        {item.origin?.link && (
          <Link to={item.origin.link} className={rpgButtonClass("secondary")}>
            <Compass size={14} aria-hidden /> Ver origem
          </Link>
        )}
      </div>
    </div>
  );
}
