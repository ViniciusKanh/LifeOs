import { useCallback } from "react";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import type { RpgAvatarId } from "@/components/rpg/rpgAssets";

/**
 * Personagem escolhido no tema RPG (persistido no backend junto das
 * preferências cosméticas). Só a tela Meu Perfil oferece a troca.
 */
export function useRpgAvatar() {
  const { prefs, update } = useRpgPreferences();
  const setAvatar = useCallback((id: RpgAvatarId) => update({ avatarId: id }), [update]);
  return { avatarId: prefs.avatarId, setAvatar };
}
