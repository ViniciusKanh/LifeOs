import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Timer as TimerIcon, Coffee, Lightbulb, History, ChevronDown, Flame, ListChecks, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { useFocus } from "@/hooks/useFocus";
import { useTasks } from "@/hooks/useTasks";
import { Button, Card, IconBadge, PageHeader } from "@/components/ui/primitives";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function isoDay(at: string) {
  return String(at).slice(0, 10);
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}

function formatClock(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Dicas estáticas de produtividade — conteúdo editorial, não dado
// medido do usuário, por isso nunca é misturado com os números reais.
const TIPS = [
  "Desligue notificações do celular antes de começar o ciclo.",
  "Defina uma única tarefa como alvo do ciclo — evite trocar de foco no meio.",
  "Depois de 4 ciclos, faça uma pausa mais longa (15–20 min).",
];

const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function FocoPage() {
  const { activeSession, summary, recentSessions, start, stop } = useFocus(50);
  const { tasks } = useTasks();
  const [mode, setMode] = useState<"pomodoro" | "free_timer">("pomodoro");
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [taskId, setTaskId] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showStopModal, setShowStopModal] = useState(false);
  const [productivity, setProductivity] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [fullHistoryOpen, setFullHistoryOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const completedSessions = useMemo(() => recentSessions.filter((s) => s.ended_at && s.actual_minutes != null), [recentSessions]);

  // Últimos 7 dias (hoje incluso) — soma de minutos por dia, a partir
  // das sessões já carregadas (nunca um número inventado).
  const weeklyChart = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of completedSessions) {
      const day = isoDay(s.started_at);
      byDay.set(day, (byDay.get(day) ?? 0) + (s.actual_minutes ?? 0));
    }
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      return { iso, label: WEEKDAY_LABELS[d.getDay()], minutes: byDay.get(iso) ?? 0, isToday: i === 6 };
    });
  }, [completedSessions]);

  // Sequência de dias consecutivos (até hoje) com ao menos uma sessão
  // concluída — mesmo raciocínio de streak usado em Hábitos.
  const focusStreak = useMemo(() => {
    const days = new Set(completedSessions.map((s) => isoDay(s.started_at)));
    let streak = 0;
    const cursor = new Date();
    for (;;) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!days.has(iso)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [completedSessions]);

  const longestSession = completedSessions.length > 0 ? Math.max(...completedSessions.map((s) => s.actual_minutes ?? 0)) : null;

  // Só tarefas ainda não concluídas fazem sentido como alvo de um
  // ciclo de foco — não oferecemos um seletor de "Projeto" porque o
  // LifeOS ainda não tem uma entidade de Projetos na interface.
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status !== "Concluído"), [tasks]);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = new Date(activeSession.started_at.replace(" ", "T") + "Z").getTime();
    const tick = () => setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession]);

  const activeMode = activeSession?.mode ?? mode;
  const plannedSeconds = (activeSession?.planned_minutes ?? plannedMinutes) * 60;
  const remaining = plannedSeconds - elapsedSeconds;

  // Progresso real do anel: só existe para o modo Pomodoro, que tem
  // uma meta de duração. No cronômetro livre não há alvo, então o
  // anel fica decorativo (cheio) em vez de fingir uma % de conclusão.
  const ringFraction = activeSession
    ? activeMode === "pomodoro"
      ? Math.min(1, Math.max(0, elapsedSeconds / plannedSeconds))
      : 1
    : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringFraction);

  const handleStart = async () => {
    setError(null);
    try {
      await start({
        mode,
        plannedMinutes: mode === "pomodoro" ? plannedMinutes : undefined,
        taskId: taskId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a sessão de foco.");
    }
  };

  const handleConfirmStop = async () => {
    if (!activeSession) return;
    setError(null);
    try {
      await stop({ id: activeSession.id, perceivedProductivity: productivity });
      setShowStopModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível encerrar a sessão de foco.");
    }
  };

  const activeTask = activeSession?.task_id ? tasks.find((t) => t.id === activeSession.task_id) : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<TimerIcon size={20} />}
        title="Focus Mode"
        subtitle="Concentre-se em uma coisa de cada vez e acompanhe seu ritmo de foco."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <Card className="p-6 md:p-8 flex flex-col items-center text-center">
            {!activeSession && (
              <div className="flex items-center rounded-xl border border-paper-border dark:border-ink-border p-1 bg-paper dark:bg-ink mb-6">
                <button
                  onClick={() => setMode("pomodoro")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "pomodoro" ? "bg-paper-raised dark:bg-ink-raised shadow-sm" : "text-slate"
                  }`}
                >
                  <TimerIcon size={13} /> Pomodoro
                </button>
                <button
                  onClick={() => setMode("free_timer")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "free_timer" ? "bg-paper-raised dark:bg-ink-raised shadow-sm" : "text-slate"
                  }`}
                >
                  <Coffee size={13} /> Cronômetro livre
                </button>
              </div>
            )}

            <div
              className={`relative w-[min(220px,60vw)] h-[min(220px,60vw)] aspect-square flex items-center justify-center mb-6 rounded-full transition-shadow duration-700 ${
                activeSession ? "shadow-glow-signal" : ""
              }`}
            >
              {/* viewBox fixo mantém a proporção do anel; o SVG escala via w-full/h-full para caber em telas estreitas */}
              <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx={110} cy={110} r={RING_RADIUS} fill="none" strokeWidth={10} className="stroke-paper dark:stroke-ink" />
                <circle
                  cx={110}
                  cy={110}
                  r={RING_RADIUS}
                  fill="none"
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={activeSession ? ringOffset : RING_CIRCUMFERENCE}
                  className={activeSession ? "stroke-signal transition-[stroke-dashoffset] duration-1000 ease-linear" : "stroke-transparent"}
                />
              </svg>
              <div>
                {!activeSession ? (
                  <>
                    <TimerIcon size={26} className="text-slate mx-auto mb-2" />
                    <p className="text-xs text-slate">Pronto para começar</p>
                  </>
                ) : (
                  <>
                    <p className="font-display font-semibold" style={{ fontSize: "clamp(2rem, 8vw, 2.75rem)" }}>
                      {formatClock(remaining)}
                    </p>
                    <p className="text-[11px] text-slate mt-1">
                      {activeMode === "pomodoro" ? (remaining >= 0 ? "restante" : "tempo extra") : "em andamento"}
                    </p>
                  </>
                )}
              </div>
            </div>

            {!activeSession ? (
              <>
                {mode === "pomodoro" && (
                  <div className="flex items-center gap-2 mb-5">
                    {[15, 25, 50].map((m) => (
                      <button
                        key={m}
                        onClick={() => setPlannedMinutes(m)}
                        className={`rounded-lg px-4 py-2 text-sm border transition-colors ${
                          plannedMinutes === m
                            ? "border-brand-500 text-brand-700 dark:text-brand-100 bg-brand-50 dark:bg-brand-700/15 font-semibold"
                            : "border-paper-border dark:border-ink-border text-slate"
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                )}

                {pendingTasks.length > 0 && (
                  <div className="relative w-full max-w-xs mb-5">
                    <select
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised pl-3 pr-8 py-2.5 text-sm"
                    >
                      <option value="">Tarefa (opcional)</option>
                      {pendingTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
                  </div>
                )}

                <Button onClick={handleStart}>
                  <Play size={16} /> Iniciar sessão de foco
                </Button>
              </>
            ) : (
              <>
                {activeTask && <p className="text-xs text-slate mb-4">Focando em: <span className="font-medium text-inherit">{activeTask.title}</span></p>}
                <Button variant="secondary" onClick={() => setShowStopModal(true)}>
                  <Square size={16} /> Encerrar sessão
                </Button>
              </>
            )}
            {error && <p className="text-xs text-drop mt-4">{error}</p>}
          </Card>

          {summary?.bestHour && (
            <p className="text-xs text-slate text-center">
              Seu horário mais produtivo costuma ser às {summary.bestHour.hour}h (produtividade média{" "}
              {summary.bestHour.avg_productivity.toFixed(1)}/5).
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl p-5 bg-gradient-to-br from-brand-500 to-cat-purple text-white shadow-card">
            <p className="text-sm font-semibold mb-1">Um ciclo de cada vez</p>
            <p className="text-xs text-white/80 leading-relaxed">
              Foco não é sobre fazer tudo agora — é sobre proteger um intervalo pequeno para uma única coisa importante.
            </p>
          </div>

          {summary && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
              <Card className="p-2 sm:p-3.5 text-center">
                <p className="text-[10px] sm:text-[11px] text-slate">Hoje</p>
                <p className="font-display font-semibold text-sm sm:text-base mt-0.5">{formatMinutes(summary.todayMinutes)}</p>
              </Card>
              <Card className="p-2 sm:p-3.5 text-center">
                <p className="text-[10px] sm:text-[11px] text-slate">Semana</p>
                <p className="font-display font-semibold text-sm sm:text-base mt-0.5">{formatMinutes(summary.weekMinutes)}</p>
              </Card>
              <Card className="p-2 sm:p-3.5 text-center">
                <p className="text-[10px] sm:text-[11px] text-slate">Mês</p>
                <p className="font-display font-semibold text-sm sm:text-base mt-0.5">{formatMinutes(summary.monthMinutes)}</p>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
            <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
              <IconBadge tone="amber" size={30} icon={<Flame size={14} />} />
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Sequência de dias</p>
                <p className="font-display font-semibold text-sm sm:text-base leading-tight">
                  {focusStreak > 0 ? `${focusStreak} ${focusStreak === 1 ? "dia" : "dias"}` : "—"}
                </p>
              </div>
            </Card>
            <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
              <IconBadge tone="purple" size={30} icon={<TimerIcon size={14} />} />
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Sessão mais longa</p>
                <p className="font-display font-semibold text-sm sm:text-base leading-tight">{longestSession ? formatMinutes(longestSession) : "—"}</p>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <p className="text-sm font-semibold mb-1">Minutos de foco — últimos 7 dias</p>
            <p className="text-xs text-slate mb-3">Soma real das sessões concluídas em cada dia.</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChart}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate" width={28} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v}min`, "Foco"]} />
                  <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
                    {weeklyChart.map((d, i) => (
                      <Cell key={i} fill={d.isToday ? "#D9860F" : "#8B5CF6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <IconBadge tone="purple" size={32} icon={<History size={15} />} />
                <p className="text-sm font-semibold">Histórico de foco</p>
              </div>
              {recentSessions.length > 6 && (
                <button
                  onClick={() => setFullHistoryOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-500 hover:underline"
                >
                  <ListChecks size={12} /> Ver tudo
                </button>
              )}
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate">Nenhuma sessão registrada ainda — inicie seu primeiro ciclo de foco.</p>
            ) : (
              <div className="space-y-2">
                {recentSessions.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate truncate">
                      {s.mode === "pomodoro" ? "Pomodoro" : "Cronômetro livre"} · {s.actual_minutes ?? "—"}min
                      {s.task_id && taskById.get(s.task_id) && (
                        <span className="text-inherit"> · {taskById.get(s.task_id)}</span>
                      )}
                    </span>
                    {s.perceived_productivity && (
                      <span className="shrink-0 text-[10px] font-semibold text-brand-600 dark:text-brand-500">{s.perceived_productivity}/5</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <IconBadge tone="amber" size={32} icon={<Lightbulb size={15} />} />
              <p className="text-sm font-semibold">Dicas para um foco melhor</p>
            </div>
            <ul className="space-y-2">
              {TIPS.map((tip) => (
                <li key={tip} className="text-xs text-slate leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-slate/50">
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {showStopModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowStopModal(false)}>
          <div
            className="w-full max-w-xs rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-3">Como foi essa sessão?</p>
            <div className="flex items-center gap-2 mb-4">
              <input type="range" min={1} max={5} value={productivity} onChange={(e) => setProductivity(Number(e.target.value))} className="flex-1" />
              <span className="text-xs w-10 text-right">{productivity}/5</span>
            </div>
            <Button onClick={handleConfirmStop} className="w-full">
              Salvar e encerrar
            </Button>
          </div>
        </div>
      )}

      {fullHistoryOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setFullHistoryOpen(false)}>
          <div
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <IconBadge tone="purple" size={32} icon={<ListChecks size={15} />} />
                <p className="text-sm font-semibold">Histórico completo de foco</p>
              </div>
              <button onClick={() => setFullHistoryOpen(false)} className="text-slate hover:text-inherit">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 pr-1">
              {recentSessions.map((s) => {
                const started = new Date(s.started_at.replace(" ", "T") + "Z");
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 text-xs rounded-xl border border-paper-border dark:border-ink-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {s.mode === "pomodoro" ? "Pomodoro" : "Cronômetro livre"}
                        {s.task_id && taskById.get(s.task_id) && <span className="text-slate"> · {taskById.get(s.task_id)}</span>}
                      </p>
                      <p className="text-slate mt-0.5">
                        {started.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} às{" "}
                        {started.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-semibold">{s.actual_minutes != null ? formatMinutes(s.actual_minutes) : "—"}</p>
                      {s.perceived_productivity && (
                        <p className="text-[10px] font-semibold text-brand-600 dark:text-brand-500">{s.perceived_productivity}/5</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
