import { useMemo, useState } from "react";
import { Coins, Gem, Landmark, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGTabs, RPGToast, RPGWallet } from "@/components/rpg";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { useBank } from "@/hooks/useBank";
import { useShopCart, useShopProducts } from "@/hooks/useShop";
import { SHOP_CATEGORIES, type ShopCategory, type ShopPaymentMethod, type ShopProduct, type ShopRarity } from "@/services/shopService";

/**
 * Loja Arcana: catálogo real + carrinho persistido + checkout. Pagamento
 * em moedas, gemas ou Crédito do Banco (reaproveita o empréstimo real do
 * Banco — nenhuma carteira paralela). Entrega passa pelo Correio da
 * Guilda: cada item chega ao Inventário do Herói depois de um tempo real
 * calculado pelo servidor conforme a raridade (itens comuns chegam na
 * hora; os mais raros levam mais minutos).
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
  const [paymentMethod, setPaymentMethod] = useState<ShopPaymentMethod>("coins");
  const { data: products, isLoading } = useShopProducts({ category: tab === "all" ? "all" : tab });
  const { cart, add, update, remove, checkout } = useShopCart();
  const { summary: bankSummary } = useBank();

  const items = useMemo(() => products ?? [], [products]);

  const onAdd = (p: ShopProduct) => {
    add.mutate({ productKey: p.key, quantity: 1 }, { onError: () => setToast("Não foi possível adicionar ao carrinho.") });
  };

  // Crédito do Banco só cobre carrinhos 100% em moedas (gemas nunca entram no empréstimo).
  const cartIsGemOnly = (cart?.subtotalGems ?? 0) > 0 && (cart?.subtotalCoins ?? 0) === 0;
  const creditLimit = bankSummary?.credit.tier.maxAmount ?? 0;
  const creditBlockedByLoan = Boolean(bankSummary?.loan.active);
  const creditBlockedByLimit = (cart?.subtotalCoins ?? 0) > creditLimit;
  const creditAvailable = !cartIsGemOnly && creditLimit > 0 && !creditBlockedByLoan && !creditBlockedByLimit;
  const effectivePaymentMethod: ShopPaymentMethod = paymentMethod === "credit" && creditAvailable ? "credit" : "coins";

  const onCheckout = () => {
    const requestId = crypto.randomUUID();
    checkout.mutate(
      { requestId, paymentMethod: cartIsGemOnly ? "coins" : effectivePaymentMethod },
      {
        onSuccess: (r) => {
          const paidWith = r.paymentMethod === "gems" ? `${r.totalGems} gemas` : r.paymentMethod === "credit" ? `${r.totalCoins} moedas no Crédito do Banco` : `${r.totalCoins} moedas`;
          setToast(r.replayed ? "Esta compra já tinha sido confirmada." : `Compra confirmada! ${paidWith} debitadas — acompanhe a entrega no Correio da Guilda.`);
        },
        onError: (err: unknown) => setToast(err instanceof Error ? err.message : "Não foi possível confirmar a compra."),
      },
    );
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
              {!cartIsGemOnly && (
                <div className="space-y-1.5 border-t border-rpg-border/60 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-muted">Forma de pagamento</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("coins")}
                      className={`flex items-center justify-center gap-1.5 border px-2 py-1.5 text-xs font-semibold ${paymentMethod === "coins" ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border/60 text-rpg-muted"}`}
                      style={{ borderRadius: 4 }}
                    >
                      <Coins size={14} aria-hidden /> Moedas
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("credit")}
                      disabled={!creditAvailable}
                      title={creditBlockedByLoan ? "Você já tem um empréstimo ativo no Banco." : creditBlockedByLimit ? `Limite atual de crédito: ${creditLimit} moedas.` : undefined}
                      className={`flex items-center justify-center gap-1.5 border px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${paymentMethod === "credit" && creditAvailable ? "border-rpg-purple bg-rpg-purple/15 text-rpg-purple" : "border-rpg-border/60 text-rpg-muted"}`}
                      style={{ borderRadius: 4 }}
                    >
                      <Landmark size={14} aria-hidden /> Crédito
                    </button>
                  </div>
                  {paymentMethod === "credit" && creditAvailable && (
                    <p className="text-[11px] text-rpg-purple">
                      Pedirá um empréstimo real de {cart.subtotalCoins.toLocaleString("pt-BR")} moedas no Banco ({((bankSummary?.credit.tier.rateBps ?? 0) / 100).toFixed(1)}% de juros, {bankSummary?.credit.termDays} dias para pagar).
                    </p>
                  )}
                  {paymentMethod === "credit" && !creditAvailable && (
                    <p className="text-[11px] text-rpg-red">
                      {creditBlockedByLoan ? "Você já tem um empréstimo ativo — quite-o no Banco para usar o crédito de novo." : creditBlockedByLimit ? `Acima do seu limite de crédito atual (${creditLimit} moedas).` : "Crédito ainda não liberado pelo seu score no Banco."}
                    </p>
                  )}
                </div>
              )}
              <RPGButton variant="gold" className="w-full justify-center" onClick={onCheckout} disabled={checkout.isPending || cart.items.some((i) => !i.available)}>
                Finalizar Compra
              </RPGButton>
              <p className="text-[11px] text-rpg-muted">
                Entrega pelo Correio da Guilda: itens comuns chegam na hora; raros e lendários levam alguns minutos. Acompanhe em Meus Pedidos.
              </p>
            </div>
          )}
        </RPGPanel>
      </div>

      {toast && <RPGToast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
