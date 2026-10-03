import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckSquare, Coins, Crown, Flame, Gift, Map as MapIcon, PieChart as PieIcon, Square, Swords, TrendingUp } from "lucide-react";
import { RPGAvatar, RPGBadge, RPGPanel, RPGProgressBar, RPGWallet, rpgAvatar } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { useGamificationProfile, useGamificationRules, useLevelHistory, useRewards, useXpHistory } from "@/hooks/useGamification";
import { useTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useGoalForecast } from "@/hooks/useGoalForecast";
import { XP_SOURCES, localToday, previewTaskReward } from "@/utils/gamification";

const tok = (name: string) => `rgb(var(--rpg-${name}))`;

/** HUD lateral do Analytics RPG: nível, loja (moedas) e missões diárias — tudo real. */
export function RpgAnalyticsSidebar() {
  const { user } = useAuth();
  const { avatarId } = useRpgAvatar();
  const { data: p, isLoading } = useGamificationProfile();
  const { rewards } = useRewards();
  const { data: rules } = useGamificationRules();
  const { tasks } = useTasks();
  const { habits, summaryByHabitId } = useHabits();
  const today = localToday();

  // Até 3 recompensas ativas, priorizando as que cabem no saldo.
  const shop = useMemo(
    () => [...rewards].sort((a, b) => Number(b.cost <= (p?.coins ?? 0)) - Number(a.cost <= (p?.coins ?? 0)) || a.cost - b.cost).slice(0, 3),
    [rewards, p?.coins],
  );

  // Missões diárias reais: tarefas com prazo hoje + hábitos diários.
  const daily = useMemo(() => {
    const t = tasks
      .filter((x) => x.due_date?.slice(0, 10) === today)
      .map((x) => ({ id: `t-${x.id}`, title: x.title, done: x.status === "Concluído", xp: previewTaskReward(rules, { priority: x.priority, dueDate: x.due_date }, today)?.xp ?? null }));
    const h = habits
      .filter((x) => x.frequency === "daily")
      .map((x) => ({ id: `h-${x.id}`, title: x.name, done: !!summaryByHabitId.get(x.id)?.checkedInToday, xp: rules?.habit.xp ?? null }));
    return [...t, ...h];
  }, [tasks, habits, summaryByHabitId, rules, today]);
  const doneCount = daily.filter((d) => d.done).length;

  return (
    <aside className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 content-start min-w-0">
      <RPGPanel variant="legendary" className="md:col-span-2 xl:col-span-1">
        {isLoading || !p ? (
          <div className="h-28 rpg-bar animate-pulse" aria-label="Carregando nível" />
        ) : (
          <div className="flex items-center gap-4">
            <RPGAvatar size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-pixel text-[11px] uppercase tracking-wider text-rpg-gold">Nível atual</p>
              <p className="rpg-title text-3xl font-bold leading-none">Nv. {p.level}</p>
              <p className="text-sm text-rpg-text mt-1 truncate">
                {user?.name?.split(" ")[0]} · {rpgAvatar(avatarId).label}
              </p>
            </div>
          </div>
        )}
        {p && (
          <div className="mt-3 space-y-2">
            <RPGProgressBar tone="purple" label="Experiência" value={p.xpIntoLevel} max={p.xpForNextLevel} valueLabel={`${p.xpIntoLevel.toLocaleString("pt-BR")} / ${p.xpForNextLevel.toLocaleString("pt-BR")} XP`} />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-rpg-muted">{(p.xpForNextLevel - p.xpIntoLevel).toLocaleString("pt-BR")} XP para o próximo nível</span>
              <RPGWallet coins={p.coins} size="sm" />
            </div>
          </div>
        )}
      </RPGPanel>

      <RPGPanel title="Loja de recompensas" icon={<Gift size={16} />} actions={<Link to="/loja" className="text-xs text-rpg-gold-light hover:underline">Ver loja →</Link>}>
        <p className="-mt-1 mb-3 text-xs text-rpg-muted">Troque moedas por recompensas. XP nunca é gasto.</p>
        {shop.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhuma recompensa criada. <Link to="/loja" className="text-rpg-gold-light hover:underline">Criar na loja →</Link></p>
        ) : (
          <ul className="space-y-2">
            {shop.map((r) => {
              const affordable = (p?.coins ?? 0) >= r.cost;
              return (
                <li key={r.id} className="flex items-center gap-3 border border-rpg-border/70 bg-rpg-bg/40 px-2.5 py-2" style={{ borderRadius: 3 }}>
                  <span className="text-xl" aria-hidden>{r.icon || "🎁"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rpg-text truncate">{r.name}</p>
                    {r.description && <p className="text-[11px] text-rpg-muted truncate">{r.description}</p>}
                  </div>
                  <RPGBadge tone={affordable ? "gold" : "muted"} icon={<Coins size={10} aria-hidden />}>{r.cost}</RPGBadge>
                </li>
              );
            })}
          </ul>
        )}
      </RPGPanel>

      <RPGPanel title="Missões diárias" icon={<Swords size={16} />} actions={daily.length > 0 ? <span className="text-xs text-rpg-muted">{doneCount} de {daily.length}</span> : undefined}>
        {daily.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhuma tarefa com prazo hoje nem hábito diário.</p>
        ) : (
          <>
            <RPGProgressBar tone="green" label="Missões diárias concluídas" value={doneCount} max={daily.length} showLabel={false} className="mb-3" />
            <ul className="space-y-1.5">
              {daily.slice(0, 7).map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  {d.done ? <CheckSquare size={16} className="text-rpg-green shrink-0" aria-label="Concluída" /> : <Square size={16} className="text-rpg-muted shrink-0" aria-label="Pendente" />}
                  <span className={`flex-1 min-w-0 truncate ${d.done ? "text-rpg-muted line-through" : "text-rpg-text"}`}>{d.title}</span>
                  {d.xp != null && <span className="font-pixel text-xs text-rpg-purple">+{d.xp} XP</span>}
                </li>
              ))}
            </ul>
            <Link to="/hoje" className="mt-3 inline-block text-xs text-rpg-gold-light hover:underline">Ir para Hoje →</Link>
          </>
        )}
      </RPGPanel>
    </aside>
  );
}

