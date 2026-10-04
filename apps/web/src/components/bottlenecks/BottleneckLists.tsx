import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Link2, ListOrdered, Radar, Search } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { BottleneckDetail, Candidate, Cause } from "@/services/bottlenecksService";
import { CONFIDENCE_UI, LEVEL_UI, TYPE_UI } from "@/utils/bottleneckDisplay";

const viewAll = (onClick: () => void, label = "Ver todos") => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs text-rpg-green hover:underline">
    {label} <ArrowRight size={13} aria-hidden />
  </button>
);

/** Visão geral: top 5 por score (ordem determinística vinda do servidor). */
export function BottleneckRanking({ ranking, selectedKey, onSelect, onViewAll }: { ranking: Candidate[]; selectedKey: string | null; onSelect: (c: Candidate) => void; onViewAll: () => void }) {
  return (
    <RPGPanel title="Visão geral dos gargalos" icon={<ListOrdered size={15} />} variant="gold" actions={viewAll(onViewAll)} className="h-full">
      {ranking.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum item acima do limite de atenção.</p>
      ) : (
        <ol className="space-y-1.5">
          {ranking.map((c, i) => {
            const level = LEVEL_UI[c.level];
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={clsx(
                    "grid w-full grid-cols-[32px_minmax(0,1fr)_minmax(64px,38%)] items-center gap-2.5 border px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold",
                    selectedKey === c.key ? "border-rpg-purple bg-rpg-purple/10" : "border-rpg-border/60 bg-rpg-bg-2/50 hover:border-rpg-gold/60",
                  )}
                  style={{ borderRadius: 3 }}
                >
                  <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full border-2 font-pixel text-xs", i === 0 ? "border-rpg-purple text-rpg-text bg-rpg-purple/30" : "border-rpg-gold/70 text-rpg-gold-light")} aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-rpg-text">{c.title}</span>
                    <span className="block text-[11px] text-rpg-muted">
                      {TYPE_UI[c.type].label} · {c.score}% impacto
                    </span>
                  </span>
                  <RPGProgressBar value={c.score} tone={level.tone} label={`${c.title}: ${c.score}% (${level.label})`} showLabel={false} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </RPGPanel>
  );
}

/** Causas com evidência e confiança — sem evidência, sem causa. */
export function BottleneckCauseList({ causes }: { causes: Cause[] }) {
  return (
    <RPGPanel title="Principais causas" icon={<Search size={15} />} variant="gold" className="h-full">
      {causes.length === 0 ? (
        <p className="text-sm text-rpg-muted">Não há evidência suficiente para determinar a causa principal.</p>
      ) : (
        <ul className="space-y-1.5">
          {causes.map((c) => {
            const conf = CONFIDENCE_UI[c.confidence];
            return (
              <li key={c.type}>
                <details className="group border border-rpg-border/60 bg-rpg-bg-2/50" style={{ borderRadius: 3 }}>
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 px-2.5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-rpg-text">{c.label}</span>
                      <span className="block text-[11px] text-rpg-muted">{c.description}</span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-rpg-muted transition-transform group-open:rotate-90" aria-hidden />
                  </summary>
                  <div className="border-t border-rpg-border/50 px-2.5 py-2 text-xs text-rpg-text/85">
                    <p>
                      <strong className="text-rpg-gold-light">Evidência:</strong> {c.evidence}
                    </p>
                    <RPGBadge tone={conf.tone} className="mt-1.5">
                      {conf.label}
                    </RPGBadge>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </RPGPanel>
  );
}

/** Itens ligados diretamente ao gargalo principal (≠ ranking, que lista gargalos independentes). */
export function BottleneckRelatedList({ related }: { related: BottleneckDetail["related"] }) {
  return (
    <RPGPanel title="Gargalos relacionados" icon={<Link2 size={15} />} variant="gold">
      {related.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum item ligado diretamente a este gargalo.</p>
      ) : (
        <ul className="space-y-1.5">
          {related.map((r) => {
            const ui = TYPE_UI[r.type];
            return (
              <li key={r.key}>
                <Link to={r.link} className="flex items-center gap-2.5 border border-rpg-border/60 bg-rpg-bg-2/50 px-2.5 py-2 hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                  <ui.icon size={20} className={clsx("shrink-0", RPG_TONE_TEXT[ui.tone])} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-rpg-text">{r.label}</span>
                    <span className="block text-[11px] text-rpg-muted">
                      {ui.label} · {r.note}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RPGPanel>
  );
}

const POTENTIAL_TONES = ["red", "orange", "gold"] as const;

/** Abaixo do limite: tendência de risco, ainda não críticos. */
export function BottleneckPotentialList({ potential, onSelect, onViewAll }: { potential: Candidate[]; onSelect: (c: Candidate) => void; onViewAll: () => void }) {
  return (
    <RPGPanel title="Outros gargalos potenciais" icon={<Radar size={15} />} variant="gold" actions={viewAll(onViewAll)}>
      {potential.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum risco emergente no momento.</p>
      ) : (
        <ol className="space-y-1.5">
          {potential.map((c, i) => (
            <li key={c.key}>
              <button type="button" onClick={() => onSelect(c)} className="grid w-full grid-cols-[24px_minmax(0,1fr)_72px] items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-rpg-border font-pixel text-[10px] text-rpg-muted" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-rpg-text">{c.title}</span>
                  <span className="block text-[10px] text-rpg-muted">{TYPE_UI[c.type].label}</span>
                </span>
                <RPGProgressBar value={c.score} tone={POTENTIAL_TONES[i] ?? "gold"} label={`Risco de ${c.title}: ${c.score}%`} showLabel={false} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </RPGPanel>
  );
}
