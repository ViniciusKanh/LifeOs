import { useMemo, useState } from "react";
import { Droplets, Moon, Dumbbell, Smile, Trash2, ChevronDown, Sun, Sparkles, Wand2, X } from "lucide-react";
import { useHealth } from "@/hooks/useHealth";
import { useHealthInsight } from "@/hooks/useCopilot";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { Link } from "react-router-dom";

const WATER_QUICK_ADD = [200, 300, 500];
const WATER_GOAL_ML = 2500; // meta fixa documentada (LifeOS ainda não tem meta de água configurável por usuário)
const SLEEP_GOAL_MINUTES = 8 * 60;
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

/** Série de 7 dias (segunda a domingo) a partir de uma lista de registros com data + valor — usada nos mini gráficos dos cards do topo e no gráfico semanal de sono. */
function weeklySeries<T>(entries: T[], getDate: (e: T) => string, getValue: (e: T) => number, weekStart: Date) {
  const byDay = new Map<number, number>();
  for (const e of entries) {
    const d = new Date(getDate(e).replace(" ", "T"));
    if (d < weekStart) continue;
    byDay.set(d.getDay(), (byDay.get(d.getDay()) ?? 0) + getValue(e));
  }
  return Array.from({ length: 7 }, (_, i) => {
    const dow = (weekStart.getDay() + i) % 7;
    return { label: WEEKDAY_LABELS[dow], value: byDay.get(dow) ?? 0 };
  });
}

