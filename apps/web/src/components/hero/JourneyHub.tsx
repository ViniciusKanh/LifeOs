import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, BarChart3, BookOpen, CalendarDays, ChevronDown, Coins, Crown, Flame, Image as ImageIcon, Scroll, Search, Sparkles, Star, Target, Trophy, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { IndicatorCard, KitSection } from "@/components/rpg-modules/ModuleKit";
import { useHeroActions, useMomentCandidates } from "@/hooks/useHero";
import type { JourneyHub, JourneySummary, Narration, NarratorMode } from "@/services/heroService";
import type { TimelineEvent } from "@/types";
import { groupTimelineByDay, timelineDayLabel, timelineEventRoute } from "@/utils/timelineEvents";
import { EMPTY_FILTERS, TYPE_MODULE, eventKey, filterEvents, groupDay, isSpecial, moduleOf, type Impact, type JourneyFilters, type JourneyItem } from "@/utils/journeyEvents";
import { fmtDate, nf } from "./HeroShared";

const R = { borderRadius: 4 } as const;
const field = "min-h-[40px] px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

/** XP recebido no período ≠ saldo da carteira: os dois aparecem separados. */
export function JourneyIndicators({ hub }: { hub: JourneyHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <IndicatorCard icon={<Sparkles size={22} />} label="XP no período" value={nf(i.xp)} hint={`nível ${i.level} · ${nf(i.totalXp)} XP total`} tone="purple" />
      <IndicatorCard icon={<Coins size={22} />} label="Moedas ganhas" value={`+${nf(i.coinsEarned)}`} hint={`saldo atual ${nf(i.balance)}`} />
      <IndicatorCard icon={<Activity size={22} />} label="Atividades" value={nf(i.activities)} hint="eventos com XP" tone="blue" />
      <IndicatorCard icon={<Trophy size={22} />} label="Conquistas" value={i.achievements} tone="orange" />
      <IndicatorCard icon={<Target size={22} />} label="Missões" value={i.missions} hint={`${i.quests} quest(s)`} tone="green" />
      <IndicatorCard icon={<Crown size={22} />} label="Marcos" value={i.levelUps} hint="subidas de nível" tone="pink" />
      <IndicatorCard icon={<Flame size={22} />} label="Consistência" value={`${i.consistencyPct}%`} hint={`${i.activeDays}/${i.spanDays} dias ativos`} tone="red" />
      <IndicatorCard icon={<BarChart3 size={22} />} label="Semana" value={i.weekDeltaPct == null ? "—" : `${i.weekDeltaPct > 0 ? "+" : ""}${i.weekDeltaPct}%`} hint="XP vs. semana anterior" tone="blue" />
    </div>
  );
}

export const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

