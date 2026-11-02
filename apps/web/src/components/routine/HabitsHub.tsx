import { useMemo, useState } from "react";
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarDays, Check, Clock, Flame, FlaskConical, Gift, Lock, Pause, Pencil, Play, Plus, Settings2, Sparkles, Star, Target, TrendingUp, Trash2, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection, MODULE_ART } from "@/components/rpg-modules/ModuleKit";
import { useExperiments } from "@/hooks/useExperiments";
import { useHabitsDay, useRoutineActions } from "@/hooks/useRoutineHubs";
import type { HabitFrequency, HabitMetaInput, HabitsHub, HubHabit } from "@/services/routineHubService";
import { FIELD, HeatGrid, ProgressRing, R, WEEKDAYS, fmtDay, nf } from "./RoutineShared";

const ART = `${MODULE_ART}/habits`;
export const FREQ_LABEL: Record<HabitFrequency, string> = { daily: "Diário", specific_days: "Dias específicos", times_per_week: "Vezes por semana", weekly: "Semanal", monthly: "Mensal" };

export function HabitsIndicators({ hub }: { hub: HabitsHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      <IndicatorCard icon={<Flame size={22} />} label="Sequência atual" value={`${i.currentStreak} dias`} tone="red" />
      <IndicatorCard icon={<Target size={22} />} label="Cumpridos hoje" value={`${i.doneToday}/${i.scheduledToday}`} hint="previstos hoje" tone="blue" />
      <IndicatorCard icon={<Zap size={22} />} label="Hábitos ativos" value={i.active} hint={i.paused ? `${i.paused} pausado(s)` : undefined} tone="purple" />
      <IndicatorCard
        icon={<TrendingUp size={22} />}
        label="Consistência 30d"
        value={i.consistency30 == null ? "—" : `${i.consistency30}%`}
        hint={i.consistencyDeltaPts == null ? "só dias previstos" : `${i.consistencyDeltaPts >= 0 ? "+" : ""}${i.consistencyDeltaPts} pts vs. antes`}
        tone="green"
      />
      <IndicatorCard icon={<Star size={22} />} label="Melhor sequência" value={`${i.bestStreak} dias`} tone="gold" />
      <IndicatorCard icon={<Sparkles size={22} />} label="XP de disciplina" value={`+${nf(i.xpToday)}`} hint={`hoje · ${nf(i.xp30)} em 30d`} tone="purple" />
      <IndicatorCard icon={<CalendarDays size={22} />} label="Semana" value={i.week.pct == null ? "—" : `${i.week.pct}%`} hint={`${i.week.fulfilled}/${i.week.expected} ocorrências`} tone="orange" />
    </div>
  );
}

