import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { RpgBanner } from "@/components/rpg/rpgAssets";

/**
 * Preferências cosméticas e de exibição do modo RPG, por usuário e por
 * aparelho (mesmo padrão do personagem escolhido). Nada aqui é dado de
 * negócio: XP, nível, moedas e conquistas continuam no backend — desligar
 * a gamificação só esconde elementos visuais, nunca apaga progresso.
 */
export type AvatarMode = "rpg" | "photo" | "initials";
export type AnimationLevel = "full" | "reduced" | "off";
export type FrameId = "bronze" | "silver" | "gold" | "rare";

export interface RpgPreferences {
  gamification: boolean;
  showXp: boolean;
  showCoins: boolean;
  animations: AnimationLevel;
  avatarMode: AvatarMode;
  frame: FrameId;
  banner: RpgBanner;
  title: string | null;
}

export const DEFAULT_RPG_PREFERENCES: RpgPreferences = {
  gamification: true,
  showXp: true,
  showCoins: true,
  animations: "full",
  avatarMode: "rpg",
  frame: "bronze",
  banner: "perfil",
  title: null,
};

const listeners = new Set<() => void>();
const keyFor = (userId: string) => `lifeos.rpg.prefs.${userId}`;
const cache = new Map<string, { raw: string | null; value: RpgPreferences }>();

function read(userId: string | undefined): RpgPreferences {
  if (!userId) return DEFAULT_RPG_PREFERENCES;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(userId));
  } catch {
    raw = null;
  }
  // Mesmo objeto enquanto o texto salvo não muda (exigência do useSyncExternalStore).
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.value;
  let value = DEFAULT_RPG_PREFERENCES;
  try {
    value = raw ? { ...DEFAULT_RPG_PREFERENCES, ...(JSON.parse(raw) as Partial<RpgPreferences>) } : DEFAULT_RPG_PREFERENCES;
  } catch {
    value = DEFAULT_RPG_PREFERENCES;
  }
  cache.set(userId, { raw, value });
  return value;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRpgPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  const prefs = useSyncExternalStore(subscribe, () => read(userId), () => DEFAULT_RPG_PREFERENCES);

  const update = useCallback(
    (patch: Partial<RpgPreferences>) => {
      if (!userId) return;
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify({ ...read(userId), ...patch }));
      } catch {
        // Storage bloqueado: a preferência vale só até recarregar.
      }
      listeners.forEach((l) => l());
    },
    [userId],
  );

  return { prefs, update };
}
