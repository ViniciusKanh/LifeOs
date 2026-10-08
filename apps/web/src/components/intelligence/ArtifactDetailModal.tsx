import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, FlaskConical, Hammer, Sword } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar, RPGTabs } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { useArtifactDetail } from "@/hooks/useIntelligence";
import type { ArtifactDetail } from "@/services/intelligenceService";
import { ARTIFACT_ICON, GLOSSARY, RARITY_UI, STATUS_UI, num, pct } from "@/utils/intelligenceDisplay";
import { ArenaTable } from "./ArenaPanel";
import { RuneList } from "./RunesPanel";

type Mode = "adventurer" | "scientist";
const MODES: Array<{ value: Mode; label: string; icon: JSX.Element }> = [
  { value: "adventurer", label: "Aventureiro", icon: <Sword size={13} className="inline mr-1" aria-hidden /> },
  { value: "scientist", label: "Cientista", icon: <FlaskConical size={13} className="inline mr-1" aria-hidden /> },
];

function Adventurer({ a }: { a: ArtifactDetail }) {
  const p = a.predictions;
  return (
    <div className="space-y-4">
      <p className="text-sm text-rpg-text/90">{a.description}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Precisão", a.metrics.accuracy, GLOSSARY.precision],
          ["Equilíbrio", a.metrics.cvMean, GLOSSARY.balance],
          ["Confiança", a.metrics.confidence, GLOSSARY.confidence],
        ].map(([l, v, tip]) => (
          <div key={l as string} className="border border-rpg-border/60 bg-rpg-bg-2/50 p-2.5" style={{ borderRadius: 3 }}>
            <RPGProgressBar tone="blue" label={l as string} value={(v as number) * 100} valueLabel={pct(v as number)} />
            <p className="mt-1 text-[10px] text-rpg-muted leading-snug">{tip as string}</p>
          </div>
        ))}
      </div>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rpg-muted">Runas que mais pesam</h3>
        <RuneList items={a.importance} limit={6} showDirection />
      </section>
      <section className="grid gap-2 sm:grid-cols-2 text-xs">
        <p className="border border-rpg-border/60 p-2.5 text-rpg-muted" style={{ borderRadius: 3 }}>
          <span className="block text-rpg-text font-semibold">Profecias</span>
          {p.resolved > 0 ? `${p.correct} de ${p.resolved} conferidas se confirmaram.` : p.total > 0 ? `${p.total} profecia(s) aguardando conferência na próxima reforja.` : "Nenhuma profecia registrada ainda."}
        </p>
        <p className="border border-rpg-border/60 p-2.5 text-rpg-muted" style={{ borderRadius: 3 }}>
          <span className="block text-rpg-text font-semibold">Alvo</span>
          {a.targetLabel}: {a.insights.threshold}.
        </p>
      </section>
    </div>
  );
}

