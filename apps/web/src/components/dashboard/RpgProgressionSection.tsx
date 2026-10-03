import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Gem, LayoutGrid, Sparkles, Store, Trophy, UserRound } from "lucide-react";
import { RPGPanel, RPGPlayerHUD, rpgButtonClass } from "@/components/rpg";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { useXpHistory } from "@/hooks/useGamification";
import { lastMissions, XP_SOURCES, type MissionState } from "@/utils/gamification";
import { dayLabel } from "@/utils/dashboardMetrics";
import type { DailySeriesPoint, Task } from "@/types";

/** Cores dos tokens RPG (sem hex solto): rgb(var(--rpg-*)). */
const tok = (name: string) => `rgb(var(--rpg-${name}))`;

const MISSION_STATE: Record<MissionState, { label: string; color: string }> = {
  done: { label: "Concluída", color: tok("green") },
  doing: { label: "Em andamento", color: tok("blue") },
  open: { label: "Aberta", color: tok("purple") },
  overdue: { label: "Atrasada", color: tok("red") },
};

/** Painel do jogador: HUD real + Life Score + atalhos (Loja, Conquistas, Perfil). */
export function RpgJourneyPlayer({ lifeScore }: { lifeScore: number | null }) {
  return (
    <RPGPanel variant="gold" title="Progressão da jornada" icon={<Sparkles size={16} />}>
      <RPGPlayerHUD
        actions={
          <>
            {lifeScore != null && (
              <Link to="/analytics" className="inline-flex items-center gap-2 px-3 py-1.5 border border-rpg-green/60 bg-rpg-green/10 text-rpg-green" style={{ borderRadius: 3 }}>
                <Gem size={15} aria-hidden />
                <span className="font-pixel text-sm">Life Score {lifeScore}</span>
              </Link>
            )}
            <Link to="/loja" className={rpgButtonClass("gold")}>
              <Store size={14} aria-hidden /> Loja
            </Link>
            <Link to="/conquistas" className={rpgButtonClass("secondary")}>
              <Trophy size={14} aria-hidden /> Conquistas
            </Link>
            <Link to="/perfil#aparencia" className={rpgButtonClass("ghost")}>
              <UserRound size={14} aria-hidden /> Perfil
            </Link>
          </>
        }
      />
    </RPGPanel>
  );
}

/** XP ganho por dia nos últimos 30 dias, empilhado por origem. */
export function RpgXpHistory() {
  const { data, isLoading, isError } = useXpHistory(30);
  const rows = useMemo(
    () => (data?.days ?? []).map((d) => ({ label: dayLabel(d.date), ...Object.fromEntries(XP_SOURCES.map((s) => [s.id, d.bySource[s.id] ?? 0])), total: d.total })),
    [data],
  );
  const total = rows.reduce((a, r) => a + r.total, 0);

  return (
    <RPGPanel title="XP ganho — últimos 30 dias" icon={<Sparkles size={16} />} className="h-full">
      {isLoading && <div className="h-56 rpg-bar animate-pulse" aria-label="Carregando histórico de XP" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar o histórico de XP.</p>}
      {data && total === 0 && <p className="py-10 text-center text-sm text-rpg-muted">Nenhum XP no período. Conclua uma missão ou cumpra um contrato para começar.</p>}
      {data && total > 0 && (
        <>
          <p className="mb-2 text-xs text-rpg-muted">
            <span className="font-pixel text-rpg-purple">{total.toLocaleString("pt-BR")} XP</span> no período
          </p>
          <div className="h-56" role="img" aria-label={`XP por dia nos últimos 30 dias, total ${total}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: tok("gold"), fillOpacity: 0.08 }} />
                {XP_SOURCES.map((s) => (
                  <Bar key={s.id} dataKey={s.id} name={s.label} stackId="xp" fill={tok(s.tone)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-rpg-muted">
            {XP_SOURCES.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5" style={{ backgroundColor: tok(s.tone), borderRadius: 1 }} aria-hidden /> {s.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </RPGPanel>
  );
}

/** "Suas últimas 100 missões": um quadrado por tarefa real, com tooltip. */
export function RpgMissionWaffle({ tasks, today }: { tasks: Task[]; today: string }) {
  const missions = useMemo(() => lastMissions(tasks, today, 100), [tasks, today]);
  const [hover, setHover] = useState<number | null>(null);
  const counts = useMemo(() => {
    const c: Record<MissionState, number> = { done: 0, doing: 0, open: 0, overdue: 0 };
    missions.forEach((m) => (c[m.state] += 1));
    return c;
  }, [missions]);
  const active = hover != null ? missions[hover] : null;

  return (
    <RPGPanel title="Suas últimas 100 missões" icon={<LayoutGrid size={16} />} className="h-full">
      {missions.length === 0 ? (
        <p className="py-10 text-center text-sm text-rpg-muted">Nenhuma missão registrada ainda.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
          <div className="grid grid-cols-10 gap-[3px] w-full max-w-[230px] mx-auto sm:mx-0 shrink-0" role="list" aria-label={`Últimas ${missions.length} missões`}>
            {missions.map((m, i) => (
              <button
                key={m.task.id}
                type="button"
                role="listitem"
                title={`${m.task.title} — ${MISSION_STATE[m.state].label}`}
                aria-label={`${m.task.title}: ${MISSION_STATE[m.state].label}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                className="aspect-square focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
                style={{ backgroundColor: MISSION_STATE[m.state].color, borderRadius: 2, opacity: hover != null && hover !== i ? 0.45 : 1 }}
              />
            ))}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <ul className="space-y-1 text-xs">
              {(Object.keys(MISSION_STATE) as MissionState[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-rpg-text">
                    <span className="w-2.5 h-2.5" style={{ backgroundColor: MISSION_STATE[k].color, borderRadius: 1 }} aria-hidden />
                    {MISSION_STATE[k].label}
                  </span>
                  <span className="font-pixel tabular-nums text-rpg-muted">{counts[k]}</span>
                </li>
              ))}
            </ul>
            <p className="min-h-[2.5rem] text-[11px] text-rpg-muted border-t border-rpg-border/60 pt-2" aria-live="polite">
              {active ? (
                <>
                  <span className="text-rpg-text">{active.task.title}</span> · {MISSION_STATE[active.state].label}
                  {active.task.due_date && ` · prazo ${dayLabel(active.task.due_date)}`}
                </>
              ) : (
                "Passe o mouse (ou foque) um quadrado para ver a missão."
              )}
            </p>
          </div>
        </div>
      )}
    </RPGPanel>
  );
}

