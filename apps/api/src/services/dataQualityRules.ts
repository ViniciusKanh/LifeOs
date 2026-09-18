/**
 * Data Health — regras de consistência, integridade e duplicidade.
 * Cada regra é uma função pura que recebe linhas já carregadas
 * (poucas colunas, escopadas ao usuário) e devolve os problemas
 * encontrados — nunca corrige nada automaticamente. Mantém as
 * verificações centralizadas aqui em vez de espalhadas em `if`s
 * pelos componentes de UI ou pelo service principal.
 */

export type DataHealthSeverity = "info" | "attention" | "warning" | "critical";

export interface DataHealthIssue {
  id: string;
  severity: DataHealthSeverity;
  module: string;
  dimension: "completeness" | "consistency" | "integrity" | "freshness" | "sync";
  title: string;
  description: string;
  affectedCount: number;
  actionPath: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  start_date: string | null;
  estimate_minutes: number | null;
  project_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface GoalRow {
  id: string;
  title: string;
  kind: string;
  target_value: number | null;
  current_value: number;
  category: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface HabitRow {
  id: string;
  name: string;
  category: string | null;
  archived_at: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
}

interface SleepRow {
  id: string;
  went_to_bed_at: string;
  woke_up_at: string;
  duration_minutes: number | null;
}

interface AcademicProjectRow {
  id: string;
  title: string;
  progress_pct: number;
  project_id: string | null;
  education_id: string | null;
}

/** Concorrência com os projetos existentes, pra checar link "órfão" sem depender de FK do SQLite. */
function existsIn(ids: Set<string>, id: string | null): boolean {
  return id == null || ids.has(id);
}

/** Tarefas: due_date anterior à criação (impossível), start_date depois do due_date, progresso/duração negativa. */
export function checkTaskConsistency(tasks: TaskRow[], modulePath: string): DataHealthIssue[] {
  const invalidDue = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date(t.created_at));
  const invalidRange = tasks.filter((t) => t.start_date && t.due_date && new Date(t.start_date) > new Date(t.due_date));
  const negativeEstimate = tasks.filter((t) => t.estimate_minutes != null && t.estimate_minutes < 0);
  const issues: DataHealthIssue[] = [];
  if (invalidDue.length > 0) {
    issues.push({
      id: "task_due_before_created",
      severity: "warning",
      module: "tasks",
      dimension: "consistency",
      title: `${invalidDue.length} ${invalidDue.length === 1 ? "tarefa tem" : "tarefas têm"} prazo anterior à criação`,
      description: "O prazo (due_date) é anterior à data em que a tarefa foi criada — verifique se o prazo está correto.",
      affectedCount: invalidDue.length,
      actionPath: modulePath,
    });
  }
  if (invalidRange.length > 0) {
    issues.push({
      id: "task_start_after_due",
      severity: "warning",
      module: "tasks",
      dimension: "consistency",
      title: `${invalidRange.length} ${invalidRange.length === 1 ? "tarefa começa" : "tarefas começam"} depois do próprio prazo`,
      description: "A data de início está depois do prazo final.",
      affectedCount: invalidRange.length,
      actionPath: modulePath,
    });
  }
  if (negativeEstimate.length > 0) {
    issues.push({
      id: "task_negative_estimate",
      severity: "attention",
      module: "tasks",
      dimension: "consistency",
      title: `${negativeEstimate.length} ${negativeEstimate.length === 1 ? "tarefa tem" : "tarefas têm"} duração estimada negativa`,
      description: "A duração estimada não pode ser negativa.",
      affectedCount: negativeEstimate.length,
      actionPath: modulePath,
    });
  }
  return issues;
}

/** Tarefas: aponta para projeto que não existe mais (integridade referencial lógica). */
export function checkTaskIntegrity(tasks: TaskRow[], projectIds: Set<string>, modulePath: string): DataHealthIssue[] {
  const orphanTasks = tasks.filter((t) => t.project_id && !existsIn(projectIds, t.project_id));
  if (orphanTasks.length === 0) return [];
  return [
    {
      id: "task_orphan_project",
      severity: "warning",
      module: "tasks",
      dimension: "integrity",
      title: `${orphanTasks.length} ${orphanTasks.length === 1 ? "tarefa aponta" : "tarefas apontam"} para um projeto que não existe mais`,
      description: "O project_id da tarefa não corresponde a nenhum projeto atual.",
      affectedCount: orphanTasks.length,
      actionPath: modulePath,
    },
  ];
}

/** Metas: progresso fora de 0–100 (kind percentage), current_value negativo, due_date anterior à criação. */
export function checkGoalConsistency(goals: GoalRow[], modulePath: string): DataHealthIssue[] {
  const issues: DataHealthIssue[] = [];
  const badPct = goals.filter((g) => g.kind === "percentage" && (g.current_value < 0 || g.current_value > 100));
  const negativeValue = goals.filter((g) => g.kind !== "percentage" && g.current_value < 0);
  const invalidDue = goals.filter((g) => g.due_date && new Date(g.due_date) < new Date(g.created_at));
  if (badPct.length > 0) {
    issues.push({
      id: "goal_pct_out_of_range",
      severity: "warning",
      module: "goals",
      dimension: "consistency",
      title: `${badPct.length} ${badPct.length === 1 ? "meta tem" : "metas têm"} progresso fora de 0–100%`,
      description: "Metas do tipo percentual devem ter valor atual entre 0 e 100.",
      affectedCount: badPct.length,
      actionPath: modulePath,
    });
  }
  if (negativeValue.length > 0) {
    issues.push({
      id: "goal_negative_value",
      severity: "warning",
      module: "goals",
      dimension: "consistency",
      title: `${negativeValue.length} ${negativeValue.length === 1 ? "meta tem" : "metas têm"} valor atual negativo`,
      description: "O valor atual de uma meta não pode ser negativo.",
      affectedCount: negativeValue.length,
      actionPath: modulePath,
    });
  }
  if (invalidDue.length > 0) {
    issues.push({
      id: "goal_due_before_created",
      severity: "attention",
      module: "goals",
      dimension: "consistency",
      title: `${invalidDue.length} ${invalidDue.length === 1 ? "meta tem" : "metas têm"} prazo anterior à criação`,
      description: "O prazo da meta é anterior à data em que ela foi criada.",
      affectedCount: invalidDue.length,
      actionPath: modulePath,
    });
  }
  return issues;
}

/** Sono: horário de dormir depois de acordar, ou duração negativa/absurda. */
export function checkSleepConsistency(sleeps: SleepRow[], modulePath: string): DataHealthIssue[] {
  const invalid = sleeps.filter((s) => new Date(s.went_to_bed_at) >= new Date(s.woke_up_at));
  if (invalid.length === 0) return [];
  return [
    {
      id: "sleep_invalid_range",
      severity: "attention",
      module: "health",
      dimension: "consistency",
      title: `${invalid.length} ${invalid.length === 1 ? "registro de sono tem" : "registros de sono têm"} horário inconsistente`,
      description: "O horário de dormir está igual ou depois do horário de acordar.",
      affectedCount: invalid.length,
      actionPath: modulePath,
    },
  ];
}

/** Projeto acadêmico apontando para educação/projeto que não existe mais. */
export function checkAcademicIntegrity(
  items: AcademicProjectRow[],
  educationIds: Set<string>,
  projectIds: Set<string>,
  modulePath: string
): DataHealthIssue[] {
  const orphans = items.filter(
    (a) => (a.education_id && !existsIn(educationIds, a.education_id)) || (a.project_id && !existsIn(projectIds, a.project_id))
  );
  if (orphans.length === 0) return [];
  return [
    {
      id: "academic_orphan_link",
      severity: "attention",
      module: "education",
      dimension: "integrity",
      title: `${orphans.length} ${orphans.length === 1 ? "projeto acadêmico aponta" : "projetos acadêmicos apontam"} para um vínculo inexistente`,
      description: "O projeto acadêmico referencia uma formação ou projeto que não existe mais.",
      affectedCount: orphans.length,
      actionPath: modulePath,
    },
  ];
}

/** Duplicidade conservadora: mesmo tipo, título normalizado igual, criados a menos de 24h um do outro. */
export function findPossibleDuplicates(
  rows: { id: string; title: string; created_at: string }[],
  module: string,
  modulePath: string
): DataHealthIssue[] {
  const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
  const byTitle = new Map<string, { id: string; created_at: string }[]>();
  for (const r of rows) {
    const key = normalize(r.title);
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push({ id: r.id, created_at: r.created_at });
    byTitle.set(key, list);
  }
  let duplicateCount = 0;
  for (const list of byTitle.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapMs = new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime();
      if (gapMs < 24 * 60 * 60 * 1000) duplicateCount++;
    }
  }
  if (duplicateCount === 0) return [];
  return [
    {
      id: `${module}_possible_duplicate`,
      severity: "info",
      module,
      dimension: "integrity",
      title: `${duplicateCount} possível ${duplicateCount === 1 ? "duplicado" : "duplicados"} em ${module === "tasks" ? "tarefas" : module === "goals" ? "metas" : module === "habits" ? "hábitos" : "projetos"}`,
      description: "Mesmo título e criados com menos de 24h de diferença — revise antes de manter os dois.",
      affectedCount: duplicateCount,
      actionPath: modulePath,
    },
  ];
}

export type { TaskRow, GoalRow, HabitRow, ProjectRow, SleepRow, AcademicProjectRow };
