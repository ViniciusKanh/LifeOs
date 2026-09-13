import { useMemo, useState } from "react";
import { Droplets, Moon, Dumbbell, Smile, Trash2, ChevronDown, Sun } from "lucide-react";
import { useHealth } from "@/hooks/useHealth";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";

const WATER_QUICK_ADD = [200, 300, 500];
const WATER_GOAL_ML = 2500; // meta fixa documentada (LifeOS ainda não tem meta de água configurável por usuário)
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtTime(iso: string) {
  return new Date(iso.replace(" ", "T")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatHM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export function SaudePage() {
  const { water, sleep, workouts, mood, addWater, removeWater, addSleep, addWorkout, removeWorkout, addMood } = useHealth();

  const [sleepForm, setSleepForm] = useState({ wentToBedAt: "", wokeUpAt: "", quality: 3 });
  const [workoutForm, setWorkoutForm] = useState({ kind: "", durationMinutes: "", distanceKm: "", intensity: "moderada" as const });
  const [moodForm, setMoodForm] = useState({ mood: 3, energy: 3, stress: 3 });

  const today = todayStr();
  const waterToday = useMemo(() => water.filter((w) => dateOnly(w.recorded_at) === today), [water, today]);
  const waterTotal = waterToday.reduce((sum, w) => sum + w.amount_ml, 0);
  const waterPct = Math.round((waterTotal / WATER_GOAL_ML) * 100);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const sleepThisWeek = useMemo(
    () => sleep.filter((s) => new Date(s.went_to_bed_at.replace(" ", "T")) >= weekStart && s.duration_minutes),
    [sleep, weekStart]
  );
  const sleepWeekly = useMemo(() => {
    const byDay = new Map<number, number>();
    for (const s of sleepThisWeek) {
      const d = new Date(s.went_to_bed_at.replace(" ", "T"));
      byDay.set(d.getDay(), (s.duration_minutes ?? 0) / 60);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const dow = (weekStart.getDay() + i) % 7; // segunda em diante
      return { label: WEEKDAY_LABELS[dow], hours: byDay.get(dow) ?? 0 };
    });
  }, [sleepThisWeek, weekStart]);
  const avgSleepMinutes = sleepThisWeek.length > 0 ? sleepThisWeek.reduce((s, x) => s + (x.duration_minutes ?? 0), 0) / sleepThisWeek.length : null;
  const bestNightMinutes = sleepThisWeek.length > 0 ? Math.max(...sleepThisWeek.map((s) => s.duration_minutes ?? 0)) : null;
  const avgQuality =
    sleepThisWeek.filter((s) => s.quality).length > 0
      ? sleepThisWeek.filter((s) => s.quality).reduce((s, x) => s + (x.quality ?? 0), 0) / sleepThisWeek.filter((s) => s.quality).length
      : null;
  const weekMaxHours = Math.max(1, ...sleepWeekly.map((d) => d.hours));

  const workoutsThisWeek = useMemo(
    () => workouts.filter((w) => new Date(w.performed_at.replace(" ", "T")) >= weekStart),
    [workouts, weekStart]
  );
  const workoutsThisWeekMinutes = workoutsThisWeek.reduce((s, w) => s + (w.duration_minutes ?? 0), 0);

  const submitSleep = async () => {
    if (!sleepForm.wentToBedAt || !sleepForm.wokeUpAt) return;
    await addSleep({
      wentToBedAt: new Date(sleepForm.wentToBedAt).toISOString(),
      wokeUpAt: new Date(sleepForm.wokeUpAt).toISOString(),
      quality: sleepForm.quality,
    });
    setSleepForm({ wentToBedAt: "", wokeUpAt: "", quality: 3 });
  };

  const submitWorkout = async () => {
    if (!workoutForm.kind.trim()) return;
    await addWorkout({
      kind: workoutForm.kind.trim(),
      durationMinutes: workoutForm.durationMinutes ? Number(workoutForm.durationMinutes) : undefined,
      distanceKm: workoutForm.distanceKm ? Number(workoutForm.distanceKm) : undefined,
      intensity: workoutForm.intensity,
    });
    setWorkoutForm({ kind: "", durationMinutes: "", distanceKm: "", intensity: "moderada" });
  };

  const submitMood = async () => {
    await addMood(moodForm);
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <p className="font-display font-bold text-2xl">Saúde e bem-estar</p>
      <p className="text-sm text-slate mt-0.5 mb-5">Cuide de você hoje para viver um amanhã melhor.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Água */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <IconBadge tone="blue" size={34} icon={<Droplets size={16} />} />
              <div>
                <p className="text-sm font-semibold">Água</p>
                <p className="text-xs text-slate">Hidratação para mais energia e foco.</p>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-end gap-2">
                <span className="font-display font-bold text-3xl">{(waterTotal / 1000).toFixed(1)}</span>
                <span className="text-xs text-slate mb-1.5">/ {(WATER_GOAL_ML / 1000).toFixed(1)} L hoje</span>
              </div>
              <p className={`text-xs font-semibold mt-0.5 ${waterPct >= 100 ? "text-growth" : "text-slate"}`}>{waterPct}% da meta</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-cat-blue/10 flex items-center justify-center">
              <Droplets size={22} className="text-cat-blue" />
            </div>
          </div>

          <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border my-4">
            <div className="h-full rounded-full bg-cat-blue transition-[width]" style={{ width: `${Math.min(100, waterPct)}%` }} />
          </div>

          <div className="flex gap-2 mb-4">
            {WATER_QUICK_ADD.map((ml) => (
              <Button key={ml} variant="secondary" className="flex-1" onClick={() => addWater(ml)}>
                +{ml}ml
              </Button>
            ))}
          </div>

          <p className="text-xs font-semibold mb-2">Registros de hoje</p>
          {waterToday.length === 0 ? (
            <p className="text-xs text-slate">Nenhum registro ainda hoje.</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {waterToday.map((w) => (
                <div key={w.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate">
                    <Droplets size={11} className="text-cat-blue" /> {w.amount_ml}ml · {fmtTime(w.recorded_at)}
                  </span>
                  <button onClick={() => removeWater(w.id)} className="text-slate hover:text-drop transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl p-3 mt-4 bg-cat-blue/5 border border-cat-blue/15 flex items-start gap-2.5">
            <Droplets size={14} className="text-cat-blue mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Dica de hoje</p>
              <p className="text-[11px] text-slate mt-0.5">Manter-se hidratado melhora seu foco, humor e desempenho cognitivo.</p>
            </div>
          </div>
        </Card>

        {/* Sono */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <IconBadge tone="purple" size={34} icon={<Moon size={16} />} />
              <div>
                <p className="text-sm font-semibold">Sono</p>
                <p className="text-xs text-slate">Mais descanso, mais produtividade.</p>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-end gap-1.5">
                <span className="font-display font-bold text-2xl">{sleep[0]?.duration_minutes ? formatHM(sleep[0].duration_minutes) : "—"}</span>
                <span className="text-xs text-slate mb-1">de sono</span>
              </div>
              <p className="text-[11px] text-slate">Última noite {sleep[0]?.quality ? `· Qualidade ${sleep[0].quality}/5` : ""}</p>
            </div>
            <div className="flex items-end gap-1 h-12">
              {sleepWeekly.map((d) => (
                <div
                  key={d.label}
                  className={`w-2.5 rounded-t-sm ${d.hours > 0 ? "bg-cat-purple" : "bg-paper-border dark:bg-ink-border"}`}
                  style={{ height: `${Math.max(3, (d.hours / weekMaxHours) * 44)}px` }}
                  title={`${d.label}: ${d.hours.toFixed(1)}h`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <Field label="Dormiu às" type="datetime-local" value={sleepForm.wentToBedAt} onChange={(e) => setSleepForm({ ...sleepForm, wentToBedAt: e.target.value })} />
            <Field label="Acordou às" type="datetime-local" value={sleepForm.wokeUpAt} onChange={(e) => setSleepForm({ ...sleepForm, wokeUpAt: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate">Qualidade do sono</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={1} max={5} value={sleepForm.quality} onChange={(e) => setSleepForm({ ...sleepForm, quality: Number(e.target.value) })} className="flex-1" />
              <span className="text-xs w-10 text-right">{sleepForm.quality}/5</span>
            </div>
          </div>
          <Button className="mt-3 w-full" onClick={submitSleep}>
            <Moon size={14} /> Registrar noite
          </Button>

          {sleepThisWeek.length > 0 && (
            <div className="mt-4 pt-4 border-t border-paper-border dark:border-ink-border grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-slate">Média de sono</p>
                <p className="text-sm font-semibold">{avgSleepMinutes ? formatHM(avgSleepMinutes) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate">Melhor noite</p>
                <p className="text-sm font-semibold">{bestNightMinutes ? formatHM(bestNightMinutes) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate">Qualidade média</p>
                <p className="text-sm font-semibold">{avgQuality ? `${avgQuality.toFixed(1)}/5` : "—"}</p>
              </div>
            </div>
          )}
        </Card>

        {/* Exercícios */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <IconBadge tone="green" size={34} icon={<Dumbbell size={16} />} />
            <div>
              <p className="text-sm font-semibold">Exercícios</p>
              <p className="text-xs text-slate">Movimento é vida.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label="Tipo" placeholder="Corrida, Musculação..." value={workoutForm.kind} onChange={(e) => setWorkoutForm({ ...workoutForm, kind: e.target.value })} />
            <Field label="Duração (min)" type="number" value={workoutForm.durationMinutes} onChange={(e) => setWorkoutForm({ ...workoutForm, durationMinutes: e.target.value })} />
            <Field label="Distância (km)" type="number" value={workoutForm.distanceKm} onChange={(e) => setWorkoutForm({ ...workoutForm, distanceKm: e.target.value })} />
            <div className="relative">
              <label className="text-xs text-slate">Intensidade</label>
              <select
                value={workoutForm.intensity}
                onChange={(e) => setWorkoutForm({ ...workoutForm, intensity: e.target.value as typeof workoutForm.intensity })}
                className="mt-1.5 w-full appearance-none rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="leve">Leve</option>
                <option value="moderada">Moderada</option>
                <option value="intensa">Intensa</option>
              </select>
              <ChevronDown size={12} className="absolute right-3 top-[34px] text-slate pointer-events-none" />
            </div>
          </div>
          <Button className="w-full" onClick={submitWorkout}>
            <Dumbbell size={14} /> Registrar exercício
          </Button>

          <div className="rounded-xl p-3 mt-4 bg-growth/5 border border-growth/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate">Esta semana</p>
              <p className="font-display font-bold text-xl">{workoutsThisWeek.length}</p>
              <p className="text-[10px] text-slate">{workoutsThisWeek.length === 1 ? "atividade" : "atividades"} · {formatHM(workoutsThisWeekMinutes)} no total</p>
            </div>
            <Dumbbell size={22} className="text-growth" />
          </div>

          <p className="text-xs font-semibold mt-4 mb-2">Últimos registros</p>
          {workouts.length === 0 ? (
            <p className="text-xs text-slate">Nenhum exercício registrado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {workouts.slice(0, 4).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">
                    <span className="font-medium">{w.kind}</span>
                    <span className="text-slate"> {w.duration_minutes ? `· ${w.duration_minutes}min` : ""}{w.distance_km ? ` · ${w.distance_km}km` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-slate">{fmtTime(w.performed_at)}</span>
                    <button onClick={() => removeWorkout(w.id)} className="text-slate hover:text-drop transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Humor e energia */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <IconBadge tone="amber" size={34} icon={<Smile size={16} />} />
            <div>
              <p className="text-sm font-semibold">Humor e energia</p>
              <p className="text-xs text-slate">Acompanhe como você está se sentindo.</p>
            </div>
          </div>

          {(["mood", "energy", "stress"] as const).map((key) => (
            <div key={key} className="flex items-center gap-3 mb-3">
              <label className="w-16 text-xs text-slate shrink-0">{key === "mood" ? "Humor" : key === "energy" ? "Energia" : "Estresse"}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={moodForm[key]}
                onChange={(e) => setMoodForm({ ...moodForm, [key]: Number(e.target.value) })}
                className={`flex-1 accent-current ${key === "mood" ? "text-signal" : key === "energy" ? "text-cat-blue" : "text-drop"}`}
              />
              <span className="text-xs w-8 text-right shrink-0">{moodForm[key]}/5</span>
            </div>
          ))}
          <Button className="w-full mt-1" onClick={submitMood}>
            <Smile size={14} /> Registrar
          </Button>

          {mood[0] && (
            <p className="text-[11px] text-slate mt-3 text-center">
              Último registro: humor {mood[0].mood}/5 · energia {mood[0].energy}/5{mood[0].stress ? ` · estresse ${mood[0].stress}/5` : ""}
            </p>
          )}

          <div className="rounded-xl p-3 mt-4 bg-gradient-to-br from-signal/10 to-cat-pink/10 border border-signal/15 flex items-start gap-2.5">
            <Sun size={14} className="text-signal-deep mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Pequenas ações, grandes mudanças</p>
              <p className="text-[11px] text-slate mt-0.5">Registrar como você se sente ajuda a identificar padrões e construir uma rotina mais equilibrada.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
