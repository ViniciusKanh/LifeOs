import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CheckCircle2, ChevronDown, Crosshair, FolderKanban, Repeat, Target, Unlink } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { LifeMapAlert, LifeMapData } from "@/types";

const ICON: Record<LifeMapAlert["id"], JSX.Element> = {
  tasks_without_project: <Unlink size={15} />,
  goals_without_habit: <Target size={15} />,
  projects_without_deadline: <FolderKanban size={15} />,
  habits_without_goal: <Repeat size={15} />,
};

/** Converte as contagens antigas em alertas simples, caso o backend ainda não envie `alerts`. */
function fallbackAlerts(data: LifeMapData): LifeMapAlert[] {
  const o = data.orphans;
  const mk = (id: LifeMapAlert["id"], count: number, title: string, description: string, path: string): LifeMapAlert[] =>
    count > 0 ? [{ id, severity: "info", title: `${count} ${title}`, description, count, items: [], cta: { label: "Resolver", path } }] : [];
  return [
    ...mk("tasks_without_project", o.tasksWithoutProject, "tarefas sem projeto", "Vincule-as a um projeto ou meta.", "/tarefas"),
    ...mk("goals_without_habit", o.goalsWithoutHabit, "metas sem hábito de apoio", "Crie um hábito da mesma categoria.", "/habitos"),
    ...mk("projects_without_deadline", o.projectsWithoutDeadline, "projetos sem prazo", "Defina prazos nas tarefas.", "/projetos"),
    ...mk("habits_without_goal", o.habitsUnlinked, "hábitos sem meta", "Conecte o hábito a uma meta.", "/metas"),
  ];
}

/**
 * Alertas estruturais acionáveis: cada alerta mostra os itens reais
 * envolvidos, permite localizá-los no mapa e abre a tela que resolve.
 */
export function LifeMapAlerts({ data, onLocate }: { data: LifeMapData; onLocate: (nodeId: string) => void }) {
  const alerts = data.alerts ?? fallbackAlerts(data);
  const [open, setOpen] = useState<string | null>(alerts[0]?.id ?? null);
  const score = data.summary.structuralScorePct;
  const tone = score >= 75 ? "text-cat-green" : score >= 45 ? "text-signal-deep dark:text-signal" : "text-drop";
  const ring = score >= 75 ? "#12B76A" : score >= 45 ? "#F59E0B" : "#EF4444";

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-black/[0.06] dark:stroke-white/[0.08]" />
            <motion.circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={ring}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 15.5}
              initial={{ strokeDashoffset: 2 * Math.PI * 15.5 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 15.5 * (1 - score / 100) }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${tone}`}>{score}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Saúde da estrutura</p>
          <p className="text-[11px] text-slate leading-snug">
            {alerts.length === 0 ? "Tudo conectado — nada para ajustar agora." : `${alerts.length} ${alerts.length === 1 ? "ponto" : "pontos"} para conectar melhor`}
          </p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-cat-green/10 text-cat-green px-3 py-2.5 text-xs font-medium">
          <CheckCircle2 size={15} /> Metas, hábitos, projetos e tarefas estão bem ligados.
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const expanded = open === a.id;
            const warn = a.severity === "warning";
            return (
              <li
                key={a.id}
                className={`rounded-xl border transition-colors ${
                  warn ? "border-signal/40 bg-signal/[0.06]" : "border-paper-border dark:border-ink-border bg-paper dark:bg-ink"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : a.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-start gap-2.5 p-3 text-left"
                >
                  <span className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${warn ? "bg-signal/15 text-signal-deep dark:text-signal" : "bg-brand-500/10 text-brand-600 dark:text-brand-400"}`}>
                    {ICON[a.id]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold leading-snug">{a.title}</span>
                    <span className="block text-[11px] text-slate leading-snug mt-0.5">{a.description}</span>
                  </span>
                  <ChevronDown size={14} className={`mt-1 shrink-0 text-slate transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (a.items.length > 0 || a.cta) && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-3 pb-3 space-y-1">
                        {a.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-1.5 rounded-lg bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border pl-2.5 pr-1 py-1">
                            <span className="flex-1 min-w-0 truncate text-xs">{it.label}</span>
                            {it.nodeId && (
                              <button
                                type="button"
                                onClick={() => onLocate(it.nodeId!)}
                                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-slate hover:text-brand-600 hover:bg-brand-500/10"
                                aria-label={`Localizar "${it.label}" no mapa`}
                                title="Ver no mapa"
                              >
                                <Crosshair size={13} />
                              </button>
                            )}
                            <Link
                              to={it.openPath}
                              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-slate hover:text-brand-600 hover:bg-brand-500/10"
                              aria-label={`Abrir "${it.label}"`}
                              title="Abrir"
                            >
                              <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        ))}
                        {a.count > a.items.length && a.items.length > 0 && (
                          <p className="text-[10.5px] text-slate px-1">+ {a.count - a.items.length} outros</p>
                        )}
                        {a.cta && (
                          <Link to={a.cta.path} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 px-1 pt-1">
                            {a.cta.label} <ArrowUpRight size={12} />
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
