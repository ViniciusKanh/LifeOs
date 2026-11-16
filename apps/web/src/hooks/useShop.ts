import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { shopService, type ShopCategory, type ShopRarity, type ShopSort } from "@/services/shopService";

const KEY = ["shop"];

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
  const checkout = useMutation({ mutationFn: (requestId: string) => shopService.checkout(requestId), onSuccess: invalidate });
  return { ...query, cart: query.data, add, update, remove, clear, checkout };
}

export function useShopOrders(enabled = true) {
  return useQuery({ queryKey: [...KEY, "orders"], queryFn: shopService.orders, enabled, staleTime: 15_000 });
}

/** Inventário do Herói: itens comprados na Loja (sem equipar/consumir ainda — Fase 2). */
export function useHeroInventory() {
  return useQuery({ queryKey: [...KEY, "inventory"], queryFn: shopService.heroInventory, staleTime: 15_000 });
}
