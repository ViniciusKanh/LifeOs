import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Gauge, Hourglass, Loader2, Target, TrendingUp } from "lucide-react";
import { Empty, Section, Tag } from "@/components/forge3/ForgeShared";
import { useMissionsLoad } from "@/hooks/useMissions3";
import { BOARD_COLUMNS, fmtMin, type MissionsOverview } from "@/services/missions3Service";
import { DONE, PRIORITY_TONE, addDaysIso, dayOf, difficultyLabel, fmtDay, fmtWeekday, isOverdue, type BoardTask } from "./MissionsShared";

type Reward = { xp: number; coins: number } | null;
const STATUS_LABEL = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.status, c.label])) as Record<string, string>;
const CHART = { grid: "rgb(var(--rpg-border) / 0.5)", text: "rgb(var(--rpg-text-muted))", gold: "rgb(var(--rpg-gold))", purple: "rgb(var(--rpg-purple))", green: "rgb(var(--rpg-green))", blue: "rgb(var(--rpg-blue))", red: "rgb(var(--rpg-red))" };
const TOOLTIP = { contentStyle: { background: "rgb(var(--rpg-panel))", border: "1px solid rgb(var(--rpg-border))", borderRadius: 4, fontSize: 12 }, labelStyle: { color: "rgb(var(--rpg-gold-light))" } };

/* ═════════════ Lista ═════════════ */

const GROUPS: Array<{ key: string; label: string; test: (t: BoardTask, today: string) => boolean }> = [
  { key: "overdue", label: "Atrasadas", test: (t, d) => isOverdue(t, d) },
  { key: "today", label: "Hoje", test: (t, d) => dayOf(t.due_date) === d },
  { key: "week", label: "Próximos 7 dias", test: (t, d) => !!t.due_date && dayOf(t.due_date)! > d && dayOf(t.due_date)! <= addDaysIso(d, 7) },
  { key: "later", label: "Mais tarde", test: (t, d) => !!t.due_date && dayOf(t.due_date)! > addDaysIso(d, 7) },
  { key: "none", label: "Sem prazo", test: (t) => !t.due_date },
];

