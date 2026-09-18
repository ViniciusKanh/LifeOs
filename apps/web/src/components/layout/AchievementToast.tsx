import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { ACHIEVEMENT_UNLOCKED_EVENT } from "@/services/achievementsService";
import { TIER_EMOJI, TIER_GLOW, TIER_LABEL, TIER_MEDAL_GRADIENT } from "@/components/achievements/tierDisplay";
import type { Achievement, AchievementTier, CustomAchievement } from "@/types";

type UnlockedItem = Achievement | CustomAchievement;

/** Troféus customizados não têm tier — tratamos como um "bronze" visual neutro. */
function tierOf(item: UnlockedItem): AchievementTier {
  return "tier" in item ? item.tier : "bronze";
}

/**
 * Comemoração global de conquista destravada — escuta o evento
 * disparado por `triggerAchievementsCheck()` (ver achievementsService)
 * de qualquer tela do app e mostra um popup por alguns segundos, no
 * estilo de troféu de PlayStation/Xbox: medalhão grande, raridade e
 * descrição em destaque. Montado uma única vez no AppShell, então
 * funciona não importa onde a ação que destravou a conquista aconteceu
 * (concluir tarefa, marcar hábito, terminar livro...).
 */
export function AchievementToast() {
  const [queue, setQueue] = useState<UnlockedItem[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onUnlocked(e: Event) {
      const detail = (e as CustomEvent<UnlockedItem[]>).detail;
      if (detail?.length) setQueue((prev) => [...prev, ...detail]);
    }
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
  }, []);

  const current = queue[0];

  // Pequeno atraso de entrada — dá tempo do popup "aparecer" com a animação em vez de já nascer visível.
  useEffect(() => {
    if (!current) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5200);
    const dequeue = setTimeout(() => setQueue((prev) => prev.slice(1)), 5600);
    return () => {
      clearTimeout(timer);
      clearTimeout(dequeue);
    };
  }, [current]);

  if (!current) return null;

  const tier = tierOf(current);
  const isCustom = !("tier" in current);

  return (
    <div
      className={`fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 max-w-sm transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
    >
      <div
        key={current.id}
        className={`relative overflow-hidden rounded-2xl border bg-paper-raised dark:bg-ink-raised p-4 flex items-start gap-3 animate-trophy-in ${TIER_GLOW[tier]}`}
        style={{ borderColor: "transparent" }}
      >
        {/* faixa de brilho que "varre" o card uma vez, como o efeito de raridade dos consoles */}
        <span className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] animate-trophy-shine`} />
        <span className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${TIER_MEDAL_GRADIENT[tier]} opacity-20 blur-2xl`} />

        <span
          className={`relative shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${TIER_MEDAL_GRADIENT[tier]} flex items-center justify-center text-white ${TIER_GLOW[tier]}`}
        >
          {isCustom && "icon" in current ? (
            <span className="text-xl leading-none">{(current as CustomAchievement).icon}</span>
          ) : (
            <Trophy size={20} />
          )}
        </span>

        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold text-brand-700 dark:text-brand-100 uppercase tracking-wider">Troféu desbloqueado</p>
            {!isCustom && (
              <span className="text-[10px] font-semibold text-slate">
                {TIER_EMOJI[tier]} {TIER_LABEL[tier]}
              </span>
            )}
          </div>
          <p className="text-sm font-display font-bold mt-0.5 truncate">{current.title}</p>
          {current.description && <p className="text-xs text-slate mt-0.5 line-clamp-2">{current.description}</p>}
        </div>

        <button onClick={() => setQueue((prev) => prev.slice(1))} className="relative text-slate shrink-0" aria-label="Fechar">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
