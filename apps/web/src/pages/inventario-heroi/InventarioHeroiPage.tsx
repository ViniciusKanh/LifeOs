import { useEffect, useMemo, useState } from "react";
import { Backpack, Boxes, Crown, Package, Sparkles, Truck } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGTabs, RPGToast } from "@/components/rpg";
import { IndicatorCard } from "@/components/rpg-modules/ModuleKit";
import { useHeroInventory, useShopEffects } from "@/hooks/useShop";
import { useHabits } from "@/hooks/useHabits";
import { ApiError } from "@/services/api";
import { CATEGORY_ICON, CATEGORY_LABEL, RARITY_LABEL } from "@/lib/shopLabels";
import { SHOP_CATEGORIES, type CosmeticSlot, type HeroInventoryItem, type ShopCategory, type ShopRarity } from "@/services/shopService";
import type { ShopCosmeticsState } from "@/types";

/**
 * Inventário do Herói: itens comprados na Loja Arcana e já entregues pelo
 * Correio da Guilda. "Usar" ativa boosters/passe/ticket (efeito real,
 * registrado em active_item_effects) e "Equipar" liga cosméticos de
 * Personalização (aura, tema, cursor, brilho — ver shopEffectsService no
 * backend). "Correio da Guilda" mostra o que ainda está a caminho.
 */

const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

const ACCENT_THEME_VALUE: Record<string, "noite-astral" | "castelo-dourado"> = {
  "tema-noite-astral": "noite-astral",
  "tema-castelo-dourado": "castelo-dourado",
};

function bareKeyOf(itemKey: string): string {
  return itemKey.replace(/^shop:/, "");
}

function isCosmeticEquipped(slot: CosmeticSlot, bareKey: string, cosmetics: ShopCosmeticsState | undefined): boolean {
  if (!cosmetics) return false;
  if (slot === "accentTheme") return cosmetics.accentTheme === ACCENT_THEME_VALUE[bareKey];
  return Boolean(cosmetics[slot]);
}

