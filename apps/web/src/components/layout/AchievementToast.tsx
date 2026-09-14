import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { ACHIEVEMENT_UNLOCKED_EVENT } from "@/services/achievementsService";
import type { Achievement, CustomAchievement } from "@/types";

type UnlockedItem = Achievement | CustomAchievement;

/**
 * Comemoração global de conquista destravada — escuta o evento
 * disparado por `triggerAchievementsCheck()` (ver achievementsService)
 * de qualquer tela do app e mostra um toast por alguns segundos.
 * Montado uma única vez no AppShell, então funciona não importa onde
 * a ação que destravou a conquista aconteceu (concluir tarefa, marcar
 * hábito, terminar livro...).
 */
export function AchievementToast() {
  const [queue, setQueue] = useState<UnlockedItem[]>([]);

  useEffect(() => {
    function onUnlocked(e: Event) {
      const detail = (e as CustomEvent<UnlockedItem[]>).detail;
      if (detail?.length) setQueue((prev) => [...prev, ...detail]);
    }
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setQueue((prev) => prev.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 max-w-xs transition-all">
      <div className="rounded-2xl border border-brand-500/30 bg-paper-raised dark:bg-ink-raised shadow-glow-brand p-4 flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-signal flex items-center justify-center text-white">
          <Trophy size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-100 uppercase tracking-wide">Conquista destravada</p>
          <p className="text-sm font-semibold mt-0.5 truncate">{current.title}</p>
          {current.description && <p className="text-xs text-slate mt-0.5">{current.description}</p>}
        </div>
        <button onClick={() => setQueue((prev) => prev.slice(1))} className="text-slate shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
