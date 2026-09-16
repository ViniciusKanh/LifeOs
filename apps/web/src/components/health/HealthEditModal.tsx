import { useMemo, useState } from "react";
import { Dumbbell, Droplets, Moon, Save, Smile, X } from "lucide-react";
import { Button, Field, IconBadge } from "@/components/ui/primitives";
import type { MoodEntryInput, SleepEntryInput, WaterEntryInput, WorkoutInput } from "@/services/healthService";
import { dateTimeLocalToIso, nullableNumber, optionalText, toDateTimeLocal } from "./healthUtils";
import type { HealthEditTarget } from "./HealthHistoryModal";

export type HealthUpdatePatch =
  | Partial<WaterEntryInput>
  | Partial<SleepEntryInput>
  | Partial<WorkoutInput>
  | Partial<MoodEntryInput>;

type WaterEditForm = { amountMl: string; recordedAt: string };
type SleepEditForm = { wentToBedAt: string; wokeUpAt: string; quality: number; notes: string };
type WorkoutEditForm = {
  kind: string;
  durationMinutes: string;
  distanceKm: string;
  intensity: "leve" | "moderada" | "intensa";
  notes: string;
  performedAt: string;
};
type MoodEditForm = { mood: number; energy: number; stress: number; note: string; recordedAt: string };
type HealthEditForm = WaterEditForm | SleepEditForm | WorkoutEditForm | MoodEditForm;

