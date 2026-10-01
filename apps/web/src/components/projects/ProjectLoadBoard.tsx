import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, CalendarClock, Clock, Gauge, Hourglass, Info } from "lucide-react";
import { formatMinutes } from "@/components/projects/projectMeta";
import type { LoadPressure, ProjectLoad, WorkloadSummary } from "@/types";

/**
 * Painel de carga por projeto — reutilizado no Dashboard, em Projetos e na
 * área Profissional. Duas leituras:
 *  - "Tarefas": barra empilhada (concluídas / em andamento / a fazer) com
 *    comprimento proporcional ao maior projeto — compara volume e progresso;
 *  - "Horas": restante estimado × registrado no período (cronômetro + foco).
 * A pressão (crítica/atenção/em dia) vem pronta do backend (classifyPressure).
 */

const PRESSURE_META: Record<LoadPressure, { label: string; className: string }> = {
  critical: { label: "Crítica", className: "bg-drop/10 text-drop" },
  attention: { label: "Atenção", className: "bg-signal/15 text-signal-deep dark:text-signal" },
  ok: { label: "Em dia", className: "bg-cat-green/10 text-cat-green" },
  idle: { label: "Sem carga", className: "bg-slate/10 text-slate" },
};

const SEGMENTS = [
  { key: "done", label: "Concluídas", className: "bg-growth" },
  { key: "doing", label: "Em andamento", className: "bg-cat-blue" },
  { key: "todo", label: "A fazer", className: "bg-cat-purple/70" },
] as const;

type Mode = "tasks" | "hours";

function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function hours(min: number) {
  if (min <= 0) return "0h";
  return min < 60 ? `${min}min` : `${(min / 60).toFixed(min >= 600 ? 0 : 1).replace(".", ",")}h`;
}

