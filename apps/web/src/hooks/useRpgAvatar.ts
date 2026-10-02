import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_RPG_AVATAR, RPG_AVATARS, type RpgAvatarId } from "@/components/rpg/rpgAssets";

/**
 * Personagem escolhido no tema RPG. Ainda não existe essa preferência no
 * backend, então ela é cosmética e fica no navegador, separada por usuário
 * (nunca é dado de negócio). Store de módulo para cabeçalho e Dashboard
 * trocarem juntos.
 */
const listeners = new Set<() => void>();
const keyFor = (userId: string) => `lifeos.rpg.avatar.${userId}`;

function read(userId: string | undefined): RpgAvatarId {
  if (!userId) return DEFAULT_RPG_AVATAR;
  try {
    const v = localStorage.getItem(keyFor(userId)) as RpgAvatarId | null;
    return v && RPG_AVATARS.some((a) => a.id === v) ? v : DEFAULT_RPG_AVATAR;
  } catch {
    return DEFAULT_RPG_AVATAR;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRpgAvatar() {
  const { user } = useAuth();
  const userId = user?.id;
  const avatarId = useSyncExternalStore(subscribe, () => read(userId), () => DEFAULT_RPG_AVATAR);

  const setAvatar = useCallback(
    (id: RpgAvatarId) => {
      if (!userId) return;
      try {
        localStorage.setItem(keyFor(userId), id);
      } catch {
        // Storage bloqueado: a escolha vale só até recarregar.
      }
      listeners.forEach((l) => l());
    },
    [userId]
  );

  return { avatarId, setAvatar };
}