function Scientist({ a }: { a: ArtifactDetail }) {
  const m = a.metrics;
  const c = m.confusion;
  const rows: Array<[string, string]> = [
    ["Algoritmo", a.algorithmLabel],
    ["Accuracy", pct(m.accuracy, 1)],
    ["Precision", pct(m.precision, 1)],
    ["Recall", pct(m.recall, 1)],
    ["F1", pct(m.f1, 1)],
    ["ROC-AUC", m.rocAuc === null ? "—" : m.rocAuc.toFixed(3).replace(".", ",")],
    ["Balanced acc. (CV mean)", pct(m.cvMean, 1)],
    ["CV std", pct(m.cvStd, 1)],
    ["Baseline (CV mean)", pct(a.insights.baselineCv, 1)],
    ["Brier score", m.brier.toFixed(3).replace(".", ",")],
    ["Brier skill score", pct(m.confidence, 1)],
    ["Dataset", `${num(a.samples)} dias · ${m.n} previsões fora da dobra · ${m.folds} dobras`],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-rpg-muted">{k}</dt>
              <dd className="text-right tabular-nums text-rpg-text">{v}</dd>
            </div>
          ))}
        </dl>
        <figure>
          <figcaption className="mb-1 text-xs font-semibold text-rpg-muted">Matriz de confusão (validação)</figcaption>
          <table className="w-full text-center text-xs tabular-nums">
            <thead>
              <tr className="text-rpg-muted">
                <th scope="col" />
                <th scope="col" className="font-normal">Prev. sim</th>
                <th scope="col" className="font-normal">Prev. não</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="font-normal text-rpg-muted text-left">Real sim</th>
                <td className="border border-rpg-green/50 bg-rpg-green/10 py-2 text-rpg-green">{c.tp}</td>
                <td className="border border-rpg-red/40 py-2 text-rpg-red">{c.fn}</td>
              </tr>
              <tr>
                <th scope="row" className="font-normal text-rpg-muted text-left">Real não</th>
                <td className="border border-rpg-red/40 py-2 text-rpg-red">{c.fp}</td>
                <td className="border border-rpg-green/50 bg-rpg-green/10 py-2 text-rpg-green">{c.tn}</td>
              </tr>
            </tbody>
          </table>
        </figure>
      </div>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rpg-muted">Importância por permutação (global, Δ log-loss)</h3>
        <RuneList items={a.importance} showDirection />
        <p className="mt-1 text-[10px] text-rpg-muted">Seta = sinal da correlação de Pearson entre a runa e o alvo. Não é SHAP: é a piora média da perda ao embaralhar cada runa nas dobras de validação.</p>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-rpg-muted">Data drift</h3>
        <p className={clsx("text-xs", a.insights.drift.detected ? "text-rpg-red" : "text-rpg-muted")}>{a.insights.drift.text ?? "Sem mudança relevante entre as últimas 30 amostras e o histórico."}</p>
      </section>
      {a.experiments[0] && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rpg-muted">Última arena</h3>
          <ArenaTable experiment={a.experiments[0]} scientist />
        </section>
      )}
    </div>
  );
}

/** Detalhe do artefato com alternância Aventureiro | Cientista. */
export function ArtifactDetailModal({ id, onClose, onReforge }: { id: string | null; onClose: () => void; onReforge: (objective: ArtifactDetail["objective"]) => void }) {
  const [mode, setMode] = useState<Mode>("adventurer");
  const { data: a, isLoading, isError } = useArtifactDetail(id);
  const ic = a ? ARTIFACT_ICON[a.icon] : null;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={a?.name ?? "Artefato"}
      size="lg"
      footer={
        a ? (
          <>
            <RPGButton variant="secondary" onClick={onClose}>
              Fechar
            </RPGButton>
            <RPGButton variant="primary" onClick={() => onReforge(a.objective)}>
              <Hammer size={15} aria-hidden /> Reforjar
            </RPGButton>
          </>
        ) : undefined
      }
    >
      {isLoading || !a || !ic ? (
        isError ? <p className="text-sm text-rpg-red">Não foi possível carregar o artefato.</p> : <div className="h-48 rpg-bar animate-pulse motion-reduce:animate-none" aria-label="Carregando artefato" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={clsx("inline-flex w-12 h-12 items-center justify-center border-2 border-current bg-rpg-bg", RPG_TONE_TEXT[ic.tone])} style={{ borderRadius: 3 }} aria-hidden>
              <ic.icon size={24} />
            </span>
            <div className="flex flex-wrap gap-1.5">
              <RPGBadge tone="muted">Nv. {a.level}</RPGBadge>
              <RPGBadge tone={RARITY_UI[a.rarity].tone}>{RARITY_UI[a.rarity].label}</RPGBadge>
              <RPGBadge tone={STATUS_UI[a.status].tone}>{STATUS_UI[a.status].label}</RPGBadge>
            </div>
            <div className="w-full sm:w-auto sm:ml-auto">
              <RPGTabs size="sm" label="Modo de leitura" tabs={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))} value={mode} onChange={setMode} />
            </div>
          </div>
          <RPGProgressBar tone="purple" label={`XP do artefato (${a.trainings} forja${a.trainings === 1 ? "" : "s"}, treinado há ${a.daysSinceTraining} dia(s))`} value={a.xp - a.levelStartXp} max={a.nextLevelXp - a.levelStartXp} valueLabel={`${num(a.xp)} / ${num(a.nextLevelXp)} XP`} />
          {a.insights.drift.detected && (
            <p className="flex items-center gap-1.5 text-xs text-rpg-red">
              <AlertTriangle size={13} aria-hidden /> {a.insights.drift.text}
            </p>
          )}
          {mode === "adventurer" ? <Adventurer a={a} /> : <Scientist a={a} />}
        </div>
      )}
    </Modal>
  );
}
