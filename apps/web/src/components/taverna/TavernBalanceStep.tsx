import { BedDouble, CheckSquare, Coins, Crown, Droplets, Dumbbell, Repeat, Sparkles, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { RPGBadge, RPGPanel, RPGStatCard } from "@/components/rpg";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import type { TavernBalance } from "@/services/tavernService";
import { fmtMinutes, fmtNum, vsAverage } from "./tavernFormat";

/** Passo 1 — Balanço do dia: só dado real do dia local, comparado com a média dos 7 dias anteriores. */
export function TavernBalanceStep({ balance }: { balance: TavernBalance }) {
  const b = balance;
  const sleepText = b.sleep?.durationMinutes ? fmtMinutes(b.sleep.durationMinutes) : b.sleep?.quality ? `qualidade ${b.sleep.quality}/5` : "—";
  const nothing = b.xp.today === 0 && b.missions.count === 0 && b.habits.done === 0 && b.water.todayMl === 0 && b.exercise.todayMinutes === 0 && !b.sleep;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-rpg-muted">
        <ProvenanceBadge kind="dado" />
        <span>Registros de hoje. Comparação: média diária dos 7 dias anteriores.</span>
      </div>

      {nothing && (
        <p className="rpg-panel p-4 text-sm text-rpg-muted">
          Nenhum registro hoje ainda. Conclua uma tarefa, marque um hábito ou registre água em{" "}
          <Link to="/saude" className="text-rpg-gold-light underline underline-offset-2">Saúde</Link> — o balanço aparece aqui.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
        <RPGStatCard icon={<Sparkles size={16} />} tone="purple" label="XP ganho" value={fmtNum(b.xp.today)} caption={vsAverage(b.xp.today, b.xp.avg7)} />
        <RPGStatCard icon={<Coins size={16} />} tone="gold" label="Moedas" value={fmtNum(b.coins.today)} caption={vsAverage(b.coins.today, b.coins.avg7)} />
        <RPGStatCard icon={<CheckSquare size={16} />} tone="blue" label="Missões" value={fmtNum(b.missions.count)} caption={vsAverage(b.missions.count, b.missions.avg7)} />
        <RPGStatCard
          icon={<Repeat size={16} />}
          tone="green"
          label="Hábitos"
          value={b.habits.total ? `${b.habits.done}/${b.habits.total}` : fmtNum(b.habits.done)}
          pct={b.habits.total ? Math.round((b.habits.done / b.habits.total) * 100) : undefined}
          caption={vsAverage(b.habits.done, b.habits.avg7)}
        />
        <RPGStatCard icon={<Droplets size={16} />} tone="cyan" label="Água" value={b.water.todayMl ? `${fmtNum(b.water.todayMl)} ml` : "—"} caption={vsAverage(b.water.todayMl, b.water.avg7, " ml")} />
        <RPGStatCard
          icon={<Dumbbell size={16} />}
          tone="orange"
          label="Treino"
          value={b.exercise.todayMinutes ? fmtMinutes(b.exercise.todayMinutes) : "—"}
          caption={b.exercise.sessions ? `${b.exercise.sessions} ${b.exercise.sessions === 1 ? "sessão" : "sessões"} · ${vsAverage(b.exercise.todayMinutes, b.exercise.avg7, " min")}` : vsAverage(b.exercise.todayMinutes, b.exercise.avg7, " min")}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <RPGPanel title="Missões concluídas hoje" icon={<CheckSquare size={15} />} className="lg:col-span-2">
          {b.mainMission && (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Crown size={14} className="text-rpg-gold" aria-hidden />
              <span className="text-rpg-muted">Missão principal de hoje:</span>
              <span className="font-semibold text-rpg-text">{b.mainMission.title}</span>
              <RPGBadge tone={b.mainMission.done ? "green" : "orange"}>{b.mainMission.done ? "Cumprida" : "Em aberto"}</RPGBadge>
            </p>
          )}
          {b.missions.items.length ? (
            <ul className="divide-y divide-rpg-border/60">
              {b.missions.items.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                  <CheckSquare size={14} className="shrink-0 text-rpg-green" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-rpg-text" title={m.title}>{m.title}</span>
                  <RPGBadge tone={m.priority === "Alta" ? "red" : m.priority === "Média" ? "gold" : "green"}>{m.priority}</RPGBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-rpg-muted">Nenhuma missão concluída hoje.</p>
          )}
        </RPGPanel>

        <div className="grid gap-3">
          <RPGPanel title="Hábitos cumpridos" icon={<Repeat size={15} />}>
            {b.habits.items.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {b.habits.items.map((h) => (
                  <li key={h.id} className="border border-rpg-green/50 bg-rpg-green/10 px-2 py-1 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
                    {h.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-rpg-muted">{b.habits.total ? "Nenhum hábito cumprido hoje." : "Você ainda não tem hábitos ativos."}</p>
            )}
          </RPGPanel>
          <RPGPanel title="Descanso e conquistas" icon={<Trophy size={15} />}>
            <p className="flex items-center gap-2 text-sm">
              <BedDouble size={14} className="shrink-0 text-rpg-blue" aria-hidden />
              <span className="text-rpg-muted">Sono da última noite:</span>
              <span className="text-rpg-text">{sleepText}</span>
            </p>
            {b.achievements.length ? (
              <ul className="mt-2 space-y-1">
                {b.achievements.map((a) => (
                  <li key={`${a.custom ? "c" : "a"}-${a.id}`} className="flex items-center gap-2 text-sm text-rpg-gold-light">
                    <Trophy size={14} className="shrink-0" aria-hidden /> <span className="truncate">{a.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-rpg-muted">Nenhuma conquista destravada hoje.</p>
            )}
          </RPGPanel>
        </div>
      </div>
    </div>
  );
}
