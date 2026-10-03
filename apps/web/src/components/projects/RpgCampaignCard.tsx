import { Link } from "react-router-dom";
import { CalendarClock, Coins, Hourglass, Pencil, Sparkles, Swords, Trash2 } from "lucide-react";
import { RPGBadge, RPGProgressBar, rpgButtonClass, type RpgTone } from "@/components/rpg";
import { formatMinutes, formatProjectDate } from "./projectMeta";
import type { Project, ProjectLoad, ProjectStatus, Task } from "@/types";

const STATUS_RPG: Record<ProjectStatus, { label: string; tone: RpgTone }> = {
  planning: { label: "Planejamento", tone: "blue" },
  active: { label: "Em andamento", tone: "green" },
  paused: { label: "Pausada", tone: "orange" },
  completed: { label: "Concluída", tone: "gold" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

/**
 * Cartão de "campanha" (projeto) no tema RPG: progresso derivado das
 * tarefas, missões abertas/concluídas, prazo, estimativa restante, XP
 * conquistado/disponível (backend) e a missão atual.
 */
export function RpgCampaignCard({
  project,
  load,
  xp,
  currentMission,
  today,
  onEdit,
  onDelete,
}: {
  project: Project;
  load?: ProjectLoad;
  xp?: { earnedXp: number; availableXp: number };
  currentMission: Task | null;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_RPG[project.status] ?? STATUS_RPG.active;
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0;
  const overdue = !!project.due_date && project.status !== "completed" && project.due_date.slice(0, 10) < today;
  const open = project.task_count - project.done_count;

  return (
    <article className={`rpg-panel ${project.status === "completed" ? "rpg-panel-gold" : ""} flex flex-col gap-3 p-4 min-w-0 w-full`}>
      <header className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-rpg-bronze bg-rpg-bg-2 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
          <Swords size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-rpg font-bold text-rpg-text leading-tight break-words">{project.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <RPGBadge tone={status.tone}>{status.label}</RPGBadge>
            {project.due_date && (
              <RPGBadge tone={overdue ? "red" : "muted"} icon={<CalendarClock size={10} aria-hidden />}>
                {formatProjectDate(project.due_date, { day: "2-digit", month: "short" })}
              </RPGBadge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 -mr-1">
          <button type="button" onClick={onEdit} className="w-8 h-8 flex items-center justify-center text-rpg-muted hover:text-rpg-gold-light" aria-label={`Editar projeto ${project.name}`}>
            <Pencil size={13} />
          </button>
          <button type="button" onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-rpg-muted hover:text-rpg-red" aria-label={`Excluir projeto ${project.name}`}>
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <RPGProgressBar tone="green" label={`${project.done_count}/${project.task_count} missões concluídas`} value={pct} max={100} valueLabel={`${pct}%`} />

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="border border-rpg-border/70 bg-rpg-bg/40 px-2 py-1.5" style={{ borderRadius: 3 }}>
          <dt className="text-rpg-muted">Missões abertas</dt>
          <dd className="font-pixel text-sm text-rpg-text tabular-nums">{open}</dd>
        </div>
        <div className="border border-rpg-border/70 bg-rpg-bg/40 px-2 py-1.5" style={{ borderRadius: 3 }}>
          <dt className="text-rpg-muted inline-flex items-center gap-1">
            <Hourglass size={10} aria-hidden /> Restante
          </dt>
          <dd className="font-pixel text-sm text-rpg-text">{load && load.remainingMinutes > 0 ? formatMinutes(load.remainingMinutes) : "—"}</dd>
        </div>
        <div className="border border-rpg-border/70 bg-rpg-bg/40 px-2 py-1.5" style={{ borderRadius: 3 }}>
          <dt className="text-rpg-muted inline-flex items-center gap-1">
            <Sparkles size={10} aria-hidden /> XP conquistado
          </dt>
          <dd className="font-pixel text-sm text-rpg-purple tabular-nums">{xp?.earnedXp ?? 0}</dd>
        </div>
        <div className="border border-rpg-border/70 bg-rpg-bg/40 px-2 py-1.5" style={{ borderRadius: 3 }}>
          <dt className="text-rpg-muted inline-flex items-center gap-1">
            <Coins size={10} aria-hidden /> XP disponível
          </dt>
          <dd className="font-pixel text-sm text-rpg-gold-light tabular-nums">{xp?.availableXp ?? 0}</dd>
        </div>
      </dl>

      <p className="text-xs text-rpg-muted min-h-[1rem] truncate">
        {currentMission ? (
          <>
            Missão atual: <span className="text-rpg-text">{currentMission.title}</span>
          </>
        ) : project.status === "completed" ? (
          "Projeto concluído."
        ) : (
          "Nenhuma missão em aberto."
        )}
      </p>
      {load && load.overdue > 0 && <p className="-mt-2 text-[11px] text-rpg-red">{load.overdue} missão(ões) atrasada(s)</p>}

      <Link to={`/projetos/${project.id}`} className={rpgButtonClass(project.status === "completed" ? "secondary" : "primary", "mt-auto justify-center")}>
        Entrar no projeto
      </Link>
    </article>
  );
}

/** Missão atual de uma campanha: a em andamento; senão, a aberta de prazo mais próximo. */
export function currentMissionFor(tasks: Task[], projectId: string): Task | null {
  const open = tasks.filter((t) => t.project_id === projectId && t.status !== "Concluído");
  const doing = open.find((t) => t.status === "Em Andamento" || t.status === "Em Revisão");
  if (doing) return doing;
  return [...open].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0] ?? null;
}
