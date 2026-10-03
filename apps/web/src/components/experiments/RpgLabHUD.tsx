import { useMemo } from "react";
import { FlaskConical, Moon, Skull, Sparkles, Zap } from "lucide-react";
import { RPGPanel, RPGStatCard } from "@/components/rpg";
import { useGamificationRules, useXpHistory } from "@/hooks/useGamification";
import type { Experiment, ExperimentStatus } from "@/types";
import { LAB_STAGE } from "./experimentDisplay";


/**
 * Bancada do laboratório: contagens reais por estágio, XP real do ledger
 * vindo de experimentos e a tabela de recompensas do motor (servidor).
 */
export function RpgLabHUD({ experiments }: { experiments: Experiment[] }) {
  const { data: rules } = useGamificationRules();
  const { data: xp } = useXpHistory(180);
  const by = useMemo(() => {
    const c: Record<ExperimentStatus, number> = { draft: 0, active: 0, paused: 0, completed: 0, cancelled: 0 };
    for (const e of experiments) c[e.status]++;
    return c;
  }, [experiments]);
  const labXp = (xp?.days ?? []).reduce((s, d) => s + (d.bySource.experiment ?? 0), 0);
  const E = rules?.experiment;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <RPGStatCard icon={<FlaskConical size={18} />} label={LAB_STAGE.draft} value={String(by.draft)} tone="muted" caption="hipóteses à espera" />
        <RPGStatCard icon={<Zap size={18} />} label="Criaturas vivas" value={String(by.active)} tone="green" caption="experimentos ativos" />
        <RPGStatCard icon={<Moon size={18} />} label={LAB_STAGE.paused} value={String(by.paused)} tone="blue" caption="pausados" />
        <RPGStatCard icon={<Sparkles size={18} />} label="Despertas" value={String(by.completed)} tone="gold" caption="concluídos" />
        <RPGStatCard icon={<Skull size={18} />} label="XP do laboratório" value={`${labXp} XP`} tone="purple" caption="últimos 180 dias" />
      </div>
      {E && (
        <RPGPanel title="Grimório do laboratório" icon={<Zap size={16} />}>
          <ul className="grid gap-2 sm:grid-cols-3 text-sm">
            <li className="border border-rpg-border/60 bg-rpg-bg-2/60 p-2.5" style={{ borderRadius: 3 }}>
              <p className="font-semibold text-rpg-text">⚡ Dar vida</p>
              <p className="text-xs text-rpg-muted">Iniciar um experimento</p>
              <p className="mt-1 font-pixel text-xs text-rpg-gold-light">+{E.started.xp} XP · +{E.started.coins} 🪙</p>
            </li>
            <li className="border border-rpg-border/60 bg-rpg-bg-2/60 p-2.5" style={{ borderRadius: 3 }}>
              <p className="font-semibold text-rpg-text">🧪 Alimentar a criatura</p>
              <p className="text-xs text-rpg-muted">Check-in feito hoje ou ontem (1 por dia)</p>
              <p className="mt-1 font-pixel text-xs text-rpg-gold-light">+{E.checkin.xp} XP · +{E.checkin.coins} 🪙</p>
            </li>
            <li className="border border-rpg-border/60 bg-rpg-bg-2/60 p-2.5" style={{ borderRadius: 3 }}>
              <p className="font-semibold text-rpg-text">🌩️ Despertar</p>
              <p className="text-xs text-rpg-muted">
                Concluir após {E.concludeMinDays} dias, com {E.concludeMinLogs}+ registros e conclusão escrita
              </p>
              <p className="mt-1 font-pixel text-xs text-rpg-gold-light">+{E.concluded.xp} XP · +{E.concluded.coins} 🪙</p>
            </li>
          </ul>
        </RPGPanel>
      )}
    </div>
  );
}
