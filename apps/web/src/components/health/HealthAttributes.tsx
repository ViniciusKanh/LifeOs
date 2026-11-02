import { AlertTriangle, CalendarRange, HeartPulse, Medal, Sparkles } from "lucide-react";
import type { HealthHub } from "@/services/moduleHubService";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { AdvisorPanel, KitSection, MedalStrip, MissionList, MODULE_ART, RankPanel } from "@/components/rpg-modules/ModuleKit";
import { formatHM } from "@/components/health/healthUtils";

/**
 * Atributos do Personagem — peças RPG da Saúde (lê /api/hub/health).
 * Gamificação de consistência de autocuidado, não avaliação médica.
 */

const ART = `${MODULE_ART}/health`;
const R = { borderRadius: 4 } as const;

export function HealthRankPanel({ hub }: { hub: HealthHub }) {
  const b = hub.rankBreakdown;
  return (
    <RankPanel
      title="Rank de Saúde"
      subtitle="Consistência dos últimos 28 dias"
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="pts"
      icon={<HeartPulse size={26} />}
      rules={
        <>
          Pontos nos últimos 28 dias: 10 por dia com água ≥ 50% da meta ({b.waterDays}), 10 por noite entre 6h e 10h ({b.balancedNights}), 15 por dia com treino — até 6 por semana, o
          descanso também conta ({b.workoutDays}) — e 5 por check-in de humor ({b.moodDays}). Passar da meta não dá pontos extras. Não é diagnóstico nem avaliação médica.
        </>
      }
    />
  );
}

export function HealthMissions({ hub }: { hub: HealthHub }) {
  return (
    <KitSection title="Mini-missões de saúde" icon={<Sparkles size={16} />}>
      <MissionList missions={hub.missions} format={(m) => (m.key === "water" ? `${m.current}/${m.target} ml` : m.key === "move" ? `${m.current}/${m.target} min` : `${m.current}/${m.target}`)} />
      <p className="mt-2 text-[10.5px] text-rpg-muted">Missões de hoje, calculadas dos seus registros. Nenhuma premia excesso.</p>
    </KitSection>
  );
}

export function SleepIntegrity({ hub }: { hub: HealthHub }) {
  const s = hub.sleep;
  return (
    <KitSection title="Sono — noite, semana e média" icon={<CalendarRange size={16} />}>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
          <dt className="font-pixel text-[9px] uppercase text-rpg-muted">Última noite</dt>
          <dd className="font-rpg text-lg font-bold text-rpg-text">{s.lastNight ? formatHM(s.lastNight.minutes) : "--"}</dd>
        </div>
        <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
          <dt className="font-pixel text-[9px] uppercase text-rpg-muted">Soma 7 dias</dt>
          <dd className="font-rpg text-lg font-bold text-rpg-text">{formatHM(s.weekTotalMinutes)}</dd>
          <dd className="text-[10px] text-rpg-muted">{s.weekNights} noite(s)</dd>
        </div>
        <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
          <dt className="font-pixel text-[9px] uppercase text-rpg-muted">Média/noite</dt>
          <dd className="font-rpg text-lg font-bold text-rpg-text">{s.weekAvgMinutes != null ? formatHM(s.weekAvgMinutes) : "--"}</dd>
        </div>
      </dl>
      {s.inconsistent.length > 0 && (
        <p className="mt-2 flex gap-1.5 border border-rpg-orange/60 bg-rpg-orange/10 p-2 text-[11.5px] text-rpg-orange" style={R} role="status">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {s.inconsistent.length} registro(s) de sono parecem inconsistentes (
            {s.inconsistent
              .slice(0, 2)
              .map((i) => `${formatHM(Math.max(0, i.minutes))} — ${i.reason}`)
              .join("; ")}
            ). Eles ficam fora das médias; revise no histórico de Sono. Nada foi apagado.
          </span>
        </p>
      )}
      <p className="mt-2 text-[10.5px] text-rpg-muted">A noite conta no dia em que você acordou (no seu fuso). Registros sobrepostos no mesmo dia contam uma vez só.</p>
    </KitSection>
  );
}

export function ConsistencyHistory({ hub }: { hub: HealthHub }) {
  const h = hub.consistencyHistory;
  return (
    <KitSection title="Histórico de consistência" icon={<CalendarRange size={16} />}>
      {h.length === 0 ? (
        <p className="text-sm text-rpg-muted">O histórico semanal aparece após a primeira segunda-feira com a automação F ligada (ou use “Executar agora” em Automações).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-xs">
            <thead>
              <tr className="text-left font-pixel text-[9px] uppercase text-rpg-muted">
                <th className="py-1">Semana</th>
                <th>Água</th>
                <th>Sono</th>
                <th>Movimento</th>
                <th>Humor</th>
              </tr>
            </thead>
            <tbody>
              {h.slice(0, 8).map((w) => (
                <tr key={w.week} className="border-t border-rpg-border/50 text-rpg-text tabular-nums">
                  <td className="py-1">
                    {w.week.slice(8, 10)}/{w.week.slice(5, 7)}
                  </td>
                  <td>{w.water}/7</td>
                  <td>{w.sleep}/7</td>
                  <td>{w.move}/7</td>
                  <td>{w.mood}/7</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KitSection>
  );
}

const HEALTH_MEDALS = [
  { code: "health_water_30", img: `${ART}/medal-1.webp`, fallbackTitle: "Fonte Constante" },
  { code: "health_sleep_14", img: `${ART}/medal-2.webp`, fallbackTitle: "Guardião do Descanso" },
  { code: "health_mood_30", img: `${ART}/medal-3.webp`, fallbackTitle: "Mente Atenta" },
];

/** Bloco RPG da Saúde: missões, sono, conselheiro, automações, histórico e medalhas. */
export function HealthAttributesHub({ hub }: { hub: HealthHub }) {
  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <HealthMissions hub={hub} />
        <SleepIntegrity hub={hub} />
        <AdvisorPanel module="health" title="Recomendações de bem-estar" avatar={`${ART}/banner-mage.webp`} />
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <AutomationsPanel
          module="health"
          title="Automações de saúde"
          intro="Lembretes e resumos usam só o que você registrou. As metas (E) têm limites prudentes e alimentam a Vitalidade e as missões."
        />
        <div className="space-y-3">
          <ConsistencyHistory hub={hub} />
          <KitSection title="Conquistas em saúde" icon={<Medal size={16} />} tone="gold">
            <MedalStrip medals={HEALTH_MEDALS} />
          </KitSection>
        </div>
      </div>
    </div>
  );
}
