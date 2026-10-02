import { Link } from "react-router-dom";
import { CalendarDays, Play } from "lucide-react";
import type { FocusTask } from "@/types";
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
