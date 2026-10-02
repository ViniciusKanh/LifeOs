import clsx from "clsx";
import { Lock } from "lucide-react";
import { rpgAvatar, type RpgAvatarId } from "./rpgAssets";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";

const SIZE = { sm: 32, md: 56, lg: 104, xl: 148 } as const;
const FRAME = {
  gold: "border-rpg-gold",
  silver: "border-rpg-muted",
  bronze: "border-rpg-bronze",
  rare: "border-rpg-purple",
} as const;

/**
 * Retrato pixel art do personagem. Sem `avatarId`, usa o escolhido pelo
 * usuário (useRpgAvatar). Os retratos já têm moldura própria, então a
 * borda aqui é fina — só separa a arte do painel.
 */
export function RPGAvatar({
  avatarId,
  size = "md",
  frame = "gold",
  state = "normal",
  alt,
  className,
}: {
  avatarId?: RpgAvatarId;
  size?: keyof typeof SIZE;
  frame?: keyof typeof FRAME;
  state?: "normal" | "selected" | "locked";
  alt?: string;
  className?: string;
}) {
  const chosen = useRpgAvatar().avatarId;
  const a = rpgAvatar(avatarId ?? chosen);
  const px = SIZE[size];
  return (
    <span
      className={clsx(
        "relative inline-block shrink-0 overflow-hidden border-2 bg-rpg-bg",
        FRAME[frame],
        state === "selected" && "ring-2 ring-rpg-gold-light ring-offset-2 ring-offset-rpg-bg",
        className
      )}
      style={{ width: px, height: px, borderRadius: 3 }}
    >
      <img
        src={px <= 56 ? a.srcSm : a.src}
        alt={alt ?? `Personagem: ${a.label}`}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={clsx("pixelated w-full h-full object-cover", state === "locked" && "grayscale opacity-40")}
      />
      {state === "locked" && (
        <span className="absolute inset-0 flex items-center justify-center text-rpg-muted" aria-hidden>
          <Lock size={px / 3} />
        </span>
      )}
    </span>
  );
}
