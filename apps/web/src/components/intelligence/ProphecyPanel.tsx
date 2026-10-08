import clsx from "clsx";
import { ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressRing } from "@/components/rpg";
import type { Prophecy, ProphecyFactor } from "@/services/intelligenceService";
import { pct } from "@/utils/intelligenceDisplay";

/** Data da véspera em dd/mm/aaaa. */
const eve = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
};
const verdict = (p: Prophecy) => ((p.probability ?? 0) >= 0.5 ? p.targetLabel : `Pouco provável: ${p.targetLabel.toLowerCase()}`);

function FactorList({ factors, dense = false }: { factors: ProphecyFactor[]; dense?: boolean }) {
  if (!factors.length) return <p className="text-xs text-rpg-muted">Nenhuma runa da véspera mudou a previsão de forma relevante.</p>;
  return (
    <ul className={clsx("space-y-1.5", dense ? "text-sm" : "text-sm")}>
      {factors.map((f) => {
        const up = f.effect > 0;
        return (
          <li key={f.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="truncate text-rpg-text/90">{f.label}</span>
            <span className={clsx("inline-flex items-center gap-1 font-pixel text-xs tabular-nums", up ? "text-rpg-green" : "text-rpg-red")}>
              {up ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />}
              {up ? "+" : ""}
              {f.effect} p.p.
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Profecia do Dia: probabilidade do artefato para hoje, a partir dos registros da véspera. */
export function ProphecyPanel({ prophecy, onAnalyze, onForge }: { prophecy: Prophecy | null; onAnalyze: () => void; onForge: () => void }) {
  return (
    <RPGPanel title="Profecia do Dia" icon={<Sparkles size={15} className="text-rpg-purple" />} className="h-full">
      {!prophecy ? (
        <div className="py-4 space-y-3">
          <p className="text-sm text-rpg-muted">Forje o Oráculo de Produtividade (ou outro artefato) para receber uma previsão diária baseada nos seus registros.</p>
          <RPGButton variant="secondary" onClick={onForge}>
            Forjar artefato
          </RPGButton>
        </div>
      ) : prophecy.probability === null ? (
        <p className="text-sm text-rpg-muted py-4">{prophecy.reason ?? "Sem dados suficientes para a profecia de hoje."}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[9rem_minmax(0,1fr)] items-center">
            <div className="flex flex-col items-center text-center">
              <RPGProgressRing value={prophecy.probability * 100} size={112} tone={prophecy.probability >= 0.5 ? "green" : "orange"} label={`Chance de ${prophecy.targetLabel.toLowerCase()}`} valueClassName="text-2xl text-rpg-text" />
              <p className={clsx("mt-2 font-semibold text-sm", prophecy.probability >= 0.5 ? "text-rpg-green" : "text-rpg-orange")}>{verdict(prophecy)}</p>
              <p className="text-[11px] text-rpg-muted">Confiança: {pct(prophecy.confidence)}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold text-rpg-muted uppercase tracking-wide">Fatores principais</p>
              <FactorList factors={prophecy.factors.slice(0, 4)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-rpg-muted">
              {prophecy.artifactName}
              {prophecy.status === "experimental" && " · experimental"}
            </span>
            <RPGButton variant="secondary" className="!py-1 text-xs" onClick={onAnalyze}>
              Ver análise →
            </RPGButton>
          </div>
        </>
      )}
    </RPGPanel>
  );
}

/** Explicabilidade da profecia: separa dado real, inferência do modelo e limites. */
export function ProphecyModal({ prophecy, open, onClose }: { prophecy: Prophecy | null; open: boolean; onClose: () => void }) {
  if (!prophecy || prophecy.probability === null) return null;
  return (
    <Modal open={open} onClose={onClose} title="Análise da profecia" size="lg">
      <div className="space-y-4 text-sm">
        <section>
          <RPGBadge tone="blue">Dado real</RPGBadge>
          <p className="mt-1.5 text-rpg-text/90">Registros da véspera ({eve(prophecy.targetDate)}) usados como runas:</p>
          <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {prophecy.factors.map((f) => (
              <li key={f.key} className="flex justify-between gap-2 text-rpg-muted">
                <span className="truncate">{f.label}</span>
                <span className="tabular-nums text-rpg-text">{f.value === null ? "sem registro" : f.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <RPGBadge tone="purple">Inferência do modelo</RPGBadge>
          <p className="mt-1.5 text-rpg-text/90">
            {prophecy.artifactName} estima <strong>{pct(prophecy.probability)}</strong> de chance de “{prophecy.targetLabel.toLowerCase()}” hoje. Efeito de cada runa, em pontos percentuais
            (quanto a chance mudaria se aquela runa estivesse na sua média):
          </p>
          <div className="mt-2 max-w-md">
            <FactorList factors={prophecy.factors} />
          </div>
        </section>
        <p className="text-xs text-rpg-muted border-t border-rpg-border/60 pt-3">
          Associação, não causa. Confiança {pct(prophecy.confidence)} = quanto as probabilidades do artefato foram melhores que a taxa-base na validação temporal.
          {prophecy.status === "experimental" && " Este artefato ainda não supera a linha de base com folga — trate a profecia como experimental."}
        </p>
      </div>
    </Modal>
  );
}
