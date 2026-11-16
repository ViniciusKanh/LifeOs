import { useEffect, useMemo, useState } from "react";
import { Backpack, Boxes, Crown, Package, Sparkles, Truck } from "lucide-react";
import { RPGBadge, RPGPageHeader, RPGPanel, RPGTabs } from "@/components/rpg";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { IndicatorCard } from "@/components/rpg-modules/ModuleKit";
import { useHeroInventory } from "@/hooks/useShop";
import { SHOP_CATEGORIES, type ShopCategory, type ShopRarity } from "@/services/shopService";

/**
 * Inventário do Herói: itens comprados na Loja Arcana e já entregues pelo
 * Correio da Guilda. Equipar em slots, loadouts e consumo de poções com
 * efeito real ainda são pendentes — aqui o item já existe e já conta nos
 * indicadores assim que chega. "Correio da Guilda" mostra o que ainda
 * está a caminho; o relógio é só visual, quem decide a chegada de verdade
 * é o servidor (a cada abertura desta tela ele reconcilia o que já pode
 * ser entregue).
 */

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

const CATEGORY_LABEL: Record<ShopCategory, string> = {
  pocoes: "Poções",
  vestimentas: "Vestimentas",
  artefatos: "Artefatos",
  personalizacao: "Personalização",
  boosters: "Boosters",
  decoracao: "Decoração",
  reliquias: "Relíquias",
  materiais: "Materiais",
  pacotes: "Pacotes",
};
const CATEGORY_ICON: Record<ShopCategory, string> = {
  pocoes: "🧪",
  vestimentas: "🧥",
  artefatos: "🔮",
  personalizacao: "🎨",
  boosters: "⚡",
  decoracao: "🏺",
  reliquias: "💎",
  materiais: "🧵",
  pacotes: "📦",
};
const RARITY_LABEL: Record<ShopRarity, { label: string; tone: RpgTone }> = {
  comum: { label: "Comum", tone: "muted" },
  incomum: { label: "Incomum", tone: "green" },
  raro: { label: "Raro", tone: "blue" },
  epico: { label: "Épico", tone: "purple" },
  lendario: { label: "Lendário", tone: "gold" },
  mitico: { label: "Mítico", tone: "pink" },
};

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

export function InventarioHeroiPage() {
  const [tab, setTab] = useState<Tab>("all");
  const { data, isLoading } = useHeroInventory();
  const items = useMemo(() => (data?.items ?? []).filter((i) => tab === "all" || i.category === tab), [data, tab]);
  const pending = data?.pending ?? [];

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
        <IndicatorCard icon={<Sparkles size={20} />} label="Bônus ativos" value={data?.kpis.bonusesActive ?? 0} hint="Efeitos funcionais chegam em uma próxima fase" tone="orange" />
      </div>

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
            <RPGPanel key={it.key} bodyClassName="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl" aria-hidden>{CATEGORY_ICON[it.category]}</span>
                <RPGBadge tone={RARITY_LABEL[it.rarity].tone}>{RARITY_LABEL[it.rarity].label}</RPGBadge>
              </div>
              <div className="min-w-0 flex-1">
                <p className="rpg-title text-sm font-bold leading-snug">{it.name}</p>
                <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{it.description}</p>
              </div>
              <div className="flex items-center justify-between border-t border-rpg-border/60 pt-2 text-xs">
                <span className="font-pixel text-rpg-gold-light tabular-nums">x{it.quantity}</span>
                <span className="text-rpg-muted">{CATEGORY_LABEL[it.category]}</span>
              </div>
            </RPGPanel>
          ))}
        </div>
      )}
    </div>
  );
}
