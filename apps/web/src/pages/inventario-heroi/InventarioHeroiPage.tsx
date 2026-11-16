import { useMemo, useState } from "react";
import { Backpack, Boxes, Crown, Package, Sparkles } from "lucide-react";
import { RPGBadge, RPGPageHeader, RPGPanel, RPGTabs } from "@/components/rpg";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { IndicatorCard } from "@/components/rpg-modules/ModuleKit";
import { useHeroInventory } from "@/hooks/useShop";
import { SHOP_CATEGORIES, type ShopCategory, type ShopRarity } from "@/services/shopService";

/**
 * Inventário do Herói (Fase 1): o que foi comprado na Loja Arcana.
 * Equipar em slots, loadouts e consumo de poções com efeito real chegam
 * na Fase 2 — aqui o item já existe e já conta nos indicadores.
 */

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

export function InventarioHeroiPage() {
  const [tab, setTab] = useState<Tab>("all");
  const { data, isLoading } = useHeroInventory();
  const items = useMemo(() => (data?.items ?? []).filter((i) => tab === "all" || i.category === tab), [data, tab]);

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
        <IndicatorCard icon={<Sparkles size={20} />} label="Bônus ativos" value={data?.kpis.bonusesActive ?? 0} hint="Efeitos funcionais chegam na Fase 3" tone="orange" />
      </div>

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
