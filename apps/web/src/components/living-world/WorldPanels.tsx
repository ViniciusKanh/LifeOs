import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookOpen, Bot, ChevronRight, Flag, CalendarDays, CheckCircle2, Coins, Dumbbell, Flame, Gift, Loader2, MessageSquare, NotebookPen, Pause, Play, Plus, ScrollText, Sparkles, Sprout, Swords, Wand2, Zap } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { AgentPortrait } from "./AgentPortrait";
import type { WorldAgent, WorldState, WorldTimelineEvent } from "@/services/livingWorldService";
import { BUILDINGS } from "./engine/worldMap";
import type { PlaceKey, PlaceMarker } from "./engine/village";

const R = { borderRadius: 4 };

export const ROOM_LABEL: Record<string, string> = {
  biblioteca: "Biblioteca",
  escritorio: "Escritório",
  academia: "Academia",
  guilda: "Guilda",
  casa: "Casa",
  jardim: "Jardim",
  praca: "Praça Central",
};

export const BUILDING_LABEL: Record<string, string> = Object.fromEntries(BUILDINGS.map((b) => [b.key, b.name]));

/** Nome de qualquer lugar do mundo (ambiente do núcleo ou construção da vila). */
export const placeLabel = (k: string) => ROOM_LABEL[k] ?? BUILDING_LABEL[k] ?? k;

const TONE_ORDER: Record<PlaceMarker["tone"], number> = { danger: 0, warn: 1, info: 2 };
const TONE_CLASS: Record<PlaceMarker["tone"], string> = {
  danger: "border-rpg-red/70 bg-rpg-red/15 text-rpg-red",
  warn: "border-rpg-gold/70 bg-rpg-gold/15 text-rpg-gold-light",
  info: "border-rpg-blue/70 bg-rpg-blue/15 text-rpg-blue",
};

/* ───────────── Pendências do reino ───────────── */

