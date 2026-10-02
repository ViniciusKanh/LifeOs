import { Card } from "@/components/ui/primitives";
import { LIFE_AREAS } from "@/utils/lifeOsLabels";
import type { DirectionOverview } from "@/types";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";

/**
 * Equilíbrio entre as áreas: a nota da roda (como você se sente) ao lado
 * do que você está de fato fazendo (metas ativas e tarefas concluídas nos
 * últimos 30 dias). Destaca área com nota baixa e nenhum esforço — dado
 * real lado a lado, sem julgamento inventado.
 */
export function AreaBalance({ balance, title = "Equilíbrio entre as áreas" }: { balance: DirectionOverview["balance"]; title?: string }) {
  const maxDone = Math.max(1, ...balance.map((b) => b.doneLast30));
  return (
    <Card className="p-4 sm:p-5">
      <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>{title}</p>
      <p className="text-[11px] text-slate mb-3">Nota da roda × metas ativas × tarefas concluídas (30 dias) que servem a metas da área.</p>
      <ul className="space-y-2">
        {LIFE_AREAS.map((a) => {
          const b = balance.find((x) => x.area === a.key);
          const neglected = b && b.score != null && b.score <= 4 && b.activeGoals === 0;
          return (
            <li key={a.key} className={`rounded-xl px-3 py-2 ${neglected ? "bg-signal/[0.08] ring-1 ring-signal/30" : ""}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-32 sm:w-40 shrink-0 truncate">
                  {a.emoji} {a.label}
                </span>
                <span className="w-10 shrink-0 font-bold tabular-nums" style={{ color: a.color }}>
                  {b?.score != null ? `${b.score}/10` : "—"}
                </span>
                <div className="flex-1 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.07] overflow-hidden rpg:h-3 rpg:rounded-sm rpg:border-2 rpg:border-black/60 rpg:bg-rpg-bg" title={`${b?.doneLast30 ?? 0} tarefas concluídas`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${((b?.doneLast30 ?? 0) / maxDone) * 100}%`, background: a.color, opacity: 0.75 }} />
                </div>
                <span className="w-16 shrink-0 text-right text-slate tabular-nums">
                  {b?.activeGoals ?? 0} meta{(b?.activeGoals ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
              {neglected && <p className="text-[10.5px] text-signal-deep dark:text-signal mt-1 pl-1">Nota baixa e nenhuma meta ativa nesta área.</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
