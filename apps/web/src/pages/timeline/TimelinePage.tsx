import { Link } from "react-router-dom";
import { History, RefreshCw, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, IconBadge, PageHeader } from "@/components/ui/primitives";
import { useTimeline } from "@/hooks/useAnalytics";
import { groupTimelineByDay, timelineDayLabel, timelineEventRoute, timelineEventTone } from "@/utils/timelineEvents";
import type { TimelineEvent } from "@/types";

/** Linha de um evento: ícone (emoji real vindo do backend), rótulo, horário e XP/moedas quando houve. */
function TimelineRow({ event }: { event: TimelineEvent }) {
  const route = timelineEventRoute(event);
  const time = new Date(event.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const reward = (event.xp ?? 0) > 0 || (event.coins ?? 0) > 0;

  const content = (
    <div className="flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-xl transition-colors group-hover:bg-black/[0.03] dark:group-hover:bg-white/[0.04]">
      <IconBadge tone={timelineEventTone(event)} icon={<span className="text-base leading-none">{event.icon}</span>} size={34} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug truncate rpg:text-rpg-text">{event.label}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {reward && (
          <span className="text-[11px] font-semibold text-signal-deep dark:text-signal whitespace-nowrap rpg:text-rpg-gold-light">
            {event.xp ? `+${event.xp} XP` : ""}
            {event.xp && event.coins ? " · " : ""}
            {event.coins ? `+${event.coins} moedas` : ""}
          </span>
        )}
        <span className="text-xs text-slate whitespace-nowrap">{time}</span>
      </div>
    </div>
  );

  if (!route) return <div className="group">{content}</div>;
  return (
    <Link to={route} className="group block">
      {content}
    </Link>
  );
}

/**
 * Timeline — histórico automático e cronológico de tudo que foi registrado
 * no LifeOS (tarefas concluídas, hábitos, saúde, leitura, foco, conquistas,
 * Banco, Guilda, Conselho de Guerra...). Consome GET /api/analytics/timeline,
 * um endpoint que já existia pronto no backend mas nunca teve tela — ver
 * claude/analise-funcoes-2026-10-27.md. Período começa em 14 dias e cresce
 * com "carregar mais", sem paginação por cursor (o endpoint é por data).
 */
export function TimelinePage() {
  const { timeline, isLoading, isFetching, isError, refetch, from, to, loadMore } = useTimeline();
  const events = timeline?.events ?? [];
  const groups = groupTimelineByDay(events);
  const periodLabel = new Date(`${from}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const periodLabelTo = new Date(`${to}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-3xl mx-auto">
      <PageHeader
        icon={<History size={20} />}
        title="Timeline"
        subtitle={`Histórico automático da sua jornada, de ${periodLabel} até ${periodLabelTo} — tudo que você já registrou de verdade, em ordem cronológica.`}
      />

      {isLoading && (
        <div className="space-y-3" aria-busy aria-label="Carregando a timeline">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <Card className="p-6 text-center">
          <p className="text-sm">Não foi possível carregar a timeline.</p>
          <Button variant="secondary" className="mt-3 mx-auto" onClick={() => void refetch()}>
            <RefreshCw size={15} /> Tentar novamente
          </Button>
        </Card>
      )}

      {!isLoading && !isError && events.length === 0 && (
        <EmptyState
          title="Ainda não há nada por aqui"
          description="Conclua uma tarefa, registre um hábito ou escreva no diário — cada registro real vira um marco na sua timeline."
          ctaLabel="Ir para Hoje"
          onCta={() => (window.location.href = "/hoje")}
        />
      )}

      {!isLoading && !isError && events.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => {
            const dayXp = timeline?.xpByDay?.[group.dayKey];
            return (
              <div key={group.dayKey}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-gold">
                    {timelineDayLabel(group.dayKey)}
                  </p>
                  {!!dayXp && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-signal-deep dark:text-signal rpg:text-rpg-gold-light">
                      <Sparkles size={12} /> {dayXp} XP no dia
                    </span>
                  )}
                </div>
                <Card className="px-3 py-1 divide-y divide-paper-border dark:divide-ink-border/60">
                  {group.events.map((event) => (
                    <TimelineRow key={`${event.type}-${event.id}`} event={event} />
                  ))}
                </Card>
              </div>
            );
          })}

          <div className="flex justify-center pt-2">
            <Button variant="secondary" onClick={loadMore} disabled={isFetching}>
              {isFetching ? "Carregando…" : "Carregar período anterior"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimelinePage;