/** Mostra "chegando" / "Xmin" / "pronto" a partir de ready_at — só decoração; quem entrega é sempre o servidor. */
function useCountdownLabel(readyAtIso: string): string {
  const [label, setLabel] = useState("calculando…");
  useEffect(() => {
    const tick = () => {
      const diffMs = new Date(readyAtIso).getTime() - Date.now();
      if (diffMs <= 0) {
        setLabel("chegando…");
        return;
      }
      const minutes = Math.ceil(diffMs / 60_000);
      setLabel(minutes <= 1 ? "menos de 1 min" : `${minutes} min`);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [readyAtIso]);
  return label;
}

type Tab = "all" | ShopCategory;

function PendingDeliveryRow({ delivery }: { delivery: { productName: string; rarity: ShopRarity; quantity: number; readyAt: string } }) {
  const label = useCountdownLabel(delivery.readyAt);
  return (
    <li className="flex items-center justify-between gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 px-2.5 py-1.5 text-xs" style={{ borderRadius: 4 }}>
      <span className="min-w-0 flex-1 truncate text-rpg-text">
        {delivery.productName} {delivery.quantity > 1 ? `x${delivery.quantity}` : ""}
      </span>
      <RPGBadge tone={RARITY_LABEL[delivery.rarity].tone}>{RARITY_LABEL[delivery.rarity].label}</RPGBadge>
      <span className="shrink-0 font-pixel text-rpg-muted tabular-nums">{label}</span>
    </li>
  );
}

/** Ação de "Usar" o Ticket de Reset de Hábito — pede qual hábito antes de consumir. */
function HabitResetAction({
  onUse,
  pending,
}: {
  onUse: (habitId: string) => void;
  pending: boolean;
}) {
  const { habits } = useHabits();
  const [habitId, setHabitId] = useState("");
  if (!habits.length) return <p className="text-[11px] text-rpg-muted">Nenhum hábito ativo para reiniciar.</p>;
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={habitId}
        onChange={(e) => setHabitId(e.target.value)}
        className="min-w-0 flex-1 border border-rpg-border bg-rpg-bg-2 px-1.5 py-1 text-[11px] text-rpg-text"
        style={{ borderRadius: 3 }}
        aria-label="Escolher hábito"
      >
        <option value="">Escolha o hábito…</option>
        {habits.map((h) => (
          <option key={h.id} value={h.id}>{h.name}</option>
        ))}
      </select>
      <RPGButton variant="gold" className="shrink-0 px-2.5 py-1 text-[11px]" disabled={!habitId || pending} onClick={() => habitId && onUse(habitId)}>
        Usar
      </RPGButton>
    </div>
  );
}

function ItemCard({
  it,
  cosmetics,
  onUse,
  onToggleCosmetic,
  usePending,
  togglePending,
}: {
  it: HeroInventoryItem;
  cosmetics: ShopCosmeticsState | undefined;
  onUse: (bareKey: string, habitId?: string) => void;
  onToggleCosmetic: (bareKey: string, enabled: boolean) => void;
  usePending: boolean;
  togglePending: boolean;
}) {
  const bareKey = bareKeyOf(it.key);
  const equipped = it.cosmeticSlot ? isCosmeticEquipped(it.cosmeticSlot, bareKey, cosmetics) : false;
  return (
    <RPGPanel bodyClassName="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl" aria-hidden>{CATEGORY_ICON[it.category]}</span>
        <RPGBadge tone={RARITY_LABEL[it.rarity].tone}>{RARITY_LABEL[it.rarity].label}</RPGBadge>
      </div>
      <div className="min-w-0 flex-1">
        <p className="rpg-title text-sm font-bold leading-snug">{it.name}</p>
        <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{it.description}</p>
        {it.effectText && <p className="mt-1 text-[11px] text-rpg-gold-light line-clamp-2">{it.effectText}</p>}
      </div>
      {bareKey === "ticket-reset-habito" ? (
        <HabitResetAction pending={usePending} onUse={(habitId) => onUse(bareKey, habitId)} />
      ) : it.usable ? (
        <RPGButton variant="gold" className="text-xs py-1.5" disabled={usePending} onClick={() => onUse(bareKey)}>
          Usar
        </RPGButton>
      ) : it.cosmeticSlot ? (
        <RPGButton variant={equipped ? "secondary" : "primary"} className="text-xs py-1.5" disabled={togglePending} onClick={() => onToggleCosmetic(bareKey, !equipped)}>
          {equipped ? "Equipado ✓ (clique para tirar)" : "Equipar"}
        </RPGButton>
      ) : null}
      <div className="flex items-center justify-between border-t border-rpg-border/60 pt-2 text-xs">
        <span className="font-pixel text-rpg-gold-light tabular-nums">x{it.quantity}</span>
        <span className="text-rpg-muted">{CATEGORY_LABEL[it.category]}</span>
      </div>
    </RPGPanel>
  );
}

export function InventarioHeroiPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const { data, isLoading, useItem, toggleCosmetic } = useHeroInventory();
  const { data: effects } = useShopEffects();
  const items = useMemo(() => (data?.items ?? []).filter((i) => tab === "all" || i.category === tab), [data, tab]);
  const pending = data?.pending ?? [];

  const notify = (message: string, tone: "success" | "error" = "success") => setToast({ message, tone });

  const handleUse = (productKey: string, habitId?: string) => {
    useItem.mutate(
      { productKey, habitId },
      {
        onSuccess: (r) => notify(r.message),
        onError: (e) => notify(errMsg(e, "Não foi possível usar este item."), "error"),
      },
    );
  };
  const handleToggle = (productKey: string, enabled: boolean) => {
    toggleCosmetic.mutate(
      { productKey, enabled },
      {
        onSuccess: (r) => notify(r.message),
        onError: (e) => notify(errMsg(e, "Não foi possível atualizar o cosmético."), "error"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <RPGPageHeader
        banner="perfil"
        eyebrow="Equipamento do Herói"
        title="Inventário do Herói"
        subtitle="Os itens que você trouxe da Loja Arcana — poções, vestes, artefatos e muito mais."
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <IndicatorCard icon={<Boxes size={20} />} label="Total de itens" value={data?.kpis.totalItems ?? 0} tone="gold" />
        <IndicatorCard icon={<Crown size={20} />} label="Lendários/Míticos" value={data?.kpis.legendaryCount ?? 0} tone="purple" />
        <IndicatorCard icon={<Package size={20} />} label="Consumíveis" value={data?.kpis.consumables ?? 0} tone="blue" />
        <IndicatorCard icon={<Sparkles size={20} />} label="Bônus ativos" value={data?.kpis.bonusesActive ?? 0} hint="Boosters e passes usados que ainda estão valendo" tone="orange" />
      </div>

      {effects && effects.activeBoosts.length > 0 && (
        <RPGPanel title="Bônus ativos" icon={<Sparkles size={16} aria-hidden />} variant="success">
          <ul className="space-y-1">
            {effects.activeBoosts.map((b) => (
              <li key={b.effectType} className="text-xs text-rpg-text">{b.label} — até {new Date(b.expiresAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</li>
            ))}
          </ul>
        </RPGPanel>
      )}

      {pending.length > 0 && (
        <RPGPanel title="Correio da Guilda" icon={<Truck size={16} aria-hidden />} variant="quest">
          <ul className="space-y-1.5">
            {pending.map((d) => (
              <PendingDeliveryRow key={`${d.productKey}-${d.readyAt}`} delivery={d} />
            ))}
          </ul>
        </RPGPanel>
      )}

      <RPGTabs
        label="Categorias do Inventário"
        value={tab}
        onChange={setTab}
        tabs={[{ value: "all", label: "Todos" }, ...SHOP_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
      />

      {isLoading ? (
        <p className="text-sm text-rpg-muted">Carregando inventário…</p>
      ) : items.length === 0 ? (
        <RPGPanel>
          <div className="flex items-center gap-3 text-sm text-rpg-muted">
            <Backpack size={28} aria-hidden className="text-rpg-muted" />
            <p>Ainda sem itens aqui. Visite a Loja Arcana para trazer poções, vestes e artefatos para a sua jornada.</p>
          </div>
        </RPGPanel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => (
            <ItemCard
              key={it.key}
              it={it}
              cosmetics={effects?.cosmetics}
              onUse={handleUse}
              onToggleCosmetic={handleToggle}
              usePending={useItem.isPending}
              togglePending={toggleCosmetic.isPending}
            />
          ))}
        </div>
      )}
      <RPGToast message={toast?.message ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
