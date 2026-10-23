import { useEffect, useState } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { CalendarClock, Crown, Loader2, Pin, ScrollText } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { rpgButtonClass } from "@/components/rpg/RPGButton";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import { Modal } from "@/components/ui/Modal";
import type { TavernMissionCandidate, TavernSummary } from "@/services/tavernService";
import { fmtDay } from "./tavernFormat";

const PRIORITY_TONE = { Alta: "red", Média: "gold", Baixa: "green" } as const;

function CandidateOption({ c, checked, main, onSelect }: { c: TavernMissionCandidate; checked: boolean; main: boolean; onSelect: () => void }) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-start gap-3 border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-rpg-gold",
        checked ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg/50 hover:border-rpg-gold/60",
      )}
      style={{ borderRadius: 3 }}
    >
      <input type="radio" name="taverna-missao" className="mt-1 h-4 w-4 shrink-0 accent-rpg-gold" checked={checked} onChange={onSelect} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {main && <RPGBadge tone="gold" icon={<Crown size={11} aria-hidden />}>Sugestão principal</RPGBadge>}
          <RPGBadge tone={PRIORITY_TONE[c.priority as keyof typeof PRIORITY_TONE] ?? "muted"}>{c.priority}</RPGBadge>
          {c.projectName && <span className="truncate text-[11px] text-rpg-muted">{c.projectName}</span>}
        </span>
        <span className={clsx("mt-1 block font-semibold text-rpg-text", main ? "text-base" : "text-sm")}>{c.title}</span>
        <span className="mt-1 block text-xs text-rpg-muted">{c.reasons.join(" · ")}</span>
      </span>
    </label>
  );
}

/** Passo 4 — Primeira missão de amanhã: sugestão por regra (prazo + prioridade), fixada só após confirmação. */
export function TavernMissionStep({
  data,
  pinning,
  onPin,
}: {
  data: TavernSummary;
  pinning: boolean;
  onPin: (taskId: string, setDueTomorrow: boolean) => Promise<void>;
}) {
  const { mission, tomorrow } = data;
  const candidates = [mission.primary, ...mission.alternatives].filter((c): c is TavernMissionCandidate => c !== null);
  const [selected, setSelected] = useState<string | null>(candidates[0]?.id ?? null);
  const [confirming, setConfirming] = useState(false);
  const [moveDue, setMoveDue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quando o resumo recarrega com outra sugestão, mantém uma seleção válida.
  useEffect(() => {
    if (!candidates.some((c) => c.id === selected)) setSelected(candidates[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.primary?.id]);

  const chosen = candidates.find((c) => c.id === selected) ?? null;
  const pinnedMain = mission.pinned[0] ?? null;

  const confirm = async () => {
    if (!chosen) return;
    setError(null);
    try {
      await onPin(chosen.id, moveDue && chosen.dueDate !== tomorrow);
      setConfirming(false);
      setMoveDue(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível fixar a missão.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-rpg-muted">
        <ProvenanceBadge kind="sugestao" />
        <span>Pela regra de urgência do LifeOS: atrasadas, depois o que vence antes, e a prioridade desempata. Sem IA.</span>
      </div>

      {pinnedMain && (
        <p className="rpg-panel rpg-panel-gold flex flex-wrap items-center gap-2 p-3 text-sm" role="status">
          <Pin size={14} className="text-rpg-gold" aria-hidden />
          <span className="text-rpg-muted">Missão principal de amanhã:</span>
          <span className="font-semibold text-rpg-text">{pinnedMain.title}</span>
          {mission.pinned.length > 1 && <span className="text-xs text-rpg-muted">(+{mission.pinned.length - 1} em foco)</span>}
        </p>
      )}

      {candidates.length === 0 ? (
        <RPGPanel title="Sem missões em aberto" icon={<ScrollText size={15} />}>
          <p className="text-sm text-rpg-muted">Não há tarefas em aberto (livres de bloqueio) para sugerir. Crie a primeira missão de amanhã em Tarefas.</p>
          <Link to="/tarefas" className={rpgButtonClass("secondary", "mt-3 inline-flex")}>Abrir Tarefas</Link>
        </RPGPanel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <RPGPanel title="Escolha a primeira missão" icon={<Crown size={15} />} className="lg:col-span-2">
            <fieldset>
              <legend className="sr-only">Missão principal de amanhã</legend>
              <div className="space-y-2">
                {candidates.map((c, i) => (
                  <CandidateOption key={c.id} c={c} main={i === 0} checked={selected === c.id} onSelect={() => setSelected(c.id)} />
                ))}
              </div>
            </fieldset>
            <RPGButton variant="gold" className="mt-3 w-full justify-center sm:w-auto" disabled={!chosen || pinning} onClick={() => setConfirming(true)}>
              <Pin size={14} aria-hidden /> Fixar como missão principal de amanhã
            </RPGButton>
          </RPGPanel>
          <RPGPanel title={`Vence amanhã (${fmtDay(tomorrow)})`} icon={<CalendarClock size={15} />}>
            {mission.dueTomorrow.length ? (
              <ul className="space-y-1.5">
                {mission.dueTomorrow.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-rpg-text" title={t.title}>{t.title}</span>
                    <RPGBadge tone={PRIORITY_TONE[t.priority as keyof typeof PRIORITY_TONE] ?? "muted"}>{t.priority}</RPGBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-rpg-muted">Nada com prazo para amanhã.</p>
            )}
          </RPGPanel>
        </div>
      )}

      <Modal
        open={confirming && !!chosen}
        onClose={() => setConfirming(false)}
        title="Fixar missão principal de amanhã"
        size="sm"
        footer={
          <>
            <RPGButton variant="ghost" onClick={() => setConfirming(false)} disabled={pinning}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={() => void confirm()} disabled={pinning}>
              {pinning ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Pin size={14} aria-hidden />} Confirmar
            </RPGButton>
          </>
        }
      >
        {chosen && (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{chosen.title}</strong> vira a missão principal de {fmtDay(tomorrow)}. Isso grava na entrada do diário de amanhã (criada se ainda não existir); concluir a
              missão amanhã rende o bônus de missão principal.
            </p>
            {chosen.dueDate !== tomorrow && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={moveDue} onChange={(e) => setMoveDue(e.target.checked)} />
                <span>
                  Também mover o prazo para amanhã
                  <span className="block text-xs text-slate">Prazo atual: {chosen.dueDate ? fmtDay(chosen.dueDate) : "sem prazo"}</span>
                </span>
              </label>
            )}
            {error && (
              <p className="text-xs text-drop" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
