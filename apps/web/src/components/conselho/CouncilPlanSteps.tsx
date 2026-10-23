import { useState, type DragEvent } from "react";
import clsx from "clsx";
import { CalendarClock, Clock, GripVertical, Sparkles } from "lucide-react";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { fmtDay, fmtMinutes } from "@/components/taverna/tavernFormat";
import type { CouncilCandidate, CouncilProposal } from "@/services/warCouncilService";
import { ReasonBadges } from "./CouncilSteps";

export type Assignments = Record<string, string | null>;
export interface BlockDraft {
  enabled: boolean;
  startTime: string;
  durationMinutes: number;
}

const UNPLANNED = "__sem_dia__";

/** Carga planejada por dia a partir das escolhas atuais (só apresentação; a regra de capacidade é do backend). */
export function loadsFor(proposal: CouncilProposal, assignments: Assignments) {
  const est = new Map(proposal.candidates.map((c) => [c.id, c.estimateMinutes ?? 0]));
  return proposal.dayLoads.map((d) => {
    const ids = Object.entries(assignments)
      .filter(([, date]) => date === d.date)
      .map(([id]) => id);
    return { ...d, plannedMinutes: ids.reduce((s, id) => s + (est.get(id) ?? 0), 0), tasks: ids.length };
  });
}

