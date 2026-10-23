import clsx from "clsx";
import { CloudFog } from "lucide-react";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { WorldRegion } from "@/services/worldmapService";
import { REGION_UI, trendInfo } from "./regionUi";

/**
 * Território do mapa: botão com nome, ícone, nível, barra de XP e tendência.
 * `compact` é a versão sobreposta ao mapa (desktop); sem ela vira o cartão
 * da lista (tablet/celular). Região sem dados aparece "em névoa".
 */
export function RegionCard({ region, onOpen, compact = false, className }: { region: WorldRegion; onOpen: () => void; compact?: boolean; className?: string }) {
  const ui = REGION_UI[region.key];
  const Icon = ui.icon;
  const trend = trendInfo(region);
  const span = region.nextLevelXp - region.levelStartXp;
  const into = region.xp - region.levelStartXp;
  const aria = region.fogged
    ? `${region.name}: região em névoa. Abrir para ver como desbloquear.`
    : `${region.name}: nível ${region.level}, ${region.xp} XP. ${trend.aria}. Abrir detalhes.`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={aria}
      className={clsx(
        "group w-full text-left border-2 bg-rpg-panel/95 shadow-rpg outline-none",
        "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-rpg-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-rpg-bg",
        region.fogged ? "border-rpg-border/70 border-dashed hover:border-rpg-muted" : "border-rpg-gold/60 hover:border-rpg-gold-light hover:bg-rpg-panel-light",
        compact ? "p-2.5" : "p-3",
        className,
      )}
      style={{ borderRadius: 4 }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={clsx(
            "inline-flex shrink-0 items-center justify-center border-2 bg-rpg-bg",
            compact ? "w-9 h-9" : "w-11 h-11",
            region.fogged ? "border-rpg-border text-rpg-muted" : clsx("border-rpg-gold/70", RPG_TONE_TEXT[ui.tone]),
          )}
          style={{ borderRadius: 3 }}
          aria-hidden
        >
          {region.fogged ? <CloudFog size={compact ? 18 : 20} /> : <Icon size={compact ? 18 : 20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("font-rpg font-bold leading-tight line-clamp-2", compact ? "text-sm" : "text-base", region.fogged ? "text-rpg-muted" : "text-rpg-gold-light")}>
            {region.name}
          </p>
          {region.fogged ? (
            <p className="font-pixel text-[11px] uppercase tracking-wide text-rpg-muted">Em névoa</p>
          ) : (
            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="font-pixel text-[11px] text-rpg-text/90 tabular-nums whitespace-nowrap">
                Nv. {region.level} · {region.xp} XP
              </p>
              <RPGBadge tone={trend.tone} className="shrink-0">
                {trend.text}
              </RPGBadge>
            </div>
          )}
        </div>
      </div>
      {region.fogged ? (
        <p className={clsx("mt-2 text-rpg-muted", compact ? "text-[11px] line-clamp-2" : "text-xs")}>{region.unlockHint}</p>
      ) : (
        <>
          <RPGProgressBar className="mt-2" tone={ui.tone} label={`Rumo ao nível ${region.level + 1}`} value={into} max={span} valueLabel={`${into}/${span}`} showLabel={!compact} />
          {!compact && region.activity && (
            <p className="mt-1.5 text-[11px] text-rpg-muted">
              Atividade real: {region.activity.activeDays30} de {region.activity.windowDays} dias com registro
            </p>
          )}
        </>
      )}
    </button>
  );
}
