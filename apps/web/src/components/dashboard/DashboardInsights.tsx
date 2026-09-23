import type { ReactNode } from "react";
import { Card } from "@/components/ui/primitives";
import type { LifeInsights, AnalyticsChangePct } from "@/types";

const HOUR_LABEL = (h: number) => `${h.toString().padStart(2, "0")}h`;

/** Mesma leitura de força de correlação usada em Analytics — nunca inventamos um rótulo novo aqui. */
function correlationStrength(r: number): string {
  const abs = Math.abs(r);
  return abs >= 0.6 ? "forte" : abs >= 0.3 ? "moderada" : "leve";
}

export interface StreakHighlight {
  habitName: string;
  streak: number;
}

/**
 * "Insights da sua semana" (novo, seção pedida pelo usuário) — cada frase só
 * aparece se houver dado real por trás (bestWeekday, correlação com pares
 * suficientes, sequência de hábito, variação de tarefas). Quando falta
 * dado, mostramos isso explicitamente em vez de esconder o cartão —
 * mesmo padrão usado em Data Health e Capacity Planner.
 */
export function DashboardInsights({
  insights,
  changePct,
  streak,
}: {
  insights: LifeInsights | null;
  changePct: AnalyticsChangePct | null;
  streak: StreakHighlight | null;
}) {
  const items: Array<{ emoji: string; tone: string; title: string; body: string }> = [];

  items.push({
    emoji: "🏆",
    tone: "border-signal/25 bg-signal/[0.06]",
    title: "Melhor dia da semana",
    body: insights?.bestWeekday
      ? `${insights.bestWeekday.label}-feira costuma ser seu dia mais produtivo, com média de ${insights.bestWeekday.avgCompleted} tarefa(s) concluída(s).`
      : "Conclua tarefas em mais dias diferentes para revelar seu melhor dia da semana.",
  });

  const sleepR = insights?.sleepVsNextDayProductivity.r ?? null;
  const sleepPairs = insights?.sleepVsNextDayProductivity.pairs ?? 0;
  items.push({
    emoji: "😴",
    tone: "border-cat-blue/25 bg-cat-blue/[0.06]",
    title: "Sono e produtividade",
    body:
      sleepR !== null && sleepPairs >= 5
        ? `Dormir mais parece ${sleepR >= 0 ? "ajudar" : "atrapalhar"} sua produtividade no dia seguinte (correlação ${sleepR >= 0 ? "positiva" : "negativa"} ${correlationStrength(sleepR)}).`
        : "Registre sono e tarefas por mais dias para revelar essa relação.",
  });

  items.push({
    emoji: "🔥",
    tone: "border-cat-green/25 bg-cat-green/[0.06]",
    title: "Sequência mais forte",
    body:
      streak && streak.streak > 0
        ? `${streak.habitName}: ${streak.streak} dia(s) seguidos. Continue hoje para manter a chama acesa.`
        : "Nenhuma sequência ativa ainda — cumpra um hábito hoje para começar uma.",
  });

  const tasksChange = changePct?.tasksCompleted ?? null;
  items.push({
    emoji: "📈",
    tone: "border-cat-pink/25 bg-cat-pink/[0.06]",
    title: "Tendência de tarefas",
    body:
      tasksChange !== null && tasksChange !== 0
        ? `Você concluiu ${Math.abs(tasksChange)}% ${tasksChange > 0 ? "mais" : "menos"} tarefas do que no período anterior.`
        : "Ainda sem histórico suficiente para comparar com o período anterior.",
  });

  return (
    <Card className="p-5 md:p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base leading-none">✨</span>
        <p className="text-sm font-semibold">Insights da sua semana</p>
      </div>
      <p className="text-xs text-slate mb-4">Só aparece aqui o que os seus dados realmente mostram — sem números inventados.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <InsightChip key={item.title} emoji={item.emoji} tone={item.tone} title={item.title} body={item.body} />
        ))}
      </div>
    </Card>
  );
}

function InsightChip({ emoji, tone, title, body }: { emoji: string; tone: string; title: string; body: ReactNode }) {
  return (
    <div className={`rounded-xl border p-3.5 ${tone}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base leading-none">{emoji}</span>
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <p className="text-[11px] text-slate leading-relaxed">{body}</p>
    </div>
  );
}
