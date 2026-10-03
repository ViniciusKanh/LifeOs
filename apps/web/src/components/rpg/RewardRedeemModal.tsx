import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Coins, Gift } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { Reward } from "@/services/gamificationService";
import { RPGButton } from "./RPGButton";

/**
 * Confirmação de resgate. A animação de "RECOMPENSA DESBLOQUEADA" só
 * aparece depois que o backend confirmou o débito (onConfirm resolvido).
 */
export function RewardRedeemModal({
  reward,
  balance,
  onClose,
  onConfirm,
}: {
  reward: Reward | null;
  balance: number;
  onClose: () => void;
  onConfirm: (reward: Reward) => Promise<{ balance: number }>;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"confirm" | "pending" | "done">("confirm");
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  useEffect(() => {
    if (reward) {
      setState("confirm");
      setError(null);
      setNewBalance(null);
    }
  }, [reward]);

  if (!reward) return <Modal open={false} onClose={onClose} title="Resgatar recompensa">{null}</Modal>;

  const confirm = async () => {
    setState("pending");
    setError(null);
    try {
      const r = await onConfirm(reward);
      setNewBalance(r.balance);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível resgatar agora.");
      setState("confirm");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={state === "done" ? "Recompensa desbloqueada" : "Resgatar recompensa"}
      size="sm"
      footer={
        state === "done" ? (
          <RPGButton variant="gold" onClick={onClose}>
            Fechar
          </RPGButton>
        ) : (
          <>
            <RPGButton variant="ghost" onClick={onClose} disabled={state === "pending"}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={confirm} disabled={state === "pending" || balance < reward.cost}>
              {state === "pending" ? "Resgatando…" : `Gastar ${reward.cost} moedas`}
            </RPGButton>
          </>
        )
      }
    >
      <AnimatePresence mode="wait">
        {state !== "done" ? (
          <motion.div key="confirm" exit={{ opacity: 0 }} className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-14 h-14 flex items-center justify-center text-3xl border-2 border-rpg-bronze bg-rpg-bg-2" style={{ borderRadius: 3 }} aria-hidden>
                {reward.icon || "🎁"}
              </span>
              <div className="min-w-0">
                <p className="font-rpg font-bold text-rpg-text">{reward.name}</p>
                {reward.description && <p className="text-xs text-rpg-muted">{reward.description}</p>}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rpg-panel p-2">
                <dt className="text-rpg-muted">Saldo atual</dt>
                <dd className="font-pixel text-base text-rpg-gold-light tabular-nums">{balance}</dd>
              </div>
              <div className="rpg-panel p-2">
                <dt className="text-rpg-muted">Saldo após</dt>
                <dd className="font-pixel text-base text-rpg-text tabular-nums">{Math.max(0, balance - reward.cost)}</dd>
              </div>
            </dl>
            {error && (
              <p role="alert" className="text-xs text-rpg-red">
                {error}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={reduce ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex flex-col items-center text-center py-4 gap-3"
            role="status"
          >
            <motion.span
              className="relative w-20 h-20 flex items-center justify-center border-2 border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light"
              style={{ borderRadius: 4 }}
              initial={reduce ? false : { rotate: -8, y: 8 }}
              animate={reduce ? undefined : { rotate: [-8, 6, -3, 0], y: 0 }}
              transition={{ duration: 0.6 }}
              aria-hidden
            >
              <Gift size={38} />
              {!reduce &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-rpg-gold-light"
                    initial={{ opacity: 1, x: 0, y: 0 }}
                    animate={{ opacity: 0, x: Math.cos((i / 6) * Math.PI * 2) * 46, y: Math.sin((i / 6) * Math.PI * 2) * 46 }}
                    transition={{ duration: 0.8, delay: 0.25 }}
                  />
                ))}
            </motion.span>
            <p className="font-pixel text-lg tracking-wider text-rpg-gold-light">RECOMPENSA DESBLOQUEADA</p>
            <p className="text-sm text-rpg-text">
              {reward.icon} {reward.name}
            </p>
            {newBalance != null && (
              <p className="inline-flex items-center gap-1 text-xs text-rpg-muted">
                <Coins size={12} aria-hidden /> Saldo: {newBalance} moedas
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
