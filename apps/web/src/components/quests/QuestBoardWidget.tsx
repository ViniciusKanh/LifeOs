import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ScrollText, Trophy } from "lucide-react";
import { RPGPanel, RPGProgressBar, RPGToast } from "@/components/rpg";
import { useQuests } from "@/hooks/useQuests";
import { useTheme } from "@/hooks/useTheme";
import type { Quest } from "@/services/questsService";
import { QuestScroll } from "./QuestScroll";
import { seasonProgress } from "./SeasonTrack";

/** Resumo do Quadro de Quests no painel: diárias de hoje + progresso da temporada. */
export function QuestBoardWidget({ className }: { className?: string }) {
  const { isRpg } = useTheme();
  const { data, isLoading, isError, refetch, claim } = useQuests();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const onClaim = async (q: Quest) => {
    try {
      const r = await claim.mutateAsync(q.id);
      // No tema RPG o feedback global já anuncia o XP; no clássico, um aviso simples.
      if (!isRpg) setToast({ text: r.replayed ? "Recompensa já resgatada." : `+${r.xp + r.bonusXp} XP resgatados.`, tone: "success" });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Não foi possível resgatar.", tone: "error" });
    }
  };

  return (
    <RPGPanel
      title={isRpg ? "Quadro de avisos" : "Quests de hoje"}
      icon={<ScrollText size={14} />}
      className={className}
      actions={
        <Link to="/quests" className="inline-flex items-center gap-1 text-[11px] text-rpg-gold-light underline-offset-2 hover:underline focus-visible:underline">
          Ver quadro <ArrowRight size={12} aria-hidden />
        </Link>
      }
    >
      {isLoading ? (
        <div className="grid gap-2 md:grid-cols-3" aria-busy="true" aria-label="Carregando quests">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 rpg-bar animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar as quests.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : (
        <>
          <ul className="grid gap-2 md:grid-cols-3">
            {data.daily.quests.map((q) => (
              <QuestScroll key={q.id} quest={q} compact onClaim={onClaim} claiming={claim.isPending && claim.variables === q.id} />
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex items-center gap-1.5 text-xs text-rpg-text sm:w-56 sm:shrink-0">
              <Trophy size={13} className="text-rpg-gold-light" aria-hidden />
              <span className="truncate">{data.season.name}</span>
            </span>
            <RPGProgressBar
              className="flex-1"
              tone="gold"
              label={`Tier ${data.season.tier} de ${data.season.maxTier}`}
              value={seasonProgress(data.season).value}
              max={seasonProgress(data.season).max}
              valueLabel={seasonProgress(data.season).text}
            />
          </div>
        </>
      )}
      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </RPGPanel>
  );
}
