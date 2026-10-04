import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { RPGProgressBar } from "@/components/rpg";
import type { CodexAttribute } from "@/services/codexService";
import { ATTR_UI } from "@/utils/codexDisplay";

const BORDER = { red: "border-rpg-red/70", green: "border-rpg-green/70", blue: "border-rpg-blue/70", gold: "border-rpg-gold/80", pink: "border-rpg-pink/70", cyan: "border-rpg-cyan/70" } as const;

/** Card ilustrado de atributo: nível, XP do nível, barra, % e tendência real (30d × 30d). */
export function CodexAttributeCard({ attr, selected, onOpen, onSelect }: { attr: CodexAttribute; selected: boolean; onOpen: () => void; onSelect: () => void }) {
  const ui = ATTR_UI[attr.key];
  const Icon = ui.icon;
  const tone = ui.tone as keyof typeof BORDER;
  const intoLevel = attr.xp - attr.levelStartXp;
  const span = attr.nextLevelXp - attr.levelStartXp;
  return (
    <button
      type="button"
      onClick={onOpen}
      onFocus={onSelect}
      onMouseEnter={onSelect}
      className={clsx("rpg-panel relative overflow-hidden text-left w-full p-3 min-h-[128px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", selected && BORDER[tone])}
      aria-label={`${attr.label}, nível ${attr.level}, ${intoLevel} de ${span} XP neste nível. Abrir detalhes`}
    >
      <img src={ui.art} alt="" aria-hidden loading="lazy" decoding="async" className="pixelated absolute inset-y-0 right-0 h-full w-[48%] object-cover opacity-90" />
      <div className="absolute inset-y-0 right-[30%] w-[30%] bg-gradient-to-r from-rpg-panel to-transparent" aria-hidden />
      <div className="relative flex items-start gap-2.5 pr-[34%] sm:pr-[40%]">
        <span className={clsx("shrink-0 w-11 h-11 flex items-center justify-center border-2 bg-rpg-bg", BORDER[tone], RPG_TONE_TEXT[ui.tone])} style={{ borderRadius: 3 }} aria-hidden>
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={clsx("font-rpg text-lg font-bold leading-none", RPG_TONE_TEXT[ui.tone])}>{attr.label}</span>
            <span className="border border-rpg-border bg-rpg-bg-2 px-1.5 py-0.5 font-pixel text-[10px] text-rpg-text" style={{ borderRadius: 2 }}>Nv. {attr.level}</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-rpg-text/80 line-clamp-2">{attr.description}</p>
        </div>
      </div>
      <ChevronRight size={16} className="absolute top-2 right-2 text-rpg-text/80" aria-hidden />
      <div className="relative mt-3 pr-[30%] sm:pr-[38%]">
        <RPGProgressBar tone={ui.tone} label={`XP de ${attr.label}`} value={intoLevel} max={span} showLabel={false} />
      </div>
      <div className="relative mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-pixel text-rpg-text tabular-nums">{intoLevel} / {span} XP</span>
        <span className="flex items-center gap-2 rounded-sm bg-rpg-bg/80 px-1.5 py-0.5">
          <span className="font-pixel text-sm text-rpg-text tabular-nums">{attr.progressPct}%</span>
          {attr.trendPct == null ? (
            <span className="text-rpg-muted" title="Sem base nos 30 dias anteriores">—</span>
          ) : (
            <span className={clsx("font-pixel", attr.trendPct >= 0 ? "text-rpg-green" : "text-rpg-red")} title="XP dos últimos 30 dias vs. 30 dias anteriores">
              {attr.trendPct >= 0 ? "↑" : "↓"} {attr.trendPct >= 0 ? "+" : ""}{attr.trendPct}%
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
