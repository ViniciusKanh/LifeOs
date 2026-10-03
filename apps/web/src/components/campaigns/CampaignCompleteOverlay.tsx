import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";

/**
 * Overlay curto de "Campanha concluída" com a recompensa REAL devolvida
 * pelo backend. Respeita reduzir movimento e a preferência de animações.
 */
export function CampaignCompleteOverlay({ data, onClose }: { data: { title: string; reward: { xp: number; coins: number } | null } | null; onClose: () => void }) {
  const systemReduce = useReducedMotion();
  const { prefs } = useRpgPreferences();
  const reduce = systemReduce || prefs.animations !== "full";
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(t);
  }, [data, onClose]);
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-rpg-bg/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="status"
          aria-live="polite"
        >
          <motion.div
            className="rpg-panel rpg-panel-gold w-full max-w-sm p-6 text-center"
            initial={reduce ? false : { scale: 0.85, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <p className="font-pixel text-sm uppercase tracking-widest text-rpg-gold">⚔️ Campanha concluída</p>
            <p className="mt-2 rpg-title text-2xl font-bold">{data.title}</p>
            <p className="mt-1 font-pixel text-3xl text-rpg-green">100%</p>
            {data.reward ? (
              <p className="mt-3 font-pixel text-lg text-rpg-gold-light">+{data.reward.xp} XP · +{data.reward.coins} 🪙</p>
            ) : (
              <p className="mt-3 text-xs text-rpg-muted">A recompensa de conclusão exige alguns dias de jornada desde o início — esta campanha foi encerrada sem baú.</p>
            )}
            <p className="mt-4 text-[11px] text-rpg-muted">Toque para fechar</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
