import clsx from "clsx";
import { Swords, Trophy } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import type { Experiment } from "@/services/intelligenceService";
import { ALGO_SHORT, pct } from "@/utils/intelligenceDisplay";

const when = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

/**
 * Tabela da arena: mesma validação temporal para todos os algoritmos.
 * Precisão = acurácia; Equilíbrio = média das acurácias por dobra (critério do vencedor).
 */
export function ArenaTable({ experiment, scientist = false }: { experiment: Experiment; scientist?: boolean }) {
  const rows = [...experiment.results].sort((a, b) => b.cvMean - a.cvMean);
  const cols = scientist
    ? (["Accuracy", "Bal. acc (CV)", "Precision", "Recall", "F1", "ROC-AUC"] as const)
    : (["Precisão", "Equilíbrio", "Confiança"] as const);
  const values = (r: Experiment["results"][number]) =>
    scientist
      ? [pct(r.metrics.accuracy), `${pct(r.cvMean)} ± ${pct(r.cvStd)}`, pct(r.metrics.precision), pct(r.metrics.recall), pct(r.metrics.f1), r.metrics.rocAuc === null ? "—" : r.metrics.rocAuc.toFixed(2).replace(".", ",")]
      : [pct(r.metrics.accuracy), pct(r.cvMean), pct(r.metrics.confidence)];
  return (
    <>
      {/* Tabela em telas médias+; cartões no celular. */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">Comparação de modelos — {experiment.objectiveLabel}</caption>
          <thead>
            <tr className="text-left text-rpg-muted border-b border-rpg-border/60">
              <th scope="col" className="py-1.5 pr-2 font-semibold">Modelo</th>
              {cols.map((c) => (
                <th key={c} scope="col" className="py-1.5 px-1 font-semibold text-right whitespace-nowrap">{c}</th>
              ))}
              <th scope="col" className="py-1.5 pl-2 font-semibold text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const win = r.algorithm === experiment.winner;
              return (
                <tr key={r.algorithm} className={clsx("border-b border-rpg-border/30", win && "text-rpg-gold-light")}>
                  <th scope="row" className="py-1.5 pr-2 font-normal text-left whitespace-nowrap">
                    {win && <Trophy size={12} className="inline mr-1 -mt-0.5" aria-hidden />}
                    {scientist ? r.label : ALGO_SHORT[r.algorithm]}
                  </th>
                  {values(r).map((v, i) => (
                    <td key={i} className="py-1.5 px-1 text-right tabular-nums whitespace-nowrap">{v}</td>
                  ))}
                  <td className="py-1.5 pl-2 text-right">{win ? <span className="font-semibold text-rpg-green">Vencedor</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="sm:hidden space-y-2">
        {rows.map((r) => (
          <li key={r.algorithm} className={clsx("border p-2", r.algorithm === experiment.winner ? "border-rpg-gold/70" : "border-rpg-border/60")} style={{ borderRadius: 3 }}>
            <p className="flex items-center justify-between text-sm">
              <span className={r.algorithm === experiment.winner ? "text-rpg-gold-light font-semibold" : "text-rpg-text"}>{ALGO_SHORT[r.algorithm]}</span>
              {r.algorithm === experiment.winner && <RPGBadge tone="gold" icon={<Trophy size={10} />}>Vencedor</RPGBadge>}
            </p>
            <dl className="mt-1 grid grid-cols-3 gap-1 text-[11px]">
              {cols.slice(0, 3).map((c, i) => (
                <div key={c}>
                  <dt className="text-rpg-muted">{c}</dt>
                  <dd className="tabular-nums text-rpg-text">{values(r)[i]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ArenaPanel({ experiment, onDetails }: { experiment: Experiment | null; onDetails: () => void }) {
  return (
    <RPGPanel title="Arena de Modelos" icon={<Swords size={15} />} className="h-full" actions={experiment ? <RPGBadge tone="green">Concluída</RPGBadge> : undefined}>
      {!experiment ? (
        <p className="text-sm text-rpg-muted py-4">Compare algoritmos e encontre o campeão para cada desafio. A primeira arena acontece quando você forja um artefato.</p>
      ) : (
        <>
          <p className="-mt-1 mb-2 text-xs text-rpg-muted">
            Desafio: <span className="text-rpg-text">prever “{experiment.objectiveLabel.toLowerCase()}”</span> · {experiment.samples} dias · {when(experiment.createdAt)}
          </p>
          <ArenaTable experiment={experiment} />
          <RPGButton variant="secondary" className="mt-3 w-full justify-center !py-1.5 text-xs" onClick={onDetails}>
            Ver detalhes da arena →
          </RPGButton>
        </>
      )}
    </RPGPanel>
  );
}

/** Aba Arena: histórico de comparações (modo cientista). */
export function ArenaHistory({ experiments, isLoading }: { experiments: Experiment[] | undefined; isLoading: boolean }) {
  if (isLoading) return <div className="rpg-panel h-48 animate-pulse motion-reduce:animate-none" aria-label="Carregando arenas" />;
  if (!experiments?.length) return <div className="rpg-panel p-6 text-center text-sm text-rpg-muted">Nenhuma arena ainda. Forje um artefato para comparar os algoritmos.</div>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {experiments.map((e) => (
        <RPGPanel key={e.id} title={e.objectiveLabel} icon={<Swords size={15} />} actions={<span className="text-[11px] text-rpg-muted">{when(e.createdAt)}</span>}>
          <p className="-mt-1 mb-2 text-xs text-rpg-muted">
            {e.samples} dias · validação temporal em {e.results[0]?.folds ?? 0} dobras · vencedor pela acurácia balanceada média
          </p>
          <ArenaTable experiment={e} scientist />
        </RPGPanel>
      ))}
    </div>
  );
}
