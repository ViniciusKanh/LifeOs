import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  CloudSun,
  Droplets,
  Dumbbell,
  Info,
  Lightbulb,
  Moon,
  Smile,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { AnimatedNumber } from "@/components/charts/motion/AnimatedNumber";
import { Sparkline } from "@/components/charts/motion/Sparkline";
import { RingProgress } from "@/components/charts/motion/RingProgress";
import type { AttentionItem, DayEntry } from "@/utils/dashboardMetrics";
import type { FocusTask, GoalForecastItem, SignalCard } from "@/types";

/* ============================================================
   Blocos visuais do Dashboard (v2). Só apresentação: os números
   chegam prontos de DashboardPage/utils/dashboardMetrics.ts.
   ============================================================ */

type Tone = "blue" | "purple" | "green" | "pink" | "teal" | "amber";

export function SectionTitle({ icon, title, action, tone = "text-brand-600" }: { icon: ReactNode; title: string; action?: { label: string; to: string }; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="flex items-center gap-2 font-display font-semibold text-[15px]">
        <span className={tone}>{icon}</span>
        {title}
      </p>
      {action && (
        <Link to={action.to} className="text-xs font-medium text-brand-600 dark:text-brand-100 hover:underline shrink-0">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/* ---------------- Hero ---------------- */

export function DashboardHero({
  firstName,
  subtitle,
  overall,
  isLoading,
  delta,
  history,
}: {
  firstName: string;
  subtitle: string;
  overall: number;
  isLoading: boolean;
  delta: { delta: number; since: string } | null;
  history: number[];
}) {
  const up = (delta?.delta ?? 0) >= 0;
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6 border-brand-500/15 bg-gradient-to-br from-paper-raised via-brand-50/70 to-signal/10 dark:from-ink-raised dark:via-brand-700/10 dark:to-signal/5">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 w-72 h-72 rounded-full bg-brand-500/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex-1 min-w-0">
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-display font-bold text-3xl sm:text-4xl tracking-tight">
            Olá, {firstName}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="text-sm sm:text-base text-slate mt-1.5">
            {subtitle}
          </motion.p>
        </div>
        <Link
          to="/analytics"
          className="flex items-center gap-4 rounded-2xl bg-paper-raised/80 dark:bg-ink-raised/80 backdrop-blur border border-paper-border dark:border-ink-border px-4 py-3 shadow-card hover:border-brand-500/40 transition-colors self-start lg:self-auto"
        >
          <IconBadge tone="green" size={44} icon={up ? <TrendingUp size={20} /> : <TrendingDown size={20} />} />
          <div>
            <p className="text-[11px] text-slate">Life Score</p>
            <p className="font-display font-bold text-4xl leading-none">{isLoading ? "—" : <AnimatedNumber value={overall} />}</p>
          </div>
          <div className="text-xs leading-tight">
            {delta ? (
              <>
                <p className={`font-semibold ${up ? "text-growth" : "text-drop"}`}>
                  {up ? "▲" : "▼"} {Math.abs(delta.delta)} pts
                </p>
                <p className="text-slate">vs. semana anterior</p>
              </>
            ) : (
              <p className="text-slate max-w-[110px]">Evolução aparece com mais dias de uso</p>
            )}
          </div>
          <Sparkline values={history} width={110} height={44} className="hidden sm:block text-brand-500" />
        </Link>
      </div>
    </Card>
  );
}

/* ---------------- KPIs ---------------- */

export interface KpiData {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: ReactNode;
  tone: Tone;
  to: string;
  pct?: number;
}

export function KpiStrip({ items }: { items: KpiData[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {items.map((k, i) => (
        <motion.div key={k.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={i === items.length - 1 ? "col-span-2 md:col-span-1" : ""}>
          <Link to={k.to} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Card className="h-full p-4 flex items-center gap-3 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-brand-500/30">
              <IconBadge tone={k.tone} size={44} icon={k.icon} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate">{k.label}</p>
                <p className="font-display font-bold text-xl leading-tight truncate">{k.value}</p>
                <p className="text-[11px] text-slate truncate">{k.caption}</p>
                {k.pct !== undefined && (
                  <div className="h-1 mt-1.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                    <motion.div className="h-full rounded-full bg-current text-growth" initial={{ width: 0 }} animate={{ width: `${Math.min(100, k.pct)}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                  </div>
                )}
              </div>
              <ChevronRight size={16} className="text-slate shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Card>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------------- Próximo melhor passo ---------------- */

export function NextBestStep({
  task,
  estimateMinutes,
  onComplete,
  isCompleting,
}: {
  task: FocusTask | null;
  estimateMinutes: number | null;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  return (
    <Card className="p-5 h-full">
      <SectionTitle icon={<Sparkles size={17} />} title="Próximo melhor passo" action={{ label: "Ver todas", to: "/tarefas" }} />
      {!task ? (
        <div className="rounded-2xl bg-growth/5 border border-growth/20 p-5 flex items-center gap-3">
          <CheckCircle2 size={22} className="text-growth shrink-0" />
          <p className="text-sm">Nenhuma tarefa em aberto. Aproveite para planejar a semana ou registrar seu dia no Diário.</p>
        </div>
      ) : (
        <motion.div layout className="rounded-2xl bg-gradient-to-br from-brand-50 to-transparent dark:from-brand-700/15 border border-brand-500/15 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <IconBadge tone="purple" size={40} icon={<Target size={18} />} />
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{task.title}</p>
              {task.reasons.length > 0 && <p className="text-xs text-slate mt-0.5">{task.reasons.slice(0, 2).join(" · ")}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            <MiniFact icon={<CalendarClock size={15} />} label="Prazo" value={task.dueDate ? new Date(`${task.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "Sem prazo"} />
            <MiniFact icon={<Clock size={15} />} label="Tempo estimado" value={estimateMinutes ? `${estimateMinutes} min` : "Não estimado"} />
            <MiniFact icon={<Zap size={15} />} label="Prioridade" value={task.priority} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button
              onClick={onComplete}
              disabled={isCompleting}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 shadow-glow-brand hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <CheckCircle2 size={16} /> {isCompleting ? "Concluindo..." : "Marcar como concluída"}
            </button>
            <Link to="/capacity-planner" className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-brand-500/30 text-brand-700 dark:text-brand-100 hover:bg-brand-500/5 transition-colors">
              <CalendarClock size={16} /> Replanejar
            </Link>
          </div>
        </motion.div>
      )}
    </Card>
  );
}

function MiniFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-paper-raised/70 dark:bg-ink-raised/60 px-3 py-2">
      <span className="text-brand-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-slate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

/* ---------------- Signals agora ---------------- */

const SIGNAL_ICON: Record<string, LucideIcon> = {
  sleep: Moon,
  energy: Zap,
  mood: Smile,
  water: Droplets,
  exercise: Dumbbell,
  workout: Dumbbell,
  reading: BookOpen,
  agenda: CalendarClock,
  weather: CloudSun,
};

const SIGNAL_STATUS: Record<SignalCard["status"], { label: string; className: string }> = {
  ok: { label: "normal", className: "bg-growth/10 text-growth" },
  attention: { label: "atenção", className: "bg-signal/15 text-signal-deep" },
  insufficient_data: { label: "sem dados", className: "bg-slate/10 text-slate" },
  not_connected: { label: "não conectado", className: "bg-slate/10 text-slate" },
};

export function SignalsNow({ signals, isLoading }: { signals: SignalCard[]; isLoading: boolean }) {
  return (
    <Card className="p-5 h-full">
      <SectionTitle icon={<Activity size={17} />} title="Signals agora" action={{ label: "Ver todos", to: "/signals" }} tone="text-cat-purple" />
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-paper dark:bg-ink animate-pulse" />)}</div>
      ) : signals.length === 0 ? (
        <p className="text-sm text-slate">Registre sono, humor ou água para ver seus sinais aqui.</p>
      ) : (
        <ul className="divide-y divide-paper-border/70 dark:divide-ink-border/60 rpg:divide-rpg-border/50 rpg:lg:grid rpg:lg:grid-cols-2 rpg:lg:gap-x-6 rpg:lg:divide-y-0">
          {signals.slice(0, 6).map((s, i) => {
            const Icon = SIGNAL_ICON[s.key] ?? Activity;
            const st = SIGNAL_STATUS[s.status];
            return (
              <motion.li key={s.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                <Link to="/signals" className="flex items-center gap-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] rounded-lg px-1">
                  <Icon size={16} className="text-slate shrink-0" />
                  <span className="text-sm flex-1 truncate">{s.label}</span>
                  <span className="text-sm font-semibold w-16 text-right">
                    {s.value === null ? "—" : `${s.value}${s.unit ? ` ${s.unit}` : ""}`}
                  </span>
                  <span className={`w-24 text-center rounded-full px-2 py-0.5 text-[11px] font-medium rpg:rounded-[3px] rpg:font-pixel ${st.className}`}>{st.label}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Precisa da sua atenção ---------------- */

const ATTENTION_TONE: Record<AttentionItem["tone"], { box: string; icon: string }> = {
  critical: { box: "border-drop/25 bg-drop/[0.04]", icon: "text-drop bg-drop/10" },
  warning: { box: "border-signal/30 bg-signal/[0.05]", icon: "text-signal-deep bg-signal/15" },
  info: { box: "border-cat-blue/25 bg-cat-blue/[0.04]", icon: "text-cat-blue bg-cat-blue/10" },
};

const ATTENTION_ICON: Record<string, LucideIcon> = { deadlines: CalendarClock, water: Droplets, goals: Target, habits: CheckCircle2 };

export function AttentionPanel({ items, onWater }: { items: AttentionItem[]; onWater: () => void }) {
  if (items.length === 0) {
    return (
      <Card className="p-4 flex items-center gap-3 border-growth/25 bg-growth/[0.04]">
        <CheckCircle2 size={20} className="text-growth shrink-0" />
        <p className="text-sm">Nada pedindo atenção agora — prazos, água e metas estão em dia.</p>
      </Card>
    );
  }
  return (
    <Card className="p-5 border-drop/20 bg-gradient-to-br from-drop/[0.03] to-transparent">
      <SectionTitle icon={<AlertTriangle size={17} />} title="Precisa da sua atenção" tone="text-drop" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((a, i) => {
          const tone = ATTENTION_TONE[a.tone];
          const Icon = ATTENTION_ICON[a.id] ?? AlertTriangle;
          const actionClass = "shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border hover:border-brand-500/40 transition-colors";
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} className={`flex items-center gap-3 rounded-xl border p-3 ${tone.box}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone.icon}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{a.title}</p>
                <p className="text-xs text-slate line-clamp-2">{a.description}</p>
              </div>
              {a.action === "water" ? (
                <button onClick={onWater} className={actionClass}>
                  {a.actionLabel}
                </button>
              ) : (
                a.href && (
                  <Link to={a.href} className={actionClass}>
                    {a.actionLabel} <ArrowRight size={12} />
                  </Link>
                )
              )}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- Seu dia ---------------- */

export function DayTimelineCard({ entries, nowLabel }: { entries: DayEntry[]; nowLabel: string }) {
  const nowIndex = entries.findIndex((e) => e.time !== null && e.time > nowLabel);
  return (
    <Card className="p-5 h-full">
      <SectionTitle icon={<CalendarClock size={17} />} title="Seu dia" action={{ label: "Ver agenda", to: "/calendario" }} />
      {entries.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">Nada na agenda nem registrado hoje ainda.</p>
      ) : (
        <ol className="relative ml-2 border-l border-dashed border-paper-border dark:border-ink-border max-h-[340px] overflow-y-auto pr-1 [scrollbar-width:thin]">
          {entries.map((e, i) => (
            <li key={e.id}>
              {i === (nowIndex === -1 ? entries.length : nowIndex) && <NowMarker />}
              <motion.div initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.03 * i }}>
                <Link to={e.href ?? "/hoje"} className="flex items-center gap-3 py-2 pl-4 pr-1 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <span className="text-[11px] text-slate w-12 shrink-0">{e.time ?? "Dia todo"}</span>
                  {e.done ? <CheckCircle2 size={18} className="text-growth shrink-0" /> : <Circle size={18} className="text-slate shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium truncate ${e.done ? "text-slate" : ""}`}>{e.title}</span>
                    <span className="block text-[11px] text-slate truncate">{e.subtitle}</span>
                  </span>
                  <ChevronRight size={14} className="text-slate shrink-0" />
                </Link>
              </motion.div>
              {i === entries.length - 1 && nowIndex === -1 && <NowMarker />}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function NowMarker() {
  return (
    <div className="relative flex items-center gap-2 py-1.5 pl-4" aria-label="Agora">
      <motion.span
        className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-brand-500"
        animate={{ boxShadow: ["0 0 0 0 rgba(124,77,255,0.5)", "0 0 0 8px rgba(124,77,255,0)"] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      <span className="text-[11px] font-semibold text-brand-600">Agora</span>
      <span className="flex-1 border-t border-dashed border-brand-500/40" />
    </div>
  );
}

/* ---------------- Insight ---------------- */

export function InsightCard({ text, basis }: { text: string | null; basis: string | null }) {
  return (
    <Card className="p-5">
      <SectionTitle icon={<Lightbulb size={17} />} title="Insight do LifeOS" action={{ label: "Ver análise", to: "/analytics" }} tone="text-signal-deep" />
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-50 to-transparent dark:from-brand-700/15 p-4 flex items-center gap-4">
        <IconBadge tone="purple" size={44} icon={<Lightbulb size={20} />} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{text ?? "Continue registrando sua rotina — os padrões aparecem com alguns dias de dados."}</p>
          {basis && <p className="text-[11px] text-slate mt-1">{basis}</p>}
        </div>
        <div className="hidden sm:flex items-end gap-1 h-12" aria-hidden>
          {[35, 50, 45, 70, 90].map((h, i) => (
            <motion.span key={i} className="w-2.5 rounded-t bg-brand-500/30" initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: 0.1 * i }} />
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Metas e prazos ---------------- */

export function GoalsCard({ goals }: { goals: GoalForecastItem[] }) {
  return (
    <Card className="p-5 h-full flex flex-col">
      <SectionTitle icon={<Target size={17} />} title="Metas e prazos" action={{ label: "Ver todas", to: "/metas" }} tone="text-drop" />
      {goals.length === 0 ? (
        <p className="text-sm text-slate flex-1">Nenhuma meta ativa com progresso mensurável.</p>
      ) : (
        <ul className="space-y-2 flex-1">
          {goals.map((g, i) => {
            const pct = Math.round(g.progressPct ?? 0);
            return (
              <li key={g.id} className="rounded-xl border border-paper-border dark:border-ink-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{g.title}</p>
                  <p className="text-sm font-bold">{pct}%</p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-1.5 flex-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${i % 2 === 0 ? "bg-brand-500" : "bg-signal"}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9 }}
                    />
                  </div>
                  <span className="text-[10px] text-slate shrink-0">
                    {g.forecastDate ? `previsão: ${new Date(`${g.forecastDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}` : g.statusLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/goal-forecast" className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold bg-brand-500/10 text-brand-700 dark:text-brand-100 hover:bg-brand-500/15 transition-colors">
        Ver Goal Forecast <ArrowRight size={13} />
      </Link>
    </Card>
  );
}

/* ---------------- Dimensões (scroller horizontal) ---------------- */

export interface DimensionItem {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: ReactNode;
  explanation: string;
  to: string;
}

export function DimensionScroller({ items }: { items: DimensionItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHow, setShowHow] = useState(false);
  const scrollBy = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="flex items-center gap-2 font-display font-semibold text-[15px]">
          <span className="text-brand-600">
            <Activity size={17} />
          </span>
          Dimensões do Life Score
        </p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowHow((v) => !v)} aria-expanded={showHow} className="inline-flex items-center gap-1 text-xs text-slate hover:text-brand-600 mr-2">
            <Info size={13} /> Como é calculado
          </button>
          <button onClick={() => scrollBy(-1)} aria-label="Rolar para a esquerda" className="w-8 h-8 rounded-full border border-paper-border dark:border-ink-border flex items-center justify-center hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => scrollBy(1)} aria-label="Rolar para a direita" className="w-8 h-8 rounded-full border border-paper-border dark:border-ink-border flex items-center justify-center hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showHow && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="text-xs text-slate overflow-hidden mb-3">
            O Life Score é a média das dimensões que têm dado real (Saúde e Hábitos sempre contam, por serem do dia). Nada é estimado: cada cartão abaixo diz de onde vem o número.
          </motion.p>
        )}
      </AnimatePresence>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 [scrollbar-width:thin]">
        {items.map((d, i) => (
          <motion.div key={d.key} className="snap-start shrink-0 w-[220px]" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 * i }}>
            <Link to={d.to} className="flex h-full flex-col gap-3 rounded-2xl border border-paper-border dark:border-ink-border p-4 hover:border-brand-500/40 transition-colors">
              <div className="flex items-center gap-3">
                <RingProgress pct={d.value} size={58} stroke={6} color={d.color}>
                  <span className="font-display font-bold text-base">{d.value}</span>
                </RingProgress>
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <span style={{ color: d.color }}>{d.icon}</span>
                    {d.label}
                  </p>
                  <p className="text-[11px] text-slate">de 100</p>
                </div>
              </div>
              <p className="text-[11px] text-slate leading-snug">{d.explanation}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Copilot + leitura ---------------- */

export function CopilotBanner({
  text,
  isLoading,
  error,
  onRegenerate,
  isRegenerating,
}: {
  text: string | null;
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white bg-gradient-to-r from-brand-600 via-brand-500 to-cat-purple shadow-glow-brand h-full">
      <motion.div aria-hidden className="absolute -left-10 -bottom-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" animate={{ x: [0, 30, 0] }} transition={{ duration: 10, repeat: Infinity }} />
      <div className="relative flex flex-col md:flex-row md:items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Sparkles size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold">LifeOS Copilot</p>
          <p className="text-sm text-white/90 mt-0.5 leading-relaxed">
            {isLoading ? "Preparando o insight de hoje..." : error ? error.message : text ?? "Sem insight gerado ainda para hoje."}
          </p>
          {error?.status === 400 && (
            <Link to="/configuracoes" className="text-xs underline font-semibold">
              Configurar IA
            </Link>
          )}
          <p className="text-[10px] text-white/70 mt-1">Sugestão gerada por IA a partir dos seus registros reais.</p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={isRegenerating || isLoading}
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-700 px-4 py-2.5 text-sm font-semibold hover:bg-white/90 disabled:opacity-60 transition-colors"
        >
          <Wand2 size={15} /> {isRegenerating ? "Gerando..." : "Gerar outro insight"}
        </button>
      </div>
    </div>
  );
}

export function ContinueReading({ book }: { book: { title: string; author: string | null; cover_url: string | null; current_page: number; total_pages: number | null } | null }) {
  const pct = book?.total_pages ? Math.round((book.current_page / book.total_pages) * 100) : null;
  return (
    <Card className="p-5 h-full">
      <SectionTitle icon={<BookOpen size={17} />} title="Continue de onde parou" action={{ label: "Ver biblioteca", to: "/biblioteca" }} tone="text-cat-pink" />
      {!book ? (
        <p className="text-sm text-slate">Nenhum livro em andamento — escolha um na Biblioteca.</p>
      ) : (
        <div className="flex items-center gap-3">
          {book.cover_url ? (
            <img src={book.cover_url} alt="" className="w-12 h-[70px] object-cover rounded-md border border-paper-border dark:border-ink-border shrink-0" />
          ) : (
            <span className="w-12 h-[70px] rounded-md bg-cat-pink/10 flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-cat-pink" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{book.title}</p>
            {book.author && <p className="text-xs text-slate truncate">{book.author}</p>}
            {pct !== null && (
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1.5 flex-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                  <motion.div className="h-full rounded-full bg-cat-pink" initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} />
                </div>
                <span className="text-[11px] text-slate">{pct}%</span>
              </div>
            )}
          </div>
          <Link to="/biblioteca" className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold border border-brand-500/30 text-brand-700 dark:text-brand-100 hover:bg-brand-500/5">
            Continuar <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </Card>
  );
}
