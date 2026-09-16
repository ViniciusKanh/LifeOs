import { useMemo, useState } from "react";
import type React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dumbbell, Droplets, Edit2, HeartPulse, LineChart as LineChartIcon, Moon, Sparkles, Sun, Trash2, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import type { HealthCorrelation, MoodEntry, SleepEntry, WaterEntry, Workout } from "@/types";
import type { MoodEntryInput, SleepEntryInput, WorkoutInput } from "@/services/healthService";
import { WaterRing } from "./HealthStatCard";
import {
  WATER_GOAL_ML,
  WATER_QUICK_ADD,
  SLEEP_GOAL_MINUTES,
  dateTimeLocalToIso,
  fmtDateTime,
  formatHM,
  optionalNumber,
  optionalText,
  parseHealthDate,
  toDateTimeLocal,
} from "./healthUtils";
import type { HealthEditTarget } from "./HealthHistoryModal";

const WORKOUT_TYPES = ["Caminhada", "Corrida", "Musculacao", "Ciclismo", "Natacao", "Alongamento", "Yoga", "Outro"];

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function chartTooltipStyle() {
  return {
    background: "var(--paper-raised, #fff)",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: 12,
    fontSize: 12,
  };
}

export function WaterCard({
  waterToday,
  waterTotal,
  waterPct,
  onQuickAdd,
  onDelete,
  onEdit,
  onOpenHistory,
}: {
  waterToday: WaterEntry[];
  waterTotal: number;
  waterPct: number;
  onQuickAdd: (amountMl: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (target: HealthEditTarget) => void;
  onOpenHistory: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [savingMl, setSavingMl] = useState<number | null>(null);

  async function add(amountMl: number) {
    setMessage(null);
    setSavingMl(amountMl);
    try {
      await onQuickAdd(amountMl);
      setMessage(`+${amountMl} ml registrados`);
    } catch (err) {
      setMessage(errorMessage(err, "Nao foi possivel registrar sua agua."));
    } finally {
      setSavingMl(null);
    }
  }

  return (
    <Card className="p-5 md:p-6">
      <CardHeader
        tone="blue"
        icon={<Droplets size={16} />}
        title="Agua"
        subtitle="Hidratacao para mais energia e foco."
        onOpenHistory={onOpenHistory}
      />

      <div className="flex items-center gap-5">
        <WaterRing pct={Math.min(100, waterPct)} />
        <div>
          <p className="font-display text-3xl font-bold leading-none">
            {(waterTotal / 1000).toFixed(1)}
            <span className="text-sm font-normal text-slate"> L</span>
          </p>
          <p className="mt-1 text-xs text-slate">de {(WATER_GOAL_ML / 1000).toFixed(1)} L hoje</p>
          <p className={`mt-2 text-xs font-semibold ${waterPct >= 100 ? "text-growth" : "text-slate"}`}>{waterPct}% da meta</p>
        </div>
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold">Adicionar rapidamente</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {WATER_QUICK_ADD.map((amountMl) => (
          <Button key={amountMl} variant="secondary" className="min-h-11 text-cat-blue" onClick={() => add(amountMl)} disabled={savingMl !== null}>
            {savingMl === amountMl ? "..." : `+${amountMl}ml`}
          </Button>
        ))}
      </div>
      {message && <p className="mb-3 rounded-xl bg-cat-blue/5 px-3 py-2 text-xs text-slate">{message}</p>}

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Registros de hoje</p>
        {waterToday.length > 5 && (
          <button onClick={onOpenHistory} className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            Ver todos
          </button>
        )}
      </div>

      {waterToday.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-border px-3 py-4 text-xs text-slate dark:border-ink-border">
          Nenhum registro de agua hoje.
        </p>
      ) : (
        <div className="space-y-1.5">
          {waterToday.slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-slate">
                <Droplets size={11} className="shrink-0 text-cat-blue" /> {entry.amount_ml}ml · {fmtDateTime(entry.recorded_at)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button onClick={() => onEdit({ kind: "water", entry })} className="text-slate transition-colors hover:text-brand-600" title="Editar">
                  <Edit2 size={12} />
                </button>
                <button onClick={() => onDelete(entry.id)} className="text-slate transition-colors hover:text-drop" title="Excluir">
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-cat-blue/15 bg-cat-blue/5 p-3">
        <Droplets size={14} className="mt-0.5 shrink-0 text-cat-blue" />
        <div>
          <p className="text-xs font-semibold">Dica de hoje</p>
          <p className="mt-0.5 text-[11px] text-slate">Manter-se hidratado ajuda sua rotina de foco e energia ao longo do dia.</p>
        </div>
      </div>
    </Card>
  );
}

export function SleepCard({
  sleep,
  sleepWeekly,
  lastNightMinutes,
  avgSleepMinutes,
  avgQuality,
  onAddSleep,
  onDelete,
  onEdit,
  onOpenHistory,
}: {
  sleep: SleepEntry[];
  sleepWeekly: Array<{ label: string; value: number }>;
  lastNightMinutes: number | null;
  avgSleepMinutes: number | null;
  avgQuality: number | null;
  onAddSleep: (input: SleepEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (target: HealthEditTarget) => void;
  onOpenHistory: () => void;
}) {
  const now = useMemo(() => new Date(), []);
  const defaultWake = toDateTimeLocal(now.toISOString());
  const defaultBed = toDateTimeLocal(new Date(now.getTime() - SLEEP_GOAL_MINUTES * 60_000).toISOString());
  const [form, setForm] = useState({ wentToBedAt: defaultBed, wokeUpAt: defaultWake, quality: 3, notes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setMessage(null);
    if (!form.wentToBedAt || !form.wokeUpAt) {
      setMessage("Informe quando dormiu e quando acordou.");
      return;
    }
    if (new Date(form.wokeUpAt).getTime() <= new Date(form.wentToBedAt).getTime()) {
      setMessage("O horario de acordar precisa ser depois do horario em que voce dormiu.");
      return;
    }
    try {
      setIsSaving(true);
      await onAddSleep({
        wentToBedAt: dateTimeLocalToIso(form.wentToBedAt),
        wokeUpAt: dateTimeLocalToIso(form.wokeUpAt),
        quality: form.quality,
        notes: optionalText(form.notes),
      });
      setForm({ wentToBedAt: "", wokeUpAt: "", quality: 3, notes: "" });
      setMessage("Noite registrada.");
    } catch (err) {
      setMessage(errorMessage(err, "Nao foi possivel registrar a noite."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="p-5 md:p-6">
      <CardHeader
        tone="purple"
        icon={<Moon size={16} />}
        title="Sono"
        subtitle="Mais descanso, mais produtividade."
        onOpenHistory={onOpenHistory}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-xl border border-paper-border p-3 dark:border-ink-border">
          <p className="text-[11px] text-slate">Tempo de sono da ultima noite</p>
          <p className="mt-1 font-display text-2xl font-bold">{lastNightMinutes ? formatHM(lastNightMinutes) : "--"}</p>
          <p className="mt-1 text-xs text-slate">{sleep[0]?.quality ? `Qualidade ${sleep[0].quality}/5` : "Sem registro de qualidade"}</p>
        </div>
        <div className="h-32 min-w-0">
          <p className="mb-1 text-[11px] text-slate">Horas de sono - ultimos 7 dias</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sleepWeekly} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EAF2" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis hide domain={[0, "dataMax + 1"]} />
              <Tooltip contentStyle={chartTooltipStyle()} formatter={(value) => [`${Number(value).toFixed(1)}h`, "Sono"]} />
              <Bar dataKey="value" fill="#7C4DFF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Dormi as" type="datetime-local" value={form.wentToBedAt} onChange={(event) => setForm({ ...form, wentToBedAt: event.target.value })} />
        <Field label="Acordei as" type="datetime-local" value={form.wokeUpAt} onChange={(event) => setForm({ ...form, wokeUpAt: event.target.value })} />
      </div>
      <Slider label="Qualidade do sono" value={form.quality} tone="purple" onChange={(value) => setForm({ ...form, quality: value })} />
      <textarea
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
        placeholder="Observacao opcional"
        rows={2}
        className="mt-3 w-full resize-none rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-ink-border dark:bg-ink"
      />
      <Button className="mt-3 w-full" onClick={submit} disabled={isSaving}>
        <Moon size={14} /> {isSaving ? "Registrando..." : "Registrar noite"}
      </Button>
      {message && <p className="mt-3 rounded-xl bg-cat-purple/5 px-3 py-2 text-xs text-slate">{message}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-paper-border pt-4 text-center dark:border-ink-border">
        <div>
          <p className="text-[10px] text-slate">Media da semana</p>
          <p className="text-sm font-semibold">{avgSleepMinutes ? formatHM(avgSleepMinutes) : "--"}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate">Qualidade media</p>
          <p className="text-sm font-semibold">{avgQuality ? `${avgQuality.toFixed(1)}/5` : "--"}</p>
        </div>
      </div>

      {sleep.length > 0 && (
        <LatestList
          title="Ultimos registros"
          items={sleep.slice(0, 2).map((entry) => ({
            id: entry.id,
            icon: <Moon size={12} className="text-cat-purple" />,
            title: entry.duration_minutes ? formatHM(entry.duration_minutes) : "Sem duracao",
            meta: fmtDateTime(entry.went_to_bed_at),
            onEdit: () => onEdit({ kind: "sleep", entry }),
            onDelete: () => onDelete(entry.id),
          }))}
        />
      )}
    </Card>
  );
}

export function WorkoutCard({
  workouts,
  workoutsWeekly,
  workoutsThisWeekMinutes,
  onAddWorkout,
  onDelete,
  onEdit,
  onOpenHistory,
}: {
  workouts: Workout[];
  workoutsWeekly: Array<{ label: string; value: number }>;
  workoutsThisWeekMinutes: number;
  onAddWorkout: (input: WorkoutInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (target: HealthEditTarget) => void;
  onOpenHistory: () => void;
}) {
  const [form, setForm] = useState({
    kind: "Caminhada",
    durationMinutes: "",
    distanceKm: "",
    intensity: "moderada" as const,
    notes: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setMessage(null);
    const durationMinutes = Number(form.durationMinutes);
    if (!form.kind.trim()) {
      setMessage("Informe o tipo de exercicio.");
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setMessage("Informe uma duracao maior que zero.");
      return;
    }
    try {
      setIsSaving(true);
      await onAddWorkout({
        kind: form.kind.trim(),
        durationMinutes,
        distanceKm: optionalNumber(form.distanceKm),
        intensity: form.intensity,
        notes: optionalText(form.notes),
      });
      setForm({ kind: "Caminhada", durationMinutes: "", distanceKm: "", intensity: "moderada", notes: "" });
      setMessage("Exercicio registrado.");
    } catch (err) {
      setMessage(errorMessage(err, "Nao foi possivel registrar o exercicio."));
    } finally {
      setIsSaving(false);
    }
  }

  const workoutsThisWeek = workoutsWeekly.reduce((sum, day) => sum + day.value, 0);

  return (
    <Card className="p-5 md:p-6">
      <CardHeader
        tone="green"
        icon={<Dumbbell size={16} />}
        title="Exercicios"
        subtitle="Movimento e vida."
        onOpenHistory={onOpenHistory}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-slate">Tipo</label>
          <select
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value })}
            className="mt-1.5 w-full rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-ink-border dark:bg-ink"
          >
            {WORKOUT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <Field label="Duracao (min)" type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} />
        <Field label="Distancia (km)" type="number" min={0} step="0.1" value={form.distanceKm} onChange={(event) => setForm({ ...form, distanceKm: event.target.value })} />
        <div>
          <label className="text-xs text-slate">Intensidade</label>
          <select
            value={form.intensity}
            onChange={(event) => setForm({ ...form, intensity: event.target.value as typeof form.intensity })}
            className="mt-1.5 w-full rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-ink-border dark:bg-ink"
          >
            <option value="leve">Leve</option>
            <option value="moderada">Moderada</option>
            <option value="intensa">Intensa</option>
          </select>
        </div>
      </div>
      <textarea
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
        placeholder="Observacao opcional"
        rows={2}
        className="mt-2 w-full resize-none rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-ink-border dark:bg-ink"
      />
      <Button className="mt-2 w-full" onClick={submit} disabled={isSaving}>
        <Dumbbell size={14} /> {isSaving ? "Registrando..." : "Registrar exercicio"}
      </Button>
      {message && <p className="mt-3 rounded-xl bg-cat-green/5 px-3 py-2 text-xs text-slate">{message}</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-growth/15 bg-growth/5 p-3 sm:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-[11px] text-slate">Esta semana</p>
          <p className="font-display text-xl font-bold">{workoutsThisWeek} atividades</p>
          <p className="text-[10px] text-slate">{formatHM(workoutsThisWeekMinutes)} no total</p>
        </div>
        <div className="h-24 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workoutsWeekly} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis hide allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle()} formatter={(value) => [`${value}`, "Atividades"]} />
              <Bar dataKey="value" fill="#22B573" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <LatestList
        title="Ultimos registros"
        empty="Nenhum exercicio registrado ainda."
        items={workouts.slice(0, 4).map((entry) => ({
          id: entry.id,
          icon: <Dumbbell size={12} className="text-cat-green" />,
          title: `${entry.kind}${entry.duration_minutes ? ` · ${entry.duration_minutes}min` : ""}${entry.distance_km ? ` · ${entry.distance_km}km` : ""}`,
          meta: fmtDateTime(entry.performed_at),
          onEdit: () => onEdit({ kind: "workouts", entry }),
          onDelete: () => onDelete(entry.id),
        }))}
      />
    </Card>
  );
}

export function MoodCard({
  mood,
  onAddMood,
  onDelete,
  onEdit,
  onOpenHistory,
}: {
  mood: MoodEntry[];
  onAddMood: (input: MoodEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (target: HealthEditTarget) => void;
  onOpenHistory: () => void;
}) {
  const [form, setForm] = useState({ mood: 3, energy: 3, stress: 3, note: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const chartData = useMemo(
    () =>
      [...mood]
        .sort((a, b) => parseHealthDate(a.recorded_at).getTime() - parseHealthDate(b.recorded_at).getTime())
        .slice(-14)
        .map((entry) => ({
          label: parseHealthDate(entry.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          humor: entry.mood,
          energia: entry.energy,
          estresse: entry.stress ?? null,
        })),
    [mood]
  );

  async function submit() {
    setMessage(null);
    try {
      setIsSaving(true);
      await onAddMood({ mood: form.mood, energy: form.energy, stress: form.stress, note: optionalText(form.note) });
      setForm({ mood: 3, energy: 3, stress: 3, note: "" });
      setMessage("Check-in de bem-estar salvo.");
    } catch (err) {
      setMessage(errorMessage(err, "Nao foi possivel salvar o check-in."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="p-5 md:p-6">
      <CardHeader
        tone="amber"
        icon={<Sun size={16} />}
        title="Humor e energia"
        subtitle="Acompanhe como voce esta se sentindo."
        onOpenHistory={onOpenHistory}
      />

      <Slider label="Humor" value={form.mood} tone="amber" onChange={(value) => setForm({ ...form, mood: value })} />
      <Slider label="Energia" value={form.energy} tone="blue" onChange={(value) => setForm({ ...form, energy: value })} />
      <Slider label="Estresse" value={form.stress} tone="red" onChange={(value) => setForm({ ...form, stress: value })} />
      <textarea
        value={form.note}
        onChange={(event) => setForm({ ...form, note: event.target.value })}
        placeholder="Observacao opcional"
        rows={2}
        className="mt-2 w-full resize-none rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-ink-border dark:bg-ink"
      />
      <Button className="mt-2 w-full" onClick={submit} disabled={isSaving}>
        <SmileIcon /> {isSaving ? "Salvando..." : "Registrar"}
      </Button>
      {message && <p className="mt-3 rounded-xl bg-signal/10 px-3 py-2 text-xs text-slate">{message}</p>}

      <div className="mt-4 h-36">
        {chartData.length < 2 ? (
          <p className="rounded-xl border border-dashed border-paper-border px-3 py-4 text-xs text-slate dark:border-ink-border">
            Registre mais dias para visualizar tendencia de humor, energia e estresse.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EAF2" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis hide domain={[1, 5]} />
              <Tooltip contentStyle={chartTooltipStyle()} />
              <Line type="monotone" dataKey="humor" stroke="#F5A31A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="energia" stroke="#3478F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="estresse" stroke="#F0445E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <LatestList
        title="Ultimos registros"
        empty="Nenhum registro emocional ainda."
        items={mood.slice(0, 3).map((entry) => ({
          id: entry.id,
          icon: <Sun size={12} className="text-signal-deep" />,
          title: `humor ${entry.mood}/5 · energia ${entry.energy}/5${entry.stress ? ` · estresse ${entry.stress}/5` : ""}`,
          meta: fmtDateTime(entry.recorded_at),
          onEdit: () => onEdit({ kind: "mood", entry }),
          onDelete: () => onDelete(entry.id),
        }))}
      />
    </Card>
  );
}

export function WellnessInsightCard({
  waterGoalDays,
  exerciseEnergyTrend,
  insightText,
  insightError,
  isGenerating,
  onGenerate,
}: {
  waterGoalDays: number;
  exerciseEnergyTrend: string | null;
  insightText: string | null;
  insightError: { message: string; status?: number } | null;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  const calculatedInsight =
    exerciseEnergyTrend ??
    (waterGoalDays > 0
      ? `Voce manteve sua meta de agua em ${waterGoalDays} dos ultimos 7 dias.`
      : "Seus registros vao revelar tendencias conforme voce usa a tela ao longo da semana.");

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconBadge tone="pink" size={34} icon={<HeartPulse size={15} />} />
          <div>
            <p className="text-sm font-semibold">Insight de bem-estar</p>
            <p className="text-xs text-slate">Pequenas acoes, grandes mudancas.</p>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-paper-border px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-paper disabled:opacity-60 dark:border-ink-border dark:hover:bg-ink-overlay"
        >
          <Wand2 size={13} />
          {isGenerating ? "Analisando..." : insightText ? "Gerar outra analise" : "Analisar com IA"}
        </button>
      </div>

      <p className="mt-4 rounded-xl border border-brand-500/10 bg-brand-500/5 px-4 py-3 text-sm leading-relaxed">{calculatedInsight}</p>

      {insightError ? (
        <p className="mt-3 rounded-xl bg-drop/10 px-4 py-3 text-xs text-drop">
          {insightError.message}
          {insightError.status === 400 && (
            <>
              {" "}
              <Link to="/configuracoes" className="font-semibold underline">
                Ir para Configuracoes
              </Link>
            </>
          )}
        </p>
      ) : insightText ? (
        <p className="mt-3 rounded-xl border border-cat-pink/15 bg-cat-pink/5 px-4 py-3 text-sm leading-relaxed">{insightText}</p>
      ) : (
        <p className="mt-3 text-xs text-slate">
          A analise com IA usa seus proprios registros de agua, sono, exercicio e humor para procurar associacoes e tendencias, sem gerar diagnostico.
        </p>
      )}
    </Card>
  );
}

export function WellnessIllustrationCard() {
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-brand-600 via-cat-purple to-cat-blue p-6 text-white shadow-card">
      <div className="relative min-h-[220px]">
        <div className="absolute inset-x-4 bottom-6 h-20 rounded-[50%] bg-white/12" />
        <div className="absolute bottom-10 left-5 h-20 w-32 rounded-t-[80px] bg-white/18" />
        <div className="absolute bottom-10 right-4 h-28 w-44 rounded-t-[100px] bg-white/14" />
        <div className="absolute right-7 top-6 h-14 w-14 rounded-full bg-signal shadow-glow-signal" />
        <Sparkles size={22} className="relative mb-3 opacity-90" />
        <div className="relative max-w-sm">
          <p className="font-display text-2xl font-bold leading-tight">Um novo dia, novas oportunidades.</p>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            Continue cuidando de voce. Seu bem-estar de hoje constroi o seu melhor amanha.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function HealthCorrelationsCard({ correlations, isLoading }: { correlations: HealthCorrelation[]; isLoading: boolean }) {
  return (
    <Card className="mt-4 p-5 md:p-6">
      <div className="flex items-center gap-2.5">
        <IconBadge tone="green" size={34} icon={<LineChartIcon size={15} />} />
        <div>
          <p className="text-sm font-semibold">Correlacoes de saude</p>
          <p className="text-xs text-slate">Padroes encontrados nos seus proprios registros de sono, exercicio, agua e humor.</p>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-slate">Calculando...</p>
      ) : correlations.length === 0 ? (
        <p className="mt-4 text-xs text-slate">
          Ainda nao ha dados suficientes para calcular uma correlacao confiavel. Continue registrando por pelo menos alguns dias.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {correlations.map((correlation) => (
            <div key={correlation.pair} className="rounded-xl border border-paper-border px-4 py-3 dark:border-ink-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{correlation.label}</p>
                <span className="rounded-full bg-growth/10 px-2 py-0.5 text-[10px] font-semibold text-growth">
                  {correlation.strength} · r={correlation.r.toFixed(2)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate">{correlation.description}</p>
            </div>
          ))}
          <p className="text-[11px] text-slate lg:col-span-2">
            Correlacao nao implica causalidade: sao associacoes observadas nos seus dados, nao diagnostico.
          </p>
        </div>
      )}
    </Card>
  );
}

function CardHeader({
  tone,
  icon,
  title,
  subtitle,
  onOpenHistory,
}: {
  tone: "blue" | "purple" | "green" | "amber";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onOpenHistory: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconBadge tone={tone} size={34} icon={icon} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-slate">{subtitle}</p>
        </div>
      </div>
      <button onClick={onOpenHistory} className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-500">
        Ver historico
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  tone: "blue" | "purple" | "amber" | "red";
  onChange: (value: number) => void;
}) {
  const accent = tone === "blue" ? "accent-cat-blue" : tone === "purple" ? "accent-cat-purple" : tone === "red" ? "accent-drop" : "accent-signal";
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs text-slate">{label}</label>
        <span className="text-xs font-semibold">{value}/5</span>
      </div>
      <input type="range" min={1} max={5} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`w-full ${accent}`} />
    </div>
  );
}

function LatestList({
  title,
  empty,
  items,
}: {
  title: string;
  empty?: string;
  items: Array<{
    id: string;
    icon: React.ReactNode;
    title: string;
    meta: string;
    onEdit: () => void;
    onDelete: () => void;
  }>;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-border px-3 py-4 text-xs text-slate dark:border-ink-border">{empty ?? "Nenhum registro ainda."}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate font-medium">{item.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="hidden text-slate sm:inline">{item.meta}</span>
                <button onClick={item.onEdit} className="text-slate transition-colors hover:text-brand-600" title="Editar">
                  <Edit2 size={12} />
                </button>
                <button onClick={item.onDelete} className="text-slate transition-colors hover:text-drop" title="Excluir">
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmileIcon() {
  return <Sun size={14} />;
}