function ProjectRow({ p, max, mode, index }: { p: ProjectLoad; max: number; mode: Mode; index: number }) {
  const pressure = PRESSURE_META[p.pressure];
  const href = p.id ? `/projetos/${p.id}` : "/tarefas";
  const scale = max > 0 ? (mode === "tasks" ? p.total : Math.max(p.remainingMinutes, p.loggedMinutesPeriod)) / max : 0;

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-paper-border dark:border-ink-border p-3 hover:border-brand-500/40 transition-colors"
    >
      <Link to={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color ?? "#6E7391" }} aria-hidden />
          <p className="text-sm font-semibold truncate flex-1">{p.name}</p>
          {p.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-drop/10 text-drop shrink-0">
              <AlertTriangle size={10} /> {p.overdue} atrasada{p.overdue > 1 ? "s" : ""}
            </span>
          )}
          <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0", pressure.className)}>{pressure.label}</span>
        </div>

        {/* Barra: largura total proporcional ao maior projeto; segmentos = composição */}
        <div className="mt-2.5 h-2.5 rounded-full bg-paper-border/70 dark:bg-ink-border/70 overflow-hidden">
          <motion.div
            className="h-full flex gap-px"
            initial={{ width: 0 }}
            whileInView={{ width: `${Math.max(scale * 100, p.total > 0 || p.remainingMinutes > 0 ? 6 : 0)}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: "easeOut", delay: index * 0.04 }}
          >
            {mode === "tasks"
              ? SEGMENTS.map((s) => {
                  const v = p[s.key];
                  return v > 0 ? <span key={s.key} className={clsx("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ flexGrow: v }} title={`${s.label}: ${v}`} /> : null;
                })
              : (
                  <>
                    {p.loggedMinutesPeriod > 0 && <span className="h-full bg-cat-purple first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.loggedMinutesPeriod }} title={`Registrado: ${hours(p.loggedMinutesPeriod)}`} />}
                    {p.remainingMinutes > 0 && <span className="h-full bg-signal/80 first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.remainingMinutes }} title={`Restante: ${hours(p.remainingMinutes)}`} />}
                  </>
                )}
          </motion.div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate">
          {mode === "tasks" ? (
            <>
              <span>
                <strong className="text-inherit font-semibold">{p.open}</strong> em aberto · {p.done}/{p.total} ({p.progressPct}%)
              </span>
              {p.doing > 0 && <span>{p.doing} em andamento</span>}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1">
                <Hourglass size={11} /> <strong className="text-inherit font-semibold">{hours(p.remainingMinutes)}</strong> restantes
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> {hours(p.loggedMinutesPeriod)} registradas
              </span>
              {p.unestimatedOpen > 0 && <span className="text-signal-deep dark:text-signal">{p.unestimatedOpen} sem estimativa</span>}
            </>
          )}
          {p.nextDue && (
            <span className={clsx("inline-flex items-center gap-1 min-w-0", p.nextDue.date < (new Date().toISOString().slice(0, 10)) && "text-drop")}>
              <CalendarClock size={11} /> <span className="truncate max-w-[160px]">{p.nextDue.title}</span> · {shortDate(p.nextDue.date)}
            </span>
          )}
          {p.hoursPerDayNeeded !== null && p.daysToDeadline !== null && (
            <span className="inline-flex items-center gap-1">
              <Gauge size={11} /> ~{String(p.hoursPerDayNeeded).replace(".", ",")} h/dia até {p.daysToDeadline < 0 ? "o prazo (vencido)" : shortDate(p.dueDate as string)}
            </span>
          )}
        </div>
      </Link>
    </motion.li>
  );
}

export function ProjectLoadBoard({
  workload,
  isLoading,
  limit,
  showTotals = true,
  emptyText = "Nenhuma tarefa em aberto nos seus projetos — carga zerada.",
}: {
  workload: WorkloadSummary | null;
  isLoading: boolean;
  limit?: number;
  showTotals?: boolean;
  emptyText?: string;
}) {
  const [mode, setMode] = useState<Mode>("tasks");
  const rows = useMemo(() => (workload?.projects ?? []).filter((p) => p.total > 0 && (p.open > 0 || p.completedPeriod > 0)), [workload]);
  const visible = limit ? rows.slice(0, limit) : rows;
  const max = useMemo(
    () => Math.max(0, ...visible.map((p) => (mode === "tasks" ? p.total : Math.max(p.remainingMinutes, p.loggedMinutesPeriod)))),
    [visible, mode]
  );
  const t = workload?.totals;

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[74px] rounded-xl bg-paper-border/50 dark:bg-ink-border/50 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!workload || rows.length === 0) {
    return <p className="text-sm text-slate py-8 text-center">{emptyText}</p>;
  }

  return (
    <div>
      {showTotals && t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: "Em aberto", value: String(t.open), hint: t.overdue > 0 ? `${t.overdue} atrasadas` : `${t.dueThisWeek} vencem em 7 dias`, warn: t.overdue > 0 },
            { label: "Restante estimado", value: formatMinutes(t.remainingMinutes), hint: t.unestimatedOpen > 0 ? `${t.unestimatedOpen} tarefas sem estimativa` : "todas estimadas", warn: false },
            { label: `Registrado (${workload.periodDays}d)`, value: formatMinutes(t.loggedMinutesPeriod), hint: "cronômetro + foco", warn: false },
            {
              label: "Para zerar a carga",
              value: t.weeksToClear !== null ? `${String(t.weeksToClear).replace(".", ",")} sem.` : "—",
              hint: t.weeksToClear !== null ? "no ritmo registrado" : "sem histórico de horas",
              warn: false,
            },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-paper dark:bg-ink px-3 py-2">
              <p className="text-[11px] text-slate">{k.label}</p>
              <p className="font-display font-bold text-lg leading-tight">{k.value}</p>
              <p className={clsx("text-[10px]", k.warn ? "text-drop font-semibold" : "text-slate")}>{k.hint}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate" aria-hidden>
          {mode === "tasks"
            ? SEGMENTS.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1">
                  <span className={clsx("w-2 h-2 rounded-sm", s.className)} /> {s.label}
                </span>
              ))
            : [
                { l: "Registrado", c: "bg-cat-purple" },
                { l: "Restante", c: "bg-signal/80" },
              ].map((s) => (
                <span key={s.l} className="inline-flex items-center gap-1">
                  <span className={clsx("w-2 h-2 rounded-sm", s.c)} /> {s.l}
                </span>
              ))}
        </div>
        <div role="tablist" aria-label="Ver carga por" className="inline-flex rounded-lg bg-paper dark:bg-ink p-0.5 shrink-0">
          {(["tasks", "hours"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={clsx("rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors", mode === m ? "bg-paper-raised dark:bg-ink-raised shadow-sm text-inherit" : "text-slate")}
            >
              {m === "tasks" ? "Tarefas" : "Horas"}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map((p, i) => (
          <ProjectRow key={p.id ?? "none"} p={p} max={max} mode={mode} index={i} />
        ))}
      </ul>

      <p className="mt-2.5 text-[10px] text-slate flex items-start gap-1">
        <Info size={11} className="shrink-0 mt-px" />
        <span>
          Pressão: <strong>crítica</strong> com tarefa atrasada ou mais de 6 h/dia necessárias até o prazo; <strong>atenção</strong> com prazo em 7 dias ou mais de 3 h/dia.
          {limit && rows.length > limit ? ` Mostrando ${limit} de ${rows.length} projetos.` : ""}
        </span>
      </p>
    </div>
  );
}
