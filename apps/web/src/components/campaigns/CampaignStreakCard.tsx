import { Coins, Flame, Star } from "lucide-react";
import { RPGPanel } from "@/components/rpg";
import type { Campaign } from "@/services/campaignsService";

/**
 * Bônus de sequência: semanas consecutivas com atividade real na campanha
 * (missão, hábito ligado ou marco). O bônus vale só para recompensas
 * futuras da campanha — o XP histórico nunca é recalculado.
 */
export function CampaignStreakCard({ campaign: c }: { campaign: Campaign | null }) {
  return (
    <RPGPanel title="Bônus de sequência" icon={<Flame size={16} />} className="h-full">
      {!c && <p className="text-sm text-rpg-muted">Nenhuma campanha selecionada.</p>}
      {c && !c.streakEnabled && <p className="text-sm text-rpg-muted">Sequência desativada nesta campanha.</p>}
      {c && c.streakEnabled && (
        <>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-11 h-11 flex items-center justify-center border border-rpg-orange/60 bg-rpg-orange/10 text-rpg-orange" style={{ borderRadius: 3 }} aria-hidden>
              <Flame size={24} />
            </span>
            <div className="min-w-0">
              <p className="font-rpg text-xl font-bold text-rpg-text leading-none">{c.streak.weeks} {c.streak.weeks === 1 ? "semana" : "semanas"}</p>
              <p className="mt-1 text-xs text-rpg-muted">Mantenha o ritmo nas missões desta campanha e ganhe bônus extras.</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 font-pixel text-xs">
            <span className="inline-flex items-center gap-1 border border-rpg-purple/60 bg-rpg-purple/10 px-2 py-0.5 text-rpg-purple" style={{ borderRadius: 3 }}><Star size={12} aria-hidden /> +{c.streak.xpPct}% XP</span>
            <span className="inline-flex items-center gap-1 border border-rpg-gold/60 bg-rpg-gold/10 px-2 py-0.5 text-rpg-gold-light" style={{ borderRadius: 3 }}><Coins size={12} aria-hidden /> +{c.streak.coinsPct}%</span>
          </div>
          {c.streak.nextTier && (
            <p className="mt-2 text-[11px] text-rpg-muted">
              {c.streak.nextTier.weeks} semanas seguidas: +{c.streak.nextTier.xpPct}% XP · +{c.streak.nextTier.coinsPct}% moedas
            </p>
          )}
        </>
      )}
    </RPGPanel>
  );
}
