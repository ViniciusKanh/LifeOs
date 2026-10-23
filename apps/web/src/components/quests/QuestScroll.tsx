import { Link } from "react-router-dom";
import clsx from "clsx";
import { Check, Gift, Loader2, Shuffle } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar, RPG_TONE_SOFT } from "@/components/rpg";
import type { Quest } from "@/services/questsService";
import { QUEST_MODULE, fmtProgress } from "./questFormat";

interface Props {
  quest: Quest;
  onClaim?: (q: Quest) => void;
  onReroll?: (q: Quest) => void;
  claiming?: boolean;
  rerolling?: boolean;
  /** Versão do widget: sem troca e com menos texto. */
  compact?: boolean;
}

/**
 * Uma quest como pergaminho pregado no quadro. Progresso real (calculado no
 * servidor); o botão "Resgatar" só aparece quando a meta foi atingida.
 */
export function QuestScroll({ quest: q, onClaim, onReroll, claiming = false, rerolling = false, compact = false }: Props) {
  const mod = QUEST_MODULE[q.module] ?? QUEST_MODULE.missions;
  const Icon = mod.icon;
  const state = q.claimed ? "claimed" : q.completed ? "ready" : "open";

  return (
    <li
      className={clsx(
        "flex flex-col gap-2 border p-3 transition-colors",
        state === "claimed" ? "border-rpg-green/50 bg-rpg-green/[0.07]" : state === "ready" ? "border-rpg-gold/80 bg-rpg-gold/10" : "border-rpg-border/70 bg-rpg-bg-2/60",
      )}
      style={{ borderRadius: 3 }}
    >
      <div className="flex items-start gap-2.5">
        <span className={clsx("grid h-8 w-8 shrink-0 place-items-center border", RPG_TONE_SOFT[mod.tone])} style={{ borderRadius: 3 }} aria-hidden>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("text-sm font-semibold leading-snug text-rpg-text", state === "claimed" && "line-through decoration-rpg-green/60")}>{q.title}</p>
          {!compact && (
            <Link to={mod.to} className="text-[11px] text-rpg-muted underline-offset-2 hover:text-rpg-text hover:underline focus-visible:underline">
              {mod.label}
            </Link>
          )}
        </div>
        <RPGBadge tone={state === "claimed" ? "green" : "purple"} className="shrink-0">
          {state === "claimed" ? <Check size={10} aria-hidden /> : null}+{q.xpReward} XP
        </RPGBadge>
      </div>

      <RPGProgressBar
        tone={state === "open" ? "blue" : state === "ready" ? "gold" : "green"}
        label={`Progresso: ${q.title}`}
        value={Math.min(q.progress, q.target)}
        max={q.target}
        valueLabel={fmtProgress(q)}
      />

      {(state === "ready" || (!compact && q.canReroll && onReroll)) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!compact && q.canReroll && onReroll && (
            <RPGButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onReroll(q)} disabled={rerolling} aria-label={`Trocar a quest: ${q.title}`}>
              {rerolling ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Shuffle size={13} aria-hidden />} Trocar
            </RPGButton>
          )}
          {state === "ready" && onClaim && (
            <RPGButton variant="gold" className="!px-3 !py-1 text-xs" onClick={() => onClaim(q)} disabled={claiming} aria-label={`Resgatar ${q.xpReward} XP da quest: ${q.title}`}>
              {claiming ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Gift size={13} aria-hidden />} Resgatar
            </RPGButton>
          )}
        </div>
      )}
    </li>
  );
}
