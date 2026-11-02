import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  AlarmClock,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  ExternalLink,
  Flag,
  Flame,
  HeartPulse,
  Hourglass,
  List,
  Play,
  Plus,
  Swords,
  Target,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { CalendarItem } from "@/types";
import { useEvents } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { usePlanningActions } from "@/hooks/usePlanningHub";
import { taskService } from "@/services/taskService";
import { EVENT_CATEGORIES, type AgendaHub, type AgendaSuggestion, type EventCategory, type TowerBlock } from "@/services/planningHubService";
import { IndicatorCard, KitSection, RankPanel } from "@/components/rpg-modules/ModuleKit";
import { Modal } from "@/components/ui/Modal";

/**
 * Agenda da Jornada — peças RPG. O calendário lê /api/events (fonte
 * unificada: eventos, blocos do Conselho, prazos de missões/metas/TCC) e
 * só edita o que pertence ao evento; prazos de outras telas se editam na
 * origem (arrastar um prazo de missão pede confirmação).
 */

const R = { borderRadius: 4 } as const;
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`);
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (key: string) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));
const timeOf = (v: string) => (/T\d{2}:\d{2}/.test(v) ? v.slice(11, 16) : null);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const CATEGORY_UI: Record<EventCategory, { label: string; cls: string; dot: string; icon: typeof CalendarDays }> = {
  evento: { label: "Evento", cls: "border-rpg-blue/60 bg-rpg-blue/10", dot: "bg-rpg-blue", icon: CalendarDays },
  foco: { label: "Foco", cls: "border-rpg-purple/60 bg-rpg-purple/15", dot: "bg-rpg-purple", icon: Crosshair },
  estudo: { label: "Estudo", cls: "border-rpg-gold/60 bg-rpg-gold/10", dot: "bg-rpg-gold", icon: BookOpen },
  saude: { label: "Saúde", cls: "border-rpg-green/60 bg-rpg-green/10", dot: "bg-rpg-green", icon: HeartPulse },
  missao: { label: "Missão", cls: "border-rpg-orange/60 bg-rpg-orange/10", dot: "bg-rpg-orange", icon: Swords },
  meta: { label: "Meta", cls: "border-rpg-pink/60 bg-rpg-pink/10", dot: "bg-rpg-pink", icon: Target },
  pessoal: { label: "Pessoal", cls: "border-rpg-border bg-rpg-bg-2", dot: "bg-rpg-muted", icon: User },
};

/** Categoria exibida de um item do calendário unificado. */
export function itemCategory(item: CalendarItem): EventCategory {
  if (item.sourceType === "task") return "missao";
  if (item.sourceType === "goal") return "meta";
  if (item.sourceType === "academic_project") return "estudo";
  const c = item.category as EventCategory | null | undefined;
  return c && (EVENT_CATEGORIES as readonly string[]).includes(c) ? c : "evento";
}

// ------------------------------------------------------------ rank / indicadores

export function AgendaRankPanel({ hub }: { hub: AgendaHub }) {
  const b = hub.rankBreakdown;
  return (
    <RankPanel
      title="Rank do Planejador"
      subtitle={`Consistência da semana: ${hub.indicators.consistencyPct}%`}
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="pts"
      icon={<Hourglass size={26} />}
      rules={
        <>
          Pontos: 40 por plano semanal selado ({b.sealedPlans}), 5 por missão concluída até o dia planejado ({b.plannedOnTime}) e 3 por sessão de foco nesta semana ({b.focusSessionsWeek}).
          Consistência = dias da semana (até hoje) com missão concluída ou sessão de foco.
        </>
      }
    />
  );
}

export function AgendaIndicators({ hub }: { hub: AgendaHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      <IndicatorCard tone="blue" icon={<CalendarDays size={24} />} label="Eventos da semana" value={i.eventsWeek} hint="compromissos e prazos" />
      <IndicatorCard tone="purple" icon={<Crosshair size={24} />} label="Blocos de foco" value={i.focusBlocks} hint={`${i.focusSessions} sessão(ões) feitas`} />
      <IndicatorCard tone="orange" icon={<Flame size={24} />} label="Sequência de planejamento" value={`${i.planStreakWeeks} sem.`} hint="planos selados seguidos" />
      <IndicatorCard tone="gold" icon={<Clock size={24} />} label="Horas planejadas" value={hm(i.plannedMinutes)} hint="blocos + estimativas" />
      <IndicatorCard tone="green" icon={<CheckCircle2 size={24} />} label="Cumprimento" value={i.completionPct == null ? "--" : `${i.completionPct}%`} hint="missões planejadas até hoje" />
      <IndicatorCard tone={i.conflicts ? "red" : "green"} icon={<AlertTriangle size={24} />} label="Conflitos" value={i.conflicts} hint="próximos 14 dias" />
      <IndicatorCard tone="purple" icon={<Hourglass size={24} />} label="Nível de organização" value={`Nv. ${hub.rank.level}`} hint={hub.rank.title} />
    </div>
  );
}

// ------------------------------------------------------------ Torre do Tempo

export function TimeTower({ hub, onToast }: { hub: AgendaHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const actions = usePlanningActions();
  const { goals } = useGoals();
  const [form, setForm] = useState<{ title: string; start: string; duration: number; category: EventCategory; taskId: string; goalId: string } | null>(null);
  const tomorrow = addDays(hub.today, 1);
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
  const activeGoals = goals.filter((g) => g.status === "active");
  const tasksToday = hub.tower.filter((b) => b.kind === "task");

  const complete = async (b: TowerBlock) => {
    if (!b.taskId) return;
    try {
      await taskService.move(b.taskId, "Concluído");
      actions.refreshAll();
      onToast(`Missão concluída: ${b.title}`);
    } catch (e) {
      err(e);
    }
  };
  const startFocus = async (b: TowerBlock) => {
    if (!b.taskId) return;
    try {
      await taskService.startTime(b.taskId);
      onToast("Cronômetro iniciado na missão. Pare pelo quadro de Missões.");
    } catch (e) {
      err(e);
    }
  };
  const postpone = (b: TowerBlock) => {
    if (b.kind === "task" && b.taskId) actions.planTask.mutate({ id: b.taskId, plannedDate: tomorrow }, { onSuccess: () => onToast("Missão replanejada para amanhã."), onError: err });
    else actions.reschedule.mutate({ id: b.id, date: tomorrow, start: b.start }, { onSuccess: () => onToast("Bloco movido para amanhã."), onError: err });
  };

  return (
    <KitSection
      title="Torre do Tempo — hoje"
      icon={<Hourglass size={16} />}
      tone="gold"
      action={
        <button type="button" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 px-2 py-1 text-xs" onClick={() => setForm({ title: "", start: "09:00", duration: 50, category: "foco", taskId: "", goalId: "" })}>
          <Plus size={13} aria-hidden /> Bloco
        </button>
      }
    >
      {hub.tower.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nada agendado para hoje. Crie um bloco de foco ou planeje missões no Conselho de Guerra.</p>
      ) : (
        <ol className="space-y-1.5">
          {hub.tower.map((b) => {
            const c = CATEGORY_UI[b.category];
            const Icon = c.icon;
            return (
              <li key={b.key} className={clsx("flex flex-wrap items-center gap-2 border-2 p-2", c.cls, b.overdue && "border-rpg-red/70")} style={R}>
                <span className="w-14 shrink-0 font-pixel text-[11px] text-rpg-gold-light tabular-nums">{b.start ? `${b.start}` : "—"}</span>
                <Icon size={15} className="shrink-0 text-rpg-text" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">
                  {b.title}
                  {b.overdue && <span className="ml-1 font-pixel text-[9px] uppercase text-rpg-red">atrasada</span>}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {b.taskId && (
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-purple" title="Iniciar foco (cronômetro da missão)" aria-label={`Iniciar foco em ${b.title}`} onClick={() => void startFocus(b)}>
                      <Play size={14} />
                    </button>
                  )}
                  {b.taskId && (
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-green" title="Concluir missão" aria-label={`Concluir ${b.title}`} onClick={() => void complete(b)}>
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-gold-light" title="Reagendar para amanhã" aria-label={`Reagendar ${b.title} para amanhã`} onClick={() => postpone(b)}>
                    <ChevronRight size={14} />
                  </button>
                  {b.link && (
                    <Link to={b.link} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-text" title="Abrir módulo de origem" aria-label={`Abrir origem de ${b.title}`}>
                      <ExternalLink size={13} />
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="Novo bloco de hoje"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="rpg-btn rpg-btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="rpg-btn rpg-btn-primary"
              disabled={!form || (!form.title.trim() && !form.taskId) || actions.createBlock.isPending}
              onClick={() => {
                if (!form) return;
                const task = tasksToday.find((t) => t.taskId === form.taskId);
                actions.createBlock.mutate(
                  {
                    title: form.title.trim() || task?.title || "Bloco de foco",
                    date: hub.today,
                    start: form.start,
                    durationMinutes: form.duration,
                    category: form.taskId ? (form.category === "evento" ? "missao" : form.category) : form.category,
                    taskId: form.taskId || null,
                    goalId: form.goalId || null,
                  },
                  {
                    onSuccess: (r) => {
                      setForm(null);
                      onToast(r.duplicated ? "Esse bloco já existia." : "Bloco criado na Agenda.");
                    },
                    onError: err,
                  },
                );
              }}
            >
              Criar bloco
            </button>
          </div>
        }
      >
        {form && (
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Objetivo do bloco</span>
              <input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} placeholder="Ex.: Escrever a seção 3" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-rpg-muted">Início</span>
                <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-rpg-muted">Duração (min)</span>
                <input type="number" min={10} max={600} value={form.duration} onChange={(e) => setForm({ ...form, duration: Math.max(10, Math.min(600, Number(e.target.value) || 10)) })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Tipo</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_UI[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Vincular missão de hoje (opcional)</span>
              <select value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R}>
                <option value="">Nenhuma</option>
                {tasksToday.map((t) => (
                  <option key={t.key} value={t.taskId ?? ""}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Vincular meta (opcional)</span>
              <select value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R}>
                <option value="">Nenhuma</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

// ------------------------------------------------------------ conflitos / distribuição / sugestões

export function ConflictsPanel({ hub, onToast }: { hub: AgendaHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { reschedule } = usePlanningActions();
  return (
    <KitSection title="Conflitos de horário" icon={<AlertTriangle size={16} />}>
      {hub.conflicts.length === 0 ? (
        <p className="text-sm text-rpg-green">Nenhum horário sobreposto nos próximos 14 dias.</p>
      ) : (
        <ul className="space-y-1.5">
          {hub.conflicts.slice(0, 5).map((c, i) => (
            <li key={i} className="border border-rpg-red/50 bg-rpg-red/10 p-2 text-[12.5px] text-rpg-text" style={R}>
              <p>
                <strong>{dayBr(c.day)}</strong> · “{c.a.title}” ({c.a.start}–{c.a.end}) × “{c.b.title}” ({c.b.start}–{c.b.end}) · {c.overlapMinutes} min
              </p>
              {c.suggestion ? (
                <button
                  type="button"
                  className="rpg-btn rpg-btn-secondary mt-1 px-2 py-1 text-xs"
                  disabled={reschedule.isPending}
                  onClick={() =>
                    reschedule.mutate(
                      { id: c.suggestion!.eventId, date: c.day, start: c.suggestion!.start },
                      { onSuccess: () => onToast(`“${c.b.title}” movido para ${c.suggestion!.start}.`), onError: (e) => onToast(e instanceof Error ? e.message : "Falhou.", "error") },
                    )
                  }
                >
                  Mover “{c.b.title}” para {c.suggestion.start}
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-rpg-muted">Sem horário livre no mesmo dia — reagende manualmente.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function TimeDistribution({ hub }: { hub: AgendaHub }) {
  const total = hub.distribution.reduce((a, d) => a + d.minutes, 0);
  return (
    <KitSection title="Distribuição do tempo (semana)" icon={<CalendarRange size={16} />}>
      {total === 0 ? (
        <p className="text-sm text-rpg-muted">Sem blocos com horário ou missões estimadas nesta semana.</p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden border border-rpg-border" style={R} role="img" aria-label="Distribuição do tempo planejado por tipo">
            {hub.distribution.map((d) => (
              <span key={d.category} className={CATEGORY_UI[d.category as EventCategory]?.dot ?? "bg-rpg-muted"} style={{ width: `${(d.minutes / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-rpg-text">
            {hub.distribution.map((d) => (
              <li key={d.category} className="flex items-center gap-1">
                <span className={clsx("h-2.5 w-2.5 rounded-full", CATEGORY_UI[d.category as EventCategory]?.dot ?? "bg-rpg-muted")} aria-hidden />
                {CATEGORY_UI[d.category as EventCategory]?.label ?? d.category} {Math.round((d.minutes / total) * 100)}% · {hm(d.minutes)}
              </li>
            ))}
          </ul>
        </>
      )}
    </KitSection>
  );
}