/** Ritual de Hoje: o que está previsto hoje (diários + ciclos em aberto), conclusão rápida e próxima recompensa. */
export function RitualPanel({ hub, onCheck, busyId }: { hub: HabitsHub; onCheck: (h: { id: string; target: number; count: number }, full: boolean) => void; busyId: string | null }) {
  const r = hub.ritual;
  return (
    <section className="rpg-panel rpg-panel-gold grid items-center gap-3 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,260px)]" aria-label="Ritual de hoje">
      <div className="flex items-center gap-3">
        <img src={`${ART}/fire.webp`} alt="" aria-hidden className="pixelated hidden h-24 w-auto sm:block" />
        <ProgressRing value={r.done} max={Math.max(1, r.total)} label="Hábitos concluídos hoje">
          <span className="font-rpg text-2xl font-bold text-rpg-green tabular-nums">
            {r.done}/{r.total}
          </span>
          <span className="font-pixel text-[9px] uppercase text-rpg-muted">hoje</span>
        </ProgressRing>
      </div>
      <div className="min-w-0">
        <p className="rpg-title text-lg font-bold">Ritual de hoje</p>
        {r.total === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhum hábito previsto para hoje — dia livre pela sua agenda de hábitos.</p>
        ) : (
          <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {r.items.map((it) => (
              <li key={it.id} className={clsx("flex items-center gap-2 border px-2 py-1.5", it.done ? "border-rpg-green/60 bg-rpg-green/10" : "border-rpg-border bg-rpg-bg-2/60")} style={R}>
                <span aria-hidden>{it.icon ?? "🔁"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{it.name}</span>
                <span className="shrink-0 font-pixel text-[10px] text-rpg-muted tabular-nums">
                  {it.count}/{it.target}
                  {it.unit ? ` ${it.unit}` : ""}
                </span>
                {it.done ? (
                  <Check size={16} className="text-rpg-green" aria-label="Cumprido" />
                ) : (
                  <button type="button" disabled={busyId === it.id} onClick={() => onCheck({ id: it.id, target: it.target, count: it.count }, true)} className="flex h-9 min-w-9 items-center justify-center border border-rpg-green/60 px-2 text-xs text-rpg-green hover:bg-rpg-green/15" style={R} aria-label={`Concluir ${it.name}`}>
                    <Check size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-rpg-border/60 pt-2 md:border-l md:border-t-0 md:pl-3 md:pt-0">
        <img src={`${ART}/chest.webp`} alt="" aria-hidden className="pixelated h-14 w-14 shrink-0" />
        {r.nextReward ? (
          <div className="min-w-0">
            <p className="font-pixel text-[10px] uppercase text-rpg-gold">Próxima recompensa</p>
            <p className="text-sm text-rpg-text">
              {r.nextReward.days} dias de “{r.nextReward.habitName}”
            </p>
            <p className="text-[11px] text-rpg-muted">
              faltam {r.nextReward.missing} · <span className="text-rpg-purple">+{r.nextReward.xp} XP</span> <span className="text-rpg-gold-light">+{r.nextReward.coins} 🪙</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-rpg-muted">Marcos de sequência valem para hábitos diários ativos.</p>
        )}
      </div>
    </section>
  );
}

/** Recompensas de sequência — catálogo oficial (habitStreakMilestones), pagas uma vez por hábito e marco. */
export function StreakRewards({ hub }: { hub: HabitsHub }) {
  return (
    <KitSection title="Recompensas da sequência" icon={<Gift size={16} />} tone="gold">
      <ol className="flex items-start gap-1 overflow-x-auto pb-1">
        {hub.milestones.map((m, i) => (
          <li key={m.days} className="flex shrink-0 items-center gap-1">
            <div className={clsx("flex w-16 flex-col items-center gap-0.5 text-center", !m.reached && "opacity-70")}>
              <span className={clsx("flex h-9 w-9 items-center justify-center border-2", m.reached ? "border-rpg-green bg-rpg-green/20 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 999 }}>
                {m.reached ? <Check size={16} aria-hidden /> : <Lock size={13} aria-hidden />}
              </span>
              <span className="font-pixel text-[10px] text-rpg-text">{m.days} dias</span>
              <span className="text-[9px] text-rpg-purple">+{m.xp} XP</span>
              {m.claimedCount > 0 && <span className="text-[9px] text-rpg-green">{m.claimedCount}× recebido</span>}
            </div>
            {i < hub.milestones.length - 1 && <span className="mt-[-28px] h-0.5 w-3 bg-rpg-border" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-[10px] text-rpg-muted">Pausas não quebram a sequência e quebrar a sequência não tira XP. Cada marco é pago uma única vez por hábito.</p>
    </KitSection>
  );
}

export function ConsistencyCalendar({ hub }: { hub: HabitsHub }) {
  const [selected, setSelected] = useState<string | null>(null);
  const day = useHabitsDay(selected);
  const past = hub.calendar.filter((c) => !c.future && c.scheduled > 0);
  const pct = past.length ? Math.round((past.reduce((s, c) => s + Math.min(c.done, c.scheduled), 0) / past.reduce((s, c) => s + c.scheduled, 0)) * 100) : null;
  return (
    <KitSection title="Calendário de consistência" icon={<CalendarDays size={16} />} action={<span className="font-pixel text-[10px] text-rpg-green">{pct == null ? "—" : `${pct}%`} (6 semanas)</span>}>
      <HeatGrid
        cells={hub.calendar}
        selected={selected}
        onSelect={setSelected}
        level={(c) => (c.scheduled === 0 ? (c.paused ? -1 : c.done > 0 ? 1 : 0) : c.done >= c.scheduled ? 3 : c.done > 0 ? 2 : 0)}
        title={(c) => `${fmtDay(c.day)}: ${c.done} cumprido(s)${c.scheduled ? ` de ${c.scheduled} previsto(s)` : ""}${c.paused ? ` · ${c.paused} pausado(s)` : ""}`}
      />
      <p className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-rpg-muted">
        <span>■ verde = cumprido</span>
        <span className="text-rpg-blue">■ azul = pausa</span>
        <span>□ tracejado = futuro</span>
      </p>
      {selected && (
        <div className="mt-2 border-t border-rpg-border/60 pt-2">
          <p className="mb-1 text-xs font-semibold text-rpg-text">{fmtDay(selected)}</p>
          {day.isLoading ? (
            <div className="h-10 animate-pulse rpg-bar" />
          ) : (day.data ?? []).length === 0 ? (
            <p className="text-xs text-rpg-muted">Nenhum hábito previsto ou registrado.</p>
          ) : (
            <ul className="space-y-0.5">
              {(day.data ?? []).map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-xs">
                  <span aria-hidden>{h.icon ?? "🔁"}</span>
                  <span className="min-w-0 flex-1 truncate text-rpg-text">{h.name}</span>
                  <span className={h.done ? "text-rpg-green" : "text-rpg-muted"}>{h.done ? "cumprido" : h.cycle ? "ciclo" : h.scheduled ? "pendente" : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </KitSection>
  );
}

/** Cartões de hábitos com ações reais (concluir, parcial, configurar, pausar, editar, excluir). */
export function HabitCardsGrid({
  hub,
  onCheck,
  onEdit,
  onDelete,
  onSettings,
  busyId,
}: {
  hub: HabitsHub;
  onCheck: (h: { id: string; target: number; count: number }, full: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (h: HubHabit) => void;
  onSettings: (h: HubHabit) => void;
  busyId: string | null;
}) {
  const reduce = useReducedMotion();
  const { habitMeta } = useRoutineActions();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const cats = useMemo(() => [...new Set(hub.habits.map((h) => h.category).filter((c): c is string => !!c))], [hub.habits]);
  const list = hub.habits.filter((h) => (cat === "all" || h.category === cat) && (!q.trim() || h.name.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["all", ...cats].map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={clsx("min-h-[36px] shrink-0 border-2 px-3 text-xs", cat === c ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
              {c === "all" ? "Todos" : c}
            </button>
          ))}
        </div>
        <input aria-label="Buscar hábitos" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar hábitos…" className={clsx(FIELD, "sm:ml-auto sm:w-56")} style={R} />
      </div>
      <motion.ul layout={!reduce} className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {list.map((h) => {
          const pct = Math.min(100, Math.round((h.todayCount / h.target) * 100));
          return (
            <li key={h.id} className={clsx("rpg-panel flex flex-col gap-2 p-3", h.doneToday && "border-rpg-green/70", h.paused && "opacity-70")}>
              <div className="flex items-start gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg-2 text-xl" style={R} aria-hidden>
                  {h.icon ?? "🔁"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-rpg font-bold text-rpg-text">{h.name}</p>
                  <p className="text-[11px] text-rpg-muted">
                    {FREQ_LABEL[h.frequency]}
                    {h.frequency === "specific_days" && h.days.length ? ` (${h.days.map((d) => WEEKDAYS[d]).join(" ")})` : ""}
                    {h.frequency === "times_per_week" ? ` (${h.timesPerCycle}×)` : ""} · {h.category ?? "Sem categoria"}
                  </p>
                </div>
                {h.paused ? <RPGBadge tone="blue">Pausado</RPGBadge> : h.doneToday ? <RPGBadge tone="green">Hoje ✓</RPGBadge> : h.scheduledToday ? <RPGBadge tone="orange">Previsto</RPGBadge> : <RPGBadge tone="muted">Livre hoje</RPGBadge>}
              </div>
              <div className="flex flex-wrap gap-1">
                <RPGBadge tone="red">🔥 {h.streak} {h.cycle ? "ciclo(s)" : "dia(s)"}</RPGBadge>
                {h.priority && <RPGBadge tone={h.priority === "Alta" ? "red" : h.priority === "Média" ? "orange" : "muted"}>{h.priority}</RPGBadge>}
                {h.reminderTime && <RPGBadge tone="blue"><Clock size={10} aria-hidden /> {h.reminderTime}</RPGBadge>}
                {h.autoSource && <RPGBadge tone="purple">Automático</RPGBadge>}
                {h.experimentId && <RPGBadge tone="purple"><FlaskConical size={10} aria-hidden /> Experimento</RPGBadge>}
                <RPGBadge tone="muted">{h.consistency30.pct == null ? "—" : `${h.consistency30.pct}%`} em 30d</RPGBadge>
              </div>
              {h.cycle ? (
                <RPGProgressBar label={`Ciclo ${h.cycle.label}`} value={h.cycle.done} max={h.cycle.need} valueLabel={`${h.cycle.done}/${h.cycle.need} ${h.cycle.label}`} tone="green" />
              ) : (
                <RPGProgressBar label="Hoje" value={h.todayCount} max={h.target} valueLabel={`${h.todayCount}/${h.target}${h.unit ? ` ${h.unit}` : ""} · ${pct}%`} tone={h.doneToday ? "green" : "purple"} />
              )}
              <div className="flex flex-wrap gap-1.5">
                {!h.paused && !h.doneToday && (
                  <>
                    <RPGButton variant="success" className="min-h-[36px] px-2 text-xs" disabled={busyId === h.id} onClick={() => onCheck({ id: h.id, target: h.target, count: h.todayCount }, true)}>
                      <Check size={13} aria-hidden /> Concluir
                    </RPGButton>
                    {h.target > 1 && (
                      <RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" disabled={busyId === h.id} onClick={() => onCheck({ id: h.id, target: h.target, count: h.todayCount }, false)}>
                        <Plus size={13} aria-hidden /> +1{h.unit ? ` ${h.unit}` : ""}
                      </RPGButton>
                    )}
                  </>
                )}
                <RPGButton variant="ghost" className="min-h-[36px] px-2 text-xs" onClick={() => habitMeta.mutate({ id: h.id, input: { paused: !h.paused } })}>
                  {h.paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />} {h.paused ? "Retomar" : "Pausar"}
                </RPGButton>
                <RPGButton variant="ghost" className="min-h-[36px] px-2 text-xs" onClick={() => onSettings(h)} aria-label={`Frequência e lembrete de ${h.name}`}>
                  <Settings2 size={13} aria-hidden />
                </RPGButton>
                <RPGButton variant="ghost" className="min-h-[36px] px-2 text-xs" onClick={() => onEdit(h.id)} aria-label={`Editar ${h.name}`}>
                  <Pencil size={13} aria-hidden />
                </RPGButton>
                <RPGButton variant="ghost" className="min-h-[36px] px-2 text-xs text-rpg-red" onClick={() => onDelete(h)} aria-label={`Excluir ${h.name}`}>
                  <Trash2 size={13} aria-hidden />
                </RPGButton>
              </div>
            </li>
          );
        })}
      </motion.ul>
      {list.length === 0 && <p className="rpg-panel py-8 text-center text-sm text-rpg-muted">Nenhum hábito com esse filtro.</p>}
    </div>
  );
}

/** Frequência, unidade, prioridade, lembrete, pausa e vínculo com experimento. */
export function HabitSettingsModal({ habit, onClose, onSaved }: { habit: HubHabit | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const { habitMeta } = useRoutineActions();
  const { experiments } = useExperiments();
  const [form, setForm] = useState<HabitMetaInput>({});
  const v = { frequency: habit?.frequency, days: habit?.days ?? [], timesPerCycle: habit?.timesPerCycle ?? 1, unit: habit?.unit ?? "", priority: habit?.priority as HabitMetaInput["priority"], reminderTime: habit?.reminderTime ?? "", experimentId: habit?.experimentId ?? "", ...form };
  const set = (p: Partial<HabitMetaInput>) => setForm((f) => ({ ...f, ...p }));
  const save = () => {
    if (!habit) return;
    habitMeta.mutate(
      { id: habit.id, input: { ...form, unit: form.unit === "" ? null : form.unit, reminderTime: form.reminderTime === "" ? null : form.reminderTime, experimentId: form.experimentId === "" ? null : form.experimentId } },
      { onSuccess: () => (onSaved("Hábito atualizado."), setForm({}), onClose()), onError: (e) => onSaved(e instanceof Error ? e.message : "Não foi possível salvar.") },
    );
  };
  return (
    <Modal open={!!habit} onClose={() => (setForm({}), onClose())} title={habit ? `Configurar: ${habit.name}` : "Configurar"} size="sm">
      {habit && (
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-rpg-muted">Frequência</span>
            <select className={FIELD} style={R} value={v.frequency} onChange={(e) => set({ frequency: e.target.value as HabitFrequency })}>
              {(Object.keys(FREQ_LABEL) as HabitFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          {v.frequency === "specific_days" && (
            <fieldset>
              <legend className="text-xs text-rpg-muted">Dias da semana</legend>
              <div className="mt-1 flex gap-1">
                {WEEKDAYS.map((d, i) => {
                  const on = (v.days ?? []).includes(i);
                  return (
                    <button key={i} type="button" aria-pressed={on} onClick={() => set({ days: on ? (v.days ?? []).filter((x) => x !== i) : [...(v.days ?? []), i], timesPerCycle: v.timesPerCycle })} className={clsx("h-10 w-10 border-2 text-xs", on ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {v.frequency === "times_per_week" && (
            <label className="block">
              <span className="text-xs text-rpg-muted">Vezes por semana</span>
              <input type="number" min={1} max={7} className={FIELD} style={R} value={v.timesPerCycle} onChange={(e) => set({ timesPerCycle: Math.max(1, Math.min(7, Number(e.target.value) || 1)), days: v.days })} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-rpg-muted">Unidade (opcional)</span>
              <input className={FIELD} style={R} maxLength={20} placeholder="copos, min, páginas…" value={v.unit ?? ""} onChange={(e) => set({ unit: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Prioridade</span>
              <select className={FIELD} style={R} value={v.priority ?? ""} onChange={(e) => set({ priority: (e.target.value || null) as HabitMetaInput["priority"] })}>
                <option value="">Sem prioridade</option>
                <option>Baixa</option>
                <option>Média</option>
                <option>Alta</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Horário do lembrete</span>
              <input type="time" className={FIELD} style={R} value={v.reminderTime ?? ""} onChange={(e) => set({ reminderTime: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Experimento (Laboratório)</span>
              <select className={FIELD} style={R} value={v.experimentId ?? ""} onChange={(e) => set({ experimentId: e.target.value })}>
                <option value="">Nenhum</option>
                {experiments.filter((x) => x.status === "active" || x.id === habit.experimentId).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-rpg-muted">Mudar a frequência não apaga check-ins nem XP já recebido. Hábitos semanais/mensais são avaliados por ciclo, não por dia.</p>
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => (setForm({}), onClose())}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={save} disabled={habitMeta.isPending || !Object.keys(form).length}>
              Salvar
            </RPGButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Análise de sequência + planejamento com a Agenda (sugestões, nunca agendamento automático). */
export function HabitsAnalysis({ hub }: { hub: HabitsHub }) {
  const { habitsPlan } = useRoutineActions();
  const max = Math.max(1, ...hub.hoursUtc);
  const ranked = [...hub.habits].filter((h) => h.consistency30.expected > 0).sort((a, b) => (b.consistency30.pct ?? 0) - (a.consistency30.pct ?? 0));
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <KitSection title="Consistência por hábito (30 dias)" icon={<BarChart3 size={16} />}>
        {ranked.length === 0 ? (
          <p className="text-sm text-rpg-muted">Ainda sem ocorrências previstas suficientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {ranked.map((h) => (
              <li key={h.id}>
                <RPGProgressBar label={h.name} value={h.consistency30.pct ?? 0} max={100} valueLabel={`${h.consistency30.fulfilled}/${h.consistency30.expected} · ${h.consistency30.pct}%`} tone={(h.consistency30.pct ?? 0) >= 70 ? "green" : (h.consistency30.pct ?? 0) >= 40 ? "orange" : "red"} />
              </li>
            ))}
          </ul>
        )}
      </KitSection>
      <div className="space-y-3">
        <KitSection title="Horários dos registros" icon={<Clock size={16} />}>
          <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Quantidade de registros de hábito por hora do dia (UTC)">
            {hub.hoursUtc.map((v, h) => (
              <span key={h} className="flex-1 bg-rpg-purple/80" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`${h}h UTC: ${v}`} />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-rpg-muted">Hora da gravação do check-in (UTC). Registros automáticos ou retroativos distorcem esta leitura.</p>
        </KitSection>
        <KitSection title="Planejar hábitos pendentes" icon={<CalendarDays size={16} />} action={<RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={() => habitsPlan.mutate()} disabled={habitsPlan.isPending}>Sugerir horários</RPGButton>}>
          {!habitsPlan.data ? (
            <p className="text-sm text-rpg-muted">Procura janelas livres na Agenda de hoje. Nada é agendado automaticamente.</p>
          ) : habitsPlan.data.suggestions.length === 0 ? (
            <p className="text-sm text-rpg-muted">Nenhum hábito pendente hoje.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {habitsPlan.data.suggestions.map((s) => (
                <li key={s.habitId} className="flex justify-between gap-2">
                  <span className="text-rpg-text">{s.name}</span>
                  <span className="font-pixel text-[11px] text-rpg-gold">{s.at ?? "sem janela livre"}</span>
                </li>
              ))}
              <li className="text-[10px] text-rpg-muted">{habitsPlan.data.basis}</li>
            </ul>
          )}
        </KitSection>
      </div>
    </div>
  );
}

export const HABIT_MEDALS = [
  { code: "hab_first_flame", img: `${ART}/medal-1.webp`, fallbackTitle: "Primeira Chama" },
  { code: "streak_7", img: `${ART}/medal-1.webp`, fallbackTitle: "Disciplina de Sete Dias" },
  { code: "hab_ritual_7", img: `${ART}/medal-2.webp`, fallbackTitle: "Ritual Consistente" },
  { code: "hab_guardian_30", img: `${ART}/medal-3.webp`, fallbackTitle: "Guardião da Rotina" },
  { code: "hab_master_500", img: `${ART}/medal-3.webp`, fallbackTitle: "Mestre da Disciplina" },
];
