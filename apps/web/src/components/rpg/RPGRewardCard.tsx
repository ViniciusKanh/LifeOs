import clsx from "clsx";
import { Clock, Coins, Pencil, Repeat } from "lucide-react";
import type { Reward } from "@/services/gamificationService";
import { RPGButton } from "./RPGButton";
import { RPGBadge } from "./RPGBadge";

function formatUntil(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Item da loja: custo, limites e estado (disponível, recarga, esgotado, saldo curto). */
export function RPGRewardCard({ reward, balance, onRedeem, onEdit }: { reward: Reward; balance: number; onRedeem: () => void; onEdit?: () => void }) {
  const soldOut = reward.redemptionLimit != null && reward.timesRedeemed >= reward.redemptionLimit;
  const cooling = !!reward.availableAt;
  const short = balance < reward.cost;
  const blocked = !reward.isActive || soldOut || cooling || short;
  const reason = !reward.isActive ? "Desativada" : soldOut ? "Esgotada" : cooling ? `Recarga até ${formatUntil(reward.availableAt!)}` : short ? `Faltam ${reward.cost - balance} moedas` : null;

  return (
    <article className={clsx("rpg-panel flex flex-col p-4 gap-3 min-w-0", !blocked && "rpg-panel-gold", !reward.isActive && "opacity-60")}>
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-12 h-12 shrink-0 flex items-center justify-center text-2xl border-2 border-rpg-bronze bg-rpg-bg-2" style={{ borderRadius: 3 }} aria-hidden>
          {reward.icon || "🎁"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-rpg font-bold text-rpg-text leading-tight break-words">{reward.name}</h3>
          {reward.description && <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{reward.description}</p>}
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} className="shrink-0 w-8 h-8 flex items-center justify-center text-rpg-muted hover:text-rpg-gold-light" aria-label={`Editar ${reward.name}`}>
            <Pencil size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {reward.cooldownHours > 0 && (
          <RPGBadge tone="blue" icon={<Clock size={10} aria-hidden />}>
            {reward.cooldownHours}h de recarga
          </RPGBadge>
        )}
        {reward.redemptionLimit != null && (
          <RPGBadge tone="purple" icon={<Repeat size={10} aria-hidden />}>
            {reward.timesRedeemed}/{reward.redemptionLimit}
          </RPGBadge>
        )}
        {reward.redemptionLimit == null && reward.timesRedeemed > 0 && <RPGBadge tone="muted">{reward.timesRedeemed}× resgatada</RPGBadge>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1.5 font-pixel text-lg text-rpg-gold-light tabular-nums">
          <Coins size={16} aria-hidden /> {reward.cost}
        </span>
        <RPGButton variant={blocked ? "secondary" : "gold"} disabled={blocked} onClick={onRedeem} aria-label={`Resgatar ${reward.name} por ${reward.cost} moedas`}>
          Resgatar
        </RPGButton>
      </div>
      {reason && <p className="-mt-1 text-[11px] text-rpg-muted">{reason}</p>}
    </article>
  );
}