/** Propostas de planejamento automático e replanejamento: editáveis, aplicadas só com aprovação. */
export function SuggestionsPanel({ hub, onToast }: { hub: AgendaHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { generateSuggestion, decideSuggestion } = usePlanningActions();
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
  return (
    <KitSection
      title="Propostas do Planejador"
      icon={<AlarmClock size={16} />}
      tone="legendary"
      action={
        <span className="flex gap-1">
          <button type="button" className="rpg-btn rpg-btn-secondary px-2 py-1 text-[11px]" disabled={generateSuggestion.isPending} onClick={() => generateSuggestion.mutate("auto_plan", { onSuccess: (r) => onToast(r.summary, r.status === "error" ? "error" : "success"), onError: err })}>
            Encaixar missões
          </button>
          <button type="button" className="rpg-btn rpg-btn-secondary px-2 py-1 text-[11px]" disabled={generateSuggestion.isPending} onClick={() => generateSuggestion.mutate("replan", { onSuccess: (r) => onToast(r.summary, r.status === "error" ? "error" : "success"), onError: err })}>
            Replanejar atrasos
          </button>
        </span>
      }
    >
      {hub.pendingSuggestions.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma proposta pendente. Gere uma acima ou ligue as automações A e F — tudo espera a sua aprovação.</p>
      ) : (
        <div className="space-y-2">
          {hub.pendingSuggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} busy={decideSuggestion.isPending} onDecide={(decision, payload) => decideSuggestion.mutate({ id: s.id, decision, payload }, { onSuccess: (r) => onToast(decision === "apply" ? `${r.applied} alteração(ões) aplicada(s).` : "Proposta descartada."), onError: err })} />
          ))}
        </div>
      )}
    </KitSection>
  );
}

