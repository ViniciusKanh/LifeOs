import clsx from "clsx";
import { BookOpen, Cpu, Heart, Leaf, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import type { IntelligenceOverview } from "@/services/intelligenceService";
import { CORE_ART, num } from "@/utils/intelligenceDisplay";

const AREA_UI: Record<string, { icon: LucideIcon; tone: RpgTone }> = {
  metas: { icon: Trophy, tone: "gold" },
  habitos: { icon: Leaf, tone: "green" },
  saude: { icon: Heart, tone: "pink" },
  educacao: { icon: BookOpen, tone: "blue" },
  foco: { icon: Target, tone: "red" },
  energia: { icon: Zap, tone: "cyan" },
};
const LEFT = ["metas", "foco", "energia"];
const RIGHT = ["habitos", "saude", "educacao"];

function AreaNode({ area, side }: { area: IntelligenceOverview["core"]["areas"][number] | { key: string; label: string; days: number; active: boolean }; side: "left" | "right" }) {
  const ui = AREA_UI[area.key];
  const Icon = ui.icon;
  return (
    <li className={clsx("flex flex-col items-center gap-1 text-center sm:gap-2", side === "left" ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row sm:text-left")} title={`${area.days} dia(s) com registro nos últimos 90`}>
      <span
        className={clsx("inline-flex w-9 h-9 shrink-0 items-center justify-center border-2 bg-rpg-bg", area.active ? clsx("border-current", RPG_TONE_TEXT[ui.tone]) : "border-rpg-border text-rpg-muted/60")}
        style={{ borderRadius: 3 }}
        aria-hidden
      >
        <Icon size={18} />
      </span>
      <span className={clsx("text-xs sm:text-sm", area.active ? "text-rpg-text" : "text-rpg-muted")}>
        {area.label}
        <span className="sr-only">{area.active ? " — conectada" : " — sem dados suficientes"}</span>
      </span>
    </li>
  );
}

/**
 * Núcleo: as 6 áreas acendem quando têm dados (14+ dias nos últimos 90).
 * O nível da forja vem do XP somado dos artefatos — nada estimado.
 */
export function IntelligenceCorePanel({ core, hasGrimoire }: { core: IntelligenceOverview["core"]; hasGrimoire: boolean }) {
  const reduce = useReducedMotion();
  const areas = hasGrimoire ? core.areas : Object.keys(AREA_UI).map((key) => ({ key, label: { metas: "Metas", habitos: "Hábitos", saude: "Saúde", educacao: "Educação", foco: "Foco", energia: "Energia" }[key]!, days: 0, active: false }));
  const by = (k: string) => areas.find((a) => a.key === k)!;
  const span = core.nextLevelXp - core.levelStartXp;
  return (
    <RPGPanel title="Núcleo de Inteligência" icon={<Cpu size={15} />} variant="gold" className="h-full">
      <div className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,150px)_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <ul className="space-y-3 sm:space-y-4 justify-self-end">{LEFT.map((k) => <AreaNode key={k} area={by(k)} side="left" />)}</ul>
          <div className="relative w-full aspect-[140/156]" aria-hidden>
            <img src={CORE_ART} alt="" className={clsx("pixelated w-full h-full object-contain", !reduce && "motion-safe:animate-[pulse_4s_ease-in-out_infinite]")} style={{ maskImage: "radial-gradient(circle, #000 55%, transparent 72%)", WebkitMaskImage: "radial-gradient(circle, #000 55%, transparent 72%)" }} />
          </div>
          <ul className="space-y-3 sm:space-y-4 justify-self-start">{RIGHT.map((k) => <AreaNode key={k} area={by(k)} side="right" />)}</ul>
        </div>
        <p className="text-sm text-rpg-text/85 text-center">
          O núcleo aprende com sua rotina e alimenta os artefatos de previsão.
          <span className="block mt-1 text-xs text-rpg-muted">
            {hasGrimoire ? `${areas.filter((a) => a.active).length} de ${areas.length} áreas conectadas.` : "Abra o Grimório e atualize para acender as áreas."}
          </span>
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm text-rpg-text">
          Nível da forja <strong className="font-rpg text-lg text-rpg-gold-light">{core.level}</strong>
        </span>
        <RPGProgressBar className="flex-1 min-w-[160px]" tone="purple" label="XP da forja" value={core.totalXp - core.levelStartXp} max={span} showLabel={false} />
        <span className="font-pixel text-xs text-rpg-text tabular-nums">
          {num(core.totalXp)} / {num(core.nextLevelXp)} XP
        </span>
      </div>
    </RPGPanel>
  );
}
