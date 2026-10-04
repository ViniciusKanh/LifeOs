import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Flame, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGamificationProfile } from "@/hooks/useGamification";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { RPGCharacterCard } from "./RPGCharacterCard";
import { RPGProgressBar } from "./RPGProgressBar";
import { RPGWallet } from "./RPGWallet";

/**
 * HUD do jogador: retrato, nome, classe cosmética, nível e XP reais
 * (derivados do ledger no backend), moedas e sequência de dias com XP.
 * `compact` é a versão de cabeçalho (só nível, barra e moedas).
 */
export function RPGPlayerHUD({ compact = false, actions, className }: { compact?: boolean; actions?: ReactNode; className?: string }) {
  const { user } = useAuth();
  const { data: p, isLoading, isError } = useGamificationProfile();
  const { prefs } = useRpgPreferences();
  const firstName = user?.name?.split(" ")[0] ?? "Aventureiro";

  if (compact) {
    // Gamificação desligada: o progresso continua no backend, só some do cabeçalho.
    if (!p || !prefs.gamification) return null;
    return (
      <Link
        to="/tesouro"
        className={clsx("hidden lg:flex items-center gap-2.5 px-2 py-1 border border-rpg-border hover:border-rpg-gold/70 bg-rpg-panel/70 transition-colors", className)}
        style={{ borderRadius: 3 }}
        aria-label={`Nível ${p.level}, ${p.xpIntoLevel} de ${p.xpForNextLevel} XP, ${p.coins} moedas. Abrir loja`}
        title="Abrir loja de recompensas"
      >
        <span className="font-pixel text-xs text-rpg-gold-light">Nv. {p.level}</span>
        {prefs.showXp && <RPGProgressBar className="w-24" tone="purple" label="Experiência" value={p.xpIntoLevel} max={p.xpForNextLevel} showLabel={false} />}
        {prefs.showCoins && <RPGWallet coins={p.coins} size="sm" />}
      </Link>
    );
  }

  return (
    <div className={clsx("flex flex-col sm:flex-row sm:items-center gap-4 min-w-0", className)}>
      <RPGCharacterCard name={firstName} level={p?.level}>
        {isLoading && <div className="mt-2 h-3 w-44 rpg-bar animate-pulse" aria-label="Carregando progressão" />}
        {isError && <p className="mt-1 text-xs text-rpg-red">Não foi possível carregar a progressão.</p>}
        {p && (
          <>
            <RPGProgressBar
              className="mt-2 w-48 sm:w-56"
              tone="purple"
              label={`Nível ${p.level} → ${p.level + 1}`}
              value={p.xpIntoLevel}
              max={p.xpForNextLevel}
              valueLabel={`${p.xpIntoLevel} / ${p.xpForNextLevel} XP`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <RPGWallet coins={p.coins} size="sm" />
              <span className="inline-flex items-center gap-1 text-rpg-orange font-pixel" title="Dias seguidos com XP">
                <Flame size={13} aria-hidden /> {p.streakDays} {p.streakDays === 1 ? "dia" : "dias"}
              </span>
              <span className="inline-flex items-center gap-1 text-rpg-purple font-pixel" title="XP ganho hoje">
                <Sparkles size={13} aria-hidden /> +{p.xpToday} hoje
              </span>
            </div>
          </>
        )}
      </RPGCharacterCard>
      {actions && <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}
