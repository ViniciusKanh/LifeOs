import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  ChevronRight,
  Flag,
  GraduationCap,
  Heart,
  ListChecks,
  Pencil,
  Plus,
  Repeat,
  Target,
  Trash2,
  Trophy,
  User,
  X,
} from "lucide-react";
import { useGoalDetail, useGoalForecast, useGoals } from "@/hooks/useGoals";
import { Button, Card, Field, IconBadge, EmptyState, PageHeader } from "@/components/ui/primitives";
import type { Goal, GoalKind, GoalPeriod } from "@/types";

function goalProgressPct(goal: Goal): number {
  if (goal.status === "done") return 100;
  if (goal.kind === "percentage" || goal.kind === "task_based") return Math.min(100, Math.max(0, Math.round(goal.current_value)));
  if (goal.kind === "numeric" && goal.target_value) {
    return Math.min(100, Math.max(0, Math.round((goal.current_value / goal.target_value) * 100)));
  }
  return 0;
}

function diasLabel(n: number) {
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

function progressLabel(goal: Goal): string | null {
  if (goal.kind === "numeric" && goal.target_value) {
    return `${goal.current_value} de ${goal.target_value}${goal.unit ? ` ${goal.unit}` : ""}`;
  }
  if (goal.kind === "task_based" && goal.linked_tasks && goal.linked_tasks.total > 0) {
    return `${goal.linked_tasks.done} de ${goal.linked_tasks.total} tarefas concluídas`;
  }
  return null;
}

/** true quando a meta tem tarefas de verdade vinculadas — progresso passa a ser automático (ver goals.routes.ts). */
function hasAutoProgress(goal: Goal): boolean {
  return goal.kind === "task_based" && !!goal.linked_tasks && goal.linked_tasks.total > 0;
}

const PERIOD_TABS: Array<{ value: GoalPeriod | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "anual", label: "Anuais" },
  { value: "mensal", label: "Mensais" },
  { value: "semanal", label: "Semanais" },
  { value: "semestral", label: "Semestrais" },
];
const PERIOD_TAG: Record<GoalPeriod, string> = { anual: "Anual", semestral: "Semestral", mensal: "Mensal", semanal: "Semanal" };

const GOAL_CATEGORIES: Array<{ value: string; label: string; tone: "green" | "blue" | "purple" | "pink"; icon: typeof Heart }> = [
  { value: "Saúde", label: "Saúde", tone: "green", icon: Heart },
  { value: "Educação", label: "Educação", tone: "blue", icon: GraduationCap },
  { value: "Carreira", label: "Carreira", tone: "purple", icon: Briefcase },
  { value: "Pessoal", label: "Pessoal", tone: "pink", icon: User },
];
const GOAL_CATEGORY_BY_VALUE = new Map(GOAL_CATEGORIES.map((c) => [c.value, c]));
const FALLBACK_GOAL_CATEGORY = { label: "Sem área", tone: "blue" as const, icon: Target };

/** Cor de destaque do card (borda + barra de progresso) — mesma linguagem visual das áreas da vida. */
const ACCENT_BORDER: Record<"green" | "blue" | "purple" | "pink", string> = {
  green: "border-l-cat-green",
  blue: "border-l-cat-blue",
  purple: "border-l-cat-purple",
  pink: "border-l-cat-pink",
};
const ACCENT_BAR: Record<"green" | "blue" | "purple" | "pink", string> = {
  green: "bg-cat-green",
  blue: "bg-cat-blue",
  purple: "bg-cat-purple",
  pink: "bg-cat-pink",
};

/**
 * Chip de previsão de conclusão da meta — regressão linear simples sobre o
 * histórico real de progresso (nunca IA, nunca um número inventado).
 * Some silenciosamente quando não há dado suficiente ainda.
 */