/** Ritmo da jornada (14 dias): missões, contratos, exercícios e XP — todos de registros reais. */
export function RpgJourneyRhythm({ series }: { series: { tasks: DailySeriesPoint[]; habits: DailySeriesPoint[]; workouts: DailySeriesPoint[] } | undefined }) {
  const xp = useXpHistory(14);
  const lines = useMemo(() => {
    if (!series) return [];
    const xpByDay = new Map((xp.data?.days ?? []).map((d) => [d.date, d]));
    const days = series.tasks.map((p) => p.day.slice(0, 10));
    return [
      { key: "tasks", label: "Missões", color: tok("purple"), values: series.tasks.map((p) => Number(p.total)) },
      { key: "habits", label: "Contratos", color: tok("green"), values: series.habits.map((p) => Number(p.total)) },
      { key: "workouts", label: "Exercícios", color: tok("orange"), values: series.workouts.map((p) => Number(p.total)) },
      { key: "focus", label: "XP de foco", color: tok("cyan"), values: days.map((d) => xpByDay.get(d)?.bySource.focus ?? 0) },
      { key: "xp", label: "XP total", color: tok("gold"), values: days.map((d) => xpByDay.get(d)?.total ?? 0) },
    ];
  }, [series, xp.data]);
  const [hidden, setHidden] = useState<Set<string>>(new Set(["xp"]));

  let body: ReactNode;
  if (!series || series.tasks.length === 0) body = <p className="py-8 text-center text-sm text-rpg-muted">Sem registros no período ainda.</p>;
  else
    body = (
      <>
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Séries do gráfico">
          {lines.map((s) => {
            const total = s.values.reduce((a, b) => a + b, 0);
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else if (next.size < lines.length - 1) next.add(s.key);
                    return next;
                  })
                }
                className={`text-left border px-2.5 py-1.5 ${off ? "opacity-45 border-rpg-border" : "border-rpg-border bg-rpg-bg-2"}`}
                style={{ borderRadius: 3 }}
              >
                <span className="flex items-center gap-1.5 text-[11px] text-rpg-muted">
                  <span className="w-2.5 h-[3px]" style={{ backgroundColor: s.color }} aria-hidden /> {s.label}
                </span>
                <span className="block font-pixel text-sm text-rpg-text tabular-nums">{total}</span>
              </button>
            );
          })}
        </div>
        <div className="pb-6">
          <AnimatedLineChart
            ariaLabel="Ritmo da jornada nos últimos 14 dias"
            labels={series.tasks.map((p) => dayLabel(p.day, { weekday: true }))}
            height={220}
            series={lines.filter((s) => !hidden.has(s.key))}
          />
        </div>
      </>
    );

  return (
    <RPGPanel title="Ritmo da jornada" icon={<Activity size={16} />} actions={<Link to="/analytics" className="text-xs text-rpg-gold-light hover:underline">Analytics</Link>}>
      {body}
    </RPGPanel>
  );
}
