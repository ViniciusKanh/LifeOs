import { Coins, Crown, Flame, Gem, Gift, Star } from "lucide-react";
import { RPGStatCard } from "@/components/rpg";
import type { TreasureSummary } from "@/services/gamificationService";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/**
 * Faixa de KPIs da carteira. XP é só informativo (nunca é gasto); o
 * bônus de sequência só aparece quando existe de verdade (campanha ativa).
 */
export function TreasureKpis({ summary, loading }: { summary: TreasureSummary | undefined; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6" aria-label="Carregando carteira">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rpg-panel h-[68px] animate-pulse" />
        ))}
      </div>
    );
  }
  const s = summary;
  const streakValue = s.streak.bonusPct > 0 ? `x${(1 + s.streak.bonusPct / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : `${s.streak.days}d`;
  return (
    <section aria-label="Carteira" className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6">
      <RPGStatCard layout="wide" dense tone="purple" icon={<Star size={22} />} value={fmt(s.totalXp)} label="XP total" />
      <RPGStatCard layout="wide" dense tone="gold" icon={<Crown size={22} />} value={`Nv. ${s.level}`} label={`${fmt(s.xpIntoLevel)}/${fmt(s.xpForNextLevel)} XP`} pct={s.progressPct} />
      <RPGStatCard layout="wide" dense tone="gold" icon={<Coins size={22} />} value={fmt(s.coins)} label="Moedas" caption={`+${fmt(s.wallet.earned30)} em 30d`} />
      <RPGStatCard layout="wide" dense tone="purple" icon={<Gem size={22} />} value={fmt(s.gems)} label="Gemas" caption={s.gemsEarned > 0 ? undefined : "marcos especiais"} />
      <RPGStatCard
        layout="wide" dense
        tone="orange"
        icon={<Flame size={22} />}
        value={streakValue}
        label={s.streak.bonusPct > 0 ? "Bônus de sequência" : "Sequência"}
        caption={s.streak.bonusPct > 0 ? `+${s.streak.bonusPct}% moedas` : `${s.streak.days} dias seguidos`}
      />
      <RPGStatCard layout="wide" dense tone="pink" icon={<Gift size={22} />} value={fmt(s.availableCount)} label="Resgates disponíveis" />
    </section>
  );
}
