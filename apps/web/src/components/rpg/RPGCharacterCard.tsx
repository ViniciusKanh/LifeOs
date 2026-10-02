import { useState, type ReactNode } from "react";
import { Repeat2 } from "lucide-react";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { rpgAvatar } from "./rpgAssets";
import { RPGAvatar } from "./RPGAvatar";
import { RPGAvatarPicker } from "./RPGAvatarPicker";
import { RPGProgressBar } from "./RPGProgressBar";

/**
 * Personagem do usuário: retrato, nome e classe cosmética (vem do retrato).
 * Nível e XP só aparecem quando existirem de verdade no backend — hoje
 * não existem, então as props ficam vazias e nada é exibido.
 */
/** Retrato clicável que abre "Escolha seu personagem". */
export function RPGAvatarButton({ size = "xl", mobileSize = "lg" }: { size?: "md" | "lg" | "xl"; mobileSize?: "sm" | "md" | "lg" }) {
  const { avatarId } = useRpgAvatar();
  const [picking, setPicking] = useState(false);
  const cls = rpgAvatar(avatarId).label;
  return (
    <>
      <button type="button" onClick={() => setPicking(true)} className="group relative shrink-0" aria-label={`Trocar personagem (atual: ${cls})`} title="Trocar personagem">
        <RPGAvatar size={mobileSize} className="sm:hidden" />
        <RPGAvatar size={size} className="hidden sm:inline-block" />
        <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-rpg-panel border-2 border-rpg-gold text-rpg-gold-light opacity-90 group-hover:opacity-100" style={{ borderRadius: 3 }} aria-hidden>
          <Repeat2 size={12} />
        </span>
      </button>
      <RPGAvatarPicker open={picking} onClose={() => setPicking(false)} />
    </>
  );
}

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
