import clsx from "clsx";
import { useAuth } from "@/hooks/useAuth";
import { useUnlockedAchievements } from "@/hooks/useAchievements";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { isFrameUnlocked, unlockedTiers } from "@/utils/cosmetics";
import { RPGAvatar } from "./RPGAvatar";

const SIZE = { sm: 32, md: 56, lg: 104, xl: 148 } as const;
const FRAME_BORDER = { gold: "border-rpg-gold", silver: "border-rpg-muted", bronze: "border-rpg-bronze", rare: "border-rpg-purple" } as const;

/**
 * Retrato do jogador conforme a preferência: personagem RPG, arte própria,
 * foto real ou iniciais. A moldura escolhida só vale se estiver desbloqueada de verdade.
 */
export function RPGPortrait({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  const { user } = useAuth();
  const { prefs } = useRpgPreferences();
  const { achievements } = useUnlockedAchievements();
  const frame = isFrameUnlocked(prefs.frame, unlockedTiers(achievements)) ? prefs.frame : "bronze";
  const px = SIZE[size];
  // Aura Arcana (Loja Arcana — Moldura Épica de Avatar): só visual, nunca troca a moldura conquistada de verdade.
  const aura = user?.rpg_prefs?.shopCosmetics?.avatarAura
    ? clsx("ring-2 ring-rpg-purple ring-offset-2 ring-offset-rpg-bg shadow-[0_0_10px_rgb(var(--rpg-purple)/0.55)]")
    : null;
  if (prefs.avatarMode === "rpg" || prefs.avatarMode === "custom" || !user) return <RPGAvatar size={size} frame={frame} className={clsx(aura, className)} />;
  const initials = (user.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span
      className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden border-2 bg-rpg-bg-2 font-rpg font-bold text-rpg-gold-light", FRAME_BORDER[frame], aura, className)}
      style={{ width: px, height: px, borderRadius: 3, fontSize: px / 2.6 }}
    >
      {prefs.avatarMode === "photo" && user.avatar_url ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" /> : <span aria-label={user.name}>{initials}</span>}
    </span>
  );
}
