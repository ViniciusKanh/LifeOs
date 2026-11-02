import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarClock, ChevronRight, Coins, Crosshair, Flag, Hourglass, Pencil, Skull, Sparkles, Swords, Trash2 } from "lucide-react";
import { KIND_META, daysUntil, formatMinutes, formatProjectDate, projectHealth, type ProjectHealthKey } from "./projectMeta";
import type { Project, ProjectLoad, Task } from "@/types";

/**
 * Peças do gestor de projetos (v2) — portfólio organizado por urgência,
 * com linguagem de "campanha" no tema RPG e versão limpa no tema clássico.
 * Todo número vem do projeto, das tarefas vinculadas ou do XP do backend.
 */

export const HEALTH_STYLE: Record<ProjectHealthKey, { chip: string; edge: string; icon: string }> = {
  late: { chip: "bg-drop/10 text-drop rpg:bg-rpg-red/15 rpg:text-rpg-red rpg:border-rpg-red/60", edge: "bg-drop rpg:bg-rpg-red", icon: "text-drop rpg:text-rpg-red" },
  risk: { chip: "bg-signal/15 text-signal-deep rpg:bg-rpg-orange/15 rpg:text-rpg-orange rpg:border-rpg-orange/60", edge: "bg-signal rpg:bg-rpg-orange", icon: "text-signal rpg:text-rpg-orange" },
  ok: { chip: "bg-cat-green/10 text-cat-green rpg:bg-rpg-green/15 rpg:text-rpg-green rpg:border-rpg-green/50", edge: "bg-cat-green rpg:bg-rpg-green", icon: "text-cat-green rpg:text-rpg-green" },
  idle: { chip: "bg-slate/10 text-slate rpg:bg-rpg-bg-2 rpg:text-rpg-muted rpg:border-rpg-border", edge: "bg-slate/50 rpg:bg-rpg-muted", icon: "text-slate rpg:text-rpg-muted" },
  done: { chip: "bg-brand-500/10 text-brand-600 rpg:bg-rpg-gold/15 rpg:text-rpg-gold-light rpg:border-rpg-gold/60", edge: "bg-brand-500 rpg:bg-rpg-gold", icon: "text-brand-600 rpg:text-rpg-gold-light" },
};

const chipBase = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight rpg:rounded-[2px] rpg:border rpg:font-pixel rpg:uppercase rpg:tracking-wide";

/** "D-5", "Hoje", "3d atrasado" — contagem regressiva do prazo do projeto. */
export function deadlineLabel(due: string | null, today: string): string | null {
  const d = daysUntil(due, today);
  if (d === null) return null;
  if (d === 0) return "Vence hoje";
  if (d < 0) return `${-d}d atrasado`;
  return `D-${d}`;
}

/** Barra de progresso com marcos (25/50/75%) — cada marco aceso é um "estandarte" conquistado. */
export function MilestoneBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="relative" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08] rpg:rounded-none rpg:h-3 rpg:bg-rpg-bg rpg:border rpg:border-rpg-border">
        <div
          className="h-full bg-gradient-to-r from-cat-green to-brand-500 rpg:bg-none rpg:bg-rpg-green transition-[width] duration-700 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      {[25, 50, 75].map((m) => (
        <span
          key={m}
          aria-hidden
          className={clsx(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-1 rounded-full rpg:rounded-none rpg:h-4",
            pct >= m ? "bg-white/90 rpg:bg-rpg-gold" : "bg-black/15 dark:bg-white/20 rpg:bg-rpg-border",
          )}
          style={{ left: `${m}%` }}
        />
      ))}
    </div>
  );
}

interface CardProps {
  project: Project;
  load?: ProjectLoad;
  xp?: { earnedXp: number; availableXp: number };
  currentMission: Task | null;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}

