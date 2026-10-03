import { Coins, Gift, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { RPGPanel, RPGProgressBar } from "@/components/rpg";
import type { Campaign } from "@/services/campaignsService";

/**
 * Próxima recompensa REAL ainda não paga: o baú de conclusão (com o bônus
 * de sequência vigente) e o progresso que falta. Sem campanha → vazio.
 */
export function CampaignRewardCard({ campaign: c }: { campaign: Campaign | null }) {
  const useMs = !!c && c.counts.milestones > 0;
  const done = !c ? 0 : useMs ? c.counts.milestonesDone : c.counts.missionsDone;
  const total = !c ? 0 : useMs ? c.counts.milestones : c.counts.missions;
  const left = Math.max(0, total - done);
  const reward = c ? { xp: Math.floor((c.completionReward.xp * (100 + c.streak.xpPct)) / 100), coins: Math.floor((c.completionReward.coins * (100 + c.streak.coinsPct)) / 100) } : null;
  const next = c?.milestones.find((m) => m.state === "current");
  const paid = c?.status === "completed";

  return (
    <RPGPanel title="Próxima recompensa" icon={<Gift size={16} />} className="h-full" actions={c && <Link to={`/forja-campanhas/${c.id}?aba=recompensas`} className="text-xs text-rpg-gold-light hover:underline">Ver todos →</Link>}>
      {!c && <p className="text-sm text-rpg-muted">Nenhuma campanha selecionada.</p>}
      {c && paid && <p className="text-sm text-rpg-green">Baú da campanha já aberto: +{c.completionReward.xp} XP base.</p>}
      {c && !paid && reward && (
        <>
          <div className="flex items-start gap-3">
            <span className="shrink-0 text-4xl leading-none" aria-hidden>🧰</span>
            <div className="min-w-0">
              <p className="font-semibold text-rpg-text leading-tight">Baú da conclusão</p>
              <p className="text-xs text-rpg-muted">
                {total === 0 ? "Adicione missões ou marcos à campanha." : left === 0 ? "Tudo feito — conclua a campanha para abrir o baú." : `Complete mais ${left} ${useMs ? (left === 1 ? "marco" : "marcos") : left === 1 ? "missão" : "missões"} desta campanha.`}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RPGProgressBar className="flex-1" tone="purple" label="Progresso até o baú" value={done} max={Math.max(1, total)} showLabel={false} />
            <span className="font-pixel text-xs text-rpg-text">{done} / {total}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 font-pixel text-xs">
            <span className="inline-flex items-center gap-1 border border-rpg-purple/60 bg-rpg-purple/10 px-2 py-0.5 text-rpg-purple" style={{ borderRadius: 3 }}><Star size={12} aria-hidden /> +{reward.xp} XP</span>
            <span className="inline-flex items-center gap-1 border border-rpg-gold/60 bg-rpg-gold/10 px-2 py-0.5 text-rpg-gold-light" style={{ borderRadius: 3 }}><Coins size={12} aria-hidden /> +{reward.coins}</span>
          </div>
          {next && (next.xpReward > 0 || next.coinReward > 0) && (
            <p className="mt-2 text-[11px] text-rpg-muted">Próximo marco: {next.title} · +{next.xpReward} XP</p>
          )}
        </>
      )}
    </RPGPanel>
  );
}
