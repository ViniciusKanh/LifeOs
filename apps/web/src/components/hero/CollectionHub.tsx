import clsx from "clsx";
import { Award, Backpack, Crown, FlaskRound, Gem, Heart, Layers, Palette, Shield, Sparkles, Sticker } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection } from "@/components/rpg-modules/ModuleKit";
import type { InventoryData, InventoryItem } from "@/services/inventoryService";
import { ITEM_RARITY, artFit, itemArtUrl } from "@/utils/inventoryDisplay";

const R = { borderRadius: 4 } as const;

/** Indicadores da coleção — contagens do inventário persistido (nada estimado). */
export function CollectionIndicators({ data }: { data: InventoryData }) {
  const items = data.items;
  const count = (fn: (i: InventoryItem) => boolean) => items.filter(fn).length;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <IndicatorCard icon={<Backpack size={22} />} label="Itens" value={data.kpis.totalItems} hint={data.kpis.capacity ? `${data.kpis.slotsUsed}/${data.kpis.capacity} espaços` : undefined} />
      <IndicatorCard icon={<Gem size={22} />} label="Relíquias" value={count((i) => i.type === "relic")} tone="purple" />
      <IndicatorCard icon={<FlaskRound size={22} />} label="Consumíveis" value={count((i) => i.type === "consumable")} tone="green" />
      <IndicatorCard icon={<Palette size={22} />} label="Cosméticos" value={count((i) => i.type === "cosmetic")} tone="pink" />
      <IndicatorCard icon={<Crown size={22} />} label="Títulos" value={count((i) => i.type === "title")} tone="orange" />
      <IndicatorCard icon={<Layers size={22} />} label="Conjuntos" value={`${data.sets.filter((s) => s.complete).length}/${data.sets.length}`} tone="blue" />
      <IndicatorCard icon={<Heart size={22} />} label="Favoritos" value={count((i) => i.favorite)} tone="red" />
      <IndicatorCard icon={<Sparkles size={22} />} label="Bônus ativos" value={data.kpis.activeBonuses} hint="efeitos de consumíveis" tone="purple" />
    </div>
  );
}

/**
 * Espaços de equipamento que EXISTEM no catálogo (título, moldura, emblema).
 * Equipar é cosmético: não altera atributos nem XP. Os equipamentos vêm do
 * mesmo inventário da Coleção — nada é duplicado na Build.
 */
const SLOTS = [
  { prefix: "title:", label: "Título", icon: Crown, hint: "Aparece ao lado do seu nome." },
  { prefix: "frame:", label: "Aparência (moldura)", icon: Shield, hint: "Moldura do retrato do herói." },
  { prefix: "emblem:", label: "Emblema", icon: Sticker, hint: "Selo de conjunto completo." },
] as const;

export function EquipmentSlots({ items, onEquip }: { items: InventoryItem[]; onEquip: (item: InventoryItem, equip: boolean) => void }) {
  return (
    <KitSection title="Equipamento do herói" icon={<Shield size={16} />} tone="gold">
      <div className="grid gap-3 md:grid-cols-3">
        {SLOTS.map((s) => {
          const options = items.filter((i) => i.key.startsWith(s.prefix) && !i.locked && (i.actions.includes("equip") || i.actions.includes("unequip") || i.equipped));
          const current = options.find((i) => i.equipped) ?? null;
          return (
            <section key={s.prefix} className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R} aria-label={`Espaço: ${s.label}`}>
              <div className="flex items-center gap-2">
                <s.icon size={16} className="text-rpg-gold" aria-hidden />
                <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">{s.label}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={clsx("flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border-2", current ? "border-rpg-gold" : "border-dashed border-rpg-border")} style={R}>
                  {current ? <img src={itemArtUrl(current.art, current.artSet)} alt="" aria-hidden className={clsx("pixelated h-full w-full", artFit(current.artSet))} /> : <s.icon size={20} className="text-rpg-muted" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rpg-text">{current?.name ?? "Vazio"}</p>
                  <p className="text-[11px] text-rpg-muted">{s.hint}</p>
                </div>
              </div>
              {options.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {options.map((o) => (
                    <li key={o.key} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-rpg-text">{o.name}</span>
                      <RPGBadge tone={ITEM_RARITY[o.rarity].tone}>{ITEM_RARITY[o.rarity].label}</RPGBadge>
                      <RPGButton variant={o.equipped ? "ghost" : "secondary"} className="min-h-[36px] px-2 text-xs" onClick={() => onEquip(o, !o.equipped)}>
                        {o.equipped ? "Desequipar" : "Equipar"}
                      </RPGButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-rpg-muted">Nenhum item deste tipo na coleção ainda.</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-rpg-muted">Equipamentos são cosméticos: não dão bônus de atributo. O catálogo atual não tem armas, armaduras ou acessórios — por isso esses espaços não aparecem.</p>
    </KitSection>
  );
}

/** Conjuntos e sinergias: itens que faltam aparecem como silhueta (sem revelar a arte). */
export function SetsGallery({ data, onSelect }: { data: InventoryData; onSelect: (key: string) => void }) {
  if (!data.sets.length) return <p className="rpg-panel py-8 text-center text-sm text-rpg-muted">Nenhum conjunto no catálogo.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {data.sets.map((s) => (
        <section key={s.id} className={clsx("rpg-panel p-3", s.complete && "rpg-panel-gold")} aria-label={`Conjunto ${s.name}`}>
          <div className="flex items-center gap-2">
            <Award size={16} className={s.complete ? "text-rpg-gold" : "text-rpg-muted"} aria-hidden />
            <p className="min-w-0 flex-1 truncate font-rpg font-bold text-rpg-text">{s.name}</p>
            {s.complete ? <RPGBadge tone="gold">Completo</RPGBadge> : <RPGBadge tone="muted">{s.owned}/{s.total}</RPGBadge>}
          </div>
          <p className="mt-0.5 text-[11px] text-rpg-muted">{s.description}</p>
          <RPGProgressBar className="mt-2" label={s.name} showLabel={false} value={s.owned} max={Math.max(1, s.total)} tone={s.complete ? "gold" : "purple"} />
          <ul className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {s.items.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  disabled={!i.owned}
                  onClick={() => onSelect(i.key)}
                  title={i.owned ? i.name : "Item ainda não obtido"}
                  aria-label={i.owned ? i.name : "Item bloqueado"}
                  className={clsx("flex aspect-square w-full items-center justify-center overflow-hidden border-2 bg-rpg-bg-2", i.owned ? "border-rpg-gold/70 hover:brightness-110" : "border-rpg-border")}
                  style={R}
                >
                  <img src={itemArtUrl(i.art, i.artSet)} alt="" aria-hidden className={clsx("pixelated h-full w-full", artFit(i.artSet), !i.owned && "opacity-40 [filter:brightness(0)]")} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-rpg-text">
            <span className="text-rpg-gold">Bônus do conjunto:</span> {s.bonus}
          </p>
        </section>
      ))}
    </div>
  );
}
