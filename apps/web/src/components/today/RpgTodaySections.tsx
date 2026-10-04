import { Link } from "react-router-dom";
import { CalendarDays, Check, Play, Plus, Square, Swords, Timer } from "lucide-react";
import type { FocusTask, Task } from "@/types";
import { useDifficultySettings, useGamificationRules } from "@/hooks/useGamification";
import { useTaskTimer } from "@/hooks/useTasks";
import { previewTaskReward } from "@/utils/gamification";
import { useAuth } from "@/hooks/useAuth";
import { useSignals } from "@/hooks/useSignals";
import { SignalsNow } from "@/components/dashboard/DashboardSections";
import { RPGAvatarButton, RPGBadge, RPGButton, RPGPanel, PRIORITY_TONE, RPG_BANNERS } from "@/components/rpg";

/* ============================================================
   Tela Hoje no tema RPG ("Centro da Jornada do Dia"). Só apresentação:
   tudo chega pronto da HojePage (mesmos hooks e services da tela clássica).
   ============================================================ */

/** Saudação pelo horário local do aparelho. */
function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function RpgTodayHero({ prioritiesPct, quote }: { prioritiesPct: number; quote: string }) {
  const { user } = useAuth();
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden h-full min-h-[200px]">
      <img src={RPG_BANNERS.hoje} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 w-full h-full object-cover object-[50%_75%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg/90 via-rpg-bg/50 to-transparent" aria-hidden />
      <div className="relative flex items-end justify-between gap-4 p-4 sm:p-6 h-full">
        <div className="min-w-0 max-w-md">
          <h1 className="rpg-title text-2xl sm:text-3xl font-bold leading-tight">
            {greeting(now)}, {user?.name?.split(" ")[0] ?? ""}!
          </h1>
          <p className="mt-1 text-sm text-rpg-text/90 first-letter:uppercase">{date}</p>
          <blockquote className="mt-4 border-2 border-rpg-border bg-rpg-bg/80 px-4 py-3 text-sm italic" style={{ borderRadius: 4 }}>
            &ldquo;{quote}&rdquo;
          </blockquote>
          <p className="mt-3 inline-flex items-center gap-1.5 font-pixel text-xs text-rpg-gold-light">
            <CalendarDays size={13} aria-hidden /> {prioritiesPct}% das prioridades concluídas
          </p>
        </div>
        <div className="hidden sm:block shrink-0">
          <RPGAvatarButton size="lg" mobileSize="md" />
        </div>
      </div>
    </header>
  );
}

/** Signals do dia — mesmo componente e serviço do Dashboard (nada recalculado aqui). */
export function RpgTodaySignals() {
  const { data, isLoading } = useSignals("today");
  return <SignalsNow signals={data?.signals ?? []} isLoading={isLoading} />;
}

/**
 * Próxima melhor ação: a 1ª tarefa do Priority Score (useFocusTasks), com o
 * motivo calculado no backend. "Iniciar" move a tarefa para Em Andamento.
 */
