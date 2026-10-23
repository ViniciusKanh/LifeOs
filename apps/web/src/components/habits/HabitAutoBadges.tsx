import { Link2, Zap } from "lucide-react";
import type { HabitAutoSourceInfo, HabitWithAuto } from "@/services/habitService";

/**
 * Selos de hábito automático ("marca sozinho quando...") e de encadeamento
 * ("depois de X"). Funciona nos dois temas (variante `rpg:`).
 */
export function HabitAutoBadges({
  habit,
  namesById,
  sources,
  compact = false,
}: {
  habit: HabitWithAuto;
  namesById: Map<string, string>;
  sources: HabitAutoSourceInfo[];
  compact?: boolean;
}) {
  const source = habit.auto_source ? sources.find((s) => s.key === habit.auto_source) : undefined;
  const afterName = habit.after_habit_id ? namesById.get(habit.after_habit_id) : undefined;
  if (!habit.auto_source && !afterName) return null;

  const threshold =
    habit.auto_source && habit.auto_threshold != null && source?.unit ? ` · mín. ${Number(habit.auto_threshold).toLocaleString("pt-BR")} ${source.unit}` : "";
  const base =
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold max-w-full rpg:rounded-[2px] rpg:border rpg:font-pixel";

  return (
    <span className={`flex flex-wrap items-center gap-1 ${compact ? "" : "mt-0.5"}`}>
      {habit.auto_source && (
        <span
          className={`${base} bg-cat-purple/10 text-cat-purple rpg:border-rpg-purple rpg:bg-rpg-purple/10 rpg:text-rpg-purple`}
          title={source ? `Marcado automaticamente ao ${source.label.toLowerCase()}${threshold}` : "Marcado automaticamente"}
        >
          <Zap size={10} aria-hidden />
          <span className="truncate">Automático{source ? `: ${source.label.toLowerCase()}${threshold}` : ""}</span>
        </span>
      )}
      {afterName && (
        <span className={`${base} bg-cat-blue/10 text-cat-blue rpg:border-rpg-border rpg:bg-rpg-bg-2 rpg:text-rpg-text`} title={`Encadeado: faça depois de “${afterName}”`}>
          <Link2 size={10} aria-hidden />
          <span className="truncate">depois de {afterName}</span>
        </span>
      )}
    </span>
  );
}
