import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Shield } from "lucide-react";
import { useHeroHud } from "@/hooks/useCodex";
import type { HeroHud } from "@/services/codexService";
import { TrophyShowcaseStrip } from "@/components/achievements/TrophyShowcase";

/**
 * Classe dinâmica do herói: calculada no servidor pelos 2 atributos mais
 * fortes nos últimos 30 dias (Códex). Muda sozinha quando a rotina muda.
 * Sem XP no período, não mostra classe nenhuma (nada inventado).
 */
export function HeroClassChip({ className }: { className?: string }) {
  const { data } = useHeroHud();
  if (!data?.currentClass) return null;
  const c = data.currentClass;
  const build = data.build.map((b) => `${b.label} ${b.sharePct}%`).join(" · ");
  return (
    <Link
      to="/codex"
      className={clsx("hidden 2xl:flex items-center gap-1.5 border border-rpg-border bg-rpg-panel/70 px-2 py-1 hover:border-rpg-gold/70 transition-colors", className)}
      style={{ borderRadius: 3 }}
      title={`Classe pela rotina dos últimos ${data.windowDays} dias (${c.basedOn.join(" + ")}). Build: ${build}`}
      aria-label={`Classe atual: ${c.name}. Build: ${build}. Abrir Códex`}
    >
      <Shield size={13} className="text-rpg-purple" aria-hidden />
      <span className="font-pixel text-xs text-rpg-text">{c.name}</span>
      {data.showcase.length > 0 && <TrophyShowcaseStrip items={data.showcase} size="xs" />}
    </Link>
  );
}

/** Build atual: os 3 atributos que mais cresceram no período, com participação e tendência reais. */
export function HeroBuild({ hud, className }: { hud: HeroHud; className?: string }) {
  if (!hud.currentClass) {
    return <p className={clsx("text-xs text-rpg-muted", className)}>Ganhe XP por alguns dias para revelar sua classe e sua build.</p>;
  }
  return (
    <div className={clsx("min-w-0", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-pixel text-[10px] uppercase tracking-widest text-rpg-muted">Classe ({hud.windowDays} dias)</span>
        <span className="font-rpg text-base font-bold text-rpg-gold-light">{hud.currentClass.name}</span>
        {hud.shifting && hud.longTermClass && (
          <span className="text-[11px] text-rpg-muted" title="Sua rotina recente está puxando para outra classe">
            antes: {hud.longTermClass.name}
          </span>
        )}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Build atual">
        {hud.build.map((b) => (
          <li key={b.key} className="inline-flex items-center gap-1 border border-rpg-border/80 bg-rpg-bg-2/70 px-2 py-0.5 text-[11px]" style={{ borderRadius: 3 }}>
            <span className="text-rpg-text">{b.label}</span>
            <span className="font-pixel text-rpg-purple">{b.sharePct}%</span>
            <span className="text-rpg-muted">Nv.{b.level}</span>
            {b.trendPct !== null && b.trendPct !== 0 && (
              <span className={b.trendPct > 0 ? "text-rpg-green" : "text-rpg-red"} aria-label={`${b.trendPct > 0 ? "subiu" : "caiu"} ${Math.abs(b.trendPct)}% contra os 30 dias anteriores`}>
                {b.trendPct > 0 ? <ArrowUpRight size={11} aria-hidden /> : <ArrowDownRight size={11} aria-hidden />}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
