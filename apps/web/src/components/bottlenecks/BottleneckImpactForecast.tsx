import { BookOpen, HeartPulse, TrendingUp, Trophy, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGPanel } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import type { BottleneckDetail, ImpactItem } from "@/services/bottlenecksService";

const UI: Record<ImpactItem["key"], { icon: LucideIcon; tone: RpgTone; sign: "+" | "−" }> = {
  campaigns: { icon: TrendingUp, tone: "green", sign: "+" },
  load: { icon: Zap, tone: "purple", sign: "−" },
  deadlines: { icon: HeartPulse, tone: "red", sign: "−" },
  missions: { icon: Trophy, tone: "gold", sign: "+" },
  projects: { icon: BookOpen, tone: "blue", sign: "+" },
};

const fmt = (i: ImpactItem) => {
  if (i.value === null) return "—";
  const sign = i.value === 0 ? "" : UI[i.key].sign;
  return `${sign}${i.value}${i.unit === "pp" ? " pp" : i.unit === "%" ? "%" : ""}`;
};

/** Simulação somente leitura: "se este item fosse concluído agora". Sempre rotulada como projeção. */
export function BottleneckImpactForecast({ impact }: { impact: BottleneckDetail["impact"] }) {
  return (
    <RPGPanel
      title="Impacto ao resolver este gargalo"
      icon={<TrendingUp size={15} className="text-rpg-green" />}
      variant="gold"
      actions={<RPGBadge tone="muted">Projeção</RPGBadge>}
    >
      <ul className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {impact.items.map((i) => {
          const ui = UI[i.key];
          return (
            <li key={i.key} className="flex items-center gap-2.5 border border-rpg-border/70 bg-rpg-bg-2/60 px-2.5 py-2 min-w-0" style={{ borderRadius: 3 }} title={i.note}>
              <ui.icon size={26} className={clsx("shrink-0", RPG_TONE_TEXT[ui.tone])} aria-hidden />
              <span className="min-w-0">
                <span className={clsx("block font-rpg text-lg font-bold leading-none tabular-nums", i.value === null ? "text-rpg-muted" : RPG_TONE_TEXT[ui.tone])}>{fmt(i)}</span>
                <span className="block text-[11px] text-rpg-text/90 leading-tight mt-0.5">{i.label}</span>
                <span className="block text-[10px] text-rpg-muted truncate">{i.note}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-rpg-muted">
        {impact.targetTitle && <>Simulando a conclusão de “{impact.targetTitle}”. </>}
        {impact.basis} Nada é alterado nos seus dados.
      </p>
    </RPGPanel>
  );
}