export function JourneyFilterBar({ filters, onChange, events, days, onDays }: { filters: JourneyFilters; onChange: (f: JourneyFilters) => void; events: TimelineEvent[]; days: number; onDays: (d: number) => void }) {
  const modules = useMemo(() => [...new Set(events.map(moduleOf))].sort(), [events]);
  const types = useMemo(() => [...new Set(events.filter((e) => filters.module === "all" || moduleOf(e) === filters.module).map((e) => e.type))].sort(), [events, filters.module]);
  const set = (p: Partial<JourneyFilters>) => onChange({ ...filters, ...p });
  return (
    <div className="rpg-panel grid gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-6">
      <select aria-label="Período" className={field} style={R} value={days} onChange={(e) => onDays(Number(e.target.value))}>
        {PERIODS.map((p) => (
          <option key={p.days} value={p.days}>
            Últimos {p.label}
          </option>
        ))}
      </select>
      <select aria-label="Módulo" className={field} style={R} value={filters.module} onChange={(e) => set({ module: e.target.value, type: "all" })}>
        <option value="all">Todos os módulos</option>
        {modules.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <select aria-label="Tipo de evento" className={field} style={R} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
        <option value="all">Todos os tipos</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select aria-label="Impacto" className={field} style={R} value={filters.impact} onChange={(e) => set({ impact: e.target.value as Impact })}>
        <option value="all">Qualquer impacto</option>
        <option value="reward">Com recompensa</option>
        <option value="high">Alto impacto</option>
        <option value="special">Só eventos especiais</option>
      </select>
      <label className="relative">
        <span className="sr-only">Buscar na Crônica</span>
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
        <input value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder="Buscar…" className={clsx(field, "w-full pl-8")} style={R} />
      </label>
      <label className="flex min-h-[40px] items-center gap-2 text-sm text-rpg-text">
        <input type="checkbox" checked={filters.favorites} onChange={(e) => set({ favorites: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--rpg-gold))]" />
        Só favoritos
      </label>
    </div>
  );
}

function Reward({ xp, coins }: { xp?: number; coins?: number }) {
  if (!xp && !coins) return null;
  return (
    <span className="shrink-0 font-pixel text-[10px] whitespace-nowrap">
      {xp ? <span className="text-rpg-purple">+{xp} XP</span> : null}
      {xp && coins ? " " : ""}
      {coins ? <span className="text-rpg-gold-light">+{coins} 🪙</span> : null}
    </span>
  );
}

function EventRow({ e, fav, onFav }: { e: TimelineEvent; fav: boolean; onFav: (e: TimelineEvent) => void }) {
  const route = timelineEventRoute(e);
  const special = isSpecial(e);
  const time = new Date(e.at.includes("T") || e.at.length <= 10 ? e.at : `${e.at.replace(" ", "T")}Z`).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const body = (
    <>
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center border-2 text-base", special ? "border-rpg-gold bg-rpg-gold/15" : "border-rpg-border bg-rpg-bg-2")} style={R} aria-hidden>
        {e.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx("block truncate text-sm", special ? "font-semibold text-rpg-gold-light" : "text-rpg-text")}>{e.label}</span>
        <span className="block text-[10px] text-rpg-muted">
          {moduleOf(e)} · {e.at.length > 10 ? time : "dia inteiro"}
        </span>
      </span>
      <Reward xp={e.xp} coins={e.coins} />
    </>
  );
  return (
    <li className={clsx("flex items-center gap-2 py-1.5", special && "rpg-panel-gold -mx-1 border-l-2 border-rpg-gold px-1")}>
      {route ? (
        <Link to={route} className="flex min-w-0 flex-1 items-center gap-2 hover:brightness-110">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{body}</div>
      )}
      <button type="button" onClick={() => onFav(e)} aria-pressed={fav} aria-label={fav ? "Remover dos marcos favoritos" : "Favoritar como marco"} className="flex h-9 w-9 shrink-0 items-center justify-center">
        <Star size={15} className={fav ? "fill-rpg-gold text-rpg-gold" : "text-rpg-muted"} aria-hidden />
      </button>
    </li>
  );
}

function GroupRow({ g, favs, onFav }: { g: Extract<JourneyItem, { kind: "group" }>; favs: Set<string>; onFav: (e: TimelineEvent) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg-2 text-base" style={R} aria-hidden>
          {g.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-rpg-text">{g.label}</span>
          <span className="block text-[10px] text-rpg-muted">{TYPE_MODULE[g.type] ?? "Outros"} · agrupado</span>
        </span>
        <Reward xp={g.xp} coins={g.coins} />
        <ChevronDown size={15} className={clsx("shrink-0 text-rpg-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="ml-11 border-l border-rpg-border/60 pl-2">
          {g.events.map((e) => (
            <EventRow key={`${e.type}-${e.id}`} e={e} fav={favs.has(eventKey(e))} onFav={onFav} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Linha do tempo vertical: dia → itens (agrupados quando repetitivos), eventos especiais em destaque. */
export function JourneyTimeline({ events, xpByDay, favs, onFav, onMore, loadingMore }: { events: TimelineEvent[]; xpByDay: Record<string, number>; favs: Set<string>; onFav: (e: TimelineEvent) => void; onMore?: () => void; loadingMore?: boolean }) {
  const reduce = useReducedMotion();
  const days = groupTimelineByDay(events);
  if (!events.length) return <p className="rpg-panel py-10 text-center text-sm text-rpg-muted">Nenhum evento com esses filtros. Cada registro real vira um capítulo aqui.</p>;
  return (
    <div className="relative space-y-3">
      {days.map((d) => (
        <motion.section key={d.dayKey} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rpg-panel p-3" aria-label={timelineDayLabel(d.dayKey)}>
          <div className="mb-1 flex items-center gap-2">
            <CalendarDays size={14} className="text-rpg-gold" aria-hidden />
            <h3 className="font-pixel text-[11px] uppercase tracking-widest text-rpg-gold">{timelineDayLabel(d.dayKey)}</h3>
            {!!xpByDay[d.dayKey] && <span className="ml-auto font-pixel text-[10px] text-rpg-purple">{xpByDay[d.dayKey]} XP no dia</span>}
          </div>
          <ul className="divide-y divide-rpg-border/40">
            {groupDay(d.events).map((it) => (it.kind === "group" ? <GroupRow key={it.key} g={it} favs={favs} onFav={onFav} /> : <EventRow key={`${it.event.type}-${it.event.id}`} e={it.event} fav={favs.has(eventKey(it.event))} onFav={onFav} />))}
          </ul>
        </motion.section>
      ))}
      {onMore && (
        <div className="flex justify-center">
          <RPGButton variant="secondary" onClick={onMore} disabled={loadingMore}>
            {loadingMore ? "Carregando…" : "Ampliar período"}
          </RPGButton>
        </div>
      )}
    </div>
  );
}

/** Marcos: favoritos do usuário + níveis (do ledger) + eventos especiais do período. */
export function MarksPanel({ hub, events, onFav }: { hub: JourneyHub; events: TimelineEvent[]; onFav: (e: TimelineEvent) => void }) {
  const special = events.filter(isSpecial).slice(0, 20);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-3">
      <KitSection title="Marcos favoritos" icon={<Star size={16} />} tone="gold">
        {hub.marks.length === 0 ? (
          <p className="text-sm text-rpg-muted">Toque na estrela de qualquer evento para guardá-lo aqui.</p>
        ) : (
          <ul className="space-y-1.5">
            {hub.marks.map((m) => (
              <li key={m.eventKey} className="flex items-center gap-2 text-sm">
                <Star size={13} className="shrink-0 fill-rpg-gold text-rpg-gold" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-rpg-text">{m.label}</span>
                <span className="shrink-0 text-[10px] text-rpg-muted">{fmtDate(m.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </KitSection>
      <KitSection title="Eventos especiais do período" icon={<Sparkles size={16} />}>
        {special.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhum evento especial neste período.</p>
        ) : (
          <ul className="divide-y divide-rpg-border/40">
            {special.map((e) => (
              <EventRow key={`${e.type}-${e.id}`} e={e} fav={hub.marks.some((m) => m.eventKey === eventKey(e))} onFav={onFav} />
            ))}
          </ul>
        )}
      </KitSection>
      <KitSection title="Histórico de níveis" icon={<Crown size={16} />}>
        {hub.levels.length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhuma subida de nível ainda.</p>
        ) : (
          <ol className="space-y-1.5">
            {hub.levels.map((l) => (
              <li key={l.level} className="flex items-center gap-2 text-sm">
                <span className="font-pixel text-rpg-gold">Nv. {l.level}</span>
                <span className="min-w-0 flex-1 truncate text-rpg-muted">{nf(l.totalXp)} XP acumulados</span>
                <span className="shrink-0 text-[10px] text-rpg-muted">{fmtDate(l.dayKey)}</span>
              </li>
            ))}
          </ol>
        )}
      </KitSection>
    </div>
  );
}

/** Momentos memoráveis: só fotos do Diário que o usuário autorizou explicitamente. */
export function MomentsPanel({ hub, onToast }: { hub: JourneyHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const [manage, setManage] = useState(false);
  const candidates = useMomentCandidates(manage);
  const { setMoment } = useHeroActions();
  const toggle = (id: string, authorized: boolean) =>
    setMoment.mutate({ id, authorized }, { onSuccess: () => void candidates.refetch(), onError: () => onToast("Não foi possível atualizar a foto.", "error") });
  return (
    <KitSection
      title="Momentos memoráveis"
      icon={<ImageIcon size={16} />}
      tone="gold"
      action={
        <RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={() => setManage(true)}>
          Escolher fotos
        </RPGButton>
      }
    >
      {hub.moments.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma foto autorizada. As fotos do Diário são privadas: só aparecem aqui as que você escolher.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {hub.moments.map((m) => (
            <li key={m.id} className="overflow-hidden border-2 border-rpg-gold/60" style={R}>
              <img src={m.dataUri} alt={m.caption ?? `Momento de ${fmtDate(m.date)}`} loading="lazy" className="aspect-square w-full object-cover" />
              <p className="truncate px-1.5 py-1 text-[10px] text-rpg-muted">{m.caption ?? fmtDate(m.date)}</p>
            </li>
          ))}
        </ul>
      )}
      <Modal open={manage} onClose={() => setManage(false)} title="Fotos do Diário na Crônica">
        <p className="mb-2 text-xs text-rpg-muted">Marque as fotos que podem aparecer nos Momentos memoráveis. Nada é publicado — a Crônica é só sua.</p>
        {candidates.isLoading ? (
          <div className="h-32 animate-pulse rpg-bar" />
        ) : (candidates.data ?? []).length === 0 ? (
          <p className="text-sm text-rpg-muted">Nenhuma foto no Diário nos últimos 180 dias.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(candidates.data ?? []).map((c) => (
              <li key={c.id}>
                <label className={clsx("block cursor-pointer overflow-hidden border-2", c.authorized ? "border-rpg-gold" : "border-rpg-border")} style={R}>
                  <img src={c.dataUri} alt={c.caption ?? fmtDate(c.date)} loading="lazy" className="aspect-square w-full object-cover" />
                  <span className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-rpg-text">
                    <input type="checkbox" checked={c.authorized} onChange={(e) => toggle(c.id, e.target.checked)} disabled={setMoment.isPending} />
                    {fmtDate(c.date)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </KitSection>
  );
}

function SummaryCard({ title, s }: { title: string; s: JourneySummary }) {
  return (
    <div className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
      <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">{title}</p>
      <p className="mt-1 font-rpg text-xl font-bold text-rpg-text tabular-nums">{nf(s.xp)} XP</p>
      <p className="text-[11px] text-rpg-muted">
        {s.activities} atividade(s) · {s.activeDays} dia(s) ativo(s)
      </p>
      {s.top.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {s.top.map((t) => (
            <li key={t.source} className="flex justify-between gap-2 text-[11px]">
              <span className="truncate text-rpg-text">{t.label}</span>
              <span className="shrink-0 text-rpg-purple tabular-nums">{t.xp} XP</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SummariesPanel({ hub }: { hub: JourneyHub }) {
  const max = Math.max(1, ...hub.weekly.map((w) => w.xp));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Hoje" s={hub.summaries.day} />
        <SummaryCard title="Esta semana" s={hub.summaries.week} />
        <SummaryCard title="Este mês" s={hub.summaries.month} />
        <SummaryCard title="Este ano" s={hub.summaries.year} />
      </div>
      <KitSection title="Evolução semanal (XP)" icon={<BarChart3 size={16} />}>
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label="XP por semana nas últimas 8 semanas">
          {hub.weekly.map((w) => (
            <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-pixel text-[9px] text-rpg-muted tabular-nums">{w.xp || ""}</span>
              <span className="w-full bg-rpg-purple/80" style={{ height: `${Math.max(2, (w.xp / max) * 100)}px`, maxHeight: "100px" }} title={`${w.xp} XP · ${w.activities} atividades`} />
              <span className="text-[9px] text-rpg-muted tabular-nums">
                {w.week.slice(8, 10)}/{w.week.slice(5, 7)}
              </span>
            </div>
          ))}
        </div>
      </KitSection>
    </div>
  );
}

const MODES: Array<{ id: NarratorMode; label: string; icon: typeof Scroll }> = [
  { id: "rpg", label: "Narrativa RPG", icon: Scroll },
  { id: "objetivo", label: "Resumo objetivo", icon: BookOpen },
  { id: "analitico", label: "Relatório analítico", icon: BarChart3 },
];

/** Narrador da Jornada: texto determinístico sempre; IA opcional, marcada como gerada por IA. */
export function NarratorPanel({ from, to, onToast }: { from: string; to: string; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { narrate } = useHeroActions();
  const [mode, setMode] = useState<NarratorMode>("rpg");
  const [result, setResult] = useState<Narration | null>(null);
  const run = (useAi: boolean) => narrate.mutate({ from, to, mode, useAi }, { onSuccess: setResult, onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível narrar agora.", "error") });
  return (
    <KitSection title="Narrador da Jornada" icon={<Wand2 size={16} />} tone="legendary">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Modo do narrador">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={clsx("inline-flex min-h-[40px] items-center gap-1.5 border-2 px-3 text-sm", mode === m.id ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            <m.icon size={14} aria-hidden /> {m.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <RPGButton variant="secondary" onClick={() => run(false)} disabled={narrate.isPending}>
          Ler os fatos (sem IA)
        </RPGButton>
        <RPGButton variant="primary" onClick={() => run(true)} disabled={narrate.isPending}>
          <Sparkles size={14} aria-hidden /> {narrate.isPending ? "Narrando…" : "Narrar com IA"}
        </RPGButton>
      </div>
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2 border-2 border-rpg-border bg-rpg-bg-2/60 p-3" style={R}>
            <div className="flex flex-wrap items-center gap-1.5">
              <RPGBadge tone={result.ai ? "purple" : "blue"}>{result.ai ? "Gerado por IA" : "Texto automático (sem IA)"}</RPGBadge>
              <span className="text-[11px] text-rpg-muted">
                {fmtDate(result.from)} a {fmtDate(result.to)}
              </span>
            </div>
            {result.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-rpg-text">
                {p}
              </p>
            ))}
            <details className="text-[11px] text-rpg-muted">
              <summary className="cursor-pointer">Fatos usados ({result.facts.length})</summary>
              <ul className="mt-1 list-disc pl-4">
                {result.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </details>
            <p className="text-[10px] text-rpg-muted">{result.disclaimer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </KitSection>
  );
}

export { EMPTY_FILTERS, eventKey, filterEvents };