/** Cartão de campanha (projeto) — compacto, ordenado por urgência na listagem. */
export function CampaignCard({ project, load, xp, currentMission, today, onEdit, onDelete }: CardProps) {
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0;
  const health = projectHealth(project, load?.overdue ?? 0, today);
  const hs = HEALTH_STYLE[health.key];
  const open = project.task_count - project.done_count;
  const deadline = project.status !== "completed" ? deadlineLabel(project.due_date, today) : null;
  const kind = KIND_META[project.kind];
  const KindIcon = kind.icon;

  return (
    <article
      className={clsx(
        "group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-paper-raised dark:bg-ink-raised border-paper-border dark:border-ink-border transition-shadow hover:shadow-md",
        "rpg:rpg-panel rpg:rounded-[4px]",
        health.key === "done" && "rpg:rpg-panel-gold",
        health.key === "late" && "rpg:rpg-panel-danger",
      )}
    >
      {/* Faixa de cor do projeto + saúde. */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: project.color ?? undefined }} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 p-4 pt-5">
        <header className="flex items-start gap-3 min-w-0">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-bronze rpg:bg-rpg-bg-2 rpg:text-rpg-gold-light"
            style={{ backgroundColor: project.color ?? "#7C4DFF" }}
            aria-hidden
          >
            <Swords size={18} className="hidden rpg:block" />
            <KindIcon size={17} className="rpg:hidden" />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to={`/projetos/${project.id}`}
              className="block font-semibold leading-tight break-words hover:underline rpg:font-rpg rpg:text-rpg-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              {project.name}
            </Link>
            <p className="mt-0.5 truncate text-[11px] text-slate rpg:text-rpg-muted">
              {kind.label}
              {project.client ? ` · ${project.client}` : ""}
              {project.area ? ` · ${project.area}` : ""}
              {project.role === "member" ? " · compartilhado" : ""}
            </p>
          </div>
          <div className="-mr-1 flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
            <button type="button" onClick={onEdit} className="flex h-9 w-9 items-center justify-center text-slate hover:text-brand-600 rpg:text-rpg-muted rpg:hover:text-rpg-gold-light" aria-label={`Editar projeto ${project.name}`}>
              <Pencil size={14} />
            </button>
            <button type="button" onClick={onDelete} className="flex h-9 w-9 items-center justify-center text-slate hover:text-drop rpg:text-rpg-muted rpg:hover:text-rpg-red" aria-label={`Excluir projeto ${project.name}`}>
              <Trash2 size={14} />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx(chipBase, hs.chip)}>
            {health.key === "late" ? <Skull size={10} aria-hidden /> : <Flag size={10} aria-hidden />} {health.label}
          </span>
          {deadline && (
            <span className={clsx(chipBase, health.key === "late" ? hs.chip : "bg-black/[0.04] dark:bg-white/[0.06] text-slate rpg:bg-rpg-bg-2 rpg:text-rpg-muted rpg:border-rpg-border")}>
              <CalendarClock size={10} aria-hidden /> {deadline}
              <span className="font-normal normal-case opacity-80">· {formatProjectDate(project.due_date, { day: "2-digit", month: "short" })}</span>
            </span>
          )}
          {project.priority && (project.priority === "Alta" || project.priority === "Crítica") && (
            <span className={clsx(chipBase, "bg-drop/10 text-drop rpg:bg-rpg-red/10 rpg:text-rpg-red rpg:border-rpg-red/50")}>{project.priority}</span>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate rpg:text-rpg-muted">
            <span>
              {project.done_count}/{project.task_count} {project.task_count === 1 ? "missão" : "missões"}
            </span>
            <span className="font-semibold tabular-nums text-inherit rpg:font-pixel rpg:text-rpg-green">{pct}%</span>
          </div>
          <MilestoneBar pct={pct} label={`Progresso de ${project.name}: ${pct}%`} />
        </div>

        <dl className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <Stat label="Abertas" value={String(open)} accent={load && load.overdue > 0 ? `${load.overdue} atras.` : undefined} />
          <Stat label="Restante" value={load && load.remainingMinutes > 0 ? formatMinutes(load.remainingMinutes) : "—"} icon={<Hourglass size={10} aria-hidden />} />
          <Stat
            label="XP"
            value={xp ? `${xp.earnedXp}` : "—"}
            accent={xp && xp.availableXp > 0 ? `+${xp.availableXp} disp.` : undefined}
            icon={<Sparkles size={10} aria-hidden />}
            valueClass="text-cat-purple rpg:text-rpg-purple"
          />
        </dl>

        {currentMission ? (
          <Link
            to={`/projetos/${project.id}`}
            className="flex items-center gap-2 rounded-xl border border-dashed border-paper-border px-2.5 py-2 text-xs hover:border-brand-500 dark:border-ink-border rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg/40 rpg:hover:border-rpg-gold"
          >
            <Crosshair size={13} className={clsx("shrink-0", hs.icon)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-muted">Missão atual</span>
              <span className="block truncate font-medium rpg:text-rpg-text">{currentMission.title}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-slate" aria-hidden />
          </Link>
        ) : (
          <p className="text-xs text-slate rpg:text-rpg-muted">{project.status === "completed" ? "Campanha concluída." : "Nenhuma missão em aberto — adicione a próxima etapa."}</p>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value, accent, icon, valueClass }: { label: string; value: string; accent?: string; icon?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-paper px-1.5 py-1.5 dark:bg-ink rpg:rounded-[3px] rpg:border rpg:border-rpg-border/70 rpg:bg-rpg-bg/40">
      <dt className="flex items-center justify-center gap-1 text-slate rpg:text-rpg-muted">
        {icon}
        {label}
      </dt>
      <dd className={clsx("truncate font-semibold tabular-nums text-sm rpg:font-pixel", valueClass ?? "rpg:text-rpg-text")}>{value}</dd>
      {accent && <dd className="truncate text-[10px] text-drop rpg:text-rpg-orange">{accent}</dd>}
    </div>
  );
}

/** Linha compacta (visão "Lista") — no celular vira um cartão empilhado. */
export function ProjectRow({ project, load, today }: { project: Project; load?: ProjectLoad; today: string }) {
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0;
  const health = projectHealth(project, load?.overdue ?? 0, today);
  const hs = HEALTH_STYLE[health.key];
  const deadline = project.status !== "completed" ? deadlineLabel(project.due_date, today) : null;
  return (
    <li>
      <Link
        to={`/projetos/${project.id}`}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border border-paper-border bg-paper-raised px-3 py-2.5 hover:border-brand-500/50 dark:border-ink-border dark:bg-ink-raised rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-border rpg:bg-rpg-panel rpg:hover:border-rpg-gold/70"
      >
        <span className={clsx("h-9 w-1.5 rounded-full rpg:rounded-none", hs.edge)} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold rpg:font-rpg rpg:text-rpg-text">{project.name}</span>
          <span className="block truncate text-[11px] text-slate rpg:text-rpg-muted">
            {project.done_count}/{project.task_count} missões · {health.label}
          </span>
        </span>
        <span className="col-span-3 sm:col-span-1 order-last sm:order-none">
          <MilestoneBar pct={pct} label={`Progresso de ${project.name}: ${pct}%`} />
        </span>
        <span className={clsx("text-xs font-semibold tabular-nums whitespace-nowrap", health.key === "late" ? "text-drop rpg:text-rpg-red" : "text-slate rpg:text-rpg-muted")}>
          {deadline ?? `${pct}%`}
        </span>
        <ChevronRight size={16} className="hidden sm:block text-slate group-hover:translate-x-0.5 transition-transform" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * "Próximas missões": tarefas abertas dos projetos ativos, atrasadas primeiro
 * e depois por prazo. Responde a pergunta "o que eu faço agora?" do gestor.
 */
export function NextMissionsPanel({ tasks, projects, today }: { tasks: Task[]; projects: Project[]; today: string }) {
  const active = new Map(projects.filter((p) => p.status === "active" || p.status === "planning").map((p) => [p.id, p]));
  const list = tasks
    .filter((t) => t.project_id && active.has(t.project_id) && t.status !== "Concluído")
    .sort((a, b) => {
      const doingA = a.status === "Em Andamento" ? 0 : 1;
      const doingB = b.status === "Em Andamento" ? 0 : 1;
      const da = a.due_date ?? "9999-12-31";
      const db = b.due_date ?? "9999-12-31";
      return da.localeCompare(db) || doingA - doingB;
    })
    .slice(0, 6);

  return (
    <section
      aria-label="Próximas missões dos projetos"
      className="rounded-2xl border border-paper-border bg-paper-raised p-4 dark:border-ink-border dark:bg-ink-raised rpg:rpg-panel rpg:rounded-[4px]"
    >
      <div className="mb-2 flex items-center gap-2">
        <Crosshair size={16} className="text-brand-600 rpg:text-rpg-gold" aria-hidden />
        <h2 className="text-sm font-semibold rpg:rpg-title rpg:text-base">Próximas missões</h2>
        <Link to="/tarefas" className="ml-auto text-[11px] font-semibold text-brand-600 hover:underline rpg:text-rpg-gold-light">
          Quadro →
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-xs text-slate rpg:text-rpg-muted">Nenhuma tarefa aberta nos projetos ativos. Entre num projeto e crie a próxima missão.</p>
      ) : (
        <ul className="divide-y divide-paper-border dark:divide-ink-border rpg:divide-rpg-border/60">
          {list.map((t) => {
            const p = active.get(t.project_id as string);
            const d = daysUntil(t.due_date, today);
            const late = d !== null && d < 0;
            return (
              <li key={t.id}>
                <Link to={`/projetos/${t.project_id}`} className="flex items-center gap-2.5 py-2 text-xs hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <span className="h-2 w-2 shrink-0 rounded-full rpg:rounded-none" style={{ backgroundColor: p?.color ?? "#7C4DFF" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium rpg:text-rpg-text">{t.title}</span>
                    <span className="block truncate text-[10.5px] text-slate rpg:text-rpg-muted">
                      {p?.name}
                      {t.status === "Em Andamento" ? " · em andamento" : ""}
                    </span>
                  </span>
                  {d !== null && (
                    <span className={clsx("shrink-0 font-semibold tabular-nums", late ? "text-drop rpg:text-rpg-red" : d <= 2 ? "text-signal-deep rpg:text-rpg-orange" : "text-slate rpg:text-rpg-muted")}>
                      {late ? `${-d}d atrás` : d === 0 ? "hoje" : `${d}d`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export { Coins };
