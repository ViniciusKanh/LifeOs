import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { BookOpen, CalendarDays, Crown, Flame, Layers, ListChecks, Repeat, Sparkles, Target } from "lucide-react";
import { RPGBadge, RPGButton, RPGIconSlot, RPGPanel, RPGProgressBar, RPGStatCard, RPG_TONE_SOFT, RPG_TONE_TEXT } from "@/components/rpg";
import { Sparkline } from "@/components/charts/motion/Sparkline";
import { useGoals } from "@/hooks/useGoals";
import type { TimelineEvent } from "@/types";
import { TIMELINE_META } from "./timelineMeta";
import { OPTIONAL_TABS, RANGE_OPTIONS, TABS, dayHeaderLabel, eventContent, formatTime, relativeDayLabel, type EventType } from "./timelineFormat";
import { categoryCounts, eventDay, type timelineHighlights } from "@/utils/timelineMetrics";

const tok = (name: string) => `rgb(var(--rpg-${name}))`;
const SPECIAL = new Set<EventType>(["achievement", "level_up", "reward", "project", "contract", "campaign"]);

/**
 * Timeline no tema RPG — "Crônica da Jornada". Só apresentação: recebe os
 * eventos reais (com o XP de cada um vindo do ledger) e os filtros da página.
 */
