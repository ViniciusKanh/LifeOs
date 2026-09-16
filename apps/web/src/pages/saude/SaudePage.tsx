import { useMemo, useState, type ReactNode } from "react";
import { Activity, Dumbbell, Droplets, HeartPulse, Loader2, Moon, ShieldCheck, Sun } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useHealth, useHealthCorrelations } from "@/hooks/useHealth";
import { useHealthInsight } from "@/hooks/useCopilot";
import { Card, IconBadge, PageHeader } from "@/components/ui/primitives";
import { HealthEditModal, type HealthUpdatePatch } from "@/components/health/HealthEditModal";
import { HealthStatCard, type HealthBadge } from "@/components/health/HealthStatCard";
import { HealthHistoryModal, type HealthEditTarget, type HealthHistoryKind } from "@/components/health/HealthHistoryModal";
import {
  HealthCorrelationsCard,
  MoodCard,
  SleepCard,
  WaterCard,
  WellnessIllustrationCard,
  WellnessInsightCard,
  WorkoutCard,
} from "@/components/health/HealthCards";
import {
  SLEEP_GOAL_MINUTES,
  WATER_GOAL_ML,
  formatHM,
  localDateKey,
  parseHealthDate,
  startOfWeek,
  todayKey,
  weeklySeries,
} from "@/components/health/healthUtils";
import type { MoodEntryInput, SleepEntryInput, WaterEntryInput, WorkoutInput } from "@/services/healthService";

function boundedPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusBadge(value: number | null, highLabel: string, middleLabel: string, emptyLabel = "Sem registro"): HealthBadge {
  if (value === null) return { label: emptyLabel, tone: "slate" };
  if (value >= 90) return { label: highLabel, tone: "green" };
  if (value >= 60) return { label: middleLabel, tone: "amber" };
  return { label: "Atenção", tone: "slate" };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function SaudePage() {
  const {
    water,
    sleep,
    workouts,
    mood,
    isLoading,
    addWater,
    updateWater,
    removeWater,
    addSleep,
    updateSleep,
    removeSleep,
    addWorkout,
    updateWorkout,
    removeWorkout,
    addMood,
    updateMood,
    removeMood,
  } = useHealth();
  const { correlations, isLoading: correlationsLoading } = useHealthCorrelations();
  const insight = useHealthInsight();

  const [historyOpen, setHistoryOpen] = useState<HealthHistoryKind | null>(null);
  const [editTarget, setEditTarget] = useState<HealthEditTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const today = todayKey();

  const waterToday = useMemo(() => water.filter((entry) => localDateKey(entry.recorded_at) === today), [water, today]);
  const waterTotal = waterToday.reduce((sum, entry) => sum + entry.amount_ml, 0);
  const waterPct = Math.round((waterTotal / WATER_GOAL_ML) * 100);
  const waterWeekly = useMemo(() => weeklySeries(water, (entry) => entry.recorded_at, (entry) => entry.amount_ml / 1000, weekStart), [water, weekStart]);

  const sleepThisWeek = useMemo(
    () => sleep.filter((entry) => parseHealthDate(entry.went_to_bed_at) >= weekStart && entry.duration_minutes),
    [sleep, weekStart]
  );
  const sleepWeekly = useMemo(
    () => weeklySeries(sleep, (entry) => entry.went_to_bed_at, (entry) => (entry.duration_minutes ?? 0) / 60, weekStart),
    [sleep, weekStart]
  );
  const lastNightMinutes = sleep[0]?.duration_minutes ?? null;
  const sleepPct = lastNightMinutes ? Math.round((lastNightMinutes / SLEEP_GOAL_MINUTES) * 100) : 0;
  const avgSleepMinutes = average(sleepThisWeek.map((entry) => entry.duration_minutes ?? 0));
  const avgQuality = average(sleepThisWeek.map((entry) => entry.quality).filter((value): value is number => value !== null));

  const workoutsThisWeek = useMemo(() => workouts.filter((entry) => parseHealthDate(entry.performed_at) >= weekStart), [workouts, weekStart]);
  const workoutsThisWeekMinutes = workoutsThisWeek.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0);
  const workoutsPct = Math.round((workoutsThisWeekMinutes / 150) * 100);
  const workoutsWeekly = useMemo(() => weeklySeries(workouts, (entry) => entry.performed_at, () => 1, weekStart), [workouts, weekStart]);

  const moodThisWeek = useMemo(() => mood.filter((entry) => parseHealthDate(entry.recorded_at) >= weekStart), [mood, weekStart]);
  const moodWeekly = useMemo(() => weeklySeries(mood, (entry) => entry.recorded_at, (entry) => entry.mood, weekStart), [mood, weekStart]);
  const avgMoodWeek = average(moodThisWeek.map((entry) => entry.mood));
  const moodPct = avgMoodWeek === null ? 0 : Math.round((avgMoodWeek / 5) * 100);

  const waterGoalDays = waterWeekly.filter((day) => day.value * 1000 >= WATER_GOAL_ML).length;
  const exerciseEnergyTrend = useMemo(() => {
    const workoutDays = new Set(workouts.map((entry) => localDateKey(entry.performed_at)));
    const withExercise = mood.filter((entry) => workoutDays.has(localDateKey(entry.recorded_at))).map((entry) => entry.energy);
    const withoutExercise = mood.filter((entry) => !workoutDays.has(localDateKey(entry.recorded_at))).map((entry) => entry.energy);
    const avgWith = average(withExercise);
    const avgWithout = average(withoutExercise);
    if (avgWith === null || avgWithout === null || withExercise.length < 2 || withoutExercise.length < 2) return null;
    if (avgWith > avgWithout + 0.4) return "Seus registros mostram tendencia de energia maior nos dias com exercicio.";
    if (avgWithout > avgWith + 0.4) return "Seus registros mostram tendencia de energia menor nos dias com exercicio.";
    return "Seus registros de energia estao estaveis entre dias com e sem exercicio.";
  }, [mood, workouts]);

  const waterBadge: HealthBadge =
    waterPct >= 100 ? { label: "Otimo!", tone: "green" } : waterPct >= 50 ? { label: "Quase la", tone: "amber" } : { label: "Beba mais agua", tone: "slate" };
  const sleepBadge = statusBadge(lastNightMinutes ? (lastNightMinutes / SLEEP_GOAL_MINUTES) * 100 : null, "Otima noite", "Quase la");
  const workoutsBadge: HealthBadge =
    workoutsThisWeek.length >= 3 ? { label: "Boa semana", tone: "green" } : workoutsThisWeek.length >= 1 ? { label: "Continue assim", tone: "amber" } : { label: "Bora se mexer", tone: "slate" };
  const moodBadge: HealthBadge =
    avgMoodWeek === null ? { label: "Sem registro", tone: "slate" } : avgMoodWeek >= 4 ? { label: "Bem hoje", tone: "green" } : avgMoodWeek >= 2.5 ? { label: "Estavel", tone: "amber" } : { label: "Atencao", tone: "slate" };

  const vitalityScore = useMemo(() => {
    const scores = [
      waterToday.length > 0 ? boundedPct(waterPct) : null,
      lastNightMinutes ? boundedPct(sleepPct) : null,
      workoutsThisWeek.length > 0 ? boundedPct(workoutsPct) : null,
      avgMoodWeek !== null ? boundedPct(moodPct) : null,
    ].filter((score): score is number => score !== null);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [avgMoodWeek, lastNightMinutes, moodPct, sleepPct, waterPct, waterToday.length, workoutsPct, workoutsThisWeek.length]);

  const healthPulse = useMemo(
    () =>
      waterWeekly.map((day, index) => ({
        label: day.label,
        Agua: boundedPct((day.value * 1000 / WATER_GOAL_ML) * 100),
        Sono: boundedPct((((sleepWeekly[index]?.value ?? 0) * 60) / SLEEP_GOAL_MINUTES) * 100),
        Movimento: (workoutsWeekly[index]?.value ?? 0) > 0 ? 100 : 0,
        Humor: boundedPct(((moodWeekly[index]?.value ?? 0) / 5) * 100),
      })),
    [moodWeekly, sleepWeekly, waterWeekly, workoutsWeekly]
  );

  const careSteps = [
    {
      icon: <Droplets size={14} />,
      label: waterPct >= 100 ? "Água em dia" : `Faltam ${Math.max(0, WATER_GOAL_ML - waterTotal)}ml de água`,
      done: waterPct >= 100,
    },
    {
      icon: <Moon size={14} />,
      label: lastNightMinutes ? `Sono: ${formatHM(lastNightMinutes)}` : "Registre sua última noite",
      done: Boolean(lastNightMinutes && sleepPct >= 85),
    },
    {
      icon: <Dumbbell size={14} />,
      label: workoutsThisWeek.length > 0 ? `${workoutsThisWeek.length} treino(s) na semana` : "Movimente o corpo hoje",
      done: workoutsThisWeek.length >= 3,
    },
    {
      icon: <Sun size={14} />,
      label: avgMoodWeek !== null ? `Humor médio ${avgMoodWeek.toFixed(1)}/5` : "Faça um check-in emocional",
      done: Boolean(avgMoodWeek !== null && avgMoodWeek >= 4),
    },
  ];

  function openEdit(target: HealthEditTarget) {
    setHistoryOpen(null);
    setEditTarget(target);
  }

  async function deleteByKind(kind: HealthHistoryKind, id: string) {
    if (kind === "water") await removeWater(id);
    if (kind === "sleep") await removeSleep(id);
    if (kind === "workouts") await removeWorkout(id);
    if (kind === "mood") await removeMood(id);
    setToast("Registro excluido.");
  }

  async function saveEdit(target: HealthEditTarget, patch: HealthUpdatePatch) {
    if (target.kind === "water") await updateWater({ id: target.entry.id, patch: patch as Partial<WaterEntryInput> });
    if (target.kind === "sleep") await updateSleep({ id: target.entry.id, patch: patch as Partial<SleepEntryInput> });
    if (target.kind === "workouts") await updateWorkout({ id: target.entry.id, patch: patch as Partial<WorkoutInput> });
    if (target.kind === "mood") await updateMood({ id: target.entry.id, patch: patch as Partial<MoodEntryInput> });
    setToast("Registro atualizado.");
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<HeartPulse size={21} />}
        title="Saúde e bem-estar"
        subtitle="Cuide de você hoje para viver um amanhã melhor."
        actions={<p className="text-xs italic text-slate">Corpo saudável, mente mais forte.</p>}
      />

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-paper-border bg-paper-raised px-4 py-3 text-sm text-slate dark:border-ink-border dark:bg-ink-raised">
          <Loader2 size={16} className="animate-spin" />
          Carregando seus registros de bem-estar...
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <HealthHero
          vitalityScore={vitalityScore}
          waterPct={boundedPct(waterPct)}
          sleepPct={boundedPct(sleepPct)}
          workoutsPct={boundedPct(workoutsPct)}
          moodPct={boundedPct(moodPct)}
        />
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <IconBadge tone="teal" size={34} icon={<Activity size={15} />} />
              <div>
                <p className="text-sm font-semibold">Pulso da semana</p>
                <p className="text-xs text-slate">Cada linha está normalizada de 0 a 100.</p>
              </div>
            </div>
            <span className="rounded-full bg-growth/10 px-2.5 py-1 text-[11px] font-semibold text-growth">
              {waterGoalDays}/7 dias com água
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={healthPulse} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="healthWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3478F6" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#3478F6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="healthMood" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F5A31A" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#F5A31A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E5EAF2" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid rgba(148,163,184,.35)", fontSize: 12 }} formatter={(value) => [`${Math.round(Number(value))}%`, ""]} />
                <Area type="monotone" dataKey="Agua" stroke="#3478F6" strokeWidth={2} fill="url(#healthWater)" />
                <Area type="monotone" dataKey="Sono" stroke="#7C4DFF" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="Movimento" stroke="#22B573" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="Humor" stroke="#F5A31A" strokeWidth={2} fill="url(#healthMood)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate sm:grid-cols-4">
            <LegendDot color="bg-cat-blue" label="Água" />
            <LegendDot color="bg-cat-purple" label="Sono" />
            <LegendDot color="bg-growth" label="Movimento" />
            <LegendDot color="bg-signal" label="Humor" />
          </div>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        {careSteps.map((step) => (
          <CareStep key={step.label} {...step} />
        ))}
      </div>

      <div className="-mx-4 mb-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        <HealthStatCard
          tone="blue"
          icon={<Droplets size={16} />}
          label="Água"
          value={`${(waterTotal / 1000).toFixed(1)} / ${(WATER_GOAL_ML / 1000).toFixed(1)} L`}
          badge={waterBadge}
          progressPct={boundedPct(waterPct)}
          caption={`${waterPct}% da meta`}
          weekly={waterWeekly}
        />
        <HealthStatCard
          tone="purple"
          icon={<Moon size={16} />}
          label="Sono"
          value={lastNightMinutes ? formatHM(lastNightMinutes) : "--"}
          badge={sleepBadge}
          progressPct={boundedPct(sleepPct)}
          caption={lastNightMinutes ? `${sleepPct}% da meta` : "sem registro"}
          weekly={sleepWeekly}
        />
        <HealthStatCard
          tone="green"
          icon={<Dumbbell size={16} />}
          label="Exercícios"
          value={`${workoutsThisWeek.length} ${workoutsThisWeek.length === 1 ? "atividade" : "atividades"}`}
          badge={workoutsBadge}
          caption={`${workoutsThisWeekMinutes} min no total`}
          weekly={workoutsWeekly}
        />
        <HealthStatCard
          tone="amber"
          icon={<Sun size={16} />}
          label="Humor & energia"
          value={mood[0] ? `${mood[0].mood} / 5` : avgMoodWeek !== null ? `${avgMoodWeek.toFixed(1)} / 5` : "-- / 5"}
          badge={moodBadge}
          caption={mood[0] ? `energia ${mood[0].energy}/5` : "sem registro"}
          weekly={moodWeekly}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WaterCard
          waterToday={waterToday}
          waterTotal={waterTotal}
          waterPct={waterPct}
          onQuickAdd={async (amountMl) => {
            await addWater(amountMl);
            setToast(`+${amountMl} ml registrados.`);
          }}
          onDelete={(id) => deleteByKind("water", id)}
          onEdit={openEdit}
          onOpenHistory={() => setHistoryOpen("water")}
        />
        <SleepCard
          sleep={sleep}
          sleepWeekly={sleepWeekly}
          lastNightMinutes={lastNightMinutes}
          avgSleepMinutes={avgSleepMinutes}
          avgQuality={avgQuality}
          onAddSleep={async (input) => {
            await addSleep(input);
            setToast("Noite registrada.");
          }}
          onDelete={(id) => deleteByKind("sleep", id)}
          onEdit={openEdit}
          onOpenHistory={() => setHistoryOpen("sleep")}
        />
        <WorkoutCard
          workouts={workouts}
          workoutsWeekly={workoutsWeekly}
          workoutsThisWeekMinutes={workoutsThisWeekMinutes}
          onAddWorkout={async (input) => {
            await addWorkout(input);
            setToast("Exercicio registrado.");
          }}
          onDelete={(id) => deleteByKind("workouts", id)}
          onEdit={openEdit}
          onOpenHistory={() => setHistoryOpen("workouts")}
        />
        <MoodCard
          mood={mood}
          onAddMood={async (input) => {
            await addMood(input);
            setToast("Check-in de bem-estar salvo.");
          }}
          onDelete={(id) => deleteByKind("mood", id)}
          onEdit={openEdit}
          onOpenHistory={() => setHistoryOpen("mood")}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WellnessInsightCard
          waterGoalDays={waterGoalDays}
          exerciseEnergyTrend={exerciseEnergyTrend}
          insightText={insight.text}
          insightError={insight.error}
          isGenerating={insight.isGenerating}
          onGenerate={() => insight.generate()}
        />
        <WellnessIllustrationCard />
      </div>

      <HealthCorrelationsCard correlations={correlations} isLoading={correlationsLoading} />

      {historyOpen && (
        <HealthHistoryModal
          kind={historyOpen}
          water={water}
          sleep={sleep}
          workouts={workouts}
          mood={mood}
          onClose={() => setHistoryOpen(null)}
          onEdit={openEdit}
          onDelete={(kind, id) => void deleteByKind(kind, id)}
        />
      )}

      {editTarget && <HealthEditModal target={editTarget} onClose={() => setEditTarget(null)} onSave={saveEdit} />}

      {toast && (
        <button
          className="fixed bottom-5 right-5 z-[70] rounded-xl border border-paper-border bg-paper-raised px-4 py-3 text-left text-sm font-semibold shadow-card dark:border-ink-border dark:bg-ink-raised"
          onClick={() => setToast(null)}
        >
          {toast}
        </button>
      )}
    </div>
  );
}