export function SaudePage() {
  const { water, sleep, workouts, mood, addWater, removeWater, addSleep, addWorkout, removeWorkout, addMood } = useHealth();
  const insight = useHealthInsight();

  const [sleepForm, setSleepForm] = useState({ wentToBedAt: "", wokeUpAt: "", quality: 3 });
  const [workoutForm, setWorkoutForm] = useState({ kind: "", durationMinutes: "", distanceKm: "", intensity: "moderada" as const });
  const [moodForm, setMoodForm] = useState({ mood: 3, energy: 3, stress: 3 });
  const [historyOpen, setHistoryOpen] = useState<"water" | "sleep" | null>(null);

  const today = todayStr();
  const waterToday = useMemo(() => water.filter((w) => dateOnly(w.recorded_at) === today), [water, today]);
  const waterTotal = waterToday.reduce((sum, w) => sum + w.amount_ml, 0);
  const waterPct = Math.round((waterTotal / WATER_GOAL_ML) * 100);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const sleepThisWeek = useMemo(
    () => sleep.filter((s) => new Date(s.went_to_bed_at.replace(" ", "T")) >= weekStart && s.duration_minutes),
    [sleep, weekStart]
  );
  const sleepWeekly = useMemo(
    () => weeklySeries(sleepThisWeek, (s) => s.went_to_bed_at, (s) => (s.duration_minutes ?? 0) / 60, weekStart),
    [sleepThisWeek, weekStart]
  );
  const avgSleepMinutes = sleepThisWeek.length > 0 ? sleepThisWeek.reduce((s, x) => s + (x.duration_minutes ?? 0), 0) / sleepThisWeek.length : null;
  const bestNightMinutes = sleepThisWeek.length > 0 ? Math.max(...sleepThisWeek.map((s) => s.duration_minutes ?? 0)) : null;
  const avgQuality =
    sleepThisWeek.filter((s) => s.quality).length > 0
      ? sleepThisWeek.filter((s) => s.quality).reduce((s, x) => s + (x.quality ?? 0), 0) / sleepThisWeek.filter((s) => s.quality).length
      : null;
  const weekMaxHours = Math.max(1, ...sleepWeekly.map((d) => d.value));
  const lastNightMinutes = sleep[0]?.duration_minutes ?? null;
  const sleepPct = lastNightMinutes ? Math.round((lastNightMinutes / SLEEP_GOAL_MINUTES) * 100) : 0;

  const workoutsThisWeek = useMemo(
    () => workouts.filter((w) => new Date(w.performed_at.replace(" ", "T")) >= weekStart),
    [workouts, weekStart]
  );
  const workoutsThisWeekMinutes = workoutsThisWeek.reduce((s, w) => s + (w.duration_minutes ?? 0), 0);
  const workoutsWeekly = useMemo(
    () => weeklySeries(workoutsThisWeek, (w) => w.performed_at, () => 1, weekStart),
    [workoutsThisWeek, weekStart]
  );

  const moodThisWeek = useMemo(() => mood.filter((m) => new Date(m.recorded_at.replace(" ", "T")) >= weekStart), [mood, weekStart]);
  const moodWeekly = useMemo(
    () => weeklySeries(moodThisWeek, (m) => m.recorded_at, (m) => m.mood, weekStart),
    [moodThisWeek, weekStart]
  );
  const avgMoodWeek = moodThisWeek.length > 0 ? moodThisWeek.reduce((s, m) => s + m.mood, 0) / moodThisWeek.length : null;

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

  // Selos de status dos cards do topo — sempre derivados dos dados
  // reais (nunca um texto fixo), para refletir o dia de fato.
  const waterBadge =
    waterPct >= 100 ? { label: "Ótimo!", tone: "green" as const } : waterPct >= 50 ? { label: "Quase lá!", tone: "amber" as const } : { label: "Beba mais água", tone: "slate" as const };
  const sleepBadge =
    !lastNightMinutes
      ? { label: "Sem registro", tone: "slate" as const }
      : sleepPct >= 90
      ? { label: "Ótima noite!", tone: "green" as const }
      : sleepPct >= 70
      ? { label: "Quase lá!", tone: "amber" as const }
      : { label: "Durma mais", tone: "slate" as const };
  const workoutsBadge =
    workoutsThisWeek.length >= 3 ? { label: "Boa semana!", tone: "green" as const } : workoutsThisWeek.length >= 1 ? { label: "Continue assim", tone: "amber" as const } : { label: "Bora se mexer", tone: "slate" as const };
  const moodBadge =
    avgMoodWeek === null ? { label: "Sem registro", tone: "slate" as const } : avgMoodWeek >= 4 ? { label: "Ótimo humor!", tone: "green" as const } : avgMoodWeek >= 2.5 ? { label: "Estável", tone: "amber" as const } : { label: "Atenção", tone: "slate" as const };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <p className="font-display font-bold text-2xl">Saúde e bem-estar</p>
      <p className="text-sm text-slate mt-0.5 mb-5">Cuide de você hoje para viver um amanhã melhor.</p>

      {/* Resumo do dia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatSummaryCard
          tone="blue"
          icon={<Droplets size={16} />}
          label="Água"
          value={`${(waterTotal / 1000).toFixed(1)} / ${(WATER_GOAL_ML / 1000).toFixed(1)} L`}
          badge={waterBadge}
          progressPct={Math.min(100, waterPct)}
          caption={`${waterPct}% da meta`}
          weekly={weeklySeries(water, (w) => w.recorded_at, (w) => w.amount_ml / 1000, weekStart)}
        />
        <StatSummaryCard
          tone="purple"
          icon={<Moon size={16} />}
          label="Sono"
          value={lastNightMinutes ? formatHM(lastNightMinutes) : "—"}
          badge={sleepBadge}
          progressPct={Math.min(100, sleepPct)}
          caption={lastNightMinutes ? `${sleepPct}% da meta` : "sem registro"}
          weekly={sleepWeekly}
        />
        <StatSummaryCard
          tone="green"
          icon={<Dumbbell size={16} />}
          label="Exercícios"
          value={`${workoutsThisWeek.length} ${workoutsThisWeek.length === 1 ? "atividade" : "atividades"}`}
          badge={workoutsBadge}
          caption={`${workoutsThisWeekMinutes} min no total`}
          weekly={workoutsWeekly}
        />
        <StatSummaryCard
          tone="amber"
          icon={<Smile size={16} />}
          label="Humor & energia"
          value={mood[0] ? `${mood[0].mood} / 5` : avgMoodWeek !== null ? `${avgMoodWeek.toFixed(1)} / 5` : "— / 5"}
          badge={moodBadge}
          caption={mood[0] ? `energia ${mood[0].energy}/5` : "Sem registro"}
          weekly={moodWeekly}
        />
      </div>

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
            <button onClick={() => setHistoryOpen("water")} className="text-xs font-medium text-brand-600 dark:text-brand-500 shrink-0">
              Ver histórico →
            </button>
          </div>

          <div className="flex items-center gap-5">
            <WaterRing pct={Math.min(100, waterPct)} />
            <div>
              <p className="font-display font-bold text-3xl leading-none">
                {(waterTotal / 1000).toFixed(1)}
                <span className="text-sm font-normal text-slate"> L</span>
              </p>
              <p className="text-xs text-slate mt-1">de {(WATER_GOAL_ML / 1000).toFixed(1)} L hoje</p>
              <p className={`text-xs font-semibold mt-2 ${waterPct >= 100 ? "text-growth" : "text-slate"}`}>{waterPct}% da meta</p>
            </div>
          </div>

          <p className="text-xs font-semibold mt-5 mb-2">Adicionar rapidamente</p>
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
            <button onClick={() => setHistoryOpen("sleep")} className="text-xs font-medium text-brand-600 dark:text-brand-500 shrink-0">
              Ver histórico →
            </button>
          </div>

          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-end gap-1.5">
                <span className="font-display font-bold text-2xl">{lastNightMinutes ? formatHM(lastNightMinutes) : "—"}</span>
                <span className="text-xs text-slate mb-1">de sono</span>
              </div>
              <p className="text-[11px] text-slate">Última noite {sleep[0]?.quality ? `· Qualidade ${sleep[0].quality}/5` : ""}</p>
            </div>
            <div className="flex items-end gap-1 h-12">
              {sleepWeekly.map((d) => (
                <div
                  key={d.label}
                  className={`w-2.5 rounded-t-sm ${d.value > 0 ? "bg-cat-purple dark:bg-cat-purple-dark" : "bg-paper-border dark:bg-ink-border"}`}
                  style={{ height: `${Math.max(3, (d.value / weekMaxHours) * 44)}px` }}
                  title={`${d.label}: ${d.value.toFixed(1)}h`}
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

      {/* Insight de bem-estar (Gemini) + card motivacional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <IconBadge tone="pink" size={34} icon={<Sparkles size={15} />} />
              <div>
                <p className="text-sm font-semibold">Insight de bem-estar</p>
                <p className="text-xs text-slate">Análise da IA sobre água, sono, exercício e humor dos últimos 7 dias.</p>
              </div>
            </div>
            <button
              onClick={() => insight.generate()}
              disabled={insight.isGenerating}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-3.5 py-2 text-xs font-semibold hover:bg-paper dark:hover:bg-ink-overlay disabled:opacity-60 transition-colors"
            >
              <Wand2 size={13} />
              {insight.isGenerating ? "Analisando..." : insight.text ? "Gerar outra análise" : "Analisar com IA"}
            </button>
          </div>

          {insight.error ? (
            <p className="text-xs mt-4 bg-drop/10 text-drop rounded-xl px-4 py-3">
              {insight.error.message}
              {insight.error.status === 400 && (
                <>
                  {" "}
                  <Link to="/configuracoes" className="underline font-semibold">
                    Ir para Configurações
                  </Link>
                </>
              )}
            </p>
          ) : insight.text ? (
            <p className="text-sm leading-relaxed mt-4 bg-cat-pink/5 border border-cat-pink/15 rounded-xl px-4 py-3">{insight.text}</p>
          ) : (
            <p className="text-xs text-slate mt-4">
              Peça uma análise para o Copilot cruzar seus próprios números de água, sono, exercício e humor e apontar um padrão real — não um texto genérico.
            </p>
          )}
        </Card>

        <Card className="p-6 bg-gradient-to-br from-brand-600 to-cat-purple text-white border-0 shadow-card">
          <Sparkles size={22} className="mb-3 opacity-90" />
          <p className="font-display font-bold text-lg leading-snug">Um novo dia, novas oportunidades</p>
          <p className="text-sm opacity-90 mt-2 leading-relaxed">Continue cuidando de você. Seu bem-estar de hoje constrói o seu melhor amanhã.</p>
          <p className="text-xs italic opacity-80 mt-4 pt-4 border-t border-white/20">
            &ldquo;Corpo saudável, mente mais forte.&rdquo;
          </p>
        </Card>
      </div>

      {historyOpen && (
        <HistoryModal
          title={historyOpen === "water" ? "Histórico de água" : "Histórico de sono"}
          onClose={() => setHistoryOpen(null)}
        >
          {historyOpen === "water" ? (
            water.length === 0 ? (
              <p className="text-sm text-slate">Nenhum registro de água ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {water.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-sm py-1.5 border-b border-paper-border dark:border-ink-border last:border-0">
                    <span className="flex items-center gap-2">
                      <Droplets size={13} className="text-cat-blue" /> {w.amount_ml}ml
                    </span>
                    <span className="text-slate text-xs">{fmtTime(w.recorded_at)}</span>
                  </div>
                ))}
              </div>
            )
          ) : sleep.length === 0 ? (
            <p className="text-sm text-slate">Nenhum registro de sono ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {sleep.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-paper-border dark:border-ink-border last:border-0">
                  <span className="flex items-center gap-2">
                    <Moon size={13} className="text-cat-purple" /> {s.duration_minutes ? formatHM(s.duration_minutes) : "—"}
                    {s.quality ? ` · ${s.quality}/5` : ""}
                  </span>
                  <span className="text-slate text-xs">{fmtTime(s.went_to_bed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </HistoryModal>
      )}
    </div>
  );
}

/** Anel de progresso circular (SVG) usado no card de água — mesmo raciocínio de um medidor físico de hidratação, mais legível de relance que uma barra linear. */
function WaterRing({ pct }: { pct: number }) {
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-paper-border dark:stroke-ink-border" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeLinecap="round"
        className="stroke-cat-blue transition-[stroke-dashoffset] duration-500"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

const TONE_BAR: Record<string, string> = {
  blue: "bg-cat-blue dark:bg-cat-blue-dark",
  purple: "bg-cat-purple dark:bg-cat-purple-dark",
  green: "bg-cat-green dark:bg-cat-green-dark",
  amber: "bg-signal",
};

const BADGE_TONE: Record<string, string> = {
  green: "bg-growth/10 text-growth",
  amber: "bg-signal/15 text-signal-deep dark:text-signal",
  slate: "bg-slate/10 text-slate",
};

function StatSummaryCard({
  tone,
  icon,
  label,
  value,
  badge,
  progressPct,
  caption,
  weekly,
}: {
  tone: "blue" | "purple" | "green" | "amber";
  icon: React.ReactNode;
  label: string;
  value: string;
  badge: { label: string; tone: "green" | "amber" | "slate" };
  progressPct?: number;
  caption: string;
  weekly: { label: string; value: number }[];
}) {
  const maxVal = Math.max(1, ...weekly.map((d) => d.value));
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBadge tone={tone} icon={icon} size={32} />
          <span className="text-xs text-slate truncate">{label}</span>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${BADGE_TONE[badge.tone]}`}>{badge.label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-bold text-lg leading-none truncate">{value}</p>
          <p className="text-[11px] text-slate mt-1.5 truncate">{caption}</p>
        </div>
        <div className="hidden sm:flex items-end gap-[3px] h-7 shrink-0">
          {weekly.map((d, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-t-sm ${d.value > 0 ? TONE_BAR[tone] : "bg-paper-border dark:bg-ink-border"}`}
              style={{ height: `${Math.max(2, (d.value / maxVal) * 28)}px` }}
              title={`${d.label}: ${d.value.toFixed(1)}`}
            />
          ))}
        </div>
      </div>
      {progressPct !== undefined && (
        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-3">
          <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </Card>
  );
}

function HistoryModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-5 shadow-card-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-semibold text-base">{title}</p>
          <button onClick={onClose} className="text-slate hover:text-inherit transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
