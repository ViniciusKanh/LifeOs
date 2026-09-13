import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Timer as TimerIcon, Coffee, Lightbulb, History, ChevronDown } from "lucide-react";
import { useFocus } from "@/hooks/useFocus";
import { useTasks } from "@/hooks/useTasks";
import { Button, Card, IconBadge } from "@/components/ui/primitives";

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
  const { activeSession, summary, recentSessions, start, stop } = useFocus();
  const { tasks } = useTasks();
  const [mode, setMode] = useState<"pomodoro" | "free_timer">("pomodoro");
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [taskId, setTaskId] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showStopModal, setShowStopModal] = useState(false);
  const [productivity, setProductivity] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleStart = () =>
    start({
      mode,
      plannedMinutes: mode === "pomodoro" ? plannedMinutes : undefined,
      taskId: taskId || undefined,
    });

  const handleConfirmStop = async () => {
    if (!activeSession) return;
    await stop({ id: activeSession.id, perceivedProductivity: productivity });
    setShowStopModal(false);
  };

  const activeTask = activeSession?.task_id ? tasks.find((t) => t.id === activeSession.task_id) : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <p className="font-display font-bold text-2xl mb-1">Focus Mode</p>
      <p className="text-sm text-slate mb-6">Concentre-se em uma coisa de cada vez e acompanhe seu ritmo de foco.</p>

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

            <div className="relative w-[220px] h-[220px] flex items-center justify-center mb-6">
              <svg width={220} height={220} className="absolute inset-0 -rotate-90">
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
            <div className="grid grid-cols-3 gap-2.5">
              <Card className="p-3.5 text-center">
                <p className="text-[11px] text-slate">Hoje</p>
                <p className="font-display font-semibold text-base mt-0.5">{formatMinutes(summary.todayMinutes)}</p>
              </Card>
              <Card className="p-3.5 text-center">
                <p className="text-[11px] text-slate">Semana</p>
                <p className="font-display font-semibold text-base mt-0.5">{formatMinutes(summary.weekMinutes)}</p>
              </Card>
              <Card className="p-3.5 text-center">
                <p className="text-[11px] text-slate">Mês</p>
                <p className="font-display font-semibold text-base mt-0.5">{formatMinutes(summary.monthMinutes)}</p>
              </Card>
            </div>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <IconBadge tone="purple" size={32} icon={<History size={15} />} />
              <p className="text-sm font-semibold">Histórico de foco</p>
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate">Nenhuma sessão registrada ainda — inicie seu primeiro ciclo de foco.</p>
            ) : (
              <div className="space-y-2">
                {recentSessions.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate">
                      {s.mode === "pomodoro" ? "Pomodoro" : "Cronômetro livre"} · {s.actual_minutes ?? "—"}min
                    </span>
                    {s.perceived_productivity && (
                      <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-500">{s.perceived_productivity}/5</span>
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
    </div>
  );
}
