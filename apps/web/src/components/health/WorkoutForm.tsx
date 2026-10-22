import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { Button, Field } from "@/components/ui/primitives";
import type { Workout, WorkoutCategory, FightModality } from "@/types";
import type { WorkoutInput } from "@/services/healthService";
import { formatPace, paceMinPerKm, workoutCategoryOf } from "@/utils/workoutStats";
import { dateTimeLocalToIso, toDateTimeLocal, todayKey } from "@/utils/localDate";
import { FIGHT_MODALITIES, STRENGTH_SPLIT_SUGGESTIONS, WORKOUT_TYPES, rpeLabel, workoutTypeMeta } from "./workoutCatalog";

type SetRow = { exercise: string; sets: string; reps: string; loadKg: string };

interface FormState {
  category: WorkoutCategory;
  durationMinutes: string;
  rpe: number | null;
  modality: FightModality | "";
  rounds: string;
  roundMinutes: string;
  muscleGroups: string;
  sets: SetRow[];
  distanceKm: string;
  notes: string;
  performedAt: string;
}

const EMPTY_SET: SetRow = { exercise: "", sets: "", reps: "", loadKg: "" };

function numOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: string) {
  const t = value.trim();
  return t ? t : null;
}

function fromWorkout(w: Workout): FormState {
  return {
    category: workoutCategoryOf(w),
    durationMinutes: w.duration_minutes ? String(w.duration_minutes) : "",
    rpe: w.rpe ?? null,
    modality: w.modality ?? "",
    rounds: w.rounds ? String(w.rounds) : "",
    roundMinutes: w.round_minutes ? String(w.round_minutes) : "",
    muscleGroups: w.muscle_groups ?? "",
    sets: (w.sets ?? []).map((s) => ({
      exercise: s.exercise,
      sets: s.sets ? String(s.sets) : "",
      reps: s.reps ? String(s.reps) : "",
      loadKg: s.load_kg !== null ? String(s.load_kg) : "",
    })),
    distanceKm: w.distance_km ? String(w.distance_km) : "",
    notes: w.notes ?? "",
    performedAt: toDateTimeLocal(w.performed_at),
  };
}

function blank(defaultWhen: string, category: WorkoutCategory = "musculacao"): FormState {
  return {
    category,
    durationMinutes: "",
    rpe: null,
    modality: "",
    rounds: "",
    roundMinutes: "",
    muscleGroups: "",
    sets: [],
    distanceKm: "",
    notes: "",
    performedAt: defaultWhen,
  };
}

/** Converte o formulário no payload da API (validação de front espelha o zod da API). */
function toInput(form: FormState, opts: { untouchedWhen: boolean; legacyIntensity: Workout["intensity"] | undefined }): WorkoutInput {
  const duration = Number(form.durationMinutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) throw new Error("Informe a duração em minutos (1 a 600).");
  const group = workoutTypeMeta(form.category).group;

  const rounds = numOrNull(form.rounds);
  const roundMinutes = numOrNull(form.roundMinutes);
  if (rounds !== null && (!Number.isInteger(rounds) || rounds <= 0)) throw new Error("Rounds precisa ser um número inteiro maior que zero.");
  if (roundMinutes !== null && roundMinutes <= 0) throw new Error("Duração do round precisa ser maior que zero.");
  const distanceKm = numOrNull(form.distanceKm);
  if (distanceKm !== null && distanceKm <= 0) throw new Error("Distância precisa ser maior que zero.");

  const sets =
    group === "strength"
      ? form.sets
          .filter((s) => s.exercise.trim())
          .map((s) => ({ exercise: s.exercise.trim(), sets: numOrNull(s.sets), reps: numOrNull(s.reps), loadKg: numOrNull(s.loadKg) }))
      : [];
  if (sets.some((s) => (s.sets !== null && (!Number.isInteger(s.sets) || s.sets <= 0)) || (s.reps !== null && (!Number.isInteger(s.reps) || s.reps <= 0)) || (s.loadKg !== null && s.loadKg < 0))) {
    throw new Error("Confira séries, repetições e carga dos exercícios.");
  }

  // Campo "Quando" intocado em "hoje" = agora (no envio, não na hora em que a tela abriu).
  const performedAt = opts.untouchedWhen ? new Date().toISOString() : form.performedAt ? dateTimeLocalToIso(form.performedAt) : undefined;

  return {
    category: form.category,
    durationMinutes: duration,
    rpe: form.rpe,
    // Sem RPE, preserva a intensidade antiga do registro (a API deriva do RPE quando houver).
    intensity: form.rpe ? undefined : opts.legacyIntensity ?? null,
    modality: group === "fight" ? form.modality || null : null,
    rounds: group === "fight" ? rounds : null,
    roundMinutes: group === "fight" ? roundMinutes : null,
    muscleGroups: group === "strength" ? textOrNull(form.muscleGroups) : null,
    sets,
    distanceKm: group === "cardio" ? distanceKm : null,
    notes: textOrNull(form.notes),
    performedAt,
  };
}