function GoalForecastChip({ goal }: { goal: Goal }) {
  const { forecast } = useGoalForecast(goal.id);
  if (goal.status !== "active" || goal.progress_source === "reading_today" || (goal.kind !== "numeric" && goal.kind !== "percentage")) return null;
  if (!forecast) return null;

  const dateLabel = formatDate(forecast.date);
  if (forecast.aheadOrBehindDays == null) {
    return <span className="text-slate">No ritmo atual, conclusão prevista para {dateLabel}</span>;
  }
  if (forecast.aheadOrBehindDays >= 0) {
    return (
      <span className="text-growth">
        No ritmo atual, conclusão prevista para {dateLabel}
        {forecast.aheadOrBehindDays > 0 ? ` (${diasLabel(forecast.aheadOrBehindDays)} antes do prazo)` : " (no prazo)"}
      </span>
    );
  }
  return (
    <span className="text-drop">
      No ritmo atual, deve atrasar ~{diasLabel(Math.abs(forecast.aheadOrBehindDays))}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

export function MetasPage() {
  // Busca todas as metas (não só as de topo) pra poder montar a hierarquia
  // meta/submeta na tela — antes só vinha o topo e a submeta nunca aparecia.
  const { goals: allGoals, stats, createGoal, updateGoal, removeGoal, addProgress, renewGoal } = useGoals();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [progressGoal, setProgressGoal] = useState<Goal | null>(null);
  const [periodTab, setPeriodTab] = useState<GoalPeriod | "todas">("todas");
  const [statusTab, setStatusTab] = useState<"ativas" | "concluidas" | "todas">("ativas");

  const goals = allGoals;
  const topLevelGoals = goals.filter((g) => !g.parent_goal_id);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      if (!g.parent_goal_id) continue;
      const list = map.get(g.parent_goal_id) ?? [];
      list.push(g);
      map.set(g.parent_goal_id, list);
    }
    return map;
  }, [goals]);

  const activeGoals = topLevelGoals.filter((g) => g.status === "active");
  const overdueGoals = activeGoals.filter((g) => g.is_overdue);
  const overallProgressPct = activeGoals.length > 0 ? Math.round(activeGoals.reduce((sum, g) => sum + goalProgressPct(g), 0) / activeGoals.length) : 0;

  const visibleGoals = useMemo(() => {
    const list = topLevelGoals.filter((goal) =>
      (periodTab === "todas" || goal.period === periodTab) &&
      (statusTab === "todas" || (statusTab === "ativas" ? goal.status === "active" : goal.status === "done"))
    );
    return [...list].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || b.created_at.localeCompare(a.created_at));
  }, [topLevelGoals, periodTab, statusTab]);

  const handleComplete = (goal: Goal) => {
    const pct = goalProgressPct(goal);
    if (pct < 100 && !confirm(`"${goal.title}" está em ${pct}% de progresso registrado. Marcar como concluída mesmo assim?`)) return;
    updateGoal({ id: goal.id, patch: { status: "done" } });
  };

  const handleDelete = (goal: Goal) => {
    if (!confirm(`Excluir "${goal.title}" e todo o seu histórico de progresso? Essa ação não pode ser desfeita.`)) return;
    removeGoal(goal.id);
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<Flag size={20} />}
        title="Metas"
        subtitle="Transforme planos em conquistas. Metas claras, progresso real."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Nova meta
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          title="Nenhuma meta cadastrada"
          description="Crie metas anuais, mensais ou semanais e ligue tarefas a elas — assim você sabe por que está fazendo o que faz."
          ctaLabel="Criar meta"
          onCta={() => setModalOpen(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Target size={18} />} tone="blue" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{activeGoals.length}</p>
                  <p className="text-xs text-slate leading-tight">Metas ativas</p>
                </div>
              </div>
              {overdueGoals.length > 0 ? (
                <p className="text-[11px] text-drop mt-2 flex items-center gap-1">
                  <AlertTriangle size={11} /> {overdueGoals.length} {overdueGoals.length === 1 ? "vencida" : "vencidas"}
                </p>
              ) : (
                <p className="text-[11px] text-slate mt-2">de {goals.length} criadas</p>
              )}
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Flag size={18} />} tone="green" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{overallProgressPct}%</p>
                  <p className="text-xs text-slate leading-tight">Progresso geral</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-2">
                <div className="h-full rounded-full bg-cat-green" style={{ width: `${overallProgressPct}%` }} />
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Calendar size={18} />} tone="purple" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{stats?.completedThisYear ?? 0}</p>
                  <p className="text-xs text-slate leading-tight">Metas concluídas</p>
                </div>
              </div>
              <p className="text-[11px] text-slate mt-2">neste ano</p>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <IconBadge icon={<Trophy size={18} />} tone="amber" />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-semibold leading-tight">{diasLabel(stats?.daysInFocus ?? 0)}</p>
                  <p className="text-xs text-slate leading-tight">Dias em foco</p>
                </div>
              </div>
              <p className="text-[11px] text-slate mt-2">seguindo suas metas</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* Coluna principal: lista de metas */}
            <div className="space-y-4 min-w-0">
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-sm font-semibold">Minhas metas</p>
                  <div className="flex rounded-md border border-paper-border p-0.5 dark:border-ink-border">
                    {([['ativas', 'Ativas'], ['concluidas', 'Concluídas'], ['todas', 'Todas']] as const).map(([value, label]) => <button key={value} onClick={() => setStatusTab(value)} className={`rounded px-2.5 py-1 text-xs font-semibold ${statusTab === value ? "bg-brand-500 text-white" : "text-slate hover:bg-paper dark:hover:bg-ink"}`}>{label}</button>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {PERIOD_TABS.filter((t) => t.value === "todas" || goals.some((g) => g.period === t.value)).map((t) => {
                    const count = t.value === "todas" ? goals.length : goals.filter((g) => g.period === t.value).length;
                    const active = periodTab === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setPeriodTab(t.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          active ? "bg-brand-500 text-white border-brand-500" : "border-paper-border dark:border-ink-border text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        {t.label} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  {visibleGoals.map((goal) => {
                    const pct = goalProgressPct(goal);
                    const label = progressLabel(goal);
                    const meta = GOAL_CATEGORY_BY_VALUE.get(goal.category?.trim() ?? "") ?? FALLBACK_GOAL_CATEGORY;
                    const Icon = meta.icon;
                    const overdue = !!goal.is_overdue;
                    const canRenew = !!goal.period && (goal.status === "done" || overdue);
                    return (
                      <div
                        key={goal.id}
                        className={`rounded-xl border border-l-4 p-4 ${overdue ? "border-drop/60 border-l-drop" : `border-paper-border dark:border-ink-border ${ACCENT_BORDER[meta.tone]}`}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <IconBadge icon={<Icon size={15} />} tone={meta.tone} size={30} />
                              <p className="text-sm font-semibold truncate">{goal.title}</p>
                              {overdue && (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-drop bg-drop/10 rounded-full px-2 py-0.5">
                                  <AlertTriangle size={10} /> Vencida
                                </span>
                              )}
                            </div>
                            {goal.description && <p className="text-xs text-slate mt-1.5 ml-9">{goal.description}</p>}
                            <div className="mt-3 flex items-center gap-3">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                                <div className={`h-full rounded-full ${overdue ? "bg-drop" : ACCENT_BAR[meta.tone]}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs w-10 text-right shrink-0">{pct}%</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate">
                              {label && <span>{label}</span>}
                              {goal.kind === "binary" && <span>Sim/Não</span>}
                              {goal.progress_source === "reading_today" && <span>Atualizado pela leitura de hoje</span>}
                              {hasAutoProgress(goal) && <span className="text-cat-blue">Progresso automático pelas tarefas</span>}
                              {goal.due_date && (
                                <span className={overdue ? "text-drop font-medium" : ""}>
                                  {overdue ? "Venceu em " : ""}
                                  {formatDate(goal.due_date)}
                                  {goal.period ? ` • ${PERIOD_TAG[goal.period]}` : ""}
                                </span>
                              )}
                              <span className="capitalize">{goal.status === "active" ? "Ativa" : goal.status === "done" ? "Concluída" : "Abandonada"}</span>
                            </div>
                            <div className="mt-1.5 text-[11px]">
                              <GoalForecastChip goal={goal} />
                            </div>
                            {overdue && (
                              <p className="mt-2 text-[11px] text-drop">
                                Prazo vencido — essa meta parou de contar no seu Life Score. Conclua ou clique em "Renovar" pra começar o próximo ciclo.
                              </p>
                            )}
                            {goal.next_action && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-brand-500/5 px-2 py-1.5 text-xs"><ListChecks size={13} className="mt-0.5 shrink-0 text-brand-500" /><span>Próximo passo: {goal.next_action}{goal.next_action_due ? ` · ${formatDate(goal.next_action_due)}` : ""}</span></p>}
                            {(childrenByParent.get(goal.id) ?? []).length > 0 && (
                              <div className="mt-3 ml-9 space-y-1.5 border-l-2 border-paper-border dark:border-ink-border pl-3">
                                <p className="text-[11px] font-medium text-slate">Submetas</p>
                                {(childrenByParent.get(goal.id) ?? []).map((child) => {
                                  const childPct = goalProgressPct(child);
                                  return (
                                    <button
                                      key={child.id}
                                      onClick={() => setEditingGoal(child)}
                                      className="w-full flex items-center gap-2 text-left text-xs hover:opacity-80"
                                    >
                                      <span className="flex-1 truncate">{child.title}</span>
                                      <div className="w-16 h-1 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border shrink-0">
                                        <div className={`h-full rounded-full ${ACCENT_BAR[meta.tone]}`} style={{ width: `${childPct}%` }} />
                                      </div>
                                      <span className="w-8 text-right text-[11px] text-slate shrink-0">{childPct}%</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {goal.status === "active" && !overdue && (
                              <>
                                {goal.progress_source !== "reading_today" && goal.kind !== "binary" && !hasAutoProgress(goal) && (
                                  <Button variant="secondary" onClick={() => setProgressGoal(goal)}>
                                    Atualizar
                                  </Button>
                                )}
                                <Button variant="ghost" onClick={() => handleComplete(goal)}>
                                  Concluir
                                </Button>
                              </>
                            )}
                            {canRenew && (
                              <Button variant="secondary" onClick={() => renewGoal(goal.id)} title={`Iniciar o próximo ciclo ${goal.period ? PERIOD_TAG[goal.period].toLowerCase() : ""}`}>
                                <Repeat size={13} /> Renovar
                              </Button>
                            )}
                            <button onClick={() => setEditingGoal(goal)} className="text-slate hover:text-inherit p-1">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDelete(goal)} className="text-slate hover:text-drop p-1">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {visibleGoals.length === 0 && <p className="text-xs text-slate py-6 text-center">Nenhuma meta nesse período.</p>}
                </div>
              </Card>
            </div>

            {/* Coluna lateral: progresso por período, áreas, marcos e conquistas */}
            <div className="space-y-4">
              <Card className="p-5">
                <p className="text-sm font-semibold mb-4">Progresso por período</p>
                {stats && stats.periods.length > 0 ? (
                  <div className="space-y-3">
                    {stats.periods.map((p) => (
                      <div key={p.period}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{p.label}</span>
                          <span className="text-slate">{p.pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.pct}%` }} />
                        </div>
                        <p className="text-[11px] text-slate mt-1">
                          {p.doneCount} de {p.totalCount}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate">Defina uma periodicidade nas suas metas para ver o progresso aqui.</p>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold mb-4">Metas por área da vida</p>
                {stats && stats.categories.length > 0 ? (
                  <div className="space-y-1">
                    {stats.categories.map((c) => {
                      const meta = GOAL_CATEGORY_BY_VALUE.get(c.category) ?? FALLBACK_GOAL_CATEGORY;
                      const Icon = meta.icon;
                      return (
                        <div key={c.category} className="flex items-center gap-3 py-2">
                          <IconBadge icon={<Icon size={14} />} tone={meta.tone} size={30} />
                          <p className="text-sm flex-1 truncate">{meta.label}</p>
                          <p className="text-xs text-slate">
                            {c.count} {c.count === 1 ? "meta" : "metas"}
                          </p>
                          <ChevronRight size={14} className="text-slate" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate">Defina uma área da vida nas suas metas para agrupá-las aqui.</p>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold mb-3">Próximos marcos</p>
                {stats && stats.upcomingMilestones.length > 0 ? (
                  <div className="space-y-3">
                    {stats.upcomingMilestones.map((m) => (
                      <div key={`${m.goalId}-${m.nextActionDue}`} className="flex items-start gap-2">
                        <ListChecks size={14} className="text-brand-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{m.nextAction}</p>
                          <p className="text-[11px] text-slate truncate">
                            {m.goalTitle} • {formatDate(m.nextActionDue)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate">Adicione o próximo passo de uma meta para vê-lo aqui.</p>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold mb-3">Conquistas recentes</p>
                {stats && stats.recentAchievements.length > 0 ? (
                  <div className="space-y-3">
                    {stats.recentAchievements.map((a, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Trophy size={14} className="text-signal-deep mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{a.title}</p>
                          <p className="text-[11px] text-slate truncate">
                            {a.subtitle} • {formatDate(a.at) ?? a.at.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate">Suas conquistas (metas concluídas, sequências de hábito) vão aparecer aqui.</p>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold">Metas no Life Score</p>
                <p className="mt-2 text-xs leading-relaxed text-slate">
                  Cada meta contribui pelo seu avanço real. O Life Score tira a média dentro de cada período e depois equilibra os períodos, para semanais, mensais e anuais terem peso semelhante.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate">
                  Uma meta com período que passa do prazo sem ser concluída sai do cálculo — ela não fica arrastando sua nota pra baixo pra sempre. Clique em "Renovar" pra começar o próximo ciclo do zero.
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-paper-border pt-3 text-xs dark:border-ink-border"><span>Períodos com metas</span><span className="font-semibold">{stats?.periods.length ?? 0}</span></div>
              </Card>
            </div>
          </div>
        </>
      )}

      {modalOpen && (
        <MetaModal
          candidateParents={topLevelGoals}
          onClose={() => setModalOpen(false)}
          onSubmit={async (input) => {
            await createGoal(input);
          }}
        />
      )}
      {editingGoal && (
        <MetaModal
          goal={editingGoal}
          candidateParents={topLevelGoals}
          onClose={() => setEditingGoal(null)}
          onSubmit={async (input) => {
            await updateGoal({ id: editingGoal.id, patch: input });
          }}
        />
      )}
      {progressGoal && (
        <ProgressoModal
          goal={progressGoal}
          onClose={() => setProgressGoal(null)}
          onSave={(value) => addProgress({ id: progressGoal.id, value })}
        />
      )}
    </div>
  );
}

function MetaModal({
  goal,
  candidateParents = [],
  onClose,
  onSubmit,
}: {
  goal?: Goal;
  candidateParents?: Goal[];
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description?: string;
    category?: string;
    kind: GoalKind;
    targetValue?: number;
    unit?: string;
    dueDate?: string;
    period?: GoalPeriod;
    nextAction?: string;
    nextActionDue?: string;
    parentGoalId?: string | null;
  }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [category, setCategory] = useState(goal?.category ?? "");
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "percentage");
  const [targetValue, setTargetValue] = useState(goal?.target_value != null ? String(goal.target_value) : "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [dueDate, setDueDate] = useState(goal?.due_date ?? "");
  const [period, setPeriod] = useState<GoalPeriod | "">(goal?.period ?? "");
  const [nextAction, setNextAction] = useState(goal?.next_action ?? "");
  const [nextActionDue, setNextActionDue] = useState(goal?.next_action_due ?? "");
  const [parentGoalId, setParentGoalId] = useState(goal?.parent_goal_id ?? "");
  const [saving, setSaving] = useState(false);

  // Só metas "Etapas" ativas fazem sentido como meta superior (rollup de submetas
  // no Life Score — ver goalsScore em metricsService.ts). Uma meta nunca vira sua própria mãe.
  const parentOptions = candidateParents.filter((g) => g.kind === "task_based" && g.status === "active" && g.id !== goal?.id);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        kind,
        targetValue: targetValue ? Number(targetValue) : undefined,
        unit: unit.trim() || undefined,
        dueDate: dueDate || undefined,
        period: period || undefined,
        nextAction: nextAction.trim() || undefined,
        nextActionDue: nextActionDue || undefined,
        parentGoalId: parentGoalId || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={<Flag size={15} />} tone="purple" size={30} />
            <p className="text-sm font-semibold">{goal ? "Editar meta" : "Nova meta"}</p>
          </div>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Título" placeholder="Publicar 3 artigos" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate">Área da vida</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="">Sem área</option>
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate">Período</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as GoalPeriod | "")}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="">Sem período</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
          </div>
          {period && (
            <p className="text-[11px] text-slate -mt-1.5">
              Metas com período contam no Life Score dentro do prazo. Se o prazo passar sem concluir, use "Renovar" na lista pra começar o próximo ciclo.
            </p>
          )}
          {parentOptions.length > 0 && (
            <div>
              <label className="text-xs text-slate">Meta superior (opcional)</label>
              <select
                value={parentGoalId}
                onChange={(e) => setParentGoalId(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="">Meta independente</option>
                {parentOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate mt-1">
                Vincular a uma meta "Etapas" faz esta virar submeta dela — o progresso da meta superior passa a ser a média das submetas.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-slate">Tipo de acompanhamento</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as GoalKind)}
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="percentage">Percentual (0-100%)</option>
              <option value="numeric">Numérico (com meta e unidade)</option>
              <option value="binary">Sim/Não</option>
              <option value="task_based">Etapas (vincule tarefas ou submetas)</option>
            </select>
          </div>
          {kind === "task_based" && (
            <p className="text-[11px] text-slate -mt-1.5">
              Vincule tarefas a esta meta (no formulário da tarefa) ou defina submetas apontando pra ela — o progresso passa a ser calculado automaticamente. Sem nenhuma das duas, o progresso continua manual.
            </p>
          )}
          {kind === "numeric" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Meta" type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
              <Field label="Unidade" placeholder="páginas, marcos, livros..." value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          )}
          {kind === "binary" && (
            <p className="text-[11px] text-slate">Metas sim/não não têm progresso parcial — ficam em 0% até você clicar em "Concluir".</p>
          )}
          <Field label="Prazo (opcional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <div className="pt-2 border-t border-paper-border dark:border-ink-border">
            <p className="text-xs text-slate mb-2">Próximo passo (opcional — aparece em "Próximos marcos")</p>
            <Field label="O que fazer a seguir" placeholder="Ler 2 capítulos, finalizar módulo 3..." value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
            <div className="mt-2">
              <Field label="Data" type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} />
            </div>
          </div>
          <Button onClick={submit} disabled={saving || !title.trim()} className="w-full">
            {saving ? "Salvando..." : goal ? "Salvar alterações" : "Criar meta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Passos rápidos por tipo de meta — evita ter que calcular o valor absoluto de cabeça. */
function quickDeltas(goal: Goal): number[] {
  if (goal.kind === "numeric") return [1, 5, 10];
  return [10, 25, 50];
}

function ProgressoModal({ goal, onClose, onSave }: { goal: Goal; onClose: () => void; onSave: (value: number) => Promise<unknown> }) {
  const [value, setValue] = useState(String(goal.current_value));
  const [saving, setSaving] = useState(false);
  const { goal: detail } = useGoalDetail(goal.id);
  const history = [...(detail?.progress ?? [])].reverse().slice(0, 4);
  const label = goal.kind === "percentage" || goal.kind === "task_based" ? "Progresso (%)" : `Valor atual${goal.unit ? ` (${goal.unit})` : ""}`;
  const max = goal.kind === "percentage" || goal.kind === "task_based" ? 100 : undefined;

  const applyDelta = (delta: number) => {
    const next = (Number(value) || 0) + delta;
    setValue(String(max !== undefined ? Math.min(next, max) : next));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(Number(value) || 0);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold mb-3">Atualizar progresso de "{goal.title}"</p>
        <Field label={label} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex gap-1.5 mt-2">
          {quickDeltas(goal).map((delta) => (
            <button
              key={delta}
              onClick={() => applyDelta(delta)}
              className="flex-1 rounded-lg border border-paper-border dark:border-ink-border py-1.5 text-xs font-semibold text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            >
              +{delta}{goal.kind !== "numeric" ? "%" : ""}
            </button>
          ))}
        </div>
        {history.length > 0 && (
          <div className="mt-3 pt-3 border-t border-paper-border dark:border-ink-border">
            <p className="text-[11px] font-semibold text-slate uppercase mb-1.5">Histórico recente</p>
            <div className="space-y-1">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-[11px] text-slate">
                  <span>{formatDate(entry.recorded_at) ?? entry.recorded_at.slice(0, 10)}</span>
                  <span className="font-medium">{entry.value}{goal.kind !== "numeric" ? "%" : goal.unit ? ` ${goal.unit}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Button onClick={submit} disabled={saving} className="w-full mt-3">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
