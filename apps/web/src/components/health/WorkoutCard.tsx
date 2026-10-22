import { useMemo, useState } from "react";
import { ChevronDown, Dumbbell, Edit2, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Card } from "@/components/ui/primitives";
import type { Workout } from "@/types";
import type { WorkoutInput } from "@/services/healthService";
import { sortWorkoutsDesc, weeklyWorkoutSummary, workoutCategoryOf } from "@/utils/workoutStats";
import { HealthCardHeader } from "./HealthCards";
import { WorkoutForm } from "./WorkoutForm";
import { describeSet, describeWorkout, workoutTypeMeta } from "./workoutCatalog";
import { defaultEntryDateTimeLocal, fmtDateTime, formatHM } from "./healthUtils";
import type { HealthEditTarget } from "./HealthHistoryModal";

/**
 * Card de Exercícios: resumo da semana do dia selecionado (sessões, minutos
 * por tipo, dias ativos — tudo calculado dos registros reais), formulário que
 * se adapta ao tipo e histórico legível com edição/exclusão.
 */
export function WorkoutCard({
  workouts,
  weekStart,
  selectedDate,
  onAddWorkout,
  onDelete,
  onEdit,
  onOpenHistory,
}: {
  workouts: Workout[];
  weekStart: Date;
  selectedDate: string;
  onAddWorkout: (input: WorkoutInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (target: HealthEditTarget) => void;
  onOpenHistory: () => void;
}) {
  const summary = useMemo(() => weeklyWorkoutSummary(workouts, weekStart), [workouts, weekStart]);
  const recent = useMemo(() => sortWorkoutsDesc(workouts).slice(0, 5), [workouts]);
  const defaultWhen = useMemo(() => defaultEntryDateTimeLocal(selectedDate), [selectedDate]);
  const maxMinutes = Math.max(1, ...summary.byCategory.map((c) => c.minutes));

  return (
    <Card className="p-5 md:p-6">
      <HealthCardHeader tone="green" icon={<Dumbbell size={16} />} title="Exercícios" subtitle="Academia, luta, cardio — cada treino conta." onOpenHistory={onOpenHistory} />

      {/* Resumo da semana — calculado só dos registros (nada estimado). */}
      <section aria-label="Resumo da semana" className="mb-4 rounded-xl border border-growth/20 bg-growth/5 p-3 rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-border rpg:bg-rpg-bg/60">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-growth rpg:font-pixel rpg:text-rpg-gold-light">Diário de treinos · semana</p>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <SummaryStat label="Sessões" value={String(summary.sessions)} />
          <SummaryStat label="Tempo" value={summary.minutes ? formatHM(summary.minutes) : "0min"} />
          <SummaryStat label="Dias ativos" value={`${summary.activeDays}/7`} />
        </dl>
        {summary.avgRpe !== null && <p className="mt-2 text-center text-[11px] text-slate">Esforço médio (RPE): {summary.avgRpe.toFixed(1)}/10</p>}

        {summary.byCategory.length === 0 ? (
          <p className="mt-3 text-center text-xs text-slate">Nenhum treino nesta semana ainda.</p>
        ) : (
          <ul className="mt-3 space-y-1.5" aria-label="Minutos por tipo">
            {summary.byCategory.map((row) => {
              const meta = workoutTypeMeta(row.category);
              const Icon = meta.icon;
              return (
                <li key={row.category} className="grid grid-cols-[18px_minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                  <Icon size={14} className="text-growth rpg:text-rpg-green" aria-hidden />
                  <span className="truncate">{meta.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-paper-border dark:bg-ink-border rpg:rounded-none rpg:bg-rpg-bg rpg:ring-1 rpg:ring-rpg-border" aria-hidden>
                    <span className="block h-full rounded-full bg-growth rpg:rounded-none rpg:bg-rpg-green" style={{ width: `${Math.round((row.minutes / maxMinutes) * 100)}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-slate">
                    {row.minutes} min · {row.sessions}x
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details open className="group mb-1">
        <summary className="mb-3 flex cursor-pointer list-none items-center justify-between text-xs font-semibold rpg:font-pixel rpg:uppercase rpg:tracking-wide rpg:text-rpg-gold-light">
          Registrar treino
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <WorkoutForm defaultWhen={defaultWhen} selectedDate={selectedDate} submitLabel="Registrar treino" onSubmit={onAddWorkout} />
      </details>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold">Últimos treinos</p>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-paper-border px-3 py-4 text-xs text-slate dark:border-ink-border rpg:rounded-[3px]">Nenhum exercício registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((w) => (
              <WorkoutHistoryItem key={w.id} workout={w} onEdit={() => onEdit({ kind: "workouts", entry: w })} onDelete={() => onDelete(w.id)} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper-raised/70 px-1 py-1.5 dark:bg-ink-raised/60 rpg:rounded-[2px] rpg:bg-rpg-panel">
      <dt className="text-[10px] text-slate">{label}</dt>
      <dd className="font-display text-lg font-bold leading-tight rpg:font-pixel rpg:text-rpg-text">{value}</dd>
    </div>
  );
}

/** Item do histórico: ícone do tipo, título, detalhes e (musculação) lista de séries expansível. */
export function WorkoutHistoryItem({ workout, onEdit, onDelete }: { workout: Workout; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = workoutTypeMeta(workoutCategoryOf(workout));
  const Icon = meta.icon;
  const { title, details } = describeWorkout(workout);
  const sets = workout.sets ?? [];

  return (
    <li className="rounded-xl border border-paper-border px-3 py-2 dark:border-ink-border rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg/40">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-growth/10 text-growth rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-border rpg:bg-rpg-bg rpg:text-rpg-green"
          aria-hidden
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-slate">
            {fmtDateTime(workout.performed_at)}
            {details.length > 0 && ` · ${details.join(" · ")}`}
          </p>
          {workout.notes && <p className="mt-0.5 line-clamp-2 text-[11px] italic text-slate">{workout.notes}</p>}
          {sets.length > 0 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400 rpg:text-rpg-gold-light" aria-expanded={expanded}>
              {expanded ? "Ocultar exercícios" : "Ver exercícios"}
            </button>
          )}
          {expanded && (
            <ul className="mt-1.5 space-y-0.5 border-l-2 border-growth/30 pl-2 text-[11px] rpg:border-rpg-border">
              {sets.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="truncate">{s.exercise}</span>
                  <span className="shrink-0 text-slate">{describeSet(s)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-0.5">
          <button onClick={onEdit} className={clsx(iconBtn, "hover:text-brand-600")} aria-label={`Editar ${title}`} title="Editar">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className={clsx(iconBtn, "hover:text-drop")} aria-label={`Excluir ${title}`} title="Excluir">
            <Trash2 size={14} />
          </button>
        </span>
      </div>
    </li>
  );
}

const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate transition-colors";
