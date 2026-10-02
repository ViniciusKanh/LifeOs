import { Link } from "react-router-dom";
import { CalendarClock, CalendarDays, CheckCircle2, Clock, Droplets, ListChecks, Moon, Plus, Repeat, Search, Swords, Zap } from "lucide-react";
import type { FocusTask } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useSignals } from "@/hooks/useSignals";
import { SignalsNow } from "@/components/dashboard/DashboardSections";
import { RPGAvatarButton, RPGButton, RPGPageHeader, RPGPanel, RPGProgressRing, RPGQuestCard, RPGStatCard, rpgButtonClass } from "@/components/rpg";

/* ============================================================
   Tela Hoje no tema RPG. Só apresentação: todos os valores chegam
   prontos da HojePage (mesmos hooks e services da tela clássica).
   ============================================================ */

export function RpgTodayHero({ prioritiesPct, quote }: { prioritiesPct: number; quote: string }) {
  const { user } = useAuth();
  const date = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return (
    <RPGPageHeader
      banner="hoje"
      leading={<RPGAvatarButton />}
      title={`Olá, ${user?.name?.split(" ")[0] ?? ""}!`}
      subtitle={<span className="italic">&ldquo;{quote}&rdquo;</span>}
      footnote={<span className="inline-flex items-center gap-1.5 first-letter:uppercase"><CalendarDays size={13} aria-hidden /> {date}</span>}
      aside={
        <div className="rpg-parchment mx-1.5 my-1.5 flex items-center gap-4 px-4 py-3 w-full sm:w-[300px]">
          <RPGProgressRing value={prioritiesPct} size={88} tone="green" label="Progresso do dia" />
          <div className="min-w-0">
            <p className="font-pixel text-xs font-bold uppercase tracking-[0.12em] text-rpg-ink/80">Progresso do dia</p>
            <p className="mt-1 text-sm text-rpg-ink">
              <strong className="font-pixel text-lg">{prioritiesPct}%</strong> das prioridades concluídas
            </p>
          </div>
        </div>
      }
    />
  );
}

/** Próxima missão: a tarefa de maior Priority Score (useFocusTasks). */
export function RpgNextQuest({ task, estimateMinutes, onComplete }: { task: FocusTask | null; estimateMinutes: number | null; onComplete: (id: string) => void }) {
  const due = task?.dueDate ? new Date(`${task.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "Sem prazo";
  return (
    <RPGPanel title="Sua próxima missão" icon={<Swords size={14} />} variant="quest" className="h-full">
      <RPGQuestCard
        label="Missão em destaque"
        title={task?.title ?? null}
        priority={task?.priority}
        reasons={task?.reasons.join(" · ") || null}
        facts={[
          { icon: <CalendarClock size={15} />, label: "Prazo", value: due },
          { icon: <Clock size={15} />, label: "Tempo estimado", value: estimateMinutes ? `${estimateMinutes} min` : "Não estimado" },
          { icon: <Zap size={15} />, label: "Prioridade", value: task?.priority ?? "—" },
        ]}
        emptyText="Tudo em dia. Escolha uma tarefa para começar ou planeje o próximo passo."
        actions={
          task ? (
            <>
              <RPGButton variant="success" onClick={() => onComplete(task.id)} className="flex-1">
                <CheckCircle2 size={16} /> Concluir missão
              </RPGButton>
              <Link to={`/tarefas?task=${task.id}`} className={rpgButtonClass("blue", "flex-1")}>
                <Search size={15} /> Ver detalhes
              </Link>
            </>
          ) : (
            <Link to="/tarefas?nova=1" className={rpgButtonClass("primary")}>
              <Plus size={15} /> Nova tarefa
            </Link>
          )
        }
      />
    </RPGPanel>
  );
}

export function RpgTodayStats({
  prioritiesDone,
  prioritiesTotal,
  prioritiesPct,
  overdue,
  habitsDone,
  habitsTotal,
  waterLabel,
  waterPct,
  onWater,
  sleepLabel,
  sleepPct,
  energy,
}: {
  prioritiesDone: number;
  prioritiesTotal: number;
  prioritiesPct: number;
  overdue: number;
  habitsDone: number;
  habitsTotal: number;
  waterLabel: string;
  waterPct: number;
  onWater: () => void;
  sleepLabel: string;
  sleepPct: number | null;
  energy: number | null;
}) {
  const habitsPct = habitsTotal > 0 ? Math.round((habitsDone / habitsTotal) * 100) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
      <RPGStatCard icon={<ListChecks size={17} />} label="Prioridades" value={`${prioritiesDone} / ${prioritiesTotal}`} tone="orange" pct={prioritiesPct} caption={overdue > 0 ? `${prioritiesPct}% concluídas · ${overdue} vencida(s)` : `${prioritiesPct}% concluídas`} to="/tarefas" />
      <RPGStatCard icon={<Repeat size={17} />} label="Hábitos" value={`${habitsDone} / ${habitsTotal}`} tone="green" pct={habitsPct} caption={`${habitsPct}% concluídos`} to="/habitos" />
      <RPGStatCard
        icon={<Droplets size={17} />}
        label="Água"
        value={waterLabel}
        tone="blue"
        pct={Math.min(waterPct, 100)}
        caption={`${waterPct}% da meta`}
        action={
          <RPGButton variant="blue" onClick={onWater} className="w-full !py-1.5 !text-xs" aria-label="Registrar 250 ml de água">
            <Plus size={13} /> 250 ml
          </RPGButton>
        }
      />
      <RPGStatCard icon={<Moon size={17} />} label="Sono" value={sleepLabel} tone="purple" pct={sleepPct ?? undefined} caption={sleepPct != null ? `${sleepPct}% da meta` : "sem registro"} to="/saude" />
      <div className="col-span-2 md:col-span-1">
        <RPGStatCard
          icon={<Zap size={17} />}
          label="Energia"
          value={energy != null ? `${energy} / 5` : "—"}
          tone="gold"
          pct={energy != null ? (energy / 5) * 100 : undefined}
          caption={energy != null ? (energy >= 4 ? "nível bom hoje" : energy >= 3 ? "nível médio" : "nível baixo") : "registre em Saúde"}
          to="/saude"
        />
      </div>
    </div>
  );
}

/** Signals do dia — mesmo componente/serviço do Dashboard. */
export function RpgTodaySignals() {
  const { data, isLoading } = useSignals("today");
  return <SignalsNow signals={data?.signals ?? []} isLoading={isLoading} />;
}