export function RpgTimelineView(props: {
  events: TimelineEvent[];
  isLoading: boolean;
  xpByDay: Record<string, number>;
  filter: EventType | "todos";
  onFilter: (f: EventType | "todos") => void;
  rangeDays: number;
  onRange: (d: number) => void;
  sortAsc: boolean;
  onSort: (asc: boolean) => void;
  days: string[];
  byDay: Map<string, TimelineEvent[]>;
  hasMoreDays: boolean;
  onMoreDays: () => void;
  highlights: ReturnType<typeof timelineHighlights>;
  categoriesPresent: number;
  daysWithRecords: number;
}) {
  const { events, xpByDay, highlights } = props;
  const reduce = useReducedMotion();
  const totalXp = Object.values(xpByDay).reduce((a, b) => a + b, 0);
  // Sparkline real: atividades por dia no período (dias sem registro = 0).
  const perDay = (() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(eventDay(e), (map.get(eventDay(e)) ?? 0) + 1);
    const out: number[] = [];
    for (let i = props.rangeDays - 1; i >= 0; i--) out.push(map.get(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)) ?? 0);
    return out;
  })();
  const breakdown = categoryCounts(events);
  const { goals } = useGoals();
  const activeGoals = goals.filter((g) => g.status === "active" && g.target_value != null && g.target_value > 0).slice(0, 4);
  const field = "px-3 py-2 text-xs bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-5">
      <header className="flex items-start gap-4">
        <RPGIconSlot icon={<BookOpen size={26} />} />
        <div className="min-w-0">
          <p className="font-pixel text-[11px] uppercase tracking-wider text-rpg-gold">Crônica da jornada</p>
          <h1 className="rpg-title text-3xl sm:text-4xl font-bold leading-tight">Timeline</h1>
          <p className="text-sm text-rpg-muted mt-1">Histórico cronológico das suas atividades, hábitos, leitura, exercícios, foco e educação.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <RPGStatCard icon={<CalendarDays size={18} />} label="Atividades registradas" value={String(events.length)} tone="blue" action={<Sparkline values={perDay} width={80} height={30} className="text-rpg-blue" />} />
        <RPGStatCard icon={<Layers size={18} />} label="Categorias ativas" value={String(props.categoriesPresent)} tone="purple" />
        <RPGStatCard icon={<ListChecks size={18} />} label="Dias com registros" value={String(props.daysWithRecords)} tone="green" caption={`de ${props.rangeDays} dias`} />
        <RPGStatCard icon={<Sparkles size={18} />} label="XP obtido no período" value={`${totalXp.toLocaleString("pt-BR")} XP`} tone="gold" caption="do ledger de XP" />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0 flex-1" role="tablist" aria-label="Filtrar por categoria">
          {TABS.map((t) => {
            const count = t.value === "todos" ? events.length : events.filter((e) => e.type === t.value).length;
            const active = props.filter === t.value;
            if (OPTIONAL_TABS.has(t.value) && count === 0 && !active) return null;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => props.onFilter(t.value)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium border transition-colors ${active ? "bg-rpg-purple text-rpg-text border-rpg-purple" : "border-rpg-border text-rpg-muted hover:text-rpg-text hover:border-rpg-gold/60"}`}
                style={{ borderRadius: 999 }}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 shrink-0">
          <label className="sr-only" htmlFor="tl-range">Período</label>
          <select id="tl-range" className={field} style={{ borderRadius: 3 }} value={props.rangeDays} onChange={(e) => props.onRange(Number(e.target.value))}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.days} value={r.days}>{r.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="tl-sort">Ordenação</label>
          <select id="tl-sort" className={field} style={{ borderRadius: 3 }} value={props.sortAsc ? "asc" : "desc"} onChange={(e) => props.onSort(e.target.value === "asc")}>
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigos</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="min-w-0">
          {props.isLoading && (
            <div className="space-y-3" aria-label="Carregando timeline">
              {[0, 1, 2].map((i) => <div key={i} className="rpg-panel h-28 animate-pulse" />)}
            </div>
          )}
          {!props.isLoading && props.days.length === 0 && (
            <RPGPanel className="text-center">
              <p className="font-rpg text-rpg-text">Nenhum capítulo escrito neste período.</p>
              <p className="text-sm text-rpg-muted mt-1">Conclua tarefas, registre hábitos, leituras e exercícios para a crônica aparecer aqui.</p>
              <Link to="/hoje" className="inline-block mt-3 text-xs text-rpg-gold-light hover:underline">Ir para Hoje →</Link>
            </RPGPanel>
          )}

          <ol className="relative space-y-6 border-l-2 border-rpg-border/70 ml-3 pl-6">
            {props.days.map((day) => {
              const dayEvents = [...props.byDay.get(day)!].sort((a, b) => (props.sortAsc ? String(a.at).localeCompare(String(b.at)) : String(b.at).localeCompare(String(a.at))));
              const dayXp = xpByDay[day] ?? 0;
              return (
                <li key={day} className="relative">
                  <span className="absolute -left-[35px] top-0.5 w-5 h-5 border-2 border-rpg-purple bg-rpg-bg flex items-center justify-center" style={{ borderRadius: 999 }} aria-hidden>
                    <span className="w-2 h-2 bg-rpg-purple" style={{ borderRadius: 999 }} />
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h2 className="font-rpg font-bold text-rpg-text">{dayHeaderLabel(day).replace(" · ", " • ")}</h2>
                    <p className="text-xs text-rpg-muted">
                      {dayEvents.length} {dayEvents.length === 1 ? "atividade" : "atividades"}
                      {dayXp > 0 && <span className="ml-2 font-pixel text-rpg-green">+{dayXp} XP</span>}
                    </p>
                  </div>
                  <ul className="rpg-panel divide-y divide-rpg-border/50">
                    {dayEvents.map((e) => {
                      const meta = TIMELINE_META[e.type];
                      const Icon = meta.icon;
                      const { title, detail } = eventContent(e);
                      const special = SPECIAL.has(e.type);
                      return (
                        <motion.li
                          key={`${e.type}-${e.id}`}
                          initial={reduce ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.25 }}
                          className={`flex items-center gap-3 px-3 py-2.5 ${special ? "bg-rpg-gold/10" : ""}`}
                        >
                          <time className="w-11 shrink-0 text-xs text-rpg-muted tabular-nums">{formatTime(String(e.at))}</time>
                          <span className={`w-9 h-9 shrink-0 flex items-center justify-center border ${RPG_TONE_SOFT[meta.rpgTone]}`} style={{ borderRadius: 4 }} aria-hidden>
                            <Icon size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            {special && <p className="font-pixel text-[10px] uppercase tracking-wider text-rpg-gold-light">{e.type === "level_up" ? "Level up" : e.type === "achievement" ? "Conquista desbloqueada" : e.type === "reward" ? "Recompensa resgatada" : e.type === "contract" ? "Contrato cumprido" : e.type === "campaign" ? "Forja de Campanhas" : "Projeto concluído"}</p>}
                            <p className={`text-sm font-semibold truncate ${special ? "text-rpg-gold-light" : "text-rpg-text"}`}>{special ? detail ?? title : title}</p>
                            {!special && detail && <p className="text-xs text-rpg-muted truncate">{detail}</p>}
                          </div>
                          <RPGBadge tone={meta.rpgTone} className="hidden sm:inline-flex shrink-0">{meta.tag}</RPGBadge>
                          <span className="w-16 shrink-0 text-right font-pixel text-xs">
                            {e.xp ? <span className="text-rpg-green">+{e.xp} XP</span> : e.type === "reward" ? <span className="text-rpg-gold-light">−{String(e.cost)} 🪙</span> : null}
                          </span>
                        </motion.li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
          {props.hasMoreDays && (
            <div className="mt-4 flex justify-center">
              <RPGButton variant="secondary" onClick={props.onMoreDays}>Carregar mais dias</RPGButton>
            </div>
          )}
        </div>

        <aside className="space-y-4 min-w-0">
          <RPGPanel title="Resumo da atividade" icon={<Layers size={16} />}>
            {breakdown.length === 0 ? (
              <p className="text-sm text-rpg-muted">Sem atividades no período.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 shrink-0 relative" role="img" aria-label={`${events.length} atividades por categoria`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdown.map((b) => ({ ...b, tag: TIMELINE_META[b.type].tag }))} dataKey="count" nameKey="tag" innerRadius={38} outerRadius={60} paddingAngle={2} stroke="none">
                        {breakdown.map((b) => <Cell key={b.type} fill={tok(TIMELINE_META[b.type].rpgTone === "muted" ? "muted" : TIMELINE_META[b.type].rpgTone)} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="font-pixel text-xl text-rpg-text leading-none">{events.length}</p>
                    <p className="text-[9px] text-rpg-muted">atividades</p>
                  </div>
                </div>
                <ul className="flex-1 min-w-0 space-y-1 text-xs">
                  {breakdown.slice(0, 8).map((b) => (
                    <li key={b.type} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 shrink-0" style={{ background: tok(TIMELINE_META[b.type].rpgTone), borderRadius: 999 }} aria-hidden />
                      <span className="truncate text-rpg-text">{TIMELINE_META[b.type].tag}</span>
                      <span className="ml-auto tabular-nums text-rpg-muted">{b.count}</span>
                      <span className="w-9 text-right tabular-nums text-rpg-muted">{Math.round((b.count / events.length) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </RPGPanel>

          <RPGPanel title="Destaques do período" icon={<Crown size={16} />} actions={totalXp > 0 ? <RPGBadge tone="purple">+{totalXp} XP</RPGBadge> : undefined}>
            {!highlights ? (
              <p className="text-sm text-rpg-muted">Registre atividades para ver destaques aqui.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Highlight icon={<Crown size={14} />} tone="gold" label="Dia mais ativo" value={highlights.mostActiveDay ? relativeDayLabel(highlights.mostActiveDay) : "—"} sub={highlights.mostActiveCount ? `${highlights.mostActiveCount} atividades` : undefined} />
                <Highlight icon={<Flame size={14} />} tone="orange" label="Maior sequência" value={highlights.bestStreakHabit ? `${highlights.bestStreakHabit.streak} dias` : "—"} sub={highlights.bestStreakHabit?.name} />
                <Highlight icon={<ListChecks size={14} />} tone="blue" label="Missões concluídas" value={String(highlights.tasksDone)} sub="tarefas" />
                <Highlight icon={<Repeat size={14} />} tone="green" label="Hábitos cumpridos" value={String(highlights.habitsDone)} sub="hábitos" />
              </dl>
            )}
          </RPGPanel>

          <RPGPanel title="Objetivos em andamento" icon={<Target size={16} />} actions={<Link to="/metas" className="text-xs text-rpg-gold-light hover:underline">Ver todas →</Link>}>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhuma meta ativa com alvo numérico.</p>
            ) : (
              <ul className="space-y-3">
                {activeGoals.map((g) => (
                  <li key={g.id}>
                    <RPGProgressBar
                      tone="purple"
                      label={g.title}
                      value={Math.min(g.current_value, g.target_value!)}
                      max={g.target_value!}
                      valueLabel={`${g.current_value} / ${g.target_value}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </RPGPanel>
        </aside>
      </div>
    </div>
  );
}

function Highlight({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: "gold" | "orange" | "blue" | "green"; label: string; value: string; sub?: string }) {
  return (
    <div className="border border-rpg-border/70 bg-rpg-bg/40 px-2.5 py-2" style={{ borderRadius: 3 }}>
      <dt className={`flex items-center gap-1.5 text-[11px] ${RPG_TONE_TEXT[tone]}`}>{icon}<span className="text-rpg-muted">{label}</span></dt>
      <dd className="mt-0.5 font-pixel text-sm text-rpg-text truncate">{value}</dd>
      {sub && <dd className="text-[10px] text-rpg-muted truncate">{sub}</dd>}
    </div>
  );
}
