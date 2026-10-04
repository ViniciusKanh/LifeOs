import { Crown, Gem, Info, Lock, Star, Target, Trophy } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import type { RareGoal } from "@/services/gamificationService";
import { TreasureSidePanel } from "./TreasureSidePanel";

const KIND = {
  level: { icon: Crown, tone: "gold" as const },
  xp: { icon: Star, tone: "purple" as const },
  achievement: { icon: Trophy, tone: "orange" as const },
  campaign: { icon: Target, tone: "cyan" as const },
};

/** Metas para itens raros: requisitos reais das recompensas bloqueadas e próximos marcos de gemas. */
export function RareRewardGoals({ goals, loading }: { goals: RareGoal[]; loading: boolean }) {
  return (
    <TreasureSidePanel
      id="metas-raras"
      title="Metas para itens raros"
      icon={<Gem size={16} />}
      actions={
        <span className="text-rpg-muted" title="Gemas vêm de marcos especiais (nível, campanha concluída, conquista ouro/platina). Recompensas com requisito liberam ao cumprir a meta.">
          <Info size={14} aria-label="Como funcionam as metas raras" />
        </span>
      }
    >
      {loading && <div className="h-24 rpg-bar animate-pulse" />}
      {!loading && goals.length === 0 && <p className="text-sm text-rpg-muted py-2">Sem metas no momento. Crie recompensas com requisito de nível para vê-las aqui.</p>}
      <ul className="space-y-2">
        {goals.map((g) => {
          const K = KIND[g.kind];
          const isGem = g.unlocks.includes("gema");
          return (
            <li key={g.id} className="flex items-center gap-2.5 border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
              <span className="w-9 h-9 shrink-0 flex items-center justify-center border-2 border-rpg-border bg-rpg-bg text-rpg-gold" style={{ borderRadius: 3 }} aria-hidden>
                <K.icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-rpg-text truncate">{g.title}</p>
                <RPGProgressBar className="mt-1" value={g.current} max={g.target} tone={K.tone} label="Progresso" valueLabel={`${g.current.toLocaleString("pt-BR")} / ${g.target.toLocaleString("pt-BR")}`} />
                <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rpg-muted">
                  {isGem ? <Gem size={10} aria-hidden /> : <Lock size={10} aria-hidden />} Libera: {g.unlocks}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </TreasureSidePanel>
  );
}