/**
 * Formulário de exercício — criação (no card) e edição (no modal). Mostra só
 * os campos do tipo escolhido: musculação (treino + séries), luta (modalidade
 * + rounds), cardio (distância + pace calculado). Duração e esforço sempre.
 */
export function WorkoutForm({
  initial,
  defaultWhen,
  selectedDate,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Workout;
  /** Valor padrão do "Quando" (datetime-local) para novos registros. */
  defaultWhen: string;
  /** Dia selecionado na tela (YYYY-MM-DD) — decide se "Quando" intocado vira "agora". */
  selectedDate?: string;
  submitLabel: string;
  onSubmit: (input: WorkoutInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const uid = useId();
  const [form, setForm] = useState<FormState>(() => (initial ? fromWorkout(initial) : blank(defaultWhen)));
  const [whenTouched, setWhenTouched] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Novo registro: acompanha o dia selecionado na tela enquanto o usuário não mexeu no "Quando".
  useEffect(() => {
    if (initial || whenTouched) return;
    setForm((f) => ({ ...f, performedAt: defaultWhen }));
  }, [defaultWhen, initial, whenTouched]);

  const meta = workoutTypeMeta(form.category);
  const pace = useMemo(() => formatPace(paceMinPerKm(Number(form.durationMinutes) || null, numOrNull(form.distanceKm))), [form.durationMinutes, form.distanceKm]);
  const fightMinutes = (numOrNull(form.rounds) ?? 0) * (numOrNull(form.roundMinutes) ?? 0);
  const retroLabel =
    form.performedAt && form.performedAt.slice(0, 10) !== todayKey()
      ? new Date(dateTimeLocalToIso(form.performedAt)).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
      : null;

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  function updateSet(index: number, next: Partial<SetRow>) {
    setForm((f) => ({ ...f, sets: f.sets.map((s, i) => (i === index ? { ...s, ...next } : s)) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const untouchedWhen = !initial && !whenTouched && selectedDate === todayKey();
      const input = toInput(form, { untouchedWhen, legacyIntensity: initial?.intensity });
      setIsSaving(true);
      await onSubmit(input);
      if (!initial) {
        // Mantém o tipo escolhido (quem treina musculação registra musculação de novo).
        setForm(blank(defaultWhen, form.category));
        setWhenTouched(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o exercício.");
    } finally {
      setIsSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 dark:border-ink-border dark:bg-ink rpg:rounded-[3px]";

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {/* Tipo: grade de ícones (radiogroup acessível por teclado/leitor de tela). */}
      <fieldset>
        <legend className="mb-1.5 text-xs text-slate">Tipo de exercício</legend>
        <div role="radiogroup" aria-label="Tipo de exercício" className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-1.5">
          {WORKOUT_TYPES.map((type) => {
            const Icon = type.icon;
            const active = type.key === form.category;
            return (
              <button
                key={type.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => patch({ category: type.key })}
                className={clsx(
                  "flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-[10px] font-semibold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
                  "rpg:rounded-[3px] rpg:border-2",
                  active
                    ? "border-growth bg-growth/10 text-growth rpg:border-rpg-gold rpg:bg-rpg-green/15 rpg:text-rpg-gold-light"
                    : "border-paper-border text-slate hover:bg-black/[0.03] dark:border-ink-border dark:hover:bg-white/[0.05] rpg:border-rpg-border rpg:bg-rpg-bg/60 rpg:text-rpg-muted"
                )}
              >
                <Icon size={17} aria-hidden />
                <span className="max-w-full break-words text-center">{type.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <Field label="Duração (min)" type="number" inputMode="numeric" min={1} max={600} value={form.durationMinutes} onChange={(e) => patch({ durationMinutes: e.target.value })} required />
        <Field
          label="Quando"
          type="datetime-local"
          value={form.performedAt}
          onChange={(e) => {
            setWhenTouched(true);
            patch({ performedAt: e.target.value });
          }}
        />
      </div>
      {retroLabel && <p className="-mt-1 text-[10px] text-signal-deep rpg:text-rpg-orange">Registro retroativo — será salvo em {retroLabel}.</p>}

      {/* Esforço percebido (RPE): toque de novo no valor escolhido para limpar. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span id={`${uid}-rpe`} className="text-xs text-slate">
            Esforço percebido (RPE)
          </span>
          <span className="text-xs font-semibold">{form.rpe ? `${form.rpe}/10 · ${rpeLabel(form.rpe)}` : "opcional"}</span>
        </div>
        <div role="radiogroup" aria-labelledby={`${uid}-rpe`} className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
            const active = form.rpe !== null && value <= form.rpe;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.rpe === value}
                aria-label={`Esforço ${value} de 10 — ${rpeLabel(value)}`}
                onClick={() => patch({ rpe: form.rpe === value ? null : value })}
                className={clsx(
                  "h-8 rounded-md border text-[11px] font-semibold transition-colors rpg:rounded-[2px] rpg:font-pixel",
                  active
                    ? value >= 9
                      ? "border-drop bg-drop/15 text-drop rpg:border-rpg-red rpg:bg-rpg-red/25 rpg:text-rpg-text"
                      : value >= 7
                        ? "border-signal bg-signal/15 text-signal-deep rpg:border-rpg-orange rpg:bg-rpg-orange/25 rpg:text-rpg-text"
                        : "border-growth bg-growth/15 text-growth rpg:border-rpg-green rpg:bg-rpg-green/25 rpg:text-rpg-text"
                    : "border-paper-border text-slate dark:border-ink-border rpg:border-rpg-border rpg:text-rpg-muted"
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {meta.group === "strength" && (
        <div className="space-y-2 rounded-xl border border-paper-border p-3 dark:border-ink-border rpg:rounded-[3px] rpg:border-rpg-border">
          <Field label="Treino / grupo muscular" placeholder="Ex.: Treino A — peito e tríceps" maxLength={120} value={form.muscleGroups} onChange={(e) => patch({ muscleGroups: e.target.value })} />
          <div className="flex flex-wrap gap-1.5" aria-label="Sugestões de treino">
            {STRENGTH_SPLIT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ muscleGroups: form.muscleGroups.trim() ? `${form.muscleGroups.trim()} · ${s}` : s })}
                className="rounded-full border border-paper-border px-2 py-0.5 text-[10px] text-slate hover:bg-black/[0.03] dark:border-ink-border rpg:rounded-[2px] rpg:border-rpg-border"
              >
                + {s}
              </button>
            ))}
          </div>

          <p className="pt-1 text-xs text-slate">Exercícios (opcional)</p>
          {form.sets.length > 0 && (
            <div className="space-y-2">
              {/* No celular o nome ocupa a linha inteira; o cabeçalho rotula só os números. */}
              <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-1.5 text-[10px] uppercase tracking-wide text-slate sm:grid-cols-[minmax(0,1fr)_56px_56px_64px_28px]" aria-hidden>
                <span className="hidden sm:block">Exercício</span>
                <span>Séries</span>
                <span>Reps</span>
                <span>Carga kg</span>
                <span />
              </div>
              {form.sets.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-1.5 sm:grid-cols-[minmax(0,1fr)_56px_56px_64px_28px]">
                  <input
                    aria-label={`Exercício ${index + 1}`}
                    placeholder="Ex.: Supino reto"
                    value={row.exercise}
                    maxLength={80}
                    onChange={(e) => updateSet(index, { exercise: e.target.value })}
                    className={clsx(inputClass, "col-span-4 px-2.5 py-2 sm:col-span-1")}
                  />
                  <input aria-label={`Séries do exercício ${index + 1}`} placeholder="Séries" type="number" inputMode="numeric" min={1} value={row.sets} onChange={(e) => updateSet(index, { sets: e.target.value })} className={clsx(inputClass, "px-2 py-2")} />
                  <input aria-label={`Repetições do exercício ${index + 1}`} placeholder="Reps" type="number" inputMode="numeric" min={1} value={row.reps} onChange={(e) => updateSet(index, { reps: e.target.value })} className={clsx(inputClass, "px-2 py-2")} />
                  <input aria-label={`Carga em kg do exercício ${index + 1}`} placeholder="kg" type="number" inputMode="decimal" min={0} step="0.5" value={row.loadKg} onChange={(e) => updateSet(index, { loadKg: e.target.value })} className={clsx(inputClass, "px-2 py-2")} />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sets: f.sets.filter((_, i) => i !== index) }))}
                    className="flex items-center justify-center text-slate hover:text-drop"
                    aria-label={`Remover exercício ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, sets: [...f.sets, { ...EMPTY_SET }] }))}
            disabled={form.sets.length >= 40}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-400 rpg:text-rpg-gold-light"
          >
            <Plus size={13} /> Adicionar exercício
          </button>
        </div>
      )}

      {meta.group === "fight" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-paper-border p-3 dark:border-ink-border rpg:rounded-[3px] rpg:border-rpg-border sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${uid}-modality`} className="text-xs text-slate">
              Modalidade
            </label>
            <select id={`${uid}-modality`} value={form.modality} onChange={(e) => patch({ modality: e.target.value as FightModality | "" })} className={clsx(inputClass, "mt-1.5")}>
              <option value="">Não informar</option>
              {FIGHT_MODALITIES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Rounds" type="number" inputMode="numeric" min={1} value={form.rounds} onChange={(e) => patch({ rounds: e.target.value })} />
          <Field label="Min por round" type="number" inputMode="decimal" min={0.5} step="0.5" value={form.roundMinutes} onChange={(e) => patch({ roundMinutes: e.target.value })} />
          {fightMinutes > 0 && <p className="col-span-2 text-[11px] text-slate sm:col-span-3">Tempo de luta/sparring: {Math.round(fightMinutes * 10) / 10} min</p>}
        </div>
      )}

      {meta.group === "cardio" && (
        <div className="grid grid-cols-2 items-end gap-2">
          <Field label="Distância (km)" type="number" inputMode="decimal" min={0} step="0.1" value={form.distanceKm} onChange={(e) => patch({ distanceKm: e.target.value })} />
          <p className="pb-2.5 text-xs text-slate" aria-live="polite">
            {pace ? (
              <>
                Pace: <span className="font-semibold text-inherit">{pace}</span>
              </>
            ) : (
              "Pace calculado com distância e duração."
            )}
          </p>
        </div>
      )}

      <div>
        <label htmlFor={`${uid}-notes`} className="text-xs text-slate">
          Observação
        </label>
        <textarea
          id={`${uid}-notes`}
          value={form.notes}
          maxLength={500}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Opcional — como se sentiu, técnica, dores..."
          rows={2}
          className={clsx(inputClass, "mt-1.5 resize-none")}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-drop/10 px-3 py-2 text-xs text-drop">
          {error}
        </p>
      )}

      <div className={clsx("flex gap-2", onCancel ? "justify-end" : "")}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            <X size={14} /> Cancelar
          </Button>
        )}
        <Button type="submit" className={onCancel ? "" : "w-full"} disabled={isSaving}>
          {initial ? <Save size={14} /> : <meta.icon size={14} />} {isSaving ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
