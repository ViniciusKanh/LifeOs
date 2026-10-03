import { motion, useReducedMotion } from "motion/react";
import { Coins, Flame, ScrollText, Sparkles } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { useGamificationRules } from "@/hooks/useGamification";
import type { Habit, HabitSummary } from "@/types";

const FREQUENCY_LABEL: Record<Habit["frequency"], string> = {
  daily: "Diário",
  specific_days: "Dias específicos",
  times_per_week: "Vezes por semana",
  weekly: "Semanal",
  monthly: "Mensal",
};

/**
 * "Contratos": visão gamificada dos hábitos reais (sem tabela nova).
 * Cumprir = o mesmo check-in de Hábitos; a recompensa exibida vem das
 * regras públicas do backend e só é concedida lá, depois de persistir.
 */
export function RpgContractsPanel({
  items,
  today,
  onFulfill,
  pendingId,
}: {
  items: Array<{ habit: Habit; summary: HabitSummary | undefined; checkedInToday: boolean; atRisk: boolean }>;
  today: string;
  onFulfill: (habit: Habit) => void;
  pendingId: string | null;
}) {
  const reduce = useReducedMotion();
  const { data: rules } = useGamificationRules();
  const done = items.filter((i) => i.checkedInToday).length;

  return (
    <RPGPanel
      title="Contratos de hoje"
      icon={<ScrollText size={16} />}
      actions={
        <span className="font-pixel text-xs text-rpg-muted">
          {done}/{items.length} cumpridos
        </span>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ habit, summary, checkedInToday, atRisk }) => (
          <li key={habit.id} className={`relative rpg-panel p-3 flex flex-col gap-2 ${checkedInToday ? "rpg-panel-success" : atRisk ? "rpg-panel-danger" : ""}`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-10 h-10 shrink-0 flex items-center justify-center text-xl border-2 border-rpg-bronze bg-rpg-bg-2" style={{ borderRadius: 3 }} aria-hidden>
                {habit.icon || "📜"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-rpg font-semibold text-rpg-text leading-tight truncate">{habit.name}</p>
                <p className="text-[11px] text-rpg-muted">
                  {FREQUENCY_LABEL[habit.frequency]}
                  {habit.target_count > 1 && ` · meta ${habit.target_count}× no dia`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <RPGBadge tone="orange" icon={<Flame size={10} aria-hidden />}>
                {summary?.currentStreak ?? 0} {(summary?.currentStreak ?? 0) === 1 ? "dia" : "dias"}
              </RPGBadge>
              {rules && (
                <>
                  <RPGBadge tone="purple" icon={<Sparkles size={10} aria-hidden />}>
                    +{rules.habit.xp} XP
                  </RPGBadge>
                  <RPGBadge tone="gold" icon={<Coins size={10} aria-hidden />}>
                    +{rules.habit.coins}
                  </RPGBadge>
                </>
              )}
              {atRisk && <RPGBadge tone="red">Sequência em risco</RPGBadge>}
            </div>
            {checkedInToday ? (
              <motion.p
                initial={reduce ? false : { scale: 1.8, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -4, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
                className="self-start border-2 border-rpg-green px-2 py-0.5 font-pixel text-xs text-rpg-green"
                style={{ borderRadius: 3 }}
              >
                CUMPRIDO HOJE
              </motion.p>
            ) : (
              <RPGButton
                variant="success"
                className="self-start"
                disabled={pendingId === habit.id}
                onClick={() => onFulfill(habit)}
                aria-label={`Cumprir contrato ${habit.name} hoje (${today})`}
              >
                {pendingId === habit.id ? "Registrando…" : "Cumprir contrato"}
              </RPGButton>
            )}
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}
