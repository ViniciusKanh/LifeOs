import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Circle, Coins, Flame, MoreHorizontal, ScrollText, Search, Sparkles } from "lucide-react";
import { RPGBadge, RPGPanel, RPGTabs } from "@/components/rpg";
import { useGamificationRules } from "@/hooks/useGamification";
import type { Habit, HabitSummary } from "@/types";

const FREQUENCY_LABEL: Record<Habit["frequency"], string> = {
  daily: "Diário",
  specific_days: "Dias específicos",
  times_per_week: "Vezes por semana",
  weekly: "Semanal",
  monthly: "Mensal",
};

type FreqFilter = "all" | Habit["frequency"];
type SortKey = "relevance" | "streak_desc" | "streak_asc" | "pending" | "done";

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "streak_desc", label: "Maior sequência" },
  { value: "streak_asc", label: "Menor sequência" },
  { value: "pending", label: "Pendentes primeiro" },
  { value: "done", label: "Concluídos primeiro" },
];

type Item = { habit: Habit; summary: HabitSummary | undefined; checkedInToday: boolean; atRisk: boolean };

/**
 * "Contratos de hoje": visão gamificada dos hábitos reais (sem tabela nova).
 * Cumprir = o mesmo check-in de Hábitos; a recompensa exibida vem das regras
 * públicas do backend e só é concedida lá, depois de persistir.
 */
export function RpgContractsPanel({
  items,
  today,
  onFulfill,
  onEdit,
  pendingId,
}: {
  items: Item[];
  today: string;
  onFulfill: (habit: Habit) => void;
  onEdit?: (habit: Habit) => void;
  pendingId: string | null;
}) {
  const reduce = useReducedMotion();
  const { data: rules } = useGamificationRules();
  const [freq, setFreq] = useState<FreqFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");

  // Só mostra as frequências que de fato existem entre os hábitos.
  const freqTabs = useMemo(() => {
    const present = new Set(items.map((i) => i.habit.frequency));
    return [{ value: "all" as FreqFilter, label: "Todos" }, ...(Object.keys(FREQUENCY_LABEL) as Habit["frequency"][]).filter((f) => present.has(f)).map((f) => ({ value: f as FreqFilter, label: FREQUENCY_LABEL[f] }))];
  }, [items]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = items.filter((i) => (freq === "all" || i.habit.frequency === freq) && (!term || `${i.habit.name} ${i.habit.category ?? ""}`.toLowerCase().includes(term)));
    const streak = (i: Item) => i.summary?.currentStreak ?? 0;
    const sorted = [...list];
    if (sort === "streak_desc") sorted.sort((a, b) => streak(b) - streak(a));
    else if (sort === "streak_asc") sorted.sort((a, b) => streak(a) - streak(b));
    else if (sort === "pending") sorted.sort((a, b) => Number(a.checkedInToday) - Number(b.checkedInToday));
    else if (sort === "done") sorted.sort((a, b) => Number(b.checkedInToday) - Number(a.checkedInToday));
    // Relevância: em risco primeiro, depois pendentes, depois maior sequência.
    else sorted.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || Number(a.checkedInToday) - Number(b.checkedInToday) || streak(b) - streak(a));
    return sorted;
  }, [items, freq, q, sort]);

  const done = items.filter((i) => i.checkedInToday).length;
  const field = "w-full pl-8 pr-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

  return (
    <RPGPanel title="Contratos de hoje" icon={<ScrollText size={16} />} actions={<span className="font-pixel text-xs text-rpg-muted">{done}/{items.length} cumpridos</span>}>
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">Honre seus contratos diários e fortaleça a sua jornada.</p>
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-4">
        <RPGTabs label="Frequência" size="sm" tabs={freqTabs} value={freq} onChange={setFreq} />
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Buscar contratos</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contratos…" className={field} style={{ borderRadius: 3 }} />
        </label>
        <label className="shrink-0">
          <span className="sr-only">Ordenar</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none" style={{ borderRadius: 3 }}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-rpg-muted py-6 text-center">Nenhum contrato com esses filtros.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ habit, summary, checkedInToday, atRisk }) => (
            <li key={habit.id} className={`relative rpg-panel p-3 flex flex-col gap-2.5 ${checkedInToday ? "rpg-panel-success" : atRisk ? "rpg-panel-danger" : "rpg-panel-gold"}`}>
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-12 h-12 shrink-0 flex items-center justify-center text-2xl border-2 border-rpg-bronze bg-rpg-bg-2" style={{ borderRadius: 3 }} aria-hidden>
                  {habit.icon || "📜"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-rpg font-bold text-rpg-text leading-tight break-words">{habit.name}</p>
                  <p className="text-[11px] text-rpg-muted">
                    {FREQUENCY_LABEL[habit.frequency]} · {habit.category?.trim() || "Geral"}
                  </p>
                  {habit.target_count > 1 && <p className="text-[11px] text-rpg-text/80 mt-0.5">Meta: {habit.target_count}× no dia</p>}
                </div>
                {onEdit && (
                  <button type="button" onClick={() => onEdit(habit)} className="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center text-rpg-muted hover:text-rpg-gold-light" aria-label={`Editar contrato ${habit.name}`}>
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                <RPGBadge tone="orange" icon={<Flame size={10} aria-hidden />}>
                  {summary?.currentStreak ?? 0} {(summary?.currentStreak ?? 0) === 1 ? "dia" : "dias"}
                </RPGBadge>
                {rules && (
                  <>
                    <RPGBadge tone="purple" icon={<Sparkles size={10} aria-hidden />}>+{rules.habit.xp} XP</RPGBadge>
                    <RPGBadge tone="gold" icon={<Coins size={10} aria-hidden />}>+{rules.habit.coins}</RPGBadge>
                  </>
                )}
                <span className="ml-auto">
                  {checkedInToday ? (
                    <motion.span
                      initial={reduce ? false : { scale: 1.8, rotate: -12, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 18 }}
                      className="inline-flex items-center gap-1.5 border-2 border-rpg-green bg-rpg-green/10 px-2 py-1 font-pixel text-[11px] text-rpg-green"
                      style={{ borderRadius: 3 }}
                      role="status"
                    >
                      <CheckCircle2 size={13} aria-hidden /> CUMPRIDO HOJE
                    </motion.span>
                  ) : (
                    <button
                      type="button"
                      disabled={pendingId === habit.id}
                      onClick={() => onFulfill(habit)}
                      aria-label={`Marcar contrato ${habit.name} como cumprido hoje (${today})`}
                      className="inline-flex items-center gap-1.5 border-2 border-rpg-border hover:border-rpg-gold bg-rpg-bg-2 px-2 py-1 font-pixel text-[11px] text-rpg-text disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
                      style={{ borderRadius: 3 }}
                    >
                      <Circle size={13} aria-hidden /> {pendingId === habit.id ? "REGISTRANDO…" : "MARCAR COMO CUMPRIDO"}
                    </button>
                  )}
                </span>
              </div>
              {atRisk && !checkedInToday && <p className="text-[11px] text-rpg-red">Sequência em risco — cumpra hoje para manter.</p>}
            </li>
          ))}
        </ul>
      )}
    </RPGPanel>
  );
}
