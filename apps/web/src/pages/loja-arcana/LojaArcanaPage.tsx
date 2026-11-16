import { useMemo, useState } from "react";
import { Coins, Gem, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGTabs, RPGToast, RPGWallet } from "@/components/rpg";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { useShopCart, useShopProducts } from "@/hooks/useShop";
import { SHOP_CATEGORIES, type ShopCategory, type ShopProduct, type ShopRarity } from "@/services/shopService";

/**
 * Loja Arcana (Fase 1): catálogo real + carrinho persistido + checkout
 * pago em moedas ou gemas já existentes no LifeOS. Entrega é imediata
 * (item já aparece no Inventário do Herói) — o Correio da Guilda (entrega
 * com atraso real) e o pagamento com Crédito do Banco chegam na Fase 2.
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

export function LojaArcanaPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<string | null>(null);
  const { data: products, isLoading } = useShopProducts({ category: tab === "all" ? "all" : tab });
  const { cart, add, update, remove, checkout } = useShopCart();

  const items = useMemo(() => products ?? [], [products]);

  const onAdd = (p: ShopProduct) => {
    add.mutate({ productKey: p.key, quantity: 1 }, { onError: () => setToast("Não foi possível adicionar ao carrinho.") });
  };

  const onCheckout = () => {
    const requestId = crypto.randomUUID();
    checkout.mutate(requestId, {
      onSuccess: (r) => setToast(r.replayed ? "Esta compra já tinha sido confirmada." : `Compra confirmada! ${r.totalCoins > 0 ? `${r.totalCoins} moedas` : `${r.totalGems} gemas`} debitadas — itens já no Inventário do Herói.`),
      onError: (err: unknown) => setToast(err instanceof Error ? err.message : "Não foi possível confirmar a compra."),
    });
  };

  const cartCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="space-y-4">
      <RPGPageHeader
        banner="loja"
        eyebrow="Mercado da Guilda"
        title="Loja Arcana"
        subtitle="Troque moedas e gemas conquistadas de verdade por poções, vestes, artefatos e personalizações para a sua jornada."
        aside={
          <div className="flex items-center gap-2">
            <RPGWallet coins={cart?.balance.coins} />
            <span className="inline-flex items-center gap-1.5 border border-rpg-purple/50 bg-rpg-purple/10 px-2.5 py-1 text-sm font-pixel font-semibold text-rpg-purple tabular-nums" style={{ borderRadius: 3 }}>
              <Gem size={14} aria-hidden /> {(cart?.balance.gems ?? 0).toLocaleString("pt-BR")}
            </span>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 min-w-0">
          <RPGTabs
            label="Categorias da Loja"
            value={tab}
            onChange={setTab}
            tabs={[{ value: "all", label: "Todos" }, ...SHOP_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
          />

          {isLoading ? (
            <p className="text-sm text-rpg-muted">Carregando catálogo…</p>
          ) : items.length === 0 ? (
            <RPGPanel>
              <p className="text-sm text-rpg-muted">Nenhum item nesta categoria ainda.</p>
            </RPGPanel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <RPGPanel key={p.key} className="flex flex-col" bodyClassName="flex flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xl" aria-hidden>{CATEGORY_ICON[p.category]}</span>
                    <RPGBadge tone={RARITY_LABEL[p.rarity].tone}>{RARITY_LABEL[p.rarity].label}</RPGBadge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="rpg-title text-sm font-bold leading-snug">{p.name}</p>
                    <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{p.description}</p>
                    {p.effectText && <p className="mt-1 text-[11px] text-rpg-purple">{p.effectText}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-rpg-border/60 pt-2">
                    <span className="inline-flex items-center gap-1 font-pixel text-sm font-semibold text-rpg-gold-light tabular-nums">
                      {p.currency === "coin" ? <Coins size={14} aria-hidden /> : <Gem size={14} aria-hidden />}
                      {p.price.toLocaleString("pt-BR")}
                    </span>
                    <RPGButton variant="gold" className="text-xs" onClick={() => onAdd(p)} disabled={add.isPending}>
                      <ShoppingCart size={14} aria-hidden /> Adicionar
                    </RPGButton>
                  </div>
                </RPGPanel>
              ))}
            </div>
          )}
        </div>

        <RPGPanel title={`Carrinho${cartCount ? ` (${cartCount})` : ""}`} icon={<ShoppingCart size={16} aria-hidden />} variant="gold" className="h-fit lg:sticky lg:top-4">
          {!cart || cart.items.length === 0 ? (
            <p className="text-sm text-rpg-muted">Seu carrinho está vazio. Adicione itens do catálogo.</p>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2">
                {cart.items.map((it) => (
                  <li key={it.productKey} className="flex items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 p-2" style={{ borderRadius: 4 }}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-rpg-text" title={it.name}>{it.name}</p>
                      {!it.available && <p className="text-[10px] text-rpg-red">Não disponível mais — remova para continuar.</p>}
                      <p className="font-pixel text-[10px] text-rpg-muted tabular-nums">
                        {it.unitPrice.toLocaleString("pt-BR")} {it.currency === "coin" ? "🪙" : "💎"} cada
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" className="rpg-btn rpg-btn-ghost h-6 w-6 p-0" aria-label={`Diminuir ${it.name}`} onClick={() => update.mutate({ productKey: it.productKey, quantity: it.quantity - 1 })}>
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-pixel text-xs tabular-nums">{it.quantity}</span>
                      <button type="button" className="rpg-btn rpg-btn-ghost h-6 w-6 p-0" aria-label={`Aumentar ${it.name}`} onClick={() => update.mutate({ productKey: it.productKey, quantity: it.quantity + 1 })}>
                        <Plus size={12} />
                      </button>
                      <button type="button" className="rpg-btn rpg-btn-ghost h-6 w-6 p-0 text-rpg-red" aria-label={`Remover ${it.name}`} onClick={() => remove.mutate(it.productKey)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-rpg-border/60 pt-2 text-sm">
                {cart.subtotalCoins > 0 && (
                  <p className="flex items-center justify-between">
                    <span className="text-rpg-muted">Subtotal (moedas)</span>
                    <span className="font-pixel font-semibold text-rpg-gold-light tabular-nums">{cart.subtotalCoins.toLocaleString("pt-BR")} 🪙</span>
                  </p>
                )}
                {cart.subtotalGems > 0 && (
                  <p className="flex items-center justify-between">
                    <span className="text-rpg-muted">Subtotal (gemas)</span>
                    <span className="font-pixel font-semibold text-rpg-purple tabular-nums">{cart.subtotalGems.toLocaleString("pt-BR")} 💎</span>
                  </p>
                )}
              </div>
              <RPGButton variant="gold" className="w-full justify-center" onClick={onCheckout} disabled={checkout.isPending || cart.items.some((i) => !i.available)}>
                Finalizar Compra
              </RPGButton>
              <p className="text-[11px] text-rpg-muted">
                Fase 1: pagamento só em moedas ou gemas, com entrega imediata ao Inventário do Herói. Crédito do Banco e entrega com o Correio da Guilda chegam na Fase 2.
              </p>
            </div>
          )}
        </RPGPanel>
      </div>

      {toast && <RPGToast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
