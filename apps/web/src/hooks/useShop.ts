import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { shopService, type ShopCategory, type ShopPaymentMethod, type ShopRarity, type ShopSort } from "@/services/shopService";
import { newRequestId } from "@/utils/requestId";

const KEY = ["shop"];
const BANK_KEY = ["bank"];

/** Catálogo da Loja Arcana, filtrável no servidor. */
export function useShopProducts(filter: { category?: ShopCategory | "all"; rarity?: ShopRarity | "all"; query?: string; sort?: ShopSort }) {
  return useQuery({ queryKey: [...KEY, "products", filter], queryFn: () => shopService.products(filter), staleTime: 30_000 });
}

/** Carrinho persistido — preços e saldo sempre recalculados no servidor. */
export function useShopCart() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, "cart"], queryFn: shopService.cart, staleTime: 5_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const add = useMutation({ mutationFn: ({ productKey, quantity }: { productKey: string; quantity?: number }) => shopService.addToCart(productKey, quantity), onSuccess: (cart) => qc.setQueryData([...KEY, "cart"], cart) });
  const update = useMutation({ mutationFn: ({ productKey, quantity }: { productKey: string; quantity: number }) => shopService.updateCartItem(productKey, quantity), onSuccess: (cart) => qc.setQueryData([...KEY, "cart"], cart) });
  const remove = useMutation({ mutationFn: (productKey: string) => shopService.removeFromCart(productKey), onSuccess: (cart) => qc.setQueryData([...KEY, "cart"], cart) });
  const clear = useMutation({ mutationFn: shopService.clearCart, onSuccess: (cart) => qc.setQueryData([...KEY, "cart"], cart) });
  // Sem atualização otimista de saldo: só o backend confirma o débito real.
  const checkout = useMutation({
    mutationFn: ({ requestId, paymentMethod }: { requestId: string; paymentMethod?: ShopPaymentMethod }) => shopService.checkout(requestId, paymentMethod),
    onSuccess: () => {
      invalidate();
      // Crédito do Banco cria/gasta um empréstimo real — o resumo do Banco precisa refletir isso.
      qc.invalidateQueries({ queryKey: BANK_KEY });
    },
  });
  return { ...query, cart: query.data, add, update, remove, clear, checkout };
}

export function useShopOrders(enabled = true) {
  return useQuery({ queryKey: [...KEY, "orders"], queryFn: shopService.orders, enabled, staleTime: 15_000 });
}

/** Inventário do Herói: itens comprados na Loja — "Usar" (boosters/passe/ticket) e "Equipar" (cosméticos). */
export function useHeroInventory() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, "inventory"], queryFn: shopService.heroInventory, staleTime: 15_000 });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...KEY, "inventory"] });
    void qc.invalidateQueries({ queryKey: [...KEY, "effects"] });
    void qc.invalidateQueries({ queryKey: ["auth", "me"] });
  };
  const useItem = useMutation({
    mutationFn: ({ productKey, habitId }: { productKey: string; habitId?: string }) => shopService.useItem(productKey, newRequestId(), habitId),
    onSuccess: invalidate,
  });
  const toggleCosmetic = useMutation({
    mutationFn: ({ productKey, enabled }: { productKey: string; enabled: boolean }) => shopService.toggleCosmetic(productKey, enabled),
    onSuccess: invalidate,
  });
  return { ...query, useItem, toggleCosmetic };
}

/** Bônus temporários ativos (boosters/passe da Loja) e cosméticos ligados agora. */
export function useShopEffects() {
  return useQuery({ queryKey: [...KEY, "effects"], queryFn: shopService.effects, staleTime: 10_000 });
}