export function MissionList({
  tasks,
  today,
  names,
  rewardOf,
  onOpen,
  onToggleDone,
  onMove,
}: {
  tasks: BoardTask[];
  today: string;
  names: { project: Map<string, string>; goal: Map<string, string>; contract: Map<string, string> };
  rewardOf: (t: BoardTask) => Reward;
  onOpen: (t: BoardTask) => void;
  onToggleDone: (t: BoardTask) => void;
  onMove: (t: BoardTask, status: string) => void;
}) {
  const groups = useMemo(() => {
    const open = tasks.filter((t) => t.status !== DONE);
    const used = new Set<string>();
    const out = GROUPS.map((g) => {
      const items = open.filter((t) => !used.has(t.id) && g.test(t, today)).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
      items.forEach((t) => used.add(t.id));
      return { ...g, items };
    });
    const done = tasks.filter((t) => t.status === DONE).sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 30);
    return [...out, { key: "done", label: "Concluídas recentes", test: () => true, items: done }].filter((g) => g.items.length > 0);
  }, [tasks, today]);

  if (!tasks.length) return <Empty icon={<Target size={22} />} title="Nenhuma missão com esses filtros." />;
  const linkOf = (t: BoardTask) => (t.project_id && names.project.get(t.project_id)) || (t.goal_id && names.goal.get(t.goal_id)) || (t.contract_id && names.contract.get(t.contract_id)) || null;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} className="rpg-panel overflow-hidden" aria-label={g.label}>
          <h3 className={clsx("flex items-center gap-2 border-b border-rpg-border px-3 py-2 font-pixel text-[12px] uppercase tracking-wider", g.key === "overdue" ? "text-rpg-red" : g.key === "done" ? "text-rpg-green" : "text-rpg-gold-light")}>
            {g.label} <Tag tone="muted">{g.items.length}</Tag>
          </h3>
          <div className="hidden grid-cols-[24px_minmax(0,1fr)_150px_80px_80px_80px_110px_140px] gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-rpg-muted lg:grid">
            <span />
            <span>Missão</span>
            <span>Vínculo</span>
            <span>Prioridade</span>
            <span>Prazo</span>
            <span>Estimativa</span>
            <span>Recompensa</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-rpg-border/60">
            {g.items.map((t) => {
              const done = t.status === DONE;
              const r = done ? null : rewardOf(t);
              const link = linkOf(t);
              const diff = difficultyLabel(t.difficulty);
              return (
                <li key={t.id} className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-3 py-2 lg:grid-cols-[24px_minmax(0,1fr)_150px_80px_80px_80px_110px_140px]">
                  <button
                    onClick={() => onToggleDone(t)}
                    aria-label={done ? `Reabrir "${t.title}"` : `Concluir "${t.title}"`}
                    className={clsx("flex h-5 w-5 items-center justify-center rounded-full border-2", done ? "border-rpg-green bg-rpg-green text-rpg-bg" : "border-rpg-border text-transparent hover:border-rpg-green hover:text-rpg-green")}
                  >
                    <Check size={12} strokeWidth={3} />
                  </button>
                  <button onClick={() => onOpen(t)} className="min-w-0 text-left">
                    <span className={clsx("block truncate text-sm", done ? "text-rpg-muted line-through" : "font-semibold text-rpg-text hover:text-rpg-gold-light")}>{t.title}</span>
                    {diff && <span className="text-[11px] text-rpg-muted">{diff}</span>}
                  </button>
                  {/* No celular/tablet, os detalhes viram uma linha de selos sob o título. */}
                  <div className="col-start-2 flex flex-wrap items-center gap-1.5 text-[11px] text-rpg-muted lg:contents">
                    <span className="truncate lg:block">{link ?? "—"}</span>
                    <span>
                      <Tag tone={PRIORITY_TONE[t.priority] ?? "muted"}>{t.priority}</Tag>
                    </span>
                    <span className={clsx(isOverdue(t, today) && "font-semibold text-rpg-red")}>{fmtDay(t.due_date)}</span>
                    <span>{fmtMin(t.estimate_minutes)}</span>
                    <span>{r ? <Tag tone="purple">+{r.xp} XP · {r.coins} 🪙</Tag> : done ? "paga" : "—"}</span>
                    <select
                      value={t.status}
                      onChange={(e) => onMove(t, e.target.value)}
                      aria-label={`Status de "${t.title}"`}
                      className="max-w-[140px] border border-rpg-border bg-rpg-bg-2 px-1.5 py-1 text-[11px] text-rpg-text"
                      style={{ borderRadius: 3 }}
                    >
                      {BOARD_COLUMNS.map((c) => (
                        <option key={c.status} value={c.status}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ═════════════ Calendário (por prazo) ═════════════ */

export function MissionCalendar({ tasks, today, onOpen, onNewOn }: { tasks: BoardTask[]; today: string; onOpen: (t: BoardTask) => void; onNewOn: (day: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const byDay = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const t of tasks) {
      const d = dayOf(t.due_date);
      if (d && d.startsWith(month)) m.set(d, [...(m.get(d) ?? []), t]);
    }
    return m;
  }, [tasks, month]);
  const first = `${month}-01`;
  const startDow = (new Date(`${first}T12:00:00`).getDay() + 6) % 7; // semana começa na segunda
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const cells: Array<string | null> = [...Array(startDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(`${month}-15T12:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const rawLabel = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  const listDays = [...byDay.keys()].sort();
  const noDue = tasks.filter((t) => !t.due_date && t.status !== DONE).length;

  return (
    <Section
      title="Calendário de prazos"
      icon={<CalendarDays size={14} />}
      action={
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1 text-rpg-muted hover:text-rpg-gold" aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[120px] text-center text-sm font-semibold text-rpg-text">{label}</span>
          <button onClick={() => shift(1)} className="p-1 text-rpg-muted hover:text-rpg-gold" aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-rpg-muted">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) =>
            d ? (
              <div key={d} className={clsx("group flex min-h-[92px] flex-col border p-1", d === today ? "border-rpg-gold bg-rpg-gold/5" : "border-rpg-border/70 bg-rpg-bg-2/50")} style={{ borderRadius: 3 }}>
                <div className="flex items-center">
                  <span className={clsx("text-[11px] font-semibold tabular-nums", d === today ? "text-rpg-gold-light" : "text-rpg-muted")}>{Number(d.slice(8))}</span>
                  <button onClick={() => onNewOn(d)} className="ml-auto text-rpg-muted opacity-0 hover:text-rpg-gold focus:opacity-100 group-hover:opacity-100" aria-label={`Nova missão com prazo em ${fmtDay(d)}`}>
                    <CalendarPlus size={12} />
                  </button>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {(byDay.get(d) ?? []).slice(0, 3).map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onOpen(t)}
                        className={clsx("block w-full truncate border-l-2 bg-rpg-bg/70 px-1 py-0.5 text-left text-[10.5px]", t.status === DONE ? "border-rpg-green text-rpg-muted line-through" : isOverdue(t, today) ? "border-rpg-red text-rpg-text" : "border-rpg-purple text-rpg-text")}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                  {(byDay.get(d)?.length ?? 0) > 3 && <li className="text-[10px] text-rpg-muted">+{byDay.get(d)!.length - 3} mais</li>}
                </ul>
              </div>
            ) : (
              <div key={`e${i}`} aria-hidden />
            ),
          )}
        </div>
      </div>
      {/* Celular: agenda em lista (a grade de 7 colunas não cabe). */}
      <ul className="space-y-2 md:hidden">
        {listDays.length === 0 && <li className="text-sm text-rpg-muted">Nenhum prazo neste mês.</li>}
        {listDays.map((d) => (
          <li key={d} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
            <p className={clsx("text-xs font-semibold capitalize", d === today ? "text-rpg-gold-light" : "text-rpg-muted")}>{fmtWeekday(d)}</p>
            <ul className="mt-1 space-y-1">
              {byDay.get(d)!.map((t) => (
                <li key={t.id}>
                  <button onClick={() => onOpen(t)} className={clsx("w-full truncate text-left text-sm", t.status === DONE ? "text-rpg-muted line-through" : "text-rpg-text")}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {noDue > 0 && <p className="mt-2 text-[11px] text-rpg-muted">{noDue} missão(ões) aberta(s) sem prazo não aparecem no calendário.</p>}
    </Section>
  );
}

/* ═════════════ Carga ═════════════ */

const LEVEL_TONE: Record<string, string> = { leve: "text-rpg-green", equilibrada: "text-rpg-blue", alta: "text-rpg-orange", sobrecarga: "text-rpg-red" };

export function MissionLoadView({ overview }: { overview: MissionsOverview }) {
  const q = useMissionsLoad(true);
  const i = overview.indicators;
  const data = (q.data?.days ?? []).map((d) => ({ dia: fmtWeekday(d.date), livre: d.freeMinutes, planejado: d.plannedMinutes, excesso: d.overloadMinutes }));
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section title="Capacidade dos próximos dias" icon={<Gauge size={14} />}>
        {q.isLoading ? (
          <div className="flex h-60 items-center justify-center text-rpg-muted">
            <Loader2 className="animate-spin" aria-label="Carregando carga" />
          </div>
        ) : q.isError ? (
          <Empty icon={<AlertTriangle size={20} />} title="Não consegui calcular a carga agora." />
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: CHART.text, fontSize: 11 }} />
                  <YAxis tick={{ fill: CHART.text, fontSize: 11 }} unit="m" />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => fmtMin(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="planejado" name="Planejado" stackId="a" fill={CHART.purple} />
                  <Bar dataKey="excesso" name="Excesso" stackId="a" fill={CHART.red} />
                  <Bar dataKey="livre" name="Livre" fill={CHART.green} opacity={0.55} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {(q.data?.days ?? []).map((d) => (
                <li key={d.date} className="flex items-center gap-2 text-xs">
                  <span className="w-16 capitalize text-rpg-muted">{fmtWeekday(d.date)}</span>
                  <span className={clsx("font-semibold capitalize", LEVEL_TONE[d.level] ?? "text-rpg-text")}>{d.level}</span>
                  <span className="text-rpg-muted">· {d.occupancyPct}% ocupado · janela {d.window}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-2 text-[11px] text-rpg-muted">Mesma regra do Planejamento de Capacidade: janela de trabalho menos compromissos da Agenda, comparada ao esforço das missões planejadas.</p>
      </Section>
      <Section title="Esforço em aberto" icon={<Hourglass size={14} />}>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Estimado em aberto" value={fmtMin(i.estimatedOpenMinutes)} />
          <Stat label="Sem estimativa" value={String(i.unestimatedOpen)} tone={i.unestimatedOpen ? "text-rpg-orange" : undefined} />
          <Stat label="Executado (30 dias)" value={fmtMin(i.executedLast30Minutes)} />
          <Stat label="Em execução" value={String(i.inProgress)} />
        </dl>
        {i.unestimatedOpen > 0 && <p className="mt-2 text-[11px] text-rpg-muted">Missões sem estimativa não entram no cálculo de carga — estime-as para o planejamento ficar fiel.</p>}
      </Section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
      <dd className={clsx("text-lg font-bold tabular-nums", tone ?? "text-rpg-text")}>{value}</dd>
      <dt className="text-[10px] uppercase tracking-wide text-rpg-muted">{label}</dt>
    </div>
  );
}

/* ═════════════ Prazos ═════════════ */

export function MissionDeadlines({ tasks, today, onOpen, onPostpone }: { tasks: BoardTask[]; today: string; onOpen: (t: BoardTask) => void; onPostpone: (t: BoardTask, days: number) => void }) {
  const open = tasks.filter((t) => t.status !== DONE);
  const lanes: Array<{ key: string; label: string; tone: string; items: BoardTask[] }> = [
    { key: "o", label: "Atrasadas", tone: "text-rpg-red", items: open.filter((t) => isOverdue(t, today)) },
    { key: "t", label: "Hoje", tone: "text-rpg-orange", items: open.filter((t) => dayOf(t.due_date) === today) },
    { key: "w", label: "Próximos 7 dias", tone: "text-rpg-blue", items: open.filter((t) => !!t.due_date && dayOf(t.due_date)! > today && dayOf(t.due_date)! <= addDaysIso(today, 7)) },
    { key: "l", label: "Depois", tone: "text-rpg-purple", items: open.filter((t) => !!t.due_date && dayOf(t.due_date)! > addDaysIso(today, 7)) },
  ].map((l) => ({ ...l, items: l.items.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")) }));
  const noDue = open.filter((t) => !t.due_date);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((l) => (
          <section key={l.key} className="rpg-panel p-2.5" aria-label={l.label}>
            <h3 className={clsx("mb-2 flex items-center gap-2 font-pixel text-[12px] uppercase tracking-wider", l.tone)}>
              {l.label} <Tag tone="muted">{l.items.length}</Tag>
            </h3>
            {l.items.length === 0 ? (
              <p className="text-xs text-rpg-muted">Nada aqui.</p>
            ) : (
              <ul className="space-y-1.5">
                {l.items.slice(0, 12).map((t) => (
                  <li key={t.id} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                    <button onClick={() => onOpen(t)} className="block w-full truncate text-left text-[13px] font-semibold text-rpg-text hover:text-rpg-gold-light">
                      {t.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-rpg-muted">
                      <span className={clsx(l.key === "o" && "font-semibold text-rpg-red")}>{fmtDay(t.due_date)}</span>
                      <span>· {STATUS_LABEL[t.status] ?? t.status}</span>
                      {t.estimate_minutes ? <span>· {fmtMin(t.estimate_minutes)}</span> : null}
                      {(l.key === "o" || l.key === "t") && (
                        <span className="ml-auto flex gap-1">
                          <button onClick={() => onPostpone(t, 1)} className="border border-rpg-border px-1.5 py-0.5 hover:border-rpg-gold hover:text-rpg-gold-light" style={{ borderRadius: 2 }} title="Mover o prazo para amanhã">
                            +1 dia
                          </button>
                          <button onClick={() => onPostpone(t, 7)} className="border border-rpg-border px-1.5 py-0.5 hover:border-rpg-gold hover:text-rpg-gold-light" style={{ borderRadius: 2 }} title="Mover o prazo uma semana">
                            +7
                          </button>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
                {l.items.length > 12 && <li className="text-[11px] text-rpg-muted">+{l.items.length - 12} na Lista.</li>}
              </ul>
            )}
          </section>
        ))}
      </div>
      {noDue.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-rpg-muted">
          <Clock size={12} aria-hidden /> {noDue.length} missão(ões) aberta(s) sem prazo. Use o Conselheiro para sugerir datas pela sua agenda.
        </p>
      )}
    </div>
  );
}

/* ═════════════ Análises ═════════════ */

export function MissionAnalytics({ overview }: { overview: MissionsOverview }) {
  const a = overview.analytics;
  const i = overview.indicators;
  const weeks = a.weeks.map((w) => ({ semana: fmtDay(w.week), Concluídas: w.done, Criadas: w.created }));
  const hasData = a.weeks.some((w) => w.done || w.created);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section title="Ritmo das últimas 12 semanas" icon={<TrendingUp size={14} />}>
        {hasData ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="semana" tick={{ fill: CHART.text, fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: CHART.text, fontSize: 11 }} />
                <Tooltip {...TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Criadas" fill={CHART.blue} opacity={0.7} />
                <Bar dataKey="Concluídas" fill={CHART.green} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty icon={<TrendingUp size={20} />} title="Ainda sem histórico suficiente." />
        )}
      </Section>
      <Section title="Qualidade da execução" icon={<Target size={14} />}>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Taxa de conclusão (30d)" value={i.completionRate == null ? "—" : `${i.completionRate}%`} />
          <Stat label="XP em missões (30d)" value={String(i.xpLast30)} />
          <Stat label="No prazo (30d)" value={a.onTimeRate == null ? "—" : `${a.onTimeRate}%`} />
          <Stat label="Lead time mediano" value={a.leadTimeMedianDays == null ? "—" : `${a.leadTimeMedianDays.toLocaleString("pt-BR")} d`} />
          <Stat label="Real ÷ estimado" value={a.estimateRatio == null ? "—" : `${a.estimateRatio.toLocaleString("pt-BR")}×`} tone={a.estimateRatio != null && a.estimateRatio > 1.3 ? "text-rpg-orange" : undefined} />
          <Stat label="Amostra de estimativas" value={String(a.estimatedSample)} />
        </dl>
        <ul className="mt-3 space-y-1">
          {a.byPriority.map((p) => (
            <li key={p.priority} className="flex items-center gap-2 text-xs">
              <Tag tone={PRIORITY_TONE[p.priority] ?? "muted"}>{p.priority}</Tag>
              <span className="text-rpg-muted">
                {p.open} aberta(s) · {p.done} concluída(s) em 30 dias
              </span>
            </li>
          ))}
        </ul>
        <Notes>
          <li>{i.definitions.completionRate}</li>
          <li>{i.definitions.xpLast30}</li>
          <li>“No prazo” considera {a.onTimeSample} missão(ões) concluída(s) com prazo; “real ÷ estimado” usa {a.estimatedSample} com estimativa e tempo registrado.</li>
        </Notes>
      </Section>
    </div>
  );
}

function Notes({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[10.5px] text-rpg-muted">{children}</ul>;
}