function HealthHero({
  vitalityScore,
  waterPct,
  sleepPct,
  workoutsPct,
  moodPct,
}: {
  vitalityScore: number;
  waterPct: number;
  sleepPct: number;
  workoutsPct: number;
  moodPct: number;
}) {
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#19223A] via-[#2F416E] to-[#0D9488] p-6 text-white shadow-card">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
        <div className="relative mx-auto flex h-48 w-48 items-center justify-center rounded-full border border-white/15 bg-white/10">
          <div
            className="absolute inset-3 rounded-full"
            style={{ background: `conic-gradient(#22B573 ${vitalityScore * 3.6}deg, rgba(255,255,255,.16) 0deg)` }}
          />
          <div className="relative flex h-36 w-36 flex-col items-center justify-center rounded-full bg-[#18213A]/92 text-center">
            <HeartPulse size={24} className="mb-2 text-[#63E6BE]" />
            <p className="font-display text-4xl font-bold leading-none">{vitalityScore}</p>
            <p className="mt-1 text-xs text-white/70">vitalidade</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Mapa de bem-estar</p>
          <p className="mt-2 font-display text-2xl font-bold leading-tight">Sua saúde em uma leitura rápida.</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/82">
            O índice mistura água de hoje, última noite de sono, movimento semanal e humor médio. Quanto mais registros, mais fiel ele fica.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <HeroMetric icon={<Droplets size={14} />} label="Água" value={waterPct} />
            <HeroMetric icon={<Moon size={14} />} label="Sono" value={sleepPct} />
            <HeroMetric icon={<Dumbbell size={14} />} label="Movimento" value={workoutsPct} />
            <HeroMetric icon={<Sun size={14} />} label="Humor" value={moodPct} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function HeroMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-white/85">{icon}{label}</span>
        <span>{boundedPct(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/16">
        <div className="h-full rounded-full bg-white" style={{ width: `${boundedPct(value)}%` }} />
      </div>
    </div>
  );
}

function CareStep({ icon, label, done }: { icon: ReactNode; label: string; done: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${done ? "bg-growth/10 text-growth" : "bg-signal/10 text-signal-deep"}`}>
          {done ? <ShieldCheck size={15} /> : icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{done ? "Em dia" : "Próximo cuidado"}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
