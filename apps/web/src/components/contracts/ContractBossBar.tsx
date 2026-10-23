import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Skull, Swords } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RPGBadge } from "@/components/rpg";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import type { Difficulty } from "@/types";
import { playSfx } from "@/utils/sfx";
import { spawnBurst } from "@/utils/xpBurst";

const FOE: Record<Difficulty, string> = { facil: "Lacaio", medio: "Guardião", dificil: "Chefe", epico: "Chefe épico" };

/**
 * O contrato como batalha: a vida do "chefe" é o número de obrigações
 * abertas (dado real). Cada tarefa concluída causa 1 de dano — com tremida,
 * "-1 HP" flutuante e som opcional. Zerou: chefe derrotado.
 */
export function ContractBossBar({ title, difficulty, total, done }: { title: string; difficulty: Difficulty; total: number; done: number }) {
  const { prefs } = useRpgPreferences();
  const reduce = useReducedMotion() || prefs.animations !== "full";
  const silent = prefs.animations === "off";
  const barRef = useRef<HTMLDivElement>(null);
  const prevDone = useRef(done);
  const [hit, setHit] = useState(0);
  const hp = Math.max(0, total - done);
  const defeated = total > 0 && hp === 0;

  useEffect(() => {
    const dealt = done - prevDone.current;
    prevDone.current = done;
    if (dealt <= 0) return;
    setHit((h) => h + 1);
    playSfx("hit", prefs.sound);
    if (silent || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const pctLeft = total > 0 ? (hp / total) * r.width : r.width / 2;
    spawnBurst(`-${dealt} HP`, { x: r.left + Math.max(24, pctLeft), y: r.top }, { tone: "damage", reduced: reduce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (total === 0) {
    return <p className="text-xs text-rpg-muted">Sem obrigações ainda — adicione tarefas para o {FOE[difficulty].toLowerCase()} ganhar vida.</p>;
  }

  return (
    <section aria-label={`${FOE[difficulty]}: ${hp} de ${total} pontos de vida`} className="rpg-panel rpg-panel-danger p-3">
      <div className="flex items-center gap-2">
        <span className={clsx("inline-flex h-8 w-8 shrink-0 items-center justify-center border-2", defeated ? "border-rpg-green text-rpg-green" : "border-rpg-red/80 text-rpg-red")} style={{ borderRadius: 3 }} aria-hidden>
          {defeated ? <Swords size={16} /> : <Skull size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-muted">{FOE[difficulty]}</p>
          <p className="truncate text-sm font-semibold text-rpg-text">{title}</p>
        </div>
        {defeated ? (
          <RPGBadge tone="green">Derrotado!</RPGBadge>
        ) : (
          <span className="font-pixel text-sm tabular-nums text-rpg-red">
            {hp}/{total} HP
          </span>
        )}
      </div>
      <div
        key={hit}
        ref={barRef}
        className={clsx("rpg-bar mt-2 h-3", hit > 0 && !reduce && "boss-hit")}
        role="progressbar"
        aria-label="Vida do chefe"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={hp}
      >
        <span className={defeated ? "bg-rpg-green" : "bg-rpg-red"} style={{ width: `${(hp / total) * 100}%`, transition: reduce ? undefined : "width 0.5s ease-out" }} />
      </div>
      <p className="mt-1 text-[11px] text-rpg-muted">
        {defeated ? "Todas as obrigações cumpridas — o bônus do contrato foi liberado." : `Cada obrigação concluída causa 1 de dano. Faltam ${hp}.`}
      </p>
    </section>
  );
}
