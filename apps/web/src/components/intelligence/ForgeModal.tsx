import { useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Hammer, Trophy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { ForgeResult, Grimoire, IntelligenceOverview, ObjectiveKey } from "@/services/intelligenceService";
import { ALGO_SHORT, ARTIFACT_ICON, RARITY_UI, pct } from "@/utils/intelligenceDisplay";

/**
 * Nova forja / reforja. Mostra a prontidão real de cada objetivo e só treina
 * após confirmação. Treinar não altera nenhum registro do usuário.
 */
export function ForgeModal({
  open,
  onClose,
  objectives,
  grimoire,
  initial,
  refresh,
  forge,
  onInspect,
}: {
  open: boolean;
  onClose: () => void;
  objectives: IntelligenceOverview["objectives"];
  grimoire: IntelligenceOverview["grimoire"];
  initial: ObjectiveKey | null;
  refresh: { mutate: () => void; isPending: boolean; data?: Grimoire; isError: boolean };
  forge: { mutateAsync: (k: ObjectiveKey) => Promise<ForgeResult>; isPending: boolean; reset: () => void };
  onInspect: (id: string) => void;
}) {
  const [selected, setSelected] = useState<ObjectiveKey | null>(initial);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prontidão atual: reaproveita o grimório de hoje; senão recalcula ao abrir.
  const fresh = grimoire && new Date(grimoire.updatedAt.replace(" ", "T") + (grimoire.updatedAt.includes("Z") ? "" : "Z")).toDateString() === new Date().toDateString();
  useEffect(() => {
    if (!open) return;
    setSelected(initial);
    setResult(null);
    setError(null);
    forge.reset();
    if (!fresh) refresh.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const g = refresh.data ?? grimoire;
  const readiness = (k: ObjectiveKey) => g?.readiness.find((r) => r.objective === k) ?? null;
  const sel = selected ? readiness(selected) : null;

  const run = async () => {
    if (!selected) return;
    setError(null);
    try {
      setResult(await forge.mutateAsync(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível forjar agora.");
    }
  };

  const footer = result ? (
    <>
      <RPGButton variant="secondary" onClick={onClose}>
        Fechar
      </RPGButton>
      <RPGButton
        variant="primary"
        onClick={() => {
          onClose();
          onInspect(result.artifact.id);
        }}
      >
        Inspecionar artefato
      </RPGButton>
    </>
  ) : (
    <>
      <RPGButton variant="secondary" onClick={onClose}>
        Cancelar
      </RPGButton>
      <RPGButton variant="primary" disabled={!selected || !sel?.ready || forge.isPending || refresh.isPending} onClick={() => void run()}>
        <Hammer size={15} aria-hidden /> {forge.isPending ? "Forjando…" : objectives.find((o) => o.key === selected)?.forged ? "Confirmar reforja" : "Confirmar forja"}
      </RPGButton>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={result ? "Artefato forjado" : "Nova forja"} size="lg" footer={footer}>
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 text-rpg-text">
            <Trophy size={18} className="text-rpg-gold-light" aria-hidden />
            <strong>{result.artifact.name}</strong> — campeão: {ALGO_SHORT[result.experiment.winner ?? "baseline"]}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <RPGBadge tone={result.artifact.status === "production" ? "green" : "orange"}>{result.artifact.status === "production" ? "Produção" : "Experimental"}</RPGBadge>
            <RPGBadge tone={RARITY_UI[result.artifact.rarity].tone}>{RARITY_UI[result.artifact.rarity].label}</RPGBadge>
            <RPGBadge tone="purple">+{result.xpGain} XP · Nv. {result.artifact.level}</RPGBadge>
          </div>
          <p className="text-rpg-muted">
            Precisão {pct(result.artifact.metrics.accuracy)} · Equilíbrio {pct(result.artifact.metrics.cvMean)} ± {pct(result.artifact.metrics.cvStd)} · Confiança {pct(result.artifact.metrics.confidence)} em{" "}
            {result.experiment.samples} dias.
            {result.confirmed > 0 && ` ${result.confirmed} profecia(s) anterior(es) confirmada(s).`}
          </p>
          {result.artifact.status === "experimental" && (
            <p className="text-xs text-rpg-orange">Nenhum algoritmo superou a linha de base com folga. O artefato fica como experimental até haver mais sinal nos seus dados.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-rpg-muted">
            A forja lê até 365 dias dos seus registros, compara 5 algoritmos com validação temporal (o modelo nunca vê o futuro) e guarda o campeão. Nenhum registro seu é alterado.
          </p>
          {refresh.isPending && <div className="h-10 rpg-bar animate-pulse motion-reduce:animate-none" aria-label="Lendo o grimório" />}
          {refresh.isError && !g && <p className="text-xs text-rpg-red">Não foi possível ler o grimório agora.</p>}
          <fieldset>
            <legend className="sr-only">Escolha o objetivo do artefato</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {objectives.map((o) => {
                const r = readiness(o.key);
                const ic = ARTIFACT_ICON[o.icon];
                const active = selected === o.key;
                return (
                  <label
                    key={o.key}
                    className={clsx("flex cursor-pointer items-start gap-2.5 border p-2.5 transition-colors", active ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border/70 bg-rpg-bg-2/50 hover:bg-rpg-panel-hover")}
                    style={{ borderRadius: 3 }}
                  >
                    <input type="radio" name="objective" className="mt-1 accent-[rgb(var(--rpg-gold))]" checked={active} onChange={() => setSelected(o.key)} />
                    <ic.icon size={20} className={clsx("shrink-0 mt-0.5", RPG_TONE_TEXT[ic.tone])} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-rpg-text">
                        {o.name} {o.forged && <span className="text-[10px] font-normal text-rpg-muted">(reforja)</span>}
                      </span>
                      <span className="block text-xs text-rpg-muted">Alvo: {o.targetLabel.toLowerCase()}</span>
                      {r && (
                        <span className={clsx("block text-[11px] mt-0.5", r.ready ? "text-rpg-green" : "text-rpg-orange")}>
                          {r.ready ? `${r.samples} dias prontos (${r.positives} × ${r.negatives})` : r.reason}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {sel && <p className="text-xs text-rpg-muted">Definição do alvo: {sel.thresholdText}.</p>}
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-rpg-red" role="alert">
              <AlertTriangle size={13} aria-hidden /> {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