function SuggestionCard({ s, busy, onDecide }: { s: AgendaSuggestion; busy: boolean; onDecide: (d: "apply" | "reject", payload?: AgendaSuggestion["payload"]) => void }) {
  const [blocks, setBlocks] = useState(s.payload.blocks ?? []);
  const [moves, setMoves] = useState(s.payload.moves ?? []);
  useEffect(() => {
    setBlocks(s.payload.blocks ?? []);
    setMoves(s.payload.moves ?? []);
  }, [s.id, s.payload]);
  const count = s.kind === "auto_plan" ? blocks.length : moves.length;
  return (
    <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
      <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-gold">{s.kind === "auto_plan" ? "Blocos sugeridos na Agenda" : "Novos dias para missões atrasadas"}</p>
      <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
        {s.kind === "auto_plan"
          ? blocks.map((b, i) => (
              <li key={`${b.taskId}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-rpg-text">
                <span className="min-w-0 flex-1 truncate">{b.title}</span>
                <span className="text-rpg-muted">{dayBr(b.date)}</span>
                <label className="sr-only" htmlFor={`sb-${s.id}-${i}`}>
                  Horário
                </label>
                <input id={`sb-${s.id}-${i}`} type="time" value={b.start} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="min-h-[36px] border border-rpg-border bg-rpg-bg px-1 text-xs" style={R} />
                <span className="text-rpg-muted">{b.durationMinutes}min</span>
                <button type="button" className="flex h-8 w-8 items-center justify-center text-rpg-muted hover:text-rpg-red" aria-label={`Remover ${b.title}`} onClick={() => setBlocks((l) => l.filter((_, j) => j !== i))}>
                  <X size={13} />
                </button>
              </li>
            ))
          : moves.map((m, i) => (
              <li key={`${m.taskId}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-rpg-text">
                <span className="min-w-0 flex-1 truncate" title={m.reason}>
                  {m.title} <span className="text-[10.5px] text-rpg-muted">({m.reason})</span>
                </span>
                <label className="sr-only" htmlFor={`sm-${s.id}-${i}`}>
                  Novo dia
                </label>
                <input id={`sm-${s.id}-${i}`} type="date" value={m.to} onChange={(e) => setMoves((l) => l.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className="min-h-[36px] border border-rpg-border bg-rpg-bg px-1 text-xs" style={R} />
                <button type="button" className="flex h-8 w-8 items-center justify-center text-rpg-muted hover:text-rpg-red" aria-label={`Remover ${m.title}`} onClick={() => setMoves((l) => l.filter((_, j) => j !== i))}>
                  <X size={13} />
                </button>
              </li>
            ))}
      </ul>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <button type="button" className="rpg-btn rpg-btn-success text-xs" disabled={busy || count === 0} onClick={() => onDecide("apply", s.kind === "auto_plan" ? { blocks } : { moves })}>
          Aprovar {count} item(ns)
        </button>
        <button type="button" className="rpg-btn rpg-btn-ghost text-xs" disabled={busy} onClick={() => onDecide("reject")}>
          Descartar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ calendário interativo

export type CalView = "mes" | "semana" | "dia" | "lista";
type SourceFilter = "todos" | EventCategory;

interface EditDraft {
  id: string | null;
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  category: EventCategory;
  reminder: string;
  isBlock: boolean;
}

/** Calendário com visões mês/semana/dia/lista, filtros por tipo e arrastar-e-soltar para reagendar. */
export function AgendaCalendar({ today, onToast, initialView = "mes" }: { today: string; onToast: (m: string, tone?: "success" | "error") => void; initialView?: CalView }) {
  const [view, setView] = useState<CalView>(initialView);
  const [cursor, setCursor] = useState(today);
  const [filter, setFilter] = useState<SourceFilter>("todos");
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const actions = usePlanningActions();

  const range = useMemo(() => {
    if (view === "dia") return { from: cursor, to: cursor };
    if (view === "semana") return { from: mondayOf(cursor), to: addDays(mondayOf(cursor), 6) };
    if (view === "lista") return { from: cursor, to: addDays(cursor, 30) };
    const first = `${cursor.slice(0, 7)}-01`;
    const start = mondayOf(first);
    return { from: start, to: addDays(start, 41) };
  }, [view, cursor]);

  const { items, isLoading, createEvent, updateEvent, removeEvent } = useEvents(range.from, range.to);
  const visible = useMemo(() => items.filter((it) => filter === "todos" || itemCategory(it) === filter), [items, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of visible) {
      const d = it.startsAt.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), it]);
    }
    for (const list of m.values()) list.sort((a, b) => (timeOf(a.startsAt) ?? "").localeCompare(timeOf(b.startsAt) ?? ""));
    return m;
  }, [visible]);

  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível salvar.", "error");
  const editable = (it: CalendarItem) => it.sourceType === "manual";

  const move = (dir: -1 | 1) => {
    if (view === "dia") setCursor(addDays(cursor, dir));
    else if (view === "semana") setCursor(addDays(cursor, 7 * dir));
    else if (view === "lista") setCursor(addDays(cursor, 30 * dir));
    else {
      const d = new Date(`${cursor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setCursor(d.toISOString().slice(0, 10));
    }
  };

  /** Soltar um item num dia (e opcionalmente num horário). */
  const dropOn = async (date: string, start: string | null, e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/lifeos-item");
    const it = items.find((x) => x.id === id);
    if (!it || it.startsAt.slice(0, 10) === date && !start) return;
    try {
      if (it.sourceType === "manual") {
        const keepTime = start ?? timeOf(it.startsAt);
        await actions.reschedule.mutateAsync({ id: it.id, date, start: it.allDay && !start ? null : keepTime });
        onToast(`“${it.title}” reagendado para ${dayBr(date)}${keepTime && !(it.allDay && !start) ? ` às ${keepTime}` : ""}.`);
      } else if (it.sourceType === "task" && it.sourceId) {
        // Prazo é dado da missão: muda só com confirmação explícita.
        if (!confirm(`Mudar o PRAZO da missão “${it.title}” para ${dayBr(date)}?`)) return;
        await taskService.update(it.sourceId, { dueDate: date });
        actions.refreshAll();
        onToast("Prazo da missão atualizado.");
      } else onToast("Prazos de metas e projetos acadêmicos se editam na tela de origem.", "error");
    } catch (x) {
      err(x);
    }
  };

  const dragProps = (it: CalendarItem) =>
    editable(it) || it.sourceType === "task"
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData("text/lifeos-item", it.id);
            e.dataTransfer.effectAllowed = "move";
          },
        }
      : {};

  const openNew = (date: string, start?: string) =>
    setDraft({ id: null, title: "", date, allDay: !start, start: start ?? "09:00", end: start ? toHm(Math.min(23 * 60 + 59, minutesOf(start) + 60)) : "10:00", category: "evento", reminder: "", isBlock: false });
  const openEdit = (it: CalendarItem) => {
    if (!editable(it)) return;
    const s = timeOf(it.startsAt);
    const e = it.endsAt ? timeOf(it.endsAt) : null;
    setDraft({ id: it.id, title: it.title, date: it.startsAt.slice(0, 10), allDay: it.allDay || !s, start: s ?? "09:00", end: e ?? (s ? toHm(Math.min(1439, minutesOf(s) + 60)) : "10:00"), category: itemCategory(it), reminder: it.reminderMinutes == null ? "" : String(it.reminderMinutes), isBlock: !!it.blockTaskId });
  };

  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    if (!draft.allDay && minutesOf(draft.end) <= minutesOf(draft.start)) return onToast("O fim precisa ser depois do início.", "error");
    const startsAt = draft.allDay ? draft.date : `${draft.date}T${draft.start}:00`;
    const endsAt = draft.allDay ? null : `${draft.date}T${draft.end}:00`;
    try {
      let id = draft.id;
      // Blocos de missão (Conselho/Agenda) não passam pelo PATCH /events (só manuais): muda só horário e metadados.
      if (id && draft.isBlock)
        await actions.reschedule.mutateAsync({ id, date: draft.date, start: draft.allDay ? null : draft.start, durationMinutes: draft.allDay ? undefined : minutesOf(draft.end) - minutesOf(draft.start) });
      else if (id) await updateEvent({ id, title: draft.title.trim(), startsAt, endsAt, allDay: draft.allDay });
      else {
        const created = (await createEvent({ title: draft.title.trim(), startsAt, endsAt, allDay: draft.allDay })) as { id?: string } | undefined;
        id = created?.id ?? null;
      }
      if (id) await actions.eventMeta.mutateAsync({ id, patch: { category: draft.category, reminderMinutes: draft.reminder ? Number(draft.reminder) : null } });
      setDraft(null);
      onToast(draft.id ? "Evento atualizado." : "Evento criado.");
    } catch (e) {
      err(e);
    }
  };

  const title =
    view === "mes"
      ? new Date(`${cursor.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
      : view === "dia"
        ? new Date(`${cursor}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" })
        : `${dayBr(range.from)} – ${dayBr(range.to)}`;

  const Chip = ({ it, compact }: { it: CalendarItem; compact?: boolean }) => {
    const c = CATEGORY_UI[itemCategory(it)];
    const overdue = it.sourceType === "task" && it.startsAt.slice(0, 10) < today;
    return (
      <button
        type="button"
        {...dragProps(it)}
        onClick={() => (editable(it) ? openEdit(it) : undefined)}
        className={clsx("flex w-full min-w-0 items-center gap-1 border px-1 text-left text-[11px] text-rpg-text", c.cls, overdue && "border-rpg-red/80", editable(it) || it.sourceType === "task" ? "cursor-grab" : "cursor-default")}
        style={{ borderRadius: 3 }}
        title={`${it.title}${overdue ? " (atrasada)" : ""}${editable(it) ? " — clique para editar, arraste para reagendar" : it.sourceType === "task" ? " — arraste para mudar o prazo" : ""}`}
      >
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", c.dot)} aria-hidden />
        {!compact && timeOf(it.startsAt) && <span className="shrink-0 font-pixel text-[9px] text-rpg-muted">{timeOf(it.startsAt)}</span>}
        <span className="truncate">{it.title}</span>
      </button>
    );
  };

  const days = view === "mes" ? Array.from({ length: 42 }, (_, i) => addDays(range.from, i)) : view === "semana" ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i)) : [];

  return (
    <KitSection
      title="Calendário"
      icon={<CalendarDays size={16} />}
      action={
        <button type="button" className="rpg-btn rpg-btn-primary inline-flex items-center gap-1 px-2 py-1 text-xs" onClick={() => openNew(view === "dia" ? cursor : today)}>
          <Plus size={13} aria-hidden /> Evento
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" className="flex h-9 w-9 items-center justify-center border border-rpg-border text-rpg-text" style={R} onClick={() => move(-1)} aria-label="Período anterior">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="rpg-btn rpg-btn-ghost px-2 py-1 text-xs" onClick={() => setCursor(today)}>
          Hoje
        </button>
        <button type="button" className="flex h-9 w-9 items-center justify-center border border-rpg-border text-rpg-text" style={R} onClick={() => move(1)} aria-label="Próximo período">
          <ChevronRight size={15} />
        </button>
        <p className="min-w-0 flex-1 truncate font-rpg font-bold capitalize text-rpg-gold-light">{title}</p>
        <div role="tablist" aria-label="Visão do calendário" className="flex gap-0.5">
          {(
            [
              ["mes", "Mês", CalendarDays],
              ["semana", "Semana", CalendarRange],
              ["dia", "Dia", Clock],
              ["lista", "Lista", List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx("inline-flex min-h-[36px] items-center gap-1 border px-2 text-xs", view === v ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
              <Icon size={12} aria-hidden /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Filtrar por tipo">
        {(["todos", ...EVENT_CATEGORIES] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx("inline-flex min-h-[32px] shrink-0 items-center gap-1 border px-2 text-[11px]", filter === f ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {f !== "todos" && <span className={clsx("h-2 w-2 rounded-full", CATEGORY_UI[f].dot)} aria-hidden />}
            {f === "todos" ? "Todos" : CATEGORY_UI[f].label}
          </button>
        ))}
      </div>

      {isLoading && <div className="h-64 animate-pulse border border-rpg-border bg-rpg-bg-2" style={R} aria-busy aria-label="Carregando calendário" />}

      {!isLoading && (view === "mes" || view === "semana") && (
        <div className={clsx("grid grid-cols-7 gap-px border border-rpg-border bg-rpg-border", view === "semana" && "max-sm:grid-cols-1")} style={R}>
          {(view === "mes" ? WEEKDAYS : []).map((w) => (
            <div key={w} className="bg-rpg-bg-2 py-1 text-center font-pixel text-[10px] uppercase text-rpg-muted">
              {w}
            </div>
          ))}
          {days.map((d, idx) => {
            const inMonth = view === "semana" || d.slice(0, 7) === cursor.slice(0, 7);
            const list = byDay.get(d) ?? [];
            return (
              <div
                key={d}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(d);
                }}
                onDragLeave={() => setDragOver((v) => (v === d ? null : v))}
                onDrop={(e) => void dropOn(d, null, e)}
                className={clsx("min-w-0 bg-rpg-panel p-1", view === "mes" ? "min-h-[64px] sm:min-h-[84px]" : "min-h-[120px]", !inMonth && "opacity-45", dragOver === d && "ring-2 ring-inset ring-rpg-gold")}
              >
                <button type="button" onClick={() => openNew(d)} className={clsx("mb-0.5 flex w-full items-center justify-between font-pixel text-[10px]", d === today ? "text-rpg-gold-light" : "text-rpg-muted")} aria-label={`Novo evento em ${dayBr(d)}`}>
                  <span className={clsx(d === today && "rounded-sm bg-rpg-gold/25 px-1")}>{view === "semana" ? `${WEEKDAYS[idx]} ${dayBr(d)}` : Number(d.slice(8, 10))}</span>
                  <Plus size={10} className="opacity-0 hover:opacity-100" aria-hidden />
                </button>
                <div className="space-y-0.5">
                  {list.slice(0, view === "mes" ? 3 : 12).map((it) => (
                    <Chip key={it.id} it={it} compact={view === "mes"} />
                  ))}
                  {view === "mes" && list.length > 3 && (
                    <button type="button" className="text-[10px] text-rpg-gold-light underline" onClick={() => (setCursor(d), setView("dia"))}>
                      +{list.length - 3}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && view === "dia" && (
        <div className="border border-rpg-border" style={R}>
          {(byDay.get(cursor) ?? []).filter((it) => !timeOf(it.startsAt)).length > 0 && (
            <div className="space-y-0.5 border-b border-rpg-border bg-rpg-bg-2/60 p-1.5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void dropOn(cursor, null, e)}>
              <p className="font-pixel text-[9px] uppercase text-rpg-muted">Dia inteiro / prazos</p>
              {(byDay.get(cursor) ?? []).filter((it) => !timeOf(it.startsAt)).map((it) => (
                <Chip key={it.id} it={it} />
              ))}
            </div>
          )}
          {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => {
            const slot = `${String(h).padStart(2, "0")}:00`;
            const list = (byDay.get(cursor) ?? []).filter((it) => timeOf(it.startsAt)?.slice(0, 2) === slot.slice(0, 2));
            return (
              <div
                key={h}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(slot);
                }}
                onDragLeave={() => setDragOver((v) => (v === slot ? null : v))}
                onDrop={(e) => void dropOn(cursor, slot, e)}
                className={clsx("flex min-h-[40px] gap-2 border-b border-rpg-border/50 px-1.5 py-1 last:border-0", dragOver === slot && "bg-rpg-gold/10")}
              >
                <button type="button" onClick={() => openNew(cursor, slot)} className="w-11 shrink-0 text-left font-pixel text-[10px] text-rpg-muted" aria-label={`Novo evento às ${slot}`}>
                  {slot}
                </button>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {list.map((it) => (
                    <Chip key={it.id} it={it} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && view === "lista" && (
        <ul className="space-y-1">
          {visible.length === 0 && <li className="text-sm text-rpg-muted">Nada nos próximos 30 dias com este filtro.</li>}
          {[...visible]
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 font-pixel text-[10px] text-rpg-muted">
                  {dayBr(it.startsAt.slice(0, 10))} {timeOf(it.startsAt) ?? ""}
                </span>
                <div className="min-w-0 flex-1">
                  <Chip it={it} />
                </div>
                {it.link && (
                  <Link to={it.link} className="flex h-8 w-8 items-center justify-center text-rpg-muted" aria-label={`Abrir origem de ${it.title}`}>
                    <ExternalLink size={12} />
                  </Link>
                )}
              </li>
            ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] text-rpg-muted">Arraste eventos e blocos para reagendar. Prazos de missões pedem confirmação; metas e projetos acadêmicos se editam na tela de origem.</p>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Editar evento" : "Novo evento"}
        size="sm"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            {draft?.id && !draft.isBlock ? (
              <button
                type="button"
                className="rpg-btn rpg-btn-danger inline-flex items-center gap-1"
                onClick={async () => {
                  if (!draft?.id || !confirm("Excluir este evento?")) return;
                  try {
                    await removeEvent(draft.id);
                    setDraft(null);
                    onToast("Evento excluído.");
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Trash2 size={14} aria-hidden /> Excluir
              </button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <button type="button" className="rpg-btn rpg-btn-ghost" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button type="button" className="rpg-btn rpg-btn-primary" disabled={!draft?.title.trim()} onClick={() => void save()}>
                Salvar
              </button>
            </span>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-2 text-sm">
            {draft.isBlock && <p className="text-[11px] text-rpg-muted">Bloco vinculado a uma missão (Conselho/Agenda).</p>}
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Título</span>
              <input value={draft.title} maxLength={200} disabled={draft.isBlock} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Data</span>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
            </label>
            <label className="flex items-center gap-2 text-xs text-rpg-text">
              <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} /> Dia inteiro
            </label>
            {!draft.allDay && (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-rpg-muted">Início</span>
                  <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-rpg-muted">Fim</span>
                  <input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} />
                </label>
              </div>
            )}
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Tipo</span>
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as EventCategory })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_UI[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-rpg-muted">Lembrete (minutos antes, opcional)</span>
              <input type="number" min={0} max={1440} value={draft.reminder} onChange={(e) => setDraft({ ...draft, reminder: e.target.value })} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-rpg-text" style={R} placeholder="Ex.: 15" />
              <span className="text-[10.5px] text-rpg-muted">Aparece no resumo diário da automação D (o aviso não é disparado minuto a minuto).</span>
            </label>
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

export function FlagLegend() {
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-rpg-muted">
      <Flag size={10} aria-hidden /> Itens em vermelho estão atrasados.
    </p>
  );
}
