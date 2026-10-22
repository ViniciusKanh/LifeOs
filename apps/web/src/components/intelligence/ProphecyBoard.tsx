import clsx from "clsx";
import { ArrowDown, ArrowUp, ScrollText } from "lucide-react";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { ArtifactSummary, Prophecy, ProphecyFactor } from "@/services/intelligenceService";
import { ARTIFACT_ICON, STATUS_UI, factorText } from "@/utils/intelligenceDisplay";

/** Leitura da chance em linguagem de jogo, sem esconder o número. */
function omen(p: number): { label: string; tone: "green" | "gold" | "orange" } {
  if (p >= 0.65) return { label: "Provável", tone: "green" };
  if (p >= 0.4) return { label: "Incerto", tone: "gold" };
  return { label: "Improvável", tone: "orange" };
}

const strongest = (factors: ProphecyFactor[], sign: 1 | -1) =>
  factors.filter((f) => Math.sign(f.effect) === sign).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0] ?? null;

function FactorHint({ factor }: { factor: ProphecyFactor }) {
  const up = factor.effect > 0;
  return (
    <li className="flex items-center gap-1.5 min-w-0">
      {up ? <ArrowUp size={12} className="shrink-0 text-rpg-green" aria-hidden /> : <ArrowDown size={12} className="shrink-0 text-rpg-red" aria-hidden />}
      <span className="truncate" title={factorText(factor)}>{factorText(factor)}</span>
      <span className={clsx("ml-auto shrink-0 font-pixel tabular-nums", up ? "text-rpg-green" : "text-rpg-red")}>
        {up ? "+" : ""}
        {factor.effect} p.p.
      </span>
    </li>
  );
}

/**
 * Quadro de Profecias: a previsão de hoje de CADA artefato forjado, com o
 * fator da véspera que mais empurrou a chance para cima e para baixo.
 * Os números vêm do modelo (dado calculado); a leitura "Provável/Incerto"
 * é só uma faixa visual da probabilidade.
 */
export function ProphecyBoard({ prophecies, artifacts, onInspect }: { prophecies: Prophecy[]; artifacts: ArtifactSummary[]; onInspect: (id: string) => void }) {
  if (!prophecies.length) return null;
  return (
    <RPGPanel title="Quadro de Profecias de hoje" icon={<ScrollText size={15} className="text-rpg-gold" />}>
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">
        Cada artefato lê os registros de ontem e estima a chance de hoje. As setas mostram o que mais pesou — use para decidir onde agir.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {prophecies.map((p) => {
          const art = artifacts.find((a) => a.id === p.artifactId);
          const ui = art ? ARTIFACT_ICON[art.icon] : null;
          const Icon = ui?.icon;
          const up = strongest(p.factors, 1);
          const down = strongest(p.factors, -1);
          const o = p.probability === null ? null : omen(p.probability);
          return (
            <li key={p.artifactId} className="min-w-0">
              <button
                type="button"
                onClick={() => onInspect(p.artifactId)}
                className="group h-full w-full border border-rpg-border bg-rpg-bg/60 p-3 text-left transition-colors hover:border-rpg-gold/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
                style={{ borderRadius: 3 }}
                aria-label={`Ver análise de ${p.artifactName}`}
              >
                <div className="flex items-start gap-2">
                  {Icon && (
                    <span className={clsx("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border border-rpg-gold/60 bg-rpg-panel", ui && RPG_TONE_TEXT[ui.tone])} style={{ borderRadius: 3 }} aria-hidden>
                      <Icon size={16} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-rpg-text">{p.targetLabel}</p>
                    <p className="truncate text-[11px] text-rpg-muted">{p.artifactName}</p>
                  </div>
                  {p.status === "experimental" && <RPGBadge tone={STATUS_UI.experimental.tone}>Teste</RPGBadge>}
                </div>
                {p.probability === null || !o ? (
                  <p className="mt-3 text-xs text-rpg-muted">{p.reason ?? "Sem registros de ontem para prever hoje."}</p>
                ) : (
                  <>
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className="font-pixel text-2xl tabular-nums text-rpg-text">{Math.round(p.probability * 100)}%</span>
                      <RPGBadge tone={o.tone}>{o.label}</RPGBadge>
                    </div>
                    <RPGProgressBar value={p.probability * 100} tone={o.tone} label={`Chance de ${p.targetLabel.toLowerCase()}`} showLabel={false} className="mt-1" />
                    {up || down ? (
                      <ul className="mt-2 space-y-1 text-[11px] text-rpg-text/90">
                        {up && <FactorHint factor={up} />}
                        {down && <FactorHint factor={down} />}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[11px] text-rpg-muted">Nenhum registro de ontem mudou muito a chance — vale a taxa de costume.</p>
                    )}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </RPGPanel>
  );
}