/** Lista as mesmas pendências reais que aparecem como brasões sobre as casas do mapa. */
export function KingdomPanel({ markers, onOpen }: { markers: Partial<Record<PlaceKey, PlaceMarker>>; onOpen: (k: PlaceKey) => void }) {
  const list = (Object.entries(markers) as Array<[PlaceKey, PlaceMarker]>).sort((a, b) => TONE_ORDER[a[1].tone] - TONE_ORDER[b[1].tone]);
  return (
    <Panel title="Pendências do reino" icon={<Flag size={15} />} action={list.length ? <RPGBadge tone="gold">{list.length}</RPGBadge> : undefined}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma pendência hoje — o reino está em paz.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map(([k, m]) => (
            <li key={k}>
              <button type="button" onClick={() => onOpen(k)} className="rpg-tile flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
                <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center border font-rpg text-base font-black", TONE_CLASS[m.tone])} style={R} aria-hidden>
                  {m.tone === "info" ? "?" : "!"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-rpg-text">{placeLabel(k)}</span>
                  <span className="block truncate text-[11px] text-rpg-muted">{m.text}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-rpg-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function Panel({ title, icon, action, children, className }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rpg-ornate min-w-0 p-3", className)} aria-label={title}>
      <div className="mb-2.5 flex items-center gap-2 border-b border-rpg-gold/25 pb-2">
        <span className="text-rpg-gold-light drop-shadow-[0_0_6px_rgba(241,198,106,0.45)]" aria-hidden>
          {icon}
        </span>
        <h2 className="rpg-ornate-title font-rpg min-w-0 flex-1 truncate text-[15px] font-bold uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function elapsedLabel(fromIso: string, now = Date.now()): string {
  const iso = fromIso.includes("T") ? fromIso : `${fromIso.replace(" ", "T")}Z`;
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/* ───────────── Atividade atual ───────────── */

export function ActivityPanel({ world, busy, onPause, onComplete, onStart }: { world: WorldState; busy: boolean; onPause: () => void; onComplete: () => void; onStart: () => void }) {
  const a = world.activity;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Panel title="Atividade atual" icon={<Play size={15} />}>
      {a ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-gradient-to-b from-rpg-purple/40 to-rpg-bg text-rpg-gold-light shadow-[inset_0_0_10px_rgba(168,117,245,0.5)]" style={R}>
              {a.room === "biblioteca" ? <BookOpen size={22} /> : <Swords size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-rpg text-base font-bold leading-tight text-rpg-text" title={a.title}>
                {a.title}
              </p>
              <p className="truncate text-[11px] text-rpg-muted">
                {a.category} · {ROOM_LABEL[a.room]} · em andamento {elapsedLabel(a.since)}
              </p>
            </div>
          </div>
          {a.progress && <RPGProgressBar label="Etapas" value={a.progress.done} max={a.progress.total} valueLabel={`${a.progress.done}/${a.progress.total}`} tone="purple" />}
          {a.reward && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Recompensa ao concluir">
              <span className="inline-flex items-center gap-1 border border-rpg-purple/50 bg-rpg-purple/10 px-1.5 py-0.5 text-[11px] font-semibold text-rpg-text" style={R}>
                <Sparkles size={11} className="text-rpg-gold-light" aria-hidden /> +{a.reward.xp} XP
              </span>
              <span className="inline-flex items-center gap-1 border border-rpg-gold/50 bg-rpg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-rpg-gold-light" style={R}>
                <Coins size={11} aria-hidden /> +{a.reward.coins} moedas
              </span>
            </div>
          )}
          <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-1.5">
            <RPGButton variant="secondary" className="min-h-[38px] px-1 text-xs" onClick={onPause} disabled={busy}>
              <Pause size={12} aria-hidden /> Pausar
            </RPGButton>
            <RPGButton variant="success" className="min-h-[38px] px-1 text-sm font-bold" onClick={onComplete} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CheckCircle2 size={13} aria-hidden />} Concluir
            </RPGButton>
            <Link to={`/tarefas?task=${a.taskId}`} className="rpg-btn rpg-btn-ghost min-h-[38px] px-1 text-xs">
              Detalhes
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-rpg-muted">Nenhuma missão em andamento. O avatar só vai para uma estação quando há uma atividade real.</p>
          <RPGButton variant="primary" className="w-full min-h-[36px] text-xs" onClick={onStart}>
            <Play size={12} aria-hidden /> Iniciar uma missão
          </RPGButton>
        </div>
      )}
    </Panel>
  );
}

/* ───────────── Agentes ───────────── */

export function agentState(a: WorldAgent, pending: boolean): { label: string; tone: "muted" | "blue" | "green" | "red" } {
  if (pending || a.lastRun?.status === "running") return { label: "Trabalhando", tone: "blue" };
  if (a.lastRun?.status === "failed") return { label: "Última execução falhou", tone: "red" };
  if (a.lastRun?.status === "done") return { label: `Disponível · ${elapsedLabel(a.lastRun.finishedAt ?? a.lastRun.startedAt)}`, tone: "green" };
  return { label: "Disponível", tone: "muted" };
}

export function AgentsPanel({ agents, pendingKey, onOpen }: { agents: WorldAgent[]; pendingKey: string | null; onOpen: (key: string) => void }) {
  return (
    <Panel title="Agentes do LifeOS" icon={<Bot size={16} />}>
      {agents.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum agente configurado.</p>
      ) : (
        <ul className="space-y-1.5">
          {agents.map((a) => {
            const st = agentState(a, pendingKey === a.key);
            const working = st.tone === "blue";
            return (
              <li key={a.key}>
                <button type="button" onClick={() => onOpen(a.key)} className="rpg-tile flex w-full items-center gap-2.5 p-1.5 text-left" aria-label={`${a.name}: ${st.label}`}>
                  <span className={clsx("relative shrink-0 border-2 bg-rpg-bg", working && "shadow-[0_0_10px_rgba(89,169,248,0.7)]")} style={{ ...R, borderColor: a.color }}>
                    <AgentPortrait agentKey={a.key} color={a.color} size={40} working={working} />
                    <span className={clsx("absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-rpg-bg", working ? "animate-pulse bg-rpg-blue" : st.tone === "red" ? "bg-rpg-red" : "bg-rpg-green")} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-rpg text-sm font-bold text-rpg-text">{a.name}</span>
                    <span className="block truncate text-[11px] text-rpg-muted">{a.specialty}</span>
                    <span className={clsx("mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide", st.tone === "red" ? "text-rpg-red" : working ? "text-rpg-blue" : st.tone === "green" ? "text-rpg-green" : "text-rpg-muted")}>
                      {working && <Loader2 size={10} className="animate-spin" aria-hidden />} {st.label}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-rpg-gold" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ───────────── Ações rápidas ───────────── */

export type QuickAction = "mission" | "plan" | "new" | "habit" | "review" | "agent";

export function QuickActions({ onAction }: { onAction: (a: QuickAction) => void }) {
  const items: Array<[QuickAction, string, ReactNode, string]> = [
    ["mission", "Iniciar Missão", <Swords key="i" size={18} />, "text-rpg-red"],
    ["plan", "Planejar Semana", <CalendarDays key="i" size={18} />, "text-rpg-blue"],
    ["new", "Nova Missão", <ScrollText key="i" size={18} />, "text-rpg-gold"],
    ["habit", "Registrar Hábito", <CheckCircle2 key="i" size={18} />, "text-rpg-green"],
    ["review", "Revisão Rápida", <NotebookPen key="i" size={18} />, "text-rpg-purple"],
    ["agent", "Conversar com Agente", <MessageSquare key="i" size={18} />, "text-rpg-pink"],
  ];
  return (
    <Panel title="Ações rápidas" icon={<Zap size={16} />}>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([k, label, icon, tone]) => (
          <button key={k} type="button" onClick={() => onAction(k)} className="rpg-tile flex min-h-[70px] flex-col items-center justify-center gap-1.5 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-rpg-text">
            <span className={clsx(tone, "drop-shadow-[0_0_6px_currentColor]")} aria-hidden>
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* ───────────── Linha do tempo ───────────── */

export const EVENT_CATEGORIES: Array<[string | null, string]> = [
  [null, "Tudo"],
  ["missoes", "Missões"],
  ["habitos", "Hábitos"],
  ["saude", "Saúde"],
  ["agentes", "Agentes"],
  ["recompensas", "Recompensas"],
  ["diario", "Diário"],
  ["mundo", "Mundo"],
];

const CAT_ICON: Record<string, ReactNode> = {
  missoes: <Swords size={15} />,
  habitos: <Sprout size={15} />,
  saude: <Dumbbell size={15} />,
  agentes: <Bot size={15} />,
  recompensas: <Gift size={15} />,
  diario: <NotebookPen size={15} />,
  revisoes: <ScrollText size={15} />,
  mundo: <Wand2 size={15} />,
  outros: <Sparkles size={15} />,
};

export function EventRow({ e, compact }: { e: WorldTimelineEvent; compact?: boolean }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-rpg-gold/50 bg-rpg-bg text-rpg-gold-light" style={R} aria-hidden>
        {CAT_ICON[e.category] ?? CAT_ICON.outros}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-rpg-text" title={e.title}>
          {e.title}
        </span>
        <span className="block truncate text-[11px] text-rpg-muted">
          {elapsedLabel(e.at)}
          {e.xp ? ` · +${e.xp} XP` : ""}
          {!compact && e.detail ? ` · ${e.detail}` : ""}
        </span>
      </span>
    </>
  );
  const cls = "rpg-tile flex min-w-0 items-center gap-2 p-2";
  return e.link ? (
    <Link to={e.link} className={clsx(cls, "hover:border-rpg-gold")} style={R}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={R}>
      {body}
    </div>
  );
}

export function TimelineStrip({ events, filter, onFilter, onHistory, loading }: { events: WorldTimelineEvent[]; filter: string | null; onFilter: (c: string | null) => void; onHistory: () => void; loading: boolean }) {
  return (
    <Panel
      title="O que está rolando no seu mundo"
      icon={<Flame size={15} />}
      action={
        <button type="button" className="shrink-0 text-xs text-rpg-blue hover:underline" onClick={onHistory}>
          Ver histórico →
        </button>
      }
    >
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrar acontecimentos">
        {EVENT_CATEGORIES.map(([k, l]) => (
          <button key={l} type="button" aria-pressed={filter === k} onClick={() => onFilter(k)} className={clsx("rpg-tile shrink-0 px-2.5 py-1 text-[11px] font-semibold", filter === k ? "text-rpg-gold-light" : "text-rpg-muted")}>
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="h-14 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : events.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nada por aqui ainda. Conclua uma missão, registre um hábito ou chame um agente.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {events.slice(0, 8).map((e) => (
            <EventRow key={e.id} e={e} compact />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ───────────── Cabeçalho ───────────── */

/** Selo de nível sobre o mapa (moedas ficam só na barra global, sem duplicar). */
export function WorldHUD({ world }: { world: WorldState }) {
  const p = world.profile;
  return (
    <div className="rpg-ornate min-w-[190px] px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-rpg text-sm font-bold text-rpg-gold-light">Nível {p.level}</span>
        <span className="text-[11px] tabular-nums text-rpg-muted">
          {p.xpIntoLevel.toLocaleString("pt-BR")} / {p.xpForNextLevel.toLocaleString("pt-BR")} XP
        </span>
      </div>
      <RPGProgressBar className="mt-1" label="XP do nível" showLabel={false} value={p.xpIntoLevel} max={Math.max(1, p.xpForNextLevel)} tone="purple" />
      {p.xpToday > 0 && <p className="mt-0.5 text-[10px] text-rpg-green">+{p.xpToday} XP hoje</p>}
    </div>
  );
}

/** Notificação temática de recompensa (só com valores reais devolvidos pelo LifeOS). */
export function RewardBanner({ reward, onDone }: { reward: { title: string; xp: number | null; coins: number | null } | null; onDone: () => void }) {
  useEffect(() => {
    if (!reward) return;
    const id = window.setTimeout(onDone, 3600);
    return () => window.clearTimeout(id);
  }, [reward, onDone]);
  if (!reward) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 motion-safe:animate-[fadeIn_0.25s_ease-out]">
      <div className="rpg-ornate flex items-center gap-3 px-4 py-2.5 shadow-[0_0_30px_rgba(241,198,106,0.35)]">
        <span className="flex h-10 w-10 items-center justify-center border-2 border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" style={R} aria-hidden>
          <Gift size={20} />
        </span>
        <div>
          <p className="font-rpg text-sm font-bold text-rpg-gold-light">{reward.title}</p>
          <p className="flex items-center gap-2 text-xs text-rpg-text">
            {reward.xp ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles size={12} className="text-rpg-purple" aria-hidden /> +{reward.xp} XP
              </span>
            ) : null}
            {reward.coins ? (
              <span className="inline-flex items-center gap-1">
                <Coins size={12} className="text-rpg-gold" aria-hidden /> +{reward.coins} moedas
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