/** Painéis de progressão: origem do XP, evolução de nível, consistência e previsão de metas. */
export function RpgProgressionPanels({ days }: { days: number }) {
  const { data: history } = useXpHistory(days);
  const { data: levels } = useLevelHistory();
  const { data: p } = useGamificationProfile();
  const { data: forecast } = useGoalForecast("all");

  const bySource = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of history?.days ?? []) for (const [k, v] of Object.entries(d.bySource)) totals[k] = (totals[k] ?? 0) + v;
    return XP_SOURCES.map((s) => ({ ...s, xp: totals[s.id] ?? 0 })).filter((s) => s.xp > 0);
  }, [history]);
  const totalXp = bySource.reduce((a, s) => a + s.xp, 0);
  const activeDays = (history?.days ?? []).filter((d) => d.total > 0).length;
  const forecastGoals = (forecast?.goals ?? []).filter((g) => g.status !== "completed").slice(0, 4);
  const STATUS_TONE: Record<string, "green" | "orange" | "red" | "muted" | "blue"> = { ahead: "green", on_track: "green", attention: "orange", at_risk: "red", overdue: "red", insufficient_data: "muted" };

  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <RPGPanel title="Origem do XP" icon={<PieIcon size={16} />}>
        {totalXp === 0 ? (
          <p className="text-sm text-rpg-muted py-6">Nenhum XP nos últimos {days} dias.</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-28 h-28 shrink-0 relative" role="img" aria-label={`${totalXp} XP por origem`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bySource} dataKey="xp" nameKey="label" innerRadius={32} outerRadius={52} paddingAngle={2} stroke="none">
                    {bySource.map((s) => <Cell key={s.id} fill={tok(s.tone)} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="font-pixel text-sm text-rpg-text leading-none">{totalXp}</p>
                <p className="text-[9px] text-rpg-muted">XP</p>
              </div>
            </div>
            <ul className="flex-1 min-w-0 space-y-1 text-xs">
              {bySource.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 shrink-0" style={{ background: tok(s.tone), borderRadius: 999 }} aria-hidden />
                  <span className="truncate text-rpg-text">{s.label}</span>
                  <span className="ml-auto tabular-nums text-rpg-muted">{Math.round((s.xp / totalXp) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </RPGPanel>

      <RPGPanel title="Progressão do personagem" icon={<Crown size={16} />}>
        {!levels || levels.levels.length === 0 ? (
          <p className="text-sm text-rpg-muted py-6">Nenhuma subida de nível ainda — o histórico aparece a partir do nível 2.</p>
        ) : (
          <>
            <div className="h-28" role="img" aria-label={`Subidas de nível até o nível ${levels.levels[levels.levels.length - 1].level}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[{ label: "Início", level: 1 }, ...levels.levels.map((l) => ({ label: new Date(`${l.dayKey}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), level: l.level }))]}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={22} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="stepAfter" dataKey="level" name="Nível" stroke={tok("gold")} strokeWidth={2} dot={{ r: 3, fill: tok("gold") }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-rpg-muted">Datas reais de cada subida, derivadas do ledger de XP.</p>
          </>
        )}
      </RPGPanel>

      <RPGPanel title="Consistência da jornada" icon={<Flame size={16} />}>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="border border-rpg-border/70 bg-rpg-bg/40 p-2" style={{ borderRadius: 3 }}>
            <dt className="text-rpg-muted">Sequência atual</dt>
            <dd className="font-pixel text-base text-rpg-orange">{p ? `${p.streakDays} d` : "—"}</dd>
          </div>
          <div className="border border-rpg-border/70 bg-rpg-bg/40 p-2" style={{ borderRadius: 3 }}>
            <dt className="text-rpg-muted">Dias com XP</dt>
            <dd className="font-pixel text-base text-rpg-text">{history ? `${activeDays}/${days}` : "—"}</dd>
          </div>
          <div className="border border-rpg-border/70 bg-rpg-bg/40 p-2" style={{ borderRadius: 3 }}>
            <dt className="text-rpg-muted">XP no período</dt>
            <dd className="font-pixel text-base text-rpg-purple">{totalXp}</dd>
          </div>
          <div className="border border-rpg-border/70 bg-rpg-bg/40 p-2" style={{ borderRadius: 3 }}>
            <dt className="text-rpg-muted">XP total</dt>
            <dd className="font-pixel text-base text-rpg-gold-light">{p ? p.totalXp.toLocaleString("pt-BR") : "—"}</dd>
          </div>
        </dl>
        {history && history.days.some((d) => d.total > 0) && (
          <div className="mt-3 h-14" role="img" aria-label="XP por dia no período">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.days}>
                <Bar dataKey="total" name="XP" fill={tok("purple")} />
                <Tooltip />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </RPGPanel>

      <RPGPanel title="Previsão de metas" icon={<MapIcon size={16} />} actions={<Link to="/goal-forecast" className="text-xs text-rpg-gold-light hover:underline">Ver todas →</Link>}>
        {forecastGoals.length === 0 ? (
          <p className="text-sm text-rpg-muted py-6">Nenhuma meta ativa para projetar.</p>
        ) : (
          <ul className="space-y-3">
            {forecastGoals.map((g) => (
              <li key={g.id}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-rpg-text truncate">{g.title}</span>
                  <RPGBadge tone={STATUS_TONE[g.status] ?? "muted"} icon={<TrendingUp size={10} aria-hidden />}>{g.statusLabel}</RPGBadge>
                </div>
                <RPGProgressBar
                  tone="purple"
                  label={g.forecastDate ? `Previsão: ${new Date(`${g.forecastDate}T12:00:00`).toLocaleDateString("pt-BR")}` : "Sem previsão ainda"}
                  value={g.progressPct ?? 0}
                  valueLabel={g.targetValue != null ? `${g.currentValue}/${g.targetValue}` : `${g.progressPct ?? 0}%`}
                />
              </li>
            ))}
          </ul>
        )}
      </RPGPanel>
    </div>
  );
}
