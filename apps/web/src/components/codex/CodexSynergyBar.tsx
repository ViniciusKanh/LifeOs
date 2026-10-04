import { Triangle } from "lucide-react";
import { RPG_TONE_BG } from "@/components/rpg/rpgAssets";
import type { Codex } from "@/services/codexService";
import { ATTR_UI } from "@/utils/codexDisplay";

/** Sinergia dos atributos: segmentos por atributo (escala comum) + sinergia geral calculada no servidor. */
export function CodexSynergyBar({ codex }: { codex: Codex }) {
  return (
    <section className="rpg-panel rpg-panel-gold flex flex-col sm:flex-row sm:items-center gap-3 p-3">
      <span className="hidden sm:flex shrink-0 w-11 h-11 items-center justify-center border-2 border-rpg-gold/70 text-rpg-gold-light bg-rpg-bg" style={{ borderRadius: 3 }} aria-hidden>
        <Triangle size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-pixel text-xs uppercase tracking-wider text-rpg-gold-light">Sinergia dos atributos</p>
        <p className="text-[11px] text-rpg-muted">Seus atributos trabalham juntos. Quanto mais equilibrados, maior seu potencial.</p>
      </div>
      <ul className="flex flex-1 gap-1" aria-label="Força de cada atributo (0 a 100)">
        {codex.attributes.map((a, i) => (
          <li key={a.key} className="flex-1 min-w-0" title={`${a.label}: ${codex.synergy.scores[i]}/100`}>
            <div className="h-3 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
              <div className={`h-full ${RPG_TONE_BG[ATTR_UI[a.key].tone]}`} style={{ width: `${codex.synergy.scores[i]}%` }} />
            </div>
            <span className="sr-only">{a.label}: {codex.synergy.scores[i]} de 100</span>
          </li>
        ))}
      </ul>
      <div className="shrink-0 text-right">
        <p className="font-rpg text-2xl font-bold text-rpg-text leading-none">{codex.synergy.synergy}%</p>
        <p className="font-pixel text-[10px] uppercase tracking-wider text-rpg-muted">Sinergia geral</p>
      </div>
    </section>
  );
}
