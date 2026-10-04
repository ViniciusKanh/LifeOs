import type { ReactNode } from "react";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { rpgAvatar } from "./rpgAssets";
import { RPGAvatar } from "./RPGAvatar";
import { RPGPortrait } from "./RPGPortrait";
import { Link } from "react-router-dom";
import { RPGProgressBar } from "./RPGProgressBar";

/**
 * Retrato clicável: o avatar só é trocado em Meu Perfil (Personalização),
 * então aqui o clique leva até lá — nenhuma outra tela altera o avatar.
 */
export function RPGAvatarButton({ size = "xl", mobileSize = "lg" }: { size?: "md" | "lg" | "xl"; mobileSize?: "sm" | "md" | "lg" }) {
  return (
    <Link to="/perfil?aba=custom" className="relative shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold" aria-label="Alterar avatar em Meu Perfil" title="Alterar avatar em Meu Perfil">
      <RPGPortrait size={mobileSize} className="sm:hidden" />
      <RPGPortrait size={size} className="hidden sm:inline-block" />
    </Link>
  );
}

/**
 * Personagem do usuário: retrato, nome e classe cosmética (vem do retrato).
 * Nível e XP vêm do motor de gamificação (RPGPlayerHUD passa os valores
 * reais); sem eles, nada de progressão é exibido.
 */
export function RPGCharacterCard({
  name,
  level,
  xp,
  compact = false,
  children,
}: {
  name: string;
  level?: number;
  xp?: { current: number; next: number };
  compact?: boolean;
  children?: ReactNode;
}) {
  const { avatarId } = useRpgAvatar();
  const cls = rpgAvatar(avatarId).label;

  return (
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <RPGAvatarButton size={compact ? "lg" : "xl"} mobileSize={compact ? "md" : "lg"} />
      <div className="min-w-0">
        <p className="rpg-title text-lg sm:text-xl font-bold truncate">{name}</p>
        <p className="font-pixel text-xs text-rpg-muted">
          {cls}
          {level != null && <span className="text-rpg-gold"> · Nv. {level}</span>}
        </p>
        {xp && <RPGProgressBar className="mt-2 w-44" tone="purple" label="Experiência" value={xp.current} max={xp.next} valueLabel={`${xp.current} / ${xp.next} XP`} />}
        {children}
      </div>
    </div>
  );
}
