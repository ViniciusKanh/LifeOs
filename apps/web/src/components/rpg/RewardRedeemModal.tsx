import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Coins, Gem } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RedeemResponse, Reward } from "@/services/gamificationService";
import { RARITY, limitText, requirementText, rewardArtUrl } from "@/utils/treasureDisplay";
import { RPGBadge } from "./RPGBadge";
import { RPGButton } from "./RPGButton";

/** Chave de idempotência por abertura do modal (clique duplo/refresh não gasta duas vezes). */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Confirmação de resgate. A animação "RECOMPENSA ADQUIRIDA" só aparece
 * depois que o backend confirmou o débito (onConfirm resolvido).
 */
export function RewardRedeemModal({
  reward,
  balance,
  gems = 0,
  onClose,
  onConfirm,
  onViewInventory,
}: {
  reward: Reward | null;
  balance: number;
  gems?: number;
  onClose: () => void;
  onConfirm: (reward: Reward, requestId: string) => Promise<RedeemResponse>;
  onViewInventory?: () => void;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"confirm" | "pending" | "done">("confirm");
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [result, setResult] = useState<RedeemResponse | null>(null);

  useEffect(() => {
    if (reward) {
      setState("confirm");
      setError(null);
      setResult(null);
      setRequestId(newRequestId());
    }
  }, [reward]);

  if (!reward) return <Modal open={false} onClose={onClose} title="Resgatar recompensa">{null}</Modal>;

  const isGem = reward.currency === "gem";
  const current = isGem ? gems : balance;
  const after = current - reward.cost;
  const unit = isGem ? "gemas" : "moedas";
  const Icon = isGem ? Gem : Coins;

  const confirm = async () => {
    setState("pending");
    setError(null);
    try {
      setResult(await onConfirm(reward, requestId));
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível resgatar agora.");
      setState("confirm");
    }
  };

  return (
    <Modal
      open
      onClose={state === "pending" ? () => undefined : onClose}
      title={state === "done" ? "Recompensa resgatada" : "Resgatar recompensa"}
      size="sm"
      footer={
        state === "done" ? (
          <>
            {onViewInventory && (
              <RPGButton variant="secondary" onClick={onViewInventory}>
                Ver inventário
              </RPGButton>
            )}
            <RPGButton variant="gold" onClick={onClose}>
              Fechar
            </RPGButton>
          </>
        ) : (
          <>
            <RPGButton variant="ghost" onClick={onClose} disabled={state === "pending"}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={confirm} disabled={state === "pending" || !reward.availability.available}>
              {state === "pending" ? "Resgatando…" : "Confirmar resgate"}
            </RPGButton>
          </>
        )
      }
    >
      <AnimatePresence mode="wait">
        {state !== "done" ? (
          <motion.div key="confirm" exit={{ opacity: 0 }} className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <img src={rewardArtUrl(reward.art, reward.category)} alt="" aria-hidden className="pixelated w-24 h-[60px] object-cover border-2 border-rpg-bronze shrink-0" style={{ borderRadius: 3 }} />
              <div className="min-w-0">
                <RPGBadge tone={RARITY[reward.rarity]?.tone ?? "muted"}>{RARITY[reward.rarity]?.label ?? "Comum"}</RPGBadge>
                <p className="mt-1 font-rpg font-bold text-rpg-text leading-tight">{reward.name}</p>
                {reward.description && <p className="text-xs text-rpg-muted line-clamp-2">{reward.description}</p>}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Custo", reward.cost],
                ["Seu saldo", current],
                ["Depois", Math.max(0, after)],
              ].map(([label, v]) => (
                <div key={label} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                  <dt className="text-[10px] uppercase tracking-wide text-rpg-muted">{label}</dt>
                  <dd className={`mt-1 inline-flex items-center gap-1 font-pixel tabular-nums ${label === "Depois" && after < 0 ? "text-rpg-red" : "text-rpg-gold-light"}`}>
                    <Icon size={13} aria-hidden /> {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-rpg-muted">
              {limitText(reward)} · {requirementText(reward)}. O valor sai em {unit}; XP nunca é gasto.
            </p>
            {!reward.availability.available && reward.availability.reason && <p className="text-xs text-rpg-orange">{reward.availability.reason}</p>}
            {error && (
              <p role="alert" className="text-xs text-rpg-red">
                {error}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center text-center gap-2 py-3"
            role="status"
          >
            <motion.img
              src={rewardArtUrl(reward.art, reward.category)}
              alt=""
              aria-hidden
              className="pixelated w-40 h-[100px] object-cover border-2 border-rpg-gold"
              style={{ borderRadius: 3 }}
              initial={reduce ? false : { rotate: -4, y: 8 }}
              animate={reduce ? undefined : { rotate: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
            />
            <p className="font-pixel text-xs uppercase tracking-[0.2em] text-rpg-gold">Recompensa adquirida</p>
            <p className="font-rpg text-lg font-bold text-rpg-text">{reward.name}</p>
            <p className="inline-flex items-center gap-1 font-pixel text-rpg-orange">
              -{reward.cost} <Icon size={14} aria-hidden /> {unit}
            </p>
            <p className="text-xs text-rpg-muted">
              Disponível no seu inventário. Saldo: {isGem ? result?.gems : result?.balance} {unit}.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
