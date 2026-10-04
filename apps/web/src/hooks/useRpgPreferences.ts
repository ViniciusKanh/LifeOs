import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";
import { DEFAULT_RPG_AVATAR, RPG_AVATARS, RPG_BANNERS, type RpgAvatarId, type RpgBanner } from "@/components/rpg/rpgAssets";
import type { CurrentUser } from "@/types";

/**
 * Preferências cosméticas e de exibição do modo RPG. Ficam no backend
 * (users.rpg_prefs_json) — só o próprio usuário altera, e valem em
 * qualquer aparelho. Nada aqui é dado de negócio: XP, nível, moedas e
 * conquistas continuam calculados no servidor; desligar a gamificação só
 * esconde elementos visuais, nunca apaga progresso.
 */
export type AvatarMode = "rpg" | "photo" | "initials" | "custom";
export type AnimationLevel = "full" | "reduced" | "off";
export type FrameId = "bronze" | "silver" | "gold" | "rare";

export interface RpgPreferences {
  avatarId: RpgAvatarId;
  gamification: boolean;
  showXp: boolean;
  showCoins: boolean;
  animations: AnimationLevel;
  avatarMode: AvatarMode;
  frame: FrameId;
  banner: RpgBanner;
  title: string | null;
  /** Classe da rotina escolhida no Códex (cosmética). */
  classId: string | null;
}

export const DEFAULT_RPG_PREFERENCES: RpgPreferences = {
  avatarId: DEFAULT_RPG_AVATAR,
  gamification: true,
  showXp: true,
  showCoins: true,
  animations: "full",
  avatarMode: "rpg",
  frame: "bronze",
  banner: "perfil",
  title: null,
  classId: null,
};

/** Valores que existiam só no navegador (versão anterior) — usados até o primeiro salvamento. */
function legacyLocal(userId: string): Partial<RpgPreferences> {
  try {
    const prefs = JSON.parse(localStorage.getItem(`lifeos.rpg.prefs.${userId}`) ?? "{}") as Partial<RpgPreferences>;
    const avatar = localStorage.getItem(`lifeos.rpg.avatar.${userId}`);
    return { ...prefs, ...(avatar && RPG_AVATARS.some((a) => a.id === avatar) ? { avatarId: avatar as RpgAvatarId } : {}) };
  } catch {
    return {};
  }
}

function resolve(user: CurrentUser | null): RpgPreferences {
  if (!user) return DEFAULT_RPG_PREFERENCES;
  const merged = { ...DEFAULT_RPG_PREFERENCES, ...legacyLocal(user.id), ...(user.rpg_prefs ?? {}) } as RpgPreferences;
  // Nunca confia cegamente no salvo: banner/personagem desconhecidos voltam ao padrão.
  if (!(merged.banner in RPG_BANNERS)) merged.banner = DEFAULT_RPG_PREFERENCES.banner;
  if (!RPG_AVATARS.some((a) => a.id === merged.avatarId)) merged.avatarId = DEFAULT_RPG_AVATAR;
  if (merged.avatarMode === "custom" && !user.rpg_avatar_image) merged.avatarMode = "rpg";
  return merged;
}

export function useRpgPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prefs = useMemo(() => resolve(user), [user]);

  const update = useCallback(
    (patch: Partial<RpgPreferences>) => {
      if (!user) return;
      // Otimista: a interface muda na hora; se o servidor recusar, recarrega o "me".
      qc.setQueryData<CurrentUser | null>(["auth", "me"], (old) => (old ? { ...old, rpg_prefs: { ...(old.rpg_prefs ?? {}), ...patch } } : old));
      authService.updateProfile({ rpgPrefs: patch }).catch(() => void qc.invalidateQueries({ queryKey: ["auth", "me"] }));
    },
    [user, qc],
  );

  return { prefs, update };
}
