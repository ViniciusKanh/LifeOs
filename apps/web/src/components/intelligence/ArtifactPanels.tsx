import clsx from "clsx";
import { Lock, Sparkles } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { ArtifactSummary, IntelligenceOverview, Readiness } from "@/services/intelligenceService";
import { UnlockRitual } from "./UnlockRitual";
import { ARTIFACT_ICON, GLOSSARY, RARITY_UI, STATUS_UI, pct } from "@/utils/intelligenceDisplay";

type Objective = IntelligenceOverview["objectives"][number];

/** Mini-card de artefato: ícone, nível, raridade, status e as três métricas do Aventureiro. */
export function ArtifactCard({ a, onInspect }: { a: ArtifactSummary; onInspect: () => void }) {
  const ic = ARTIFACT_ICON[a.icon];
  const rar = RARITY_UI[a.rarity];
  const st = STATUS_UI[a.status];
  return (
    <article className={clsx("flex flex-col border bg-rpg-bg-2/60 p-3 min-w-0", a.rarity === "legendary" ? "border-rpg-gold/70" : a.rarity === "epic" ? "border-rpg-purple/50" : "border-rpg-border/70")} style={{ borderRadius: 3 }}>
      <div className="flex items-start gap-2.5">
        <span className={clsx("inline-flex w-11 h-11 shrink-0 items-center justify-center border-2 border-current bg-rpg-bg", RPG_TONE_TEXT[ic.tone])} style={{ borderRadius: 3 }} aria-hidden>
          <ic.icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-rpg-gold-light leading-tight">{a.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RPGBadge tone="muted">Nv. {a.level}</RPGBadge>
            <RPGBadge tone={rar.tone}>{rar.label}</RPGBadge>
            <span className={clsx("inline-flex items-center gap-1 text-[10px] font-semibold", RPG_TONE_TEXT[st.tone])}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden /> {st.label}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-rpg-muted leading-snug">{a.description}</p>
      <div className="mt-2 space-y-1">
        {[
          ["Precisão", a.metrics.accuracy, GLOSSARY.precision],
          ["Equilíbrio", a.metrics.balancedAccuracy, GLOSSARY.balance],
          ["Confiança", a.metrics.confidence, GLOSSARY.confidence],
        ].map(([label, v, tip]) => (
          <div key={label as string} className="grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-2 text-[11px]" title={tip as string}>
            <span className="text-rpg-muted">{label as string}</span>
            <RPGProgressBar tone="blue" label={label as string} value={(v as number) * 100} showLabel={false} />
            <span className="text-right font-pixel tabular-nums text-rpg-text">{pct(v as number)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-rpg-muted truncate">{a.algorithmLabel}</span>
        <RPGButton variant="secondary" className="!px-2 !py-1 text-xs" onClick={onInspect}>
          Inspecionar
        </RPGButton>
      </div>
    </article>
  );
}

/** Objetivo ainda não forjado: mostra o que ele faria e convida a forjar. */
export function LockedArtifactCard({ o, onForge, readiness }: { o: Objective; onForge: () => void; readiness?: Readiness | null }) {
  const ic = ARTIFACT_ICON[o.icon];
  return (
    <article className="flex flex-col border border-dashed border-rpg-border/80 bg-rpg-bg/40 p-3 min-w-0" style={{ borderRadius: 3 }}>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex w-11 h-11 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg text-rpg-muted" style={{ borderRadius: 3 }} aria-hidden>
          <ic.icon size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-rpg-text/80 leading-tight">{o.name}</h3>
          <span className="inline-flex items-center gap-1 text-[10px] text-rpg-muted">
            <Lock size={10} aria-hidden /> Ainda não forjado
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-rpg-muted leading-snug flex-1">{o.description}</p>
      {readiness && (
        <div className="mt-2">
          <UnlockRitual r={readiness} compact />
        </div>
      )}
      <RPGButton variant="ghost" className="mt-2 self-start !px-2 !py-1 text-xs" onClick={onForge}>
        <Sparkles size={13} aria-hidden /> Forjar
      </RPGButton>
    </article>
  );
}

export function ArtifactGrid({ artifacts, objectives, onInspect, onForge, limit, className, readiness }: { artifacts: ArtifactSummary[]; objectives: Objective[]; onInspect: (id: string) => void; onForge: (key: Objective["key"]) => void; limit?: number; className?: string; readiness?: Readiness[] }) {
  const locked = objectives.filter((o) => !o.forged);
  const items = [...artifacts.map((a) => ({ kind: "a" as const, a })), ...locked.map((o) => ({ kind: "o" as const, o }))].slice(0, limit ?? Infinity);
  return (
    <div className={clsx("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((it) => (it.kind === "a" ? <ArtifactCard key={it.a.id} a={it.a} onInspect={() => onInspect(it.a.id)} /> : <LockedArtifactCard key={it.o.key} o={it.o} onForge={() => onForge(it.o.key)} readiness={readiness?.find((r) => r.objective === it.o.key) ?? null} />))}
    </div>
  );
}

export function ArtifactsPanel(props: { artifacts: ArtifactSummary[]; objectives: Objective[]; onInspect: (id: string) => void; onForge: (key: Objective["key"]) => void; onViewAll: () => void; readiness?: Readiness[] }) {
  return (
    <RPGPanel
      title="Artefatos ativos"
      icon={<Sparkles size={15} />}
      className="h-full"
      actions={
        <button type="button" onClick={props.onViewAll} className="text-xs text-rpg-gold-light hover:underline">
          Ver todos →
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-xs text-rpg-muted">Modelos que alimentam o LifeOS com previsões da sua rotina.</p>
      <ArtifactGrid {...props} limit={4} />
    </RPGPanel>
  );
}
