import { useSearchParams } from "react-router-dom";
import type { RpgTone } from "@/components/rpg";
import type { HeroAchievementState, HeroRarity } from "@/services/heroService";

/** Peças compartilhadas pelas abas do Perfil do Herói (mesma linguagem visual do ModuleKit). */

export const HERO_ART = {
  achievements: { scene: "/assets/rpg/banners/conquistas.webp", mage: "/assets/rpg/hub/reward-trophy.webp" },
  treasure: { scene: "/assets/rpg/treasure-hero.webp", mage: "/assets/rpg/hub/reward-chest.webp" },
  collection: { scene: "/assets/rpg/inventory-hero.webp", mage: "/assets/rpg/items/backpack.webp" },
  build: { scene: "/assets/rpg/build-hero.webp", mage: "/assets/rpg/avatars/cavaleiro.webp" },
  journey: { scene: "/assets/rpg/codex-hero.webp", mage: "/assets/rpg/hub/tome-quill.webp" },
  advisor: "/assets/rpg/avatars/mago.webp",
} as const;

export const RARITY_UI: Record<HeroRarity, { label: string; tone: RpgTone; ring: string }> = {
  comum: { label: "Comum", tone: "muted", ring: "border-rpg-border" },
  incomum: { label: "Incomum", tone: "green", ring: "border-rpg-green/70" },
  rara: { label: "Rara", tone: "blue", ring: "border-rpg-blue/70" },
  epica: { label: "Épica", tone: "purple", ring: "border-rpg-purple/80" },
  lendaria: { label: "Lendária", tone: "gold", ring: "border-rpg-gold" },
  mitica: { label: "Mítica", tone: "pink", ring: "border-rpg-pink" },
};

export const STATE_UI: Record<HeroAchievementState, { label: string; tone: RpgTone }> = {
  bloqueada: { label: "Bloqueada", tone: "muted" },
  nao_iniciada: { label: "Não iniciada", tone: "muted" },
  em_progresso: { label: "Em progresso", tone: "purple" },
  desbloqueada: { label: "Desbloqueada", tone: "green" },
  resgatada: { label: "Resgatada", tone: "gold" },
};

/** Raridade dos itens do inventário/Códex (escala de 5 níveis já existente). */
export const ITEM_RARITY_TONE: Record<string, RpgTone> = { common: "muted", uncommon: "green", rare: "blue", epic: "purple", legendary: "gold" };

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.length > 10 ? `${iso.replace(" ", "T")}Z` : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};
export const nf = (n: number) => n.toLocaleString("pt-BR");

/** Aba atual na URL (?aba=), com valor padrão — permite links diretos das notificações. */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("aba") as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const set = (t: T) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === fallback) p.delete("aba");
        else p.set("aba", t);
        return p;
      },
      { replace: true },
    );
  return [tab, set];
}
