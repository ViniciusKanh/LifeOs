import { BookOpen, HeartPulse, TrendingUp, Trophy, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGPanel } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import type { BottleneckDetail, ImpactItem } from "@/services/bottlenecksService";

const UI: Record<ImpactItem["key"], { icon: LucideIcon; tone: RpgTone; sign: "+" | "−"; title: string }> = {
  campaigns: { icon: TrendingUp, tone: "green", sign: "+", title: "Campanha avança" },
  load: { icon: Zap, tone: "purple", sign: "−", title: "Agenda mais leve" },
  deadlines: { icon: HeartPulse, tone: "red", sign: "−", title: "Prazos salvos" },
  missions: { icon: Trophy, tone: "gold", sign: "+", title: "Tarefas liberadas" },
  projects: { icon: BookOpen, tone: "blue", sign: "+", title: "Projetos destravados" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const fmt = (i: ImpactItem) => {
  if (i.value === null) return "—";
  const sign = i.value === 0 ? "" : UI[i.key].sign;
  return `${sign}${i.value}${i.unit === "pp" ? " pts" : i.unit === "%" ? "%" : ""}`;
};

/**
 * Frase "isso significa que…" para cada número da simulação. Só traduz o
 * valor calculado no servidor; quando não há valor, diz o porquê (nota do servidor).
 */
function meaning(i: ImpactItem): string {
  if (i.value === null) return i.note === "—" ? "Sem dados suficientes para estimar." : `Sem estimativa: ${i.note.replace(/\.$/, "").toLowerCase()}.`;
  const v = i.value;
  switch (i.key) {
    case "campaigns":
      return v > 0 ? `A barra de progresso da campanha sobe até ${v} pontos (${i.note.replace(/^até \+\d+ pp em /, "")}).` : "Nenhuma campanha avança só com isso.";
    case "load":
      return v > 0 ? `Sua agenda dos próximos 7 dias fica cerca de ${v}% mais leve.` : "Sua agenda da semana não muda.";
    case "deadlines":
      return v > 0 ? `${plural(v, "prazo deixa", "prazos deixam")} de correr risco de estourar.` : "Nenhum prazo em risco depende só disso.";
    case "missions":
      if (v === 0) return "Nada mais estava esperando só por este item.";
      // Para marcos de campanha a nota do servidor é genérica; para tarefas ela traz os títulos liberados.
      return /^Marcos/.test(i.note) ? `${plural(v, "marco da campanha fica livre", "marcos da campanha ficam livres")} para começar.` : `${plural(v, "tarefa fica livre", "tarefas ficam livres")} para começar: ${i.note}.`;
    case "projects":
      return v > 0 ? `${plural(v, "projeto parado volta", "projetos parados voltam")} a andar: ${i.note}.` : "Nenhum projeto estava parado por causa disso.";
  }
}

/** Simulação somente leitura: "se este item fosse concluído agora". Sempre rotulada como estimativa. */
export function BottleneckImpactForecast({ impact }: { impact: BottleneckDetail["impact"] }) {
  return (
    <RPGPanel
      title="Ao resolver isso"
      icon={<TrendingUp size={15} className="text-rpg-green" />}
      variant="gold"
      actions={<RPGBadge tone="muted">Estimativa</RPGBadge>}
    >
      <p className="mb-2 text-[11px] text-rpg-text/75">
        {impact.targetTitle ? <>Simulamos o que acontece se “{impact.targetTitle}” for concluído hoje. </> : null}
        Nada é alterado nos seus dados.
      </p>
      <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
        {impact.items.map((i) => {
          const ui = UI[i.key];
          return (
            <li key={i.key} className="flex items-start gap-2.5 border border-rpg-border/70 bg-rpg-bg-2/60 px-2.5 py-2 min-w-0" style={{ borderRadius: 3 }}>
              <ui.icon size={24} className={clsx("shrink-0 mt-0.5", RPG_TONE_TEXT[ui.tone])} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className={clsx("font-rpg text-lg font-bold leading-none tabular-nums", i.value === null ? "text-rpg-muted" : RPG_TONE_TEXT[ui.tone])}>{fmt(i)}</span>
                  <span className="text-[11px] font-semibold text-rpg-text/90 leading-tight">{ui.title}</span>
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-rpg-text/75">{meaning(i)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-rpg-muted">{impact.basis}</p>
    </RPGPanel>
  );
}