export function RpgNextAction({
  task,
  estimateMinutes,
  onStart,
}: {
  task: FocusTask | null;
  estimateMinutes: number | null;
  onStart: (id: string) => void;
}) {
  return (
    <RPGPanel title="Próxima melhor ação" icon={<Play size={14} />} variant="legendary">
      {!task ? (
        <p className="text-sm text-rpg-muted">Nenhuma tarefa em aberto agora.</p>
      ) : (
        <div className="flex items-center gap-3 border-2 border-rpg-border bg-rpg-bg/50 px-3 py-2.5" style={{ borderRadius: 4 }}>
          <div className="flex-1 min-w-0">
            <Link to={`/tarefas?task=${task.id}`} className="block text-sm font-semibold hover:underline line-clamp-2">
              {task.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-rpg-muted">
              <RPGBadge tone={PRIORITY_TONE[task.priority] ?? "muted"}>{task.priority}</RPGBadge>
              {estimateMinutes ? <span>~ {estimateMinutes} min</span> : null}
              {task.reasons[0] && <span className="truncate">{task.reasons[0]}</span>}
            </div>
          </div>
          {task.status !== "Em Andamento" && (
            <RPGButton onClick={() => onStart(task.id)} className="shrink-0 !py-2">
              Iniciar
            </RPGButton>
          )}
        </div>
      )}
    </RPGPanel>
  );
}

const DIFFICULTY: Record<string, string> = { Baixa: "Fácil", Média: "Média", Alta: "Difícil" };

/**
 * "Missões de hoje": as prioridades reais do dia com dificuldade (prioridade),
 * projeto, prazo, duração estimada e a recompensa prevista pelas regras do
 * backend. A missão principal (1ª do Priority Score) ganha "Iniciar Focus",
 * que abre o cronômetro da tarefa — encerrar o foco registra os blocos de 25 min.
 */
export function RpgTodayMissions({
  tasks,
  mainTaskId,
  projectNames,
  today,
  onComplete,
  onAdd,
  onStartFocus,
}: {
  tasks: Task[];
  mainTaskId: string | null;
  projectNames: Map<string, string>;
  today: string;
  onComplete: (id: string) => void;
  onAdd: () => void;
  onStartFocus: (id: string) => void;
}) {
  const { data: rules } = useGamificationRules();
  const { rewards: scale, priority: priorityScale } = useDifficultySettings();
  const timer = useTaskTimer(mainTaskId);
  const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <RPGPanel
      title="Missões de hoje"
      icon={<Swords size={15} />}
      actions={
        <RPGButton variant="gold" onClick={onAdd} className="!py-1.5">
          <Plus size={13} aria-hidden /> Missão
        </RPGButton>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-rpg-muted py-4">Nenhuma missão pendente — bom trabalho! Adicione uma tarefa para planejar o próximo passo.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const isMain = t.id === mainTaskId;
            const reward = previewTaskReward(rules, { priority: t.priority, dueDate: t.due_date, habitId: t.habit_id, difficulty: t.difficulty }, today, t.id === mainTaskId, scale, priorityScale);
            return (
              <li key={t.id} className={`border-2 px-3 py-2.5 ${isMain ? "border-rpg-gold bg-rpg-gold/5" : "border-rpg-border bg-rpg-bg/40"}`} style={{ borderRadius: 4 }}>
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onComplete(t.id)}
                    aria-label={`Concluir missão ${t.title}`}
                    className="mt-0.5 w-6 h-6 shrink-0 flex items-center justify-center border-2 border-rpg-border hover:border-rpg-green text-rpg-green"
                    style={{ borderRadius: 3 }}
                  >
                    <Check size={14} className="opacity-0 hover:opacity-100" aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isMain && <RPGBadge tone="gold">Missão principal</RPGBadge>}
                      <Link to={`/tarefas?task=${t.id}`} className="text-sm font-semibold text-rpg-text hover:underline break-words">
                        {t.title}
                      </Link>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-rpg-muted">
                      <RPGBadge tone={PRIORITY_TONE[t.priority] ?? "muted"}>{DIFFICULTY[t.priority] ?? t.priority}</RPGBadge>
                      {t.project_id && projectNames.get(t.project_id) && <span className="truncate max-w-[10rem]">⚑ {projectNames.get(t.project_id)}</span>}
                      {t.due_date && <span>Prazo {fmtDate(t.due_date)}</span>}
                      {t.estimate_minutes ? <span>~ {t.estimate_minutes} min</span> : null}
                      {reward && (
                        <span className="inline-flex items-center gap-2 font-pixel">
                          <span className="text-rpg-purple">+{reward.xp} XP</span>
                          <span className="text-rpg-gold-light">+{reward.coins} 🪙</span>
                        </span>
                      )}
                    </div>
                    {isMain && (
                      <div className="mt-2">
                        {timer.activeEntry ? (
                          <RPGButton variant="secondary" className="!py-1.5" onClick={() => void timer.stop()}>
                            <Square size={12} aria-hidden /> Encerrar Focus
                          </RPGButton>
                        ) : (
                          <RPGButton variant="blue" className="!py-1.5" onClick={() => onStartFocus(t.id)}>
                            <Timer size={13} aria-hidden /> Iniciar Focus
                          </RPGButton>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </RPGPanel>
  );
}
