import { Flame, Layers, Target, TrendingUp } from "lucide-react";
import { Card, StatTile } from "@/components/ui/primitives";
import type { GrimoireStats } from "@/services/grimoireService";

const br = (k: string) => k.slice(5).split("-").reverse().join("/");

/** Estatísticas reais do Grimório: retenção (só com amostra mínima), sequência e revisões por dia. */
export function GrimoireStatsPanel({ stats }: { stats: GrimoireStats }) {
  const max = Math.max(1, ...stats.byDay.map((d) => d.reviews));
  const totalReviews = stats.byDay.reduce((s, d) => s + d.reviews, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<Target size={16} />} tone="purple" label="Retenção (30 dias)" value={stats.retention30d == null ? "—" : `${stats.retention30d}%`} caption={stats.retention30d == null ? `Dados insuficientes (${stats.retentionSample}/10 revisões)` : `${stats.retentionSample} revisões de cartões aprendidos`} />
        <StatTile icon={<Flame size={16} />} tone="amber" label="Sequência" value={`${stats.streak} ${stats.streak === 1 ? "dia" : "dias"}`} caption="Dias seguidos com revisão" />
        <StatTile icon={<TrendingUp size={16} />} tone="blue" label="Revisões hoje" value={String(stats.reviewsToday)} caption={`${totalReviews} nos últimos 30 dias`} />
        <StatTile icon={<Layers size={16} />} tone="green" label="Cartões" value={String(stats.totals.cards)} caption={`${stats.totals.new} novos · ${stats.totals.learning} aprendendo · ${stats.totals.mature} maduros`} />
      </div>
      <Card className="p-4">
        <p className="text-sm font-semibold mb-3 rpg:rpg-title">Revisões por dia (30 dias)</p>
        {totalReviews === 0 ? (
          <p className="text-sm text-slate py-6 text-center">Nenhuma revisão nos últimos 30 dias. Estude a fila de hoje para começar o histórico.</p>
        ) : (
          <>
            <div className="flex items-end gap-[3px] h-32" role="img" aria-label={`Revisões por dia nos últimos 30 dias, total ${totalReviews}`}>
              {stats.byDay.map((d) => {
                const h = Math.round((d.reviews / max) * 100);
                const okH = d.reviews ? Math.round((d.correct / d.reviews) * h) : 0;
                return (
                  <div key={d.day} className="flex-1 min-w-0 h-full flex flex-col justify-end" title={`${br(d.day)}: ${d.reviews} revisões, ${d.correct} acertos`}>
                    <div className="w-full bg-drop/40 rounded-t-sm rpg:rounded-none rpg:bg-rpg-red/50" style={{ height: `${h - okH}%` }} />
                    <div className="w-full bg-cat-purple rpg:bg-rpg-purple" style={{ height: `${okH}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate mt-1">
              <span>{br(stats.byDay[0].day)}</span>
              <span>{br(stats.byDay[stats.byDay.length - 1].day)}</span>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 bg-cat-purple rpg:bg-rpg-purple" aria-hidden /> Acertos (Difícil, Bom, Fácil)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 bg-drop/40 rpg:bg-rpg-red/50" aria-hidden /> Errei
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