export function HealthEditModal({
  target,
  onClose,
  onSave,
}: {
  target: HealthEditTarget;
  onClose: () => void;
  onSave: (target: HealthEditTarget, patch: HealthUpdatePatch) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initial = useMemo<HealthEditForm>(() => {
    if (target.kind === "water") {
      return {
        amountMl: String(target.entry.amount_ml),
        recordedAt: toDateTimeLocal(target.entry.recorded_at),
      };
    }
    if (target.kind === "sleep") {
      return {
        wentToBedAt: toDateTimeLocal(target.entry.went_to_bed_at),
        wokeUpAt: toDateTimeLocal(target.entry.woke_up_at),
        quality: target.entry.quality ?? 3,
        notes: target.entry.notes ?? "",
      };
    }
    if (target.kind === "workouts") {
      return {
        kind: target.entry.kind,
        durationMinutes: String(target.entry.duration_minutes ?? ""),
        distanceKm: target.entry.distance_km === null ? "" : String(target.entry.distance_km),
        intensity: target.entry.intensity ?? "moderada",
        notes: target.entry.notes ?? "",
        performedAt: toDateTimeLocal(target.entry.performed_at),
      };
    }
    return {
      mood: target.entry.mood,
      energy: target.entry.energy,
      stress: target.entry.stress ?? 3,
      note: target.entry.note ?? "",
      recordedAt: toDateTimeLocal(target.entry.recorded_at),
    };
  }, [target]);

  const [form, setForm] = useState<HealthEditForm>(initial);

  async function submit() {
    setError(null);
    try {
      const patch = buildPatch(target.kind, form);
      setIsSaving(true);
      await onSave(target, patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar este registro.");
    } finally {
      setIsSaving(false);
    }
  }

  const icon =
    target.kind === "water" ? (
      <Droplets size={16} />
    ) : target.kind === "sleep" ? (
      <Moon size={16} />
    ) : target.kind === "workouts" ? (
      <Dumbbell size={16} />
    ) : (
      <Smile size={16} />
    );

  const title =
    target.kind === "water"
      ? "Editar agua"
      : target.kind === "sleep"
        ? "Editar sono"
        : target.kind === "workouts"
          ? "Editar exercicio"
          : "Editar humor";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-paper-border bg-paper-raised p-5 shadow-card-dark dark:border-ink-border dark:bg-ink-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <IconBadge tone={target.kind === "sleep" ? "purple" : target.kind === "workouts" ? "green" : target.kind === "mood" ? "amber" : "blue"} icon={icon} size={36} />
            <div>
              <p className="font-display text-base font-semibold">{title}</p>
              <p className="text-xs text-slate">Ajuste o registro sem criar duplicidade.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate transition-colors hover:text-inherit" title="Fechar">
            <X size={18} />
          </button>
        </div>

        {target.kind === "water" && "amountMl" in form && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Quantidade (ml)" type="number" min={1} value={form.amountMl} onChange={(event) => setForm({ ...form, amountMl: event.target.value })} />
            <Field label="Quando" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm({ ...form, recordedAt: event.target.value })} />
          </div>
        )}

        {target.kind === "sleep" && "wentToBedAt" in form && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Dormiu as" type="datetime-local" value={form.wentToBedAt} onChange={(event) => setForm({ ...form, wentToBedAt: event.target.value })} />
              <Field label="Acordou as" type="datetime-local" value={form.wokeUpAt} onChange={(event) => setForm({ ...form, wokeUpAt: event.target.value })} />
            </div>
            <Slider label="Qualidade" value={form.quality} onChange={(value) => setForm({ ...form, quality: value })} />
            <TextArea label="Notas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          </div>
        )}

        {target.kind === "workouts" && "kind" in form && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tipo" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} />
              <Field label="Duracao (min)" type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} />
              <Field label="Distancia (km)" type="number" min={0} step="0.1" value={form.distanceKm} onChange={(event) => setForm({ ...form, distanceKm: event.target.value })} />
              <SelectIntensity value={form.intensity} onChange={(value) => setForm({ ...form, intensity: value })} />
              <Field label="Quando" type="datetime-local" value={form.performedAt} onChange={(event) => setForm({ ...form, performedAt: event.target.value })} />
            </div>
            <TextArea label="Notas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          </div>
        )}

        {target.kind === "mood" && "mood" in form && (
          <div className="space-y-3">
            <Slider label="Humor" value={form.mood} onChange={(value) => setForm({ ...form, mood: value })} />
            <Slider label="Energia" value={form.energy} onChange={(value) => setForm({ ...form, energy: value })} />
            <Slider label="Estresse" value={form.stress} onChange={(value) => setForm({ ...form, stress: value })} />
            <Field label="Quando" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm({ ...form, recordedAt: event.target.value })} />
            <TextArea label="Nota" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-drop/10 px-3 py-2 text-xs text-drop">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSaving}>
            <Save size={14} /> {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildPatch(kind: HealthEditTarget["kind"], form: HealthEditForm): HealthUpdatePatch {
  if (kind === "water" && "amountMl" in form) {
    const amountMl = Number(form.amountMl);
    if (!Number.isFinite(amountMl) || amountMl <= 0) throw new Error("Informe uma quantidade de agua maior que zero.");
    if (!form.recordedAt) throw new Error("Informe quando voce bebeu agua.");
    return { amountMl, recordedAt: dateTimeLocalToIso(form.recordedAt) };
  }

  if (kind === "sleep" && "wentToBedAt" in form) {
    if (!form.wentToBedAt || !form.wokeUpAt) throw new Error("Informe quando dormiu e quando acordou.");
    if (new Date(form.wokeUpAt).getTime() <= new Date(form.wentToBedAt).getTime()) {
      throw new Error("O horario de acordar precisa ser depois do horario em que voce dormiu.");
    }
    return {
      wentToBedAt: dateTimeLocalToIso(form.wentToBedAt),
      wokeUpAt: dateTimeLocalToIso(form.wokeUpAt),
      quality: form.quality,
      notes: optionalText(form.notes) ?? null,
    };
  }

  if (kind === "workouts" && "kind" in form) {
    const durationMinutes = Number(form.durationMinutes);
    if (!form.kind.trim()) throw new Error("Informe o tipo de exercicio.");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Informe a duracao do exercicio.");
    if (!form.performedAt) throw new Error("Informe quando o exercicio aconteceu.");
    return {
      kind: form.kind.trim(),
      durationMinutes,
      distanceKm: nullableNumber(form.distanceKm),
      intensity: form.intensity,
      notes: optionalText(form.notes) ?? null,
      performedAt: dateTimeLocalToIso(form.performedAt),
    };
  }

  if (kind === "mood" && "mood" in form) {
    if (!form.recordedAt) throw new Error("Informe quando este registro aconteceu.");
    return {
      mood: form.mood,
      energy: form.energy,
      stress: form.stress,
      note: optionalText(form.note) ?? null,
      recordedAt: dateTimeLocalToIso(form.recordedAt),
    };
  }

  throw new Error("Registro invalido.");
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs text-slate">{label}</label>
        <span className="text-xs font-semibold">{value}/5</span>
      </div>
      <input type="range" min={1} max={5} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full" />
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 dark:border-ink-border dark:bg-ink"
      />
    </div>
  );
}

function SelectIntensity({ value, onChange }: { value: "leve" | "moderada" | "intensa"; onChange: (value: "leve" | "moderada" | "intensa") => void }) {
  return (
    <div>
      <label className="text-xs text-slate">Intensidade</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as "leve" | "moderada" | "intensa")}
        className="mt-1.5 w-full rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 dark:border-ink-border dark:bg-ink"
      >
        <option value="leve">Leve</option>
        <option value="moderada">Moderada</option>
        <option value="intensa">Intensa</option>
      </select>
    </div>
  );
}
