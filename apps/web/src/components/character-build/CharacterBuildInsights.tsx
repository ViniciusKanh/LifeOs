import { ArrowDown, ArrowRight, ArrowUp, Lightbulb, Scale } from "lucide-react";
import { RPGPanel } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { BuildOverview } from "@/services/buildService";
import { ATTR_UI } from "@/utils/codexDisplay";

/** Comparação geral: atual → meta, com cor e seta (nunca só cor). */
export function BuildComparison({ gaps }: { gaps: BuildOverview["gaps"] }) {
  return (
    <RPGPanel
      title="Comparação geral"
      icon={<Scale size={15} />}
      variant="gold"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-rpg-muted">
            <th className="pb-1 text-left font-normal">Atributo</th>
            <th className="pb-1 text-right font-normal">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rpg-purple" aria-hidden />
                Hoje
              </span>
            </th>
            <th className="pb-1 font-normal">
              <span className="sr-only">Situação</span>
            </th>
            <th className="pb-1 text-right font-normal">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rpg-gold" aria-hidden />
                Meta
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((g) => {
            const ui = ATTR_UI[g.key];
            const Arrow = g.status === "above" ? ArrowUp : g.status === "below" ? ArrowDown : ArrowRight;
            const tone = g.status === "above" ? "text-rpg-green" : g.status === "below" ? "text-rpg-red" : "text-rpg-blue";
            return (
              <tr key={g.key} className="border-b border-rpg-border/40 last:border-0">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2 text-rpg-text">
                    <ui.icon size={16} className={RPG_TONE_TEXT[ui.tone]} aria-hidden /> {g.label}
                  </span>
                </td>
                <td className="py-1.5 text-right font-pixel tabular-nums text-rpg-text">{g.current}</td>
                <td className={`py-1.5 text-center ${tone}`}>
                  <Arrow size={15} className="inline" aria-label={g.status === "above" ? "acima da meta" : g.status === "below" ? "abaixo da meta" : "na meta"} />
                </td>
                <td className="py-1.5 text-right font-pixel tabular-nums text-rpg-gold-light">{g.target}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </RPGPanel>
  );
}

/** Insights 100% determinísticos (derivados dos gaps). */
export function CharacterBuildInsights({ insights }: { insights: BuildOverview["insights"] }) {
  return (
    <RPGPanel title="Principais insights" icon={<Lightbulb size={15} />} variant="gold">
      {insights.length === 0 ? (
        <p className="text-sm text-rpg-muted">Ainda não há dados suficientes para gerar insights.</p>
      ) : (
        <ul className="divide-y divide-rpg-border/40">
          {insights.map((i) => (
            <li key={i.text} className="flex items-start gap-2.5 py-2 text-sm text-rpg-text">
              {i.tone === "up" ? <ArrowUp size={18} className="text-rpg-green shrink-0" aria-hidden /> : i.tone === "down" ? <ArrowDown size={18} className="text-rpg-red shrink-0" aria-hidden /> : <ArrowRight size={18} className="text-rpg-blue shrink-0" aria-hidden />}
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </RPGPanel>
  );
}
