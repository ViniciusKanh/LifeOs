import { api } from "./api";

/** Espelho de /api/shop (Loja Arcana — Fase 1: catálogo, carrinho e checkout em moedas/gemas). */
export const SHOP_CATEGORIES = ["pocoes", "vestimentas", "artefatos", "personalizacao", "boosters", "decoracao", "reliquias", "materiais", "pacotes"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_RARITIES = ["comum", "incomum", "raro", "epico", "lendario", "mitico"] as const;
export type ShopRarity = (typeof SHOP_RARITIES)[number];

export type ShopSort = "relevancia" | "preco_asc" | "preco_desc" | "raridade";

export interface ShopProduct {
  key: string;
  category: ShopCategory;
  rarity: ShopRarity;
  name: string;
  description: string;
  currency: "coin" | "gem";
  price: number;
  art: string;
  effectText: string | null;
  durationText: string | null;
  stackable: boolean;
  maxStack: number;
  featured: boolean;
  active: boolean;
  stock: number | null;
}

export interface CartItem {
  productKey: string;
  name: string;
  rarity: ShopRarity;
  art: string;
  currency: "coin" | "gem";
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: boolean;
}

export interface Cart {
  items: CartItem[];
  subtotalCoins: number;
  subtotalGems: number;
  balance: { coins: number; gems: number };
}

export interface CheckoutResponse {
  orderId: string;
  totalCoins: number;
  totalGems: number;
  replayed: boolean;
}

export interface ShopOrder {
  id: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ productKey: string; productName: string; rarity: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

export interface HeroInventoryItem {
  key: string;
  name: string;
  description: string;
  category: ShopCategory;
  rarity: ShopRarity;
  art: string;
  quantity: number;
  effectText: string | null;
  durationText: string | null;
  acquiredAt: string | null;
}

export interface HeroInventory {
  items: HeroInventoryItem[];
  kpis: { totalItems: number; legendaryCount: number; consumables: number; slotsUsed: number; bonusesActive: number };
}

export const shopService = {
  products: (filter: { category?: ShopCategory | "all"; rarity?: ShopRarity | "all"; query?: string; sort?: ShopSort } = {}) => {
    const qs = new URLSearchParams();
    if (filter.category && filter.category !== "all") qs.set("category", filter.category);
    if (filter.rarity && filter.rarity !== "all") qs.set("rarity", filter.rarity);
    if (filter.query) qs.set("query", filter.query);
    if (filter.sort) qs.set("sort", filter.sort);
    const qsStr = qs.toString();
    return api.get<ShopProduct[]>(`/shop/products${qsStr ? `?${qsStr}` : ""}`);
  },
  cart: () => api.get<Cart>("/shop/cart"),
  addToCart: (productKey: string, quantity = 1) => api.post<Cart>("/shop/cart/items", { productKey, quantity }),
  updateCartItem: (productKey: string, quantity: number) => api.patch<Cart>(`/shop/cart/items/${encodeURIComponent(productKey)}`, { quantity }),
  removeFromCart: (productKey: string) => api.delete<Cart>(`/shop/cart/items/${encodeURIComponent(productKey)}`),
  clearCart: () => api.delete<Cart>("/shop/cart"),
  checkout: (requestId: string) => api.post<CheckoutResponse>("/shop/checkout", { requestId }),
  orders: () => api.get<ShopOrder[]>("/shop/orders"),
  heroInventory: () => api.get<HeroInventory>("/shop/inventory"),
};
