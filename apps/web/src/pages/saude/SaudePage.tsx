import { useMemo, useState } from "react";
import { Dumbbell, Droplets, HeartPulse, Loader2, Moon, Sun } from "lucide-react";
import { useHealth, useHealthCorrelations } from "@/hooks/useHealth";
import { useHealthInsight } from "@/hooks/useCopilot";
import { PageHeader } from "@/components/ui/primitives";
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
  const workoutsWeekly = useMemo(() => weeklySeries(workouts, (entry) => entry.performed_at, () => 1, weekStart), [workouts, weekStart]);

  const moodThisWeek = useMemo(() => mood.filter((entry) => parseHealthDate(entry.recorded_at) >= weekStart), [mood, weekStart]);
  const moodWeekly = useMemo(() => weeklySeries(mood, (entry) => entry.recorded_at, (entry) => entry.mood, weekStart), [mood, weekStart]);
  const avgMoodWeek = average(moodThisWeek.map((entry) => entry.mood));

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