function TaskCard({
  task,
  value,
  proposal,
  reason,
  onChange,
  draggable,
}: {
  task: CouncilCandidate;
  value: string | null;
  proposal: CouncilProposal;
  reason: string | null;
  onChange: (date: string | null) => void;
  draggable: boolean;
}) {
  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <li draggable={draggable} onDragStart={draggable ? onDragStart : undefined} className="rpg-panel px-2.5 py-2 min-w-0 space-y-1.5">
      <div className="flex items-start gap-1.5 min-w-0">
        {draggable && <GripVertical size={14} className="mt-0.5 shrink-0 text-rpg-muted cursor-grab" aria-hidden />}
        <p className="min-w-0 flex-1 text-sm font-semibold text-rpg-text break-words leading-tight">{task.title}</p>
      </div>
      <p className="text-[11px] text-rpg-muted">
        {task.estimateMinutes ? fmtMinutes(task.estimateMinutes) : "sem estimativa"}
        {task.dueDate ? ` · prazo ${fmtDay(task.dueDate)}` : ""}
        {task.projectName ? ` · ${task.projectName}` : ""}
      </p>
      <ReasonBadges reasons={task.reasons} />
      {reason && !value && <p className="text-[11px] text-rpg-orange">{reason}</p>}
      <label className="block">
        <span className="sr-only">Dia planejado para {task.title}</span>
        <select
          value={value ?? UNPLANNED}
          onChange={(e) => onChange(e.target.value === UNPLANNED ? null : e.target.value)}
          className="w-full min-h-[36px] border-2 border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text focus:border-rpg-gold focus:outline-none"
          style={{ borderRadius: 3 }}
        >
          <option value={UNPLANNED}>Fora do plano</option>
          {proposal.dayLoads.map((d) => (
            <option key={d.date} value={d.date} disabled={d.date < proposal.firstDay}>
              {fmtDay(d.date)}
              {d.date < proposal.firstDay ? " (já passou)" : ""}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

/**
 * Passo 3 — distribuição pelos dias. A proposta vem do backend (capacidade
 * real); o usuário ajusta pelo seletor de dia (sempre) ou arrastando (desktop).
 */
export function CouncilDistributionStep({
  proposal,
  assignments,
  onAssign,
  desktop,
}: {
  proposal: CouncilProposal;
  assignments: Assignments;
  onAssign: (taskId: string, date: string | null) => void;
  desktop: boolean;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const loads = loadsFor(proposal, assignments);
  const reasons = new Map(proposal.assignments.map((a) => [a.taskId, a.unplacedReason]));
  const byId = new Map(proposal.candidates.map((c) => [c.id, c]));
  const unplanned = proposal.candidates.filter((c) => !assignments[c.id]);

  if (proposal.candidates.length === 0) {
    return (
      <RPGPanel>
        <p className="text-sm text-rpg-text">Nenhuma missão candidata para esta semana.</p>
        <p className="text-xs text-rpg-muted mt-1">Escolha focos com missões abertas, ou crie missões com prazo — sem candidatas não há o que distribuir.</p>
      </RPGPanel>
    );
  }

  const drop = (date: string | null) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!byId.has(id) || (date && date < proposal.firstDay)) return;
    onAssign(id, date);
  };
  const dropProps = (key: string, date: string | null) =>
    desktop
      ? {
          onDragOver: (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            setDragOver(key);
          },
          onDragLeave: () => setDragOver((k) => (k === key ? null : k)),
          onDrop: drop(date),
        }
      : {};

  return (
    <div className="space-y-4">
      <p className="text-xs text-rpg-muted">
        Proposta calculada com a sua capacidade livre real (janela útil menos a agenda e as tarefas fora do plano). Ajuste à vontade — nada é gravado antes de selar.
        {desktop ? " Arraste as missões entre os dias ou use o seletor." : ""}
      </p>

      <section
        aria-label="Missões fora do plano"
        {...dropProps(UNPLANNED, null)}
        className={clsx("rpg-panel p-3", dragOver === UNPLANNED && "border-rpg-gold")}
      >
        <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold mb-2">
          Fora do plano ({unplanned.length})
        </p>
        {unplanned.length === 0 ? (
          <p className="text-xs text-rpg-muted">Todas as candidatas têm um dia.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {unplanned.map((t) => (
              <TaskCard key={t.id} task={t} value={null} proposal={proposal} reason={reasons.get(t.id) ?? null} onChange={(d) => onAssign(t.id, d)} draggable={desktop} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-7 [&>*]:min-w-0">
        {loads.map((d) => {
          const past = d.date < proposal.firstDay;
          const over = d.plannedMinutes > d.capacityMinutes;
          const tasks = proposal.candidates.filter((c) => assignments[c.id] === d.date);
          return (
            <section
              key={d.date}
              aria-label={`${fmtDay(d.date)}: ${tasks.length} missões`}
              {...(past ? {} : dropProps(d.date, d.date))}
              className={clsx("rpg-panel p-2.5 space-y-2", past && "opacity-60", dragOver === d.date && "border-rpg-gold", over && "rpg-panel-danger")}
            >
              <div>
                <p className="font-pixel text-xs text-rpg-gold-light capitalize">{fmtDay(d.date)}</p>
                {past ? (
                  <p className="text-[11px] text-rpg-muted">Já passou</p>
                ) : (
                  <>
                    <RPGProgressBar
                      className="mt-1"
                      tone={over ? "red" : "green"}
                      label={`Carga de ${fmtDay(d.date)}`}
                      value={Math.min(d.plannedMinutes, Math.max(d.capacityMinutes, 1))}
                      max={Math.max(d.capacityMinutes, 1)}
                      showLabel={false}
                    />
                    <p className={clsx("text-[11px] mt-0.5", over ? "text-rpg-red" : "text-rpg-muted")}>
                      {fmtMinutes(d.plannedMinutes)} de {fmtMinutes(d.capacityMinutes)} livres{over ? " — acima da capacidade" : ""}
                    </p>
                  </>
                )}
              </div>
              {tasks.length === 0 ? (
                <p className="text-[11px] text-rpg-muted">{past ? "" : "Sem missões."}</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} value={d.date} proposal={proposal} reason={null} onChange={(nd) => onAssign(t.id, nd)} draggable={desktop} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Passo 4 — blocos opcionais na Agenda para as missões com dia. */
export function CouncilAgendaStep({
  proposal,
  assignments,
  blocks,
  onBlock,
  suggestedHour,
}: {
  proposal: CouncilProposal;
  assignments: Assignments;
  blocks: Record<string, BlockDraft>;
  onBlock: (taskId: string, patch: Partial<BlockDraft>) => void;
  suggestedHour: number | null;
}) {
  const planned = proposal.candidates.filter((c) => assignments[c.id]).sort((a, b) => String(assignments[a.id]).localeCompare(String(assignments[b.id])));
  if (planned.length === 0) {
    return (
      <RPGPanel>
        <p className="text-sm text-rpg-muted">Nenhuma missão com dia ainda — volte ao passo anterior para distribuir.</p>
      </RPGPanel>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-rpg-muted">
        Opcional: reserve um horário na Agenda para as missões que precisam de tempo protegido.
        {suggestedHour != null && (
          <>
            {" "}
            <Sparkles size={12} className="inline text-rpg-purple" aria-hidden /> Sugestão: seu Ritmo do herói mostra que você rende mais por volta das {String(suggestedHour).padStart(2, "0")}h.
          </>
        )}
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {planned.map((t) => {
          const b = blocks[t.id];
          const id = `bloco-${t.id}`;
          return (
            <li key={t.id} className={clsx("rpg-panel p-3 space-y-2 min-w-0", b?.enabled && "rpg-panel-gold")}>
              <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-start gap-2">
                <input
                  id={id}
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[rgb(var(--rpg-gold))]"
                  checked={!!b?.enabled}
                  onChange={(e) => onBlock(t.id, { enabled: e.target.checked })}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-rpg-text break-words">{t.title}</span>
                  <span className="block text-[11px] text-rpg-muted capitalize">
                    {fmtDay(String(assignments[t.id]))}
                    {t.estimateMinutes ? ` · ${fmtMinutes(t.estimateMinutes)}` : ""}
                  </span>
                </span>
              </label>
              {b?.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-rpg-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} aria-hidden /> Início
                    </span>
                    <input
                      type="time"
                      value={b.startTime}
                      onChange={(e) => onBlock(t.id, { startTime: e.target.value })}
                      className="mt-1 w-full min-h-[36px] border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text focus:border-rpg-gold focus:outline-none"
                      style={{ borderRadius: 3 }}
                    />
                  </label>
                  <label className="text-[11px] text-rpg-muted">
                    <span className="flex items-center gap-1">
                      <CalendarClock size={11} aria-hidden /> Duração (min)
                    </span>
                    <input
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={b.durationMinutes}
                      onChange={(e) => onBlock(t.id, { durationMinutes: Number(e.target.value) })}
                      className="mt-1 w-full min-h-[36px] border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text focus:border-rpg-gold focus:outline-none"
                      style={{ borderRadius: 3 }}
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Validação local do bloco (o backend valida de novo). */
export function blockError(b: BlockDraft): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime)) return "Informe um horário válido.";
  if (!Number.isInteger(b.durationMinutes) || b.durationMinutes < 15 || b.durationMinutes > 480) return "A duração deve ficar entre 15 e 480 minutos.";
  const [h, m] = b.startTime.split(":").map(Number);
  if (h * 60 + m + b.durationMinutes > 24 * 60) return "O bloco precisa terminar no mesmo dia.";
  return null;
}

export function SealSummaryBadges({ planned, blocks, focus }: { planned: number; blocks: number; focus: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <RPGBadge tone="green">{planned} missões com dia</RPGBadge>
      <RPGBadge tone="blue">{blocks} blocos na Agenda</RPGBadge>
      <RPGBadge tone="gold">{focus} focos</RPGBadge>
    </div>
  );
}
