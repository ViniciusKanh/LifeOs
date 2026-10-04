import clsx from "clsx";
import { Clock, Coins, Gem, Gift, Infinity as InfinityIcon, Pencil, Sparkles, Star } from "lucide-react";
import type { Reward } from "@/services/gamificationService";
import { RARITY, limitText, requirementText, rewardArtUrl } from "@/utils/treasureDisplay";
import { RPGBadge } from "./RPGBadge";
import { RPGButton } from "./RPGButton";
import { RPGProgressBar } from "./RPGProgressBar";

/**
 * Card de recompensa do Tesouro: arte pixel art, raridade, preço, requisito
 * real (nunca "XP ganho" — resgatar não dá XP), limite e estado calculado
 * pelo backend (reward.availability).
 */
export function RPGRewardCard({
  reward,
  balance,
  gems = 0,
  onRedeem,
  onEdit,
  onToggleFavorite,
  coinsPerDay,
}: {
  reward: Reward;
  balance: number;
  gems?: number;
  onRedeem: () => void;
  onEdit?: () => void;
  onToggleFavorite?: () => void;
  coinsPerDay?: number;
}) {
  const a = reward.availability;
  const rarity = RARITY[reward.rarity] ?? RARITY.comum;
  const isGem = reward.currency === "gem";
  const shortOnly = a.code === "insufficient";
  const etaDays = shortOnly && !isGem && coinsPerDay && coinsPerDay > 0 ? Math.ceil(a.missingCoins / coinsPerDay) : null;
  const glow = reward.rarity === "epico" || reward.rarity === "lendario";
  const limited = reward.limitPeriod !== "none" || reward.cooldownHours > 0;

  return (
    <article
      className={clsx(
        "rpg-panel group flex flex-col min-w-0 overflow-hidden transition-transform motion-safe:hover:-translate-y-0.5",
        a.available && "rpg-panel-gold",
        glow && a.available && "shadow-[0_0_18px_rgb(var(--rpg-gold)/0.25)]",
        !reward.isActive && "opacity-60",
      )}
    >
      <div className="relative aspect-[2/1] bg-rpg-bg-2 overflow-hidden">
        <img src={rewardArtUrl(reward.art, reward.category)} alt="" aria-hidden loading="lazy" decoding="async" className="pixelated w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-rpg-panel/90 to-transparent" aria-hidden />
        <RPGBadge tone={rarity.tone} className="absolute top-2 left-2 bg-rpg-bg/85">
          {rarity.label}
        </RPGBadge>
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {reward.isAiGenerated && (
            <span className="w-7 h-7 flex items-center justify-center bg-rpg-bg/85 text-rpg-purple border border-rpg-border" style={{ borderRadius: 3 }} title="Criada com sugestão da IA">
              <Sparkles size={13} aria-label="Sugestão da IA" />
            </span>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={reward.isFavorite}
              aria-label={reward.isFavorite ? `Remover ${reward.name} dos favoritos` : `Favoritar ${reward.name}`}
              className={clsx("w-7 h-7 flex items-center justify-center bg-rpg-bg/85 border border-rpg-border hover:text-rpg-gold-light", reward.isFavorite ? "text-rpg-gold-light" : "text-rpg-muted")}
              style={{ borderRadius: 3 }}
            >
              <Star size={13} fill={reward.isFavorite ? "currentColor" : "none"} />
            </button>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={`Editar ${reward.name}`} className="w-7 h-7 flex items-center justify-center bg-rpg-bg/85 border border-rpg-border text-rpg-muted hover:text-rpg-gold-light" style={{ borderRadius: 3 }}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="font-rpg font-bold text-rpg-text leading-tight break-words">{reward.name}</h3>
          {reward.description && <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{reward.description}</p>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={clsx("inline-flex items-center gap-1.5 font-pixel text-base tabular-nums", isGem ? "text-rpg-purple" : "text-rpg-gold-light")}>
            {isGem ? <Gem size={15} aria-hidden /> : <Coins size={15} aria-hidden />} {reward.cost}
            <span className="sr-only">{isGem ? "gemas" : "moedas"}</span>
          </span>
          <RPGBadge tone="purple" icon={<Star size={10} aria-hidden />}>
            {requirementText(reward)}
          </RPGBadge>
        </div>

        {shortOnly && reward.isActive && (
          <RPGProgressBar
            value={isGem ? gems : balance}
            max={reward.cost}
            tone={isGem ? "purple" : "orange"}
            label="Progresso até o resgate"
            valueLabel={`${isGem ? gems : balance}/${reward.cost}`}
          />
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-[11px] text-rpg-muted min-w-0">
            {limited ? <Clock size={12} aria-hidden /> : <InfinityIcon size={12} aria-hidden />}
            <span className="truncate">{limitText(reward)}</span>
          </span>
          <RPGButton
            variant={a.available ? "primary" : "secondary"}
            disabled={!a.available}
            onClick={onRedeem}
            className="!px-3 !py-1.5 shrink-0"
            aria-label={`Resgatar ${reward.name} por ${reward.cost} ${isGem ? "gemas" : "moedas"}`}
          >
            <Gift size={13} aria-hidden /> Resgatar
          </RPGButton>
        </div>
        {!a.available && a.reason && (
          <p className="-mt-1 text-[11px] text-rpg-muted">
            {a.reason}
            {etaDays ? ` · ~${etaDays} dia${etaDays > 1 ? "s" : ""} no seu ritmo` : ""}
            {a.nextAvailableAt && a.code !== "insufficient" ? ` Libera ${new Date(a.nextAvailableAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : ""}
          </p>
        )}
      </div>
    </article>
  );
}
