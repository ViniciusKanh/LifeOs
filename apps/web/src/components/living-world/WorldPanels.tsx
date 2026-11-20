import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookOpen, Bot, CalendarDays, CheckCircle2, Coins, Dumbbell, Flame, Gift, Loader2, MessageSquare, NotebookPen, Pause, Play, Plus, ScrollText, Sparkles, Sprout, Swords, Wand2, Zap } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import type { WorldAgent, WorldState, WorldTimelineEvent } from "@/services/livingWorldService";

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

export function Panel({ title, icon, action, children, className }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rpg-panel min-w-0 p-3", className)} aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-rpg-gold" aria-hidden>
          {icon}
        </span>
        <h2 className="rpg-title min-w-0 flex-1 truncate text-sm font-bold uppercase">{title}</h2>
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
          <div className="flex items-start gap-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-rpg-purple bg-rpg-purple/15 text-rpg-purple" style={R}>
              {a.room === "biblioteca" ? <BookOpen size={20} /> : <Swords size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-rpg-text" title={a.title}>
                {a.title}
              </p>
              <p className="truncate text-[11px] text-rpg-muted">
                {a.category} · {ROOM_LABEL[a.room]} · em andamento {elapsedLabel(a.since)}
              </p>
            </div>
          </div>
          {a.progress && <RPGProgressBar label="Etapas" value={a.progress.done} max={a.progress.total} valueLabel={`${a.progress.done}/${a.progress.total}`} tone="purple" />}
          {a.reward && (
            <p className="flex items-center gap-1 text-[11px] text-rpg-gold-light">
              <Sparkles size={12} aria-hidden /> +{a.reward.xp} XP · +{a.reward.coins} moedas ao concluir (pela dificuldade)
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <RPGButton variant="secondary" className="min-h-[36px] px-1 text-xs" onClick={onPause} disabled={busy}>
              <Pause size={12} aria-hidden /> Pausar
            </RPGButton>
            <RPGButton variant="success" className="min-h-[36px] px-1 text-xs" onClick={onComplete} disabled={busy}>
              {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <CheckCircle2 size={12} aria-hidden />} Concluir
            </RPGButton>
            <Link to={`/tarefas?task=${a.taskId}`} className="rpg-btn rpg-btn-ghost min-h-[36px] px-1 text-xs">
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
    <Panel title="Agentes do LifeOS" icon={<Bot size={15} />}>
      {agents.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum agente configurado.</p>
      ) : (
        <ul className="space-y-1.5">
          {agents.map((a) => {
            const st = agentState(a, pendingKey === a.key);
            const working = st.tone === "blue";
            return (
              <li key={a.key}>
                <button type="button" onClick={() => onOpen(a.key)} className="flex w-full items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-left hover:border-rpg-gold" style={R}>
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center border-2" style={{ ...R, borderColor: a.color, color: a.color }}>
                    <Bot size={18} aria-hidden />
                    <span className={clsx("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full", working ? "animate-pulse bg-rpg-blue" : st.tone === "red" ? "bg-rpg-red" : "bg-rpg-green")} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rpg-text">{a.name}</span>
                    <span className={clsx("block truncate text-[11px]", st.tone === "red" ? "text-rpg-red" : working ? "text-rpg-blue" : "text-rpg-muted")}>{st.label}</span>
                    {working && <span className="mt-1 block h-1 overflow-hidden bg-rpg-bg" aria-hidden><span className="block h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] bg-rpg-blue" /></span>}
                  </span>
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
    <Panel title="Ações rápidas" icon={<Zap size={15} />}>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map(([k, label, icon, tone]) => (
          <button key={k} type="button" onClick={() => onAction(k)} className="flex min-h-[64px] flex-col items-center justify-center gap-1 border border-rpg-border bg-rpg-bg-2/60 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-rpg-text hover:border-rpg-gold" style={R}>
            <span className={tone} aria-hidden>
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
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-rpg-border bg-rpg-bg text-rpg-gold" style={R} aria-hidden>
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
  const cls = "flex min-w-0 items-center gap-2 border border-rpg-border/70 bg-rpg-bg-2/50 p-2";
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
          <button key={l} type="button" aria-pressed={filter === k} onClick={() => onFilter(k)} className={clsx("shrink-0 border px-2 py-1 text-[11px] font-semibold", filter === k ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={R}>
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

export function WorldHUD({ world }: { world: WorldState }) {
  const p = world.profile;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[180px] border-2 border-rpg-gold/60 bg-rpg-bg-2 px-3 py-1.5" style={R}>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-bold text-rpg-text">Nível {p.level}</span>
          <span className="tabular-nums text-rpg-muted">
            {p.xpIntoLevel.toLocaleString("pt-BR")} / {p.xpForNextLevel.toLocaleString("pt-BR")} XP
          </span>
        </div>
        <RPGProgressBar className="mt-1" label="XP do nível" showLabel={false} value={p.xpIntoLevel} max={Math.max(1, p.xpForNextLevel)} tone="purple" />
      </div>
      <RPGBadge tone="gold" icon={<Coins size={12} aria-hidden />}>
        {p.coins.toLocaleString("pt-BR")}
      </RPGBadge>
      <RPGBadge tone="purple" icon={<Plus size={12} aria-hidden />}>
        {p.xpToday} XP hoje
      </RPGBadge>
    </div>
  );
}
