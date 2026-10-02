import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FolderKanban, Loader2, Plus, Target } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import { useGoals } from "@/hooks/useGoals";
import { LIFE_AREAS, LIFE_AREA_BY_KEY, cycleLabel } from "@/utils/lifeOsLabels";
import type { DirectionGoal, LifeArea } from "@/types";

type Horizon = "year" | "quarter" | "month" | "none";

/** Opções de ciclo para os seletores: este e o próximo ano, seus trimestres e os próximos 12 meses. */
export function cycleOptions(now = new Date()): Array<{ value: string; label: string }> {
  const y = now.getFullYear();
  const out: Array<{ value: string; label: string }> = [];
  for (const yy of [y, y + 1]) out.push({ value: String(yy), label: `Ano ${yy}` });
  for (const yy of [y, y + 1]) for (let q = 1; q <= 4; q++) out.push({ value: `${yy}-Q${q}`, label: `${q}º trimestre ${yy}` });
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, now.getMonth() + i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: cycleLabel(v) });
  }
  return out;
}

function ProgressBar({ pct, color }: { pct: number | null; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct ?? 0}%` }} transition={{ duration: 0.6 }} />
    </div>
  );
}

function GoalRow({ goal, childrenGoals, depth = 0 }: { goal: DirectionGoal; childrenGoals: (id: string) => DirectionGoal[]; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = childrenGoals(goal.id);
  const area = goal.lifeArea ? LIFE_AREA_BY_KEY[goal.lifeArea] : null;
  const color = area?.color ?? "#9550FF";
  const noWork = goal.openTasks + goal.doneTasks === 0 && goal.projects.length === 0 && goal.progressSource !== "value";
  return (
    <li className={depth > 0 ? "ml-4 sm:ml-6 border-l border-paper-border dark:border-ink-border pl-3" : ""}>
      <div className="rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-3 my-1.5">
        <div className="flex items-start gap-2.5">
          {kids.length > 0 ? (
            <button onClick={() => setOpen((v) => !v)} className="mt-0.5 text-slate" aria-expanded={open} aria-label={open ? "Recolher submetas" : "Mostrar submetas"}>
              <ChevronRight size={15} className={`transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-[15px]" />
          )}
          <span className="text-base leading-none mt-0.5" aria-hidden>
            {area?.emoji ?? "🎯"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Link to="/metas" className={`text-sm font-semibold hover:underline ${goal.status === "done" ? "line-through text-slate" : ""}`}>
                {goal.title}
              </Link>
              <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-black/[0.04] dark:bg-white/[0.06] text-slate">{cycleLabel(goal.cycle)}</span>
              {area && <span className="text-[10px] text-slate">{area.label}</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <ProgressBar pct={goal.progressPct} color={color} />
              </div>
              <span className="text-[11px] font-semibold tabular-nums w-10 text-right">{goal.progressPct != null ? `${goal.progressPct}%` : "—"}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate">
              {goal.projects.map((p) => (
                <Link key={p.id} to={`/projetos/${p.id}`} className="inline-flex items-center gap-1 rounded-md bg-cat-blue/10 text-cat-blue px-1.5 py-0.5 hover:underline">
                  <FolderKanban size={10} /> {p.name} · {p.doneCount}/{p.taskCount}
                </Link>
              ))}
              {goal.openTasks + goal.doneTasks > 0 && (
                <span>
                  {goal.doneTasks}/{goal.openTasks + goal.doneTasks} tarefas
                </span>
              )}
              {noWork && goal.status === "active" && <span className="text-signal-deep dark:text-signal">Sem projeto nem tarefa ligada ainda</span>}
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && kids.length > 0 && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {kids.map((k) => (
              <GoalRow key={k.id} goal={k} childrenGoals={childrenGoals} depth={depth + 1} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * Metas por ciclo: ano → trimestre → mês, com os projetos que servem a cada
 * meta. Metas ainda sem ciclo/área aparecem em "Organizar" para o usuário
 * encaixar na hierarquia em um clique.
 */
export function CycleGoals({ goals, cycles }: { goals: DirectionGoal[]; cycles: { year: string; quarter: string; month: string } }) {
  const { createGoal, updateGoal } = useGoals();
  const [horizon, setHorizon] = useState<Horizon>("year");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<LifeArea | "">("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => cycleOptions(), []);

  const active = goals.filter((g) => g.status !== "abandoned");
  const cycleOf: Record<Exclude<Horizon, "none">, string> = { year: cycles.year, quarter: cycles.quarter, month: cycles.month };
  const inHorizon = (g: DirectionGoal) => {
    if (horizon === "none") return !g.cycle && g.status === "active";
    if (horizon === "year") return g.cycle === cycles.year;
    return g.cycle === cycleOf[horizon];
  };
  const roots = active.filter((g) => inHorizon(g) && (horizon !== "year" || !g.parentGoalId || !active.some((p) => p.id === g.parentGoalId && p.cycle === cycles.year)));
  const childrenGoals = (id: string) => active.filter((g) => g.parentGoalId === id);
  const parents = active.filter((g) => g.status === "active" && (horizon === "quarter" ? g.cycle === cycles.year : horizon === "month" ? g.cycle === cycles.quarter || g.cycle === cycles.year : false));

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createGoal({
        title: title.trim(),
        kind: "task_based",
        lifeArea: area || null,
        cycle: horizon === "none" ? null : cycleOf[horizon],
        parentGoalId: parent || null,
      });
      setTitle("");
      setParent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a meta.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: Horizon; label: string; count: number }> = [
    { key: "year", label: cycleLabel(cycles.year), count: active.filter((g) => g.cycle === cycles.year).length },
    { key: "quarter", label: cycleLabel(cycles.quarter), count: active.filter((g) => g.cycle === cycles.quarter).length },
    { key: "month", label: cycleLabel(cycles.month), count: active.filter((g) => g.cycle === cycles.month).length },
    { key: "none", label: "Organizar", count: active.filter((g) => !g.cycle && g.status === "active").length },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-cat-purple" />
          <p className="text-sm font-semibold">Metas por ciclo</p>
        </div>
        <div role="tablist" aria-label="Horizonte" className="flex gap-1 overflow-x-auto max-w-full">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={horizon === t.key}
              onClick={() => setHorizon(t.key)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                horizon === t.key ? "bg-cat-purple text-white" : "text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {t.label} <span className="opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {horizon === "none" ? (
        roots.length === 0 ? (
          <p className="text-xs text-slate py-6 text-center">Todas as metas ativas já estão num ciclo. 👏</p>
        ) : (
          <ul className="space-y-2">
            {roots.map((g) => (
              <li key={g.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border p-3">
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{g.title}</span>
                <select
                  aria-label={`Área de ${g.title}`}
                  className={`${inputClass} sm:w-44 !py-1.5 !text-xs`}
                  value={g.lifeArea ?? ""}
                  onChange={(e) => updateGoal({ id: g.id, patch: { lifeArea: (e.target.value || null) as LifeArea | null } })}
                >
                  <option value="">Área da vida…</option>
                  {LIFE_AREAS.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.emoji} {a.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Ciclo de ${g.title}`}
                  className={`${inputClass} sm:w-48 !py-1.5 !text-xs`}
                  value=""
                  onChange={(e) => e.target.value && updateGoal({ id: g.id, patch: { cycle: e.target.value } })}
                >
                  <option value="">Encaixar no ciclo…</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )
      ) : roots.length === 0 ? (
        <p className="text-xs text-slate py-6 text-center">
          Nenhuma meta para {tabs.find((t) => t.key === horizon)?.label.toLowerCase()} ainda. {horizon === "year" ? "Comece pelas 2–4 grandes metas do ano." : "Quebre uma meta maior em passos deste período."}
        </p>
      ) : (
        <ul>
          {roots.map((g) => (
            <GoalRow key={g.id} goal={g} childrenGoals={childrenGoals} />
          ))}
        </ul>
      )}

      {horizon !== "none" && (
        <div className="mt-3 pt-3 border-t border-paper-border dark:border-ink-border flex flex-col lg:flex-row gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={160}
            placeholder={`Nova meta para ${tabs.find((t) => t.key === horizon)?.label}`}
            aria-label="Título da nova meta"
            className={`${inputClass} flex-1`}
          />
          <select aria-label="Área da vida" value={area} onChange={(e) => setArea(e.target.value as LifeArea | "")} className={`${inputClass} lg:w-44`}>
            <option value="">Área da vida…</option>
            {LIFE_AREAS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.emoji} {a.label}
              </option>
            ))}
          </select>
          {parents.length > 0 && (
            <select aria-label="Contribui para" value={parent} onChange={(e) => setParent(e.target.value)} className={`${inputClass} lg:w-52`}>
              <option value="">Contribui para… (opcional)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <Button onClick={add} disabled={busy || !title.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-drop mt-2">{error}</p>}
    </Card>
  );
}
