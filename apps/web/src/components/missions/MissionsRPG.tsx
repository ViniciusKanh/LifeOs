import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, CalendarPlus, CheckCircle2, Circle, Flame, Gauge, Layers, ListChecks, Play, Plus, Sparkles, Trash2, Trophy, Wand2, X } from "lucide-react";
import type { MissionsHub } from "@/services/planningHubService";
import { usePlanningActions } from "@/hooks/usePlanningHub";
import { taskService } from "@/services/taskService";
import { RPGProgressBar } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { AdvisorPanel, IndicatorCard, KitSection, MODULE_ART, RankPanel } from "@/components/rpg-modules/ModuleKit";

/** Missões da Jornada — peças RPG (rank do executor, combo, carga, Mestre de Missões). */

const R = { borderRadius: 4 } as const;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`);
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export const TIER_UI = {
  comum: { label: "Comum", cls: "border-rpg-border text-rpg-muted" },
  prioritaria: { label: "Prioritária", cls: "border-rpg-orange/70 bg-rpg-orange/10 text-rpg-orange" },
  epica: { label: "Épica", cls: "border-rpg-purple/70 bg-rpg-purple/15 text-rpg-purple" },
  campanha: { label: "Campanha", cls: "border-rpg-gold/70 bg-rpg-gold/15 text-rpg-gold-light" },
  concluida: { label: "Concluída", cls: "border-rpg-green/70 bg-rpg-green/10 text-rpg-green" },
} as const;

export function ExecutorRankPanel({ hub }: { hub: MissionsHub }) {
  return (
    <RankPanel
      title="Rank do Executor"
      subtitle={`Consistência: ${hub.consistency.activeDaysLast14}/14 dias`}
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="missões"
      icon={<Trophy size={26} />}
      rules={
        <>
          O rank conta as missões concluídas (sem criar XP novo — o XP vem da conclusão, uma única vez por missão). Ranks: Recruta → Aventureiro (10) → Explorador Avançado (50) →
          Conquistador (150) → Lenda da Execução (400).
        </>
      }
    />
  );
}

/** Combo diário. Regra: dias seguidos com pelo menos 1 missão concluída; hoje ainda sem conclusão não quebra o combo. */
export function DailyCombo({ hub }: { hub: MissionsHub }) {
  const c = hub.combo;
  return (
    <KitSection title="Combo diário" icon={<Flame size={16} />} action={<span className="font-pixel text-[10px] text-rpg-muted">recorde {c.best}</span>}>
      <p className="font-rpg text-3xl font-bold text-rpg-orange">
        {c.current} <span className="text-sm font-normal text-rpg-muted">dia(s) seguido(s)</span>
      </p>
      <ul className="mt-2 flex gap-1" aria-label="Últimos 14 dias">
        {c.history.map((h) => (
          <li key={h.day} title={`${dayBr(h.day)}: ${h.completed} concluída(s)`} className={clsx("h-6 flex-1 border", h.completed > 0 ? "border-rpg-orange bg-rpg-orange/60" : "border-rpg-border bg-rpg-bg")} style={{ borderRadius: 2 }} />
        ))}
      </ul>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {c.milestones.map((m) => (
          <li key={m.days} className={clsx("border px-1.5 font-pixel text-[10px]", m.reached ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 2 }}>
            {m.reached ? "★" : "☆"} {m.days} dias
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10.5px] text-rpg-muted">Hoje: {c.todayDone} concluída(s). Um dia sem conclusão zera o combo. Marcos são selos visuais — não geram XP extra.</p>
    </KitSection>
  );
}

export function MissionLoad({ hub }: { hub: MissionsHub }) {
  const l = hub.load;
  return (
    <KitSection title="Análise de carga" icon={<Gauge size={16} />}>
      <div className="grid grid-cols-2 gap-2">
        <IndicatorCard tone="gold" icon={<BarChart3 size={20} />} label="Estimado pendente" value={hm(l.pendingEstimateMinutes)} hint={`${l.unestimated} sem estimativa`} />
        <IndicatorCard tone="purple" icon={<Play size={20} />} label="Executado (semana)" value={hm(l.executedWeekMinutes)} hint="sessões de foco" />
        <IndicatorCard tone="blue" icon={<ListChecks size={20} />} label="Pendentes" value={l.pending} hint={l.byPriority.map((p) => `${p.priority[0]}:${p.count}`).join(" · ")} />
        <IndicatorCard tone={l.overdue ? "red" : "green"} icon={<Flame size={20} />} label="Atrasadas" value={l.overdue} hint="prazo ou dia planejado passou" />
      </div>
      <div className="mt-2">
        <div className="mb-0.5 flex justify-between font-pixel text-[10px] uppercase text-rpg-muted">
          <span>Ocupação do resto da semana</span>
          <span className={clsx(l.occupancyPct != null && l.occupancyPct > 100 ? "text-rpg-red" : "text-rpg-text")}>{l.occupancyPct == null ? "sem capacidade declarada" : `${l.occupancyPct}%`}</span>
        </div>
        <RPGProgressBar value={Math.min(100, l.occupancyPct ?? 0)} tone={l.occupancyPct != null && l.occupancyPct > 100 ? "red" : "purple"} label="Ocupação" showLabel={false} />
        <p className="mt-1 text-[10.5px] text-rpg-muted">Disponível: {hm(l.freeMinutesRestOfWeek)} (Capacity Planner).</p>
      </div>
    </KitSection>
  );
}

export function TierCounts({ hub }: { hub: MissionsHub }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Missões por categoria">
      {(Object.keys(TIER_UI) as Array<keyof typeof TIER_UI>).map((k) => (
        <li key={k} className={clsx("inline-flex items-center gap-1 border px-2 py-1 text-xs", TIER_UI[k].cls)} style={R} title={k === "epica" ? "Dificuldade épica ou estimativa ≥ 4h" : k === "campanha" ? "Vinculada a campanha ou meta" : k === "prioritaria" ? "Prioridade Alta" : undefined}>
          <Layers size={11} aria-hidden /> {TIER_UI[k].label} <strong>{hub.counts[k]}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Mestre de Missões: subtarefas da missão em destaque + divisão sugerida (editável, só salva com aprovação). */
export function MissionMaster({ hub, onToast }: { hub: MissionsHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const actions = usePlanningActions();
  const f = hub.featured;
  const [newTitle, setNewTitle] = useState("");
  const [proposal, setProposal] = useState<{ ai: boolean; items: string[]; note: string } | null>(null);
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
  if (!f) return <KitSection title="Mestre de Missões" icon={<Wand2 size={16} />}><p className="text-sm text-rpg-muted">Nenhuma missão aberta. Crie uma nova missão para começar.</p></KitSection>;
  const list = f.subtaskList;
  const done = list.filter((s) => s.done).length;

  return (
    <KitSection title="Mestre de Missões" icon={<Wand2 size={16} />} tone="legendary">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate font-rpg font-bold text-rpg-gold-light">{f.title}</p>
        <span className={clsx("border px-1 font-pixel text-[9px] uppercase", TIER_UI[f.tier].cls)} style={{ borderRadius: 2 }}>
          {TIER_UI[f.tier].label}
        </span>
      </div>
      <p className="text-[11px] text-rpg-muted">
        {[f.projectName, f.goalTitle && `Meta: ${f.goalTitle}`, f.campaignTitle && `Campanha: ${f.campaignTitle}`, f.dueDate && `prazo ${dayBr(f.dueDate)}`, f.estimateMinutes && `~${hm(f.estimateMinutes)}`, `+${f.baseXp} XP base`].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <RPGProgressBar className="flex-1" value={done} max={Math.max(1, list.length)} tone="green" label="Progresso por subtarefas" showLabel={false} />
        <span className="font-pixel text-[10px] text-rpg-text">
          {done}/{list.length}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center"
              aria-label={s.done ? `Reabrir ${s.title}` : `Concluir subtarefa ${s.title}`}
              onClick={() =>
                actions.toggleSubtask.mutate(
                  { id: s.id, done: !s.done },
                  { onSuccess: (r) => r.allDone && onToast("Todas as subtarefas feitas! Conclua a missão para receber o XP."), onError: err },
                )
              }
            >
              {s.done ? <CheckCircle2 size={17} className="text-rpg-green" /> : <Circle size={17} className="text-rpg-muted" />}
            </button>
            <span className={clsx("min-w-0 flex-1 text-sm", s.done ? "text-rpg-muted line-through" : "text-rpg-text")}>{s.title}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center text-rpg-muted hover:text-rpg-red" aria-label={`Excluir ${s.title}`} onClick={() => actions.deleteSubtask.mutate(s.id, { onError: err })}>
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          actions.addSubtasks.mutate({ taskId: f.id, titles: [newTitle.trim()] }, { onSuccess: () => setNewTitle(""), onError: err });
        }}
      >
        <label htmlFor="new-subtask" className="sr-only">
          Nova subtarefa
        </label>
        <input id="new-subtask" value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nova subtarefa" className="min-h-[40px] min-w-0 flex-1 border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text" style={R} />
        <button type="submit" className="rpg-btn rpg-btn-secondary px-2 text-sm" disabled={!newTitle.trim()} aria-label="Adicionar subtarefa">
          <Plus size={14} />
        </button>
      </form>

      {proposal ? (
        <div className="mt-2 border border-rpg-purple/60 bg-rpg-purple/10 p-2" style={R}>
          <p className="mb-1 text-[11px] text-rpg-purple">{proposal.ai ? "Sugestão da IA" : "Roteiro sugerido"} — {proposal.note}</p>
          <ul className="space-y-1">
            {proposal.items.map((t, i) => (
              <li key={i} className="flex gap-1">
                <label className="sr-only" htmlFor={`prop-${i}`}>
                  Subtarefa sugerida {i + 1}
                </label>
                <input id={`prop-${i}`} value={t} maxLength={200} onChange={(e) => setProposal({ ...proposal, items: proposal.items.map((x, j) => (j === i ? e.target.value : x)) })} className="min-h-[36px] min-w-0 flex-1 border border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text" style={R} />
                <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted" aria-label="Remover sugestão" onClick={() => setProposal({ ...proposal, items: proposal.items.filter((_, j) => j !== i) })}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <button
              type="button"
              className="rpg-btn rpg-btn-success text-xs"
              disabled={proposal.items.filter((x) => x.trim()).length === 0 || actions.addSubtasks.isPending}
              onClick={() =>
                actions.addSubtasks.mutate(
                  { taskId: f.id, titles: proposal.items.filter((x) => x.trim()) },
                  {
                    onSuccess: () => {
                      setProposal(null);
                      onToast("Subtarefas salvas.");
                    },
                    onError: err,
                  },
                )
              }
            >
              Aprovar e salvar
            </button>
            <button type="button" className="rpg-btn rpg-btn-ghost text-xs" onClick={() => setProposal(null)}>
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          <button
            type="button"
            className="rpg-btn rpg-btn-primary inline-flex items-center justify-center gap-1 text-xs"
            disabled={actions.breakdown.isPending}
            onClick={() => actions.breakdown.mutate(f.id, { onSuccess: (r) => setProposal({ ai: r.ai, items: r.subtasks, note: r.note }), onError: err })}
          >
            <Sparkles size={13} aria-hidden /> {actions.breakdown.isPending ? "Dividindo…" : "Dividir com IA"}
          </button>
          <button
            type="button"
            className="rpg-btn rpg-btn-secondary inline-flex items-center justify-center gap-1 text-xs"
            onClick={() =>
              taskService
                .startTime(f.id)
                .then(() => onToast("Cronômetro iniciado. Pare pelo cartão da missão."))
                .catch(err)
            }
          >
            <Play size={13} aria-hidden /> Iniciar
          </button>
          <button
            type="button"
            className="rpg-btn rpg-btn-success inline-flex items-center justify-center gap-1 text-xs"
            onClick={() => {
              if (list.length > done && !confirm(`Ainda há ${list.length - done} subtarefa(s) abertas. Concluir a missão mesmo assim?`)) return;
              taskService
                .move(f.id, "Concluído")
                .then(() => {
                  actions.refreshAll();
                  onToast("Missão concluída!");
                })
                .catch(err);
            }}
          >
            <CheckCircle2 size={13} aria-hidden /> Concluir
          </button>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
        <button type="button" className="inline-flex items-center gap-1 text-rpg-gold-light underline" onClick={() => actions.planTask.mutate({ id: f.id, plannedDate: hub.today }, { onSuccess: () => onToast("Missão planejada para hoje (aparece na Torre do Tempo)."), onError: err })}>
          <CalendarPlus size={11} aria-hidden /> Planejar para hoje
        </button>
        {f.projectId && (
          <Link to={`/projetos/${f.projectId}`} className="text-rpg-gold-light underline">
            Abrir projeto
          </Link>
        )}
      </div>
    </KitSection>
  );
}

export function MissionsAutomationsAndAdvisor() {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <AutomationsPanel module="missions" title="Automações de missões" intro="Progresso por subtarefas, alertas e sincronizações. A conclusão (e o XP) é sempre feita por você, uma vez por missão." />
      <AdvisorPanel module="missions" title="Mestre de Missões (IA)" avatar={`${MODULE_ART}/missions/advisor.webp`} />
    </div>
  );
}
