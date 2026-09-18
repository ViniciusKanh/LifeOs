import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import {
  METRIC_CATALOG,
  METRIC_KEYS,
  getDailySeries,
  aggregateSeries,
  compareMetric,
  describeComparison,
  type ExperimentMetricKey,
  type MetricComparison,
} from "./experimentMetricsService.js";
import { checkAutomaticRule, type VerificationRule } from "./experimentVerificationService.js";

type Db = ReturnType<typeof getDb>;

export class ExperimentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ExperimentStatus = "draft" | "active" | "paused" | "completed" | "cancelled";
export type ExperimentCategory =
  | "saude" | "sono" | "exercicio" | "hidratacao" | "produtividade" | "focus" | "educacao" | "leitura" | "habitos" | "bem_estar" | "personalizado";

export const CATEGORY_LABEL: Record<ExperimentCategory, string> = {
  saude: "Saúde",
  sono: "Sono",
  exercicio: "Exercício",
  hidratacao: "Hidratação",
  produtividade: "Produtividade",
  focus: "Focus",
  educacao: "Educação",
  leitura: "Leitura",
  habitos: "Hábitos",
  bem_estar: "Bem-estar",
  personalizado: "Personalizado",
};

interface ExperimentRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: ExperimentCategory;
  hypothesis: string | null;
  motivation: string | null;
  status: ExperimentStatus;
  start_date: string;
  end_date: string;
  primary_metric: ExperimentMetricKey;
  secondary_metrics_json: string | null;
  linked_habit_id: string | null;
  verification_type: "automatic" | "manual";
  verification_rule: VerificationRule | null;
  verification_config_json: string | null;
  success_criteria_type: "consistency" | "metric_change" | "none";
  success_criteria_value: number | null;
  personal_conclusion: string | null;
  worth_continuing: "yes" | "maybe" | "no" | null;
  perceived_result: "improved" | "no_change" | "worsened" | null;
  created_at: string;
  updated_at: string;
}

function mapExperiment(row: ExperimentRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    hypothesis: row.hypothesis,
    motivation: row.motivation,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    primary_metric: row.primary_metric,
    secondary_metrics: row.secondary_metrics_json ? (JSON.parse(row.secondary_metrics_json) as ExperimentMetricKey[]) : [],
    linked_habit_id: row.linked_habit_id,
    verification_type: row.verification_type,
    verification_rule: row.verification_rule,
    verification_config: row.verification_config_json ? JSON.parse(row.verification_config_json) : null,
    success_criteria_type: row.success_criteria_type,
    success_criteria_value: row.success_criteria_value,
    personal_conclusion: row.personal_conclusion,
    worth_continuing: row.worth_continuing,
    perceived_result: row.perceived_result,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Baseline = mesma duração do experimento, imediatamente anterior ao início (seção 12). */
function baselinePeriod(startDate: string, endDate: string): { from: string; to: string } {
  const durationDays = daysBetween(startDate, endDate) + 1;
  const to = addDays(startDate, -1);
  const from = addDays(to, -(durationDays - 1));
  return { from, to };
}

async function fetchExperimentRow(db: Db, ownerId: string, id: string): Promise<ExperimentRow> {
  const r = await db.execute({ sql: "SELECT * FROM personal_experiments WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = r.rows[0] as unknown as ExperimentRow | undefined;
  if (!row) throw new ExperimentError("Experimento não encontrado.", 404);
  return row;
}

/* ---------------------------- Catálogo de métricas (disponibilidade real) ---------------------------- */

export async function getMetricCatalog(db: Db, ownerId: string) {
  const checks = await Promise.all(
    METRIC_KEYS.map(async (key) => {
      const def = METRIC_CATALOG[key];
      if (def.requiresHabit) {
        const r = await db.execute({ sql: "SELECT COUNT(*) AS c FROM habits WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] });
        const c = Number((r.rows[0] as unknown as { c: number }).c);
        return { key, hasHistory: c > 0, historyDays: 0 };
      }
      const since = addDays(isoDate(new Date()), -180);
      const to = isoDate(new Date());
      const { daysWithData } = await getDailySeries(db, ownerId, key, since, to, null);
      return { key, hasHistory: daysWithData > 0, historyDays: daysWithData };
    })
  );
  const byKey = new Map(checks.map((c) => [c.key, c]));
  return METRIC_KEYS.map((key) => {
    const def = METRIC_CATALOG[key];
    const info = byKey.get(key)!;
    return {
      key,
      label: def.label,
      unit: def.unit,
      inverse: def.inverse,
      requiresHabit: def.requiresHabit,
      sourcePath: def.sourcePath,
      sourceLabel: def.sourceLabel,
      hasHistory: info.hasHistory,
      historyDays: info.historyDays,
    };
  });
}

/* ---------------------------- Listagem ---------------------------- */

export async function listExperiments(db: Db, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM personal_experiments WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] });
  const today = isoDate(new Date());
  return Promise.all(
    (r.rows as unknown as ExperimentRow[]).map(async (row) => {
      const durationDays = daysBetween(row.start_date, row.end_date) + 1;
      const elapsedRaw = daysBetween(row.start_date, today < row.end_date ? today : row.end_date) + 1;
      const daysElapsed = Math.min(durationDays, Math.max(0, elapsedRaw));
      const progressPct = row.status === "completed" ? 100 : Math.round((daysElapsed / durationDays) * 100);

      let resultLabel: string | null = null;
      const def = METRIC_CATALOG[row.primary_metric];
      if (def && (row.status === "completed" || row.status === "active") && daysElapsed >= def.minDaysForBaseline) {
        const baseline = baselinePeriod(row.start_date, row.end_date);
        const duringTo = today < row.end_date ? today : row.end_date;
        const [beforeSeries, duringSeries] = await Promise.all([
          getDailySeries(db, ownerId, row.primary_metric, baseline.from, baseline.to, row.linked_habit_id),
          getDailySeries(db, ownerId, row.primary_metric, row.start_date, duringTo, row.linked_habit_id),
        ]);
        const comparison = compareMetric(def, aggregateSeries(beforeSeries), aggregateSeries(duringSeries));
        if (comparison.trend === "positive" || comparison.trend === "negative") {
          const sign = comparison.diffPct! > 0 ? "+" : "";
          resultLabel = `${sign}${comparison.diffPct}% ${def.label.toLowerCase()}`;
        }
      }

      return { ...mapExperiment(row), progressPct, daysElapsed, durationDays, resultLabel };
    })
  );
}

/* ---------------------------- Resumo (KPIs do topo) ---------------------------- */

export async function getExperimentSummary(db: Db, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM personal_experiments WHERE owner_id = ? ORDER BY created_at ASC", args: [ownerId] });
  const rows = r.rows as unknown as ExperimentRow[];
  const totalCount = rows.length;
  const activeCount = rows.filter((x) => x.status === "active").length;
  const completedCount = rows.filter((x) => x.status === "completed").length;
  const cancelledCount = rows.filter((x) => x.status === "cancelled").length;
  const endedCount = completedCount + cancelledCount;
  const completionRatePct = endedCount > 0 ? Math.round((completedCount / endedCount) * 100) : null;

  const today = isoDate(new Date());
  let weeksExperimenting = 0;
  let experimentingSinceDate: string | null = null;
  for (const row of rows) {
    if (row.status === "draft") continue;
    if (!experimentingSinceDate || row.start_date < experimentingSinceDate) experimentingSinceDate = row.start_date;
    const to = row.status === "completed" || row.status === "cancelled" ? row.end_date : today < row.end_date ? today : row.end_date;
    weeksExperimenting += Math.max(0, daysBetween(row.start_date, to) + 1) / 7;
  }

  let bestImpact: { label: string; diffPct: number } | null = null;
  for (const row of rows.filter((x) => x.status === "completed")) {
    const def = METRIC_CATALOG[row.primary_metric];
    if (!def) continue;
    const baseline = baselinePeriod(row.start_date, row.end_date);
    const [beforeSeries, duringSeries] = await Promise.all([
      getDailySeries(db, ownerId, row.primary_metric, baseline.from, baseline.to, row.linked_habit_id),
      getDailySeries(db, ownerId, row.primary_metric, row.start_date, row.end_date, row.linked_habit_id),
    ]);
    const comparison = compareMetric(def, aggregateSeries(beforeSeries), aggregateSeries(duringSeries));
    if (comparison.trend === "positive" && comparison.diffPct !== null) {
      if (!bestImpact || Math.abs(comparison.diffPct) > Math.abs(bestImpact.diffPct)) {
        bestImpact = { label: def.label, diffPct: comparison.diffPct };
      }
    }
  }

  return {
    activeCount,
    totalCount,
    completedCount,
    completionRatePct,
    bestImpact,
    weeksExperimenting: Math.round(weeksExperimenting),
    experimentingSinceDate,
  };
}

/* ---------------------------- Insights (últimos concluídos) ---------------------------- */

export async function getExperimentInsights(db: Db, ownerId: string) {
  const r = await db.execute({
    sql: "SELECT * FROM personal_experiments WHERE owner_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 10",
    args: [ownerId],
  });
  const rows = r.rows as unknown as ExperimentRow[];
  if (rows.length === 0) return [];

  const diffs: number[] = [];
  for (const row of rows) {
    const def = METRIC_CATALOG[row.primary_metric];
    if (!def) continue;
    const baseline = baselinePeriod(row.start_date, row.end_date);
    const [beforeSeries, duringSeries] = await Promise.all([
      getDailySeries(db, ownerId, row.primary_metric, baseline.from, baseline.to, row.linked_habit_id),
      getDailySeries(db, ownerId, row.primary_metric, row.start_date, row.end_date, row.linked_habit_id),
    ]);
    const comparison = compareMetric(def, aggregateSeries(beforeSeries), aggregateSeries(duringSeries));
    if (comparison.diffPct !== null) {
      const signedFavorable = comparison.inverse ? -comparison.diffPct : comparison.diffPct;
      diffs.push(signedFavorable);
    }
  }

  const stats: Array<{ label: string; value: string }> = [];
  if (diffs.length > 0) {
    const avg = Math.round((diffs.reduce((s, v) => s + v, 0) / diffs.length) * 10) / 10;
    stats.push({ label: "Variação média nas métricas principais", value: `${avg > 0 ? "+" : ""}${avg}%` });
  }
  const last3 = rows.slice(0, 3);
  if (last3.length > 0) {
    const allCompleted = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM personal_experiments WHERE owner_id = ? AND status IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 3",
      args: [ownerId],
    });
    void allCompleted;
    stats.push({ label: "Taxa de conclusão (últimos 3)", value: `${Math.round((last3.filter((x) => x.status === "completed").length / last3.length) * 100)}%` });
  }
  return stats;
}

/* ---------------------------- CRUD ---------------------------- */

export interface CreateExperimentInput {
  title: string;
  description?: string | null;
  category: ExperimentCategory;
  hypothesis?: string | null;
  motivation?: string | null;
  startDate: string;
  endDate: string;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics?: ExperimentMetricKey[];
  linkedHabitId?: string | null;
  verificationType: "automatic" | "manual";
  verificationRule?: VerificationRule | null;
  verificationConfig?: Record<string, unknown> | null;
  successCriteriaType?: "consistency" | "metric_change" | "none";
  successCriteriaValue?: number | null;
}

function validateDatesAndMetric(input: { startDate: string; endDate: string; primaryMetric: ExperimentMetricKey; linkedHabitId?: string | null }) {
  if (input.endDate <= input.startDate) throw new ExperimentError("A data final deve ser depois da data inicial.");
  if (!METRIC_CATALOG[input.primaryMetric]) throw new ExperimentError("Métrica principal inválida.");
  if (METRIC_CATALOG[input.primaryMetric].requiresHabit && !input.linkedHabitId) {
    throw new ExperimentError("Essa métrica exige selecionar um hábito.");
  }
}

export async function createExperiment(db: Db, ownerId: string, input: CreateExperimentInput) {
  validateDatesAndMetric(input);
  if (input.linkedHabitId) {
    const h = await db.execute({ sql: "SELECT id FROM habits WHERE id = ? AND owner_id = ?", args: [input.linkedHabitId, ownerId] });
    if (h.rows.length === 0) throw new ExperimentError("Hábito não encontrado.", 404);
  }
  const id = nanoid();
  const today = isoDate(new Date());
  const status: ExperimentStatus = input.startDate > today ? "draft" : "active";
  await db.execute({
    sql: `INSERT INTO personal_experiments
          (id, owner_id, title, description, category, hypothesis, motivation, status, start_date, end_date,
           primary_metric, secondary_metrics_json, linked_habit_id, verification_type, verification_rule,
           verification_config_json, success_criteria_type, success_criteria_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, ownerId, input.title.trim(), input.description ?? null, input.category, input.hypothesis ?? null, input.motivation ?? null,
      status, input.startDate, input.endDate, input.primaryMetric, JSON.stringify(input.secondaryMetrics ?? []),
      input.linkedHabitId ?? null, input.verificationType, input.verificationRule ?? null,
      input.verificationConfig ? JSON.stringify(input.verificationConfig) : null,
      input.successCriteriaType ?? "none", input.successCriteriaValue ?? null,
    ],
  });
  return mapExperiment(await fetchExperimentRow(db, ownerId, id));
}

export type UpdateExperimentInput = Partial<CreateExperimentInput>;

export async function updateExperiment(db: Db, ownerId: string, id: string, input: UpdateExperimentInput) {
  const current = await fetchExperimentRow(db, ownerId, id);
  const merged = {
    title: input.title ?? current.title,
    description: input.description !== undefined ? input.description : current.description,
    category: input.category ?? current.category,
    hypothesis: input.hypothesis !== undefined ? input.hypothesis : current.hypothesis,
    motivation: input.motivation !== undefined ? input.motivation : current.motivation,
    startDate: input.startDate ?? current.start_date,
    endDate: input.endDate ?? current.end_date,
    primaryMetric: input.primaryMetric ?? current.primary_metric,
    secondaryMetrics: input.secondaryMetrics ?? (current.secondary_metrics_json ? JSON.parse(current.secondary_metrics_json) : []),
    linkedHabitId: input.linkedHabitId !== undefined ? input.linkedHabitId : current.linked_habit_id,
    verificationType: input.verificationType ?? current.verification_type,
    verificationRule: input.verificationRule !== undefined ? input.verificationRule : current.verification_rule,
    verificationConfig: input.verificationConfig !== undefined ? input.verificationConfig : (current.verification_config_json ? JSON.parse(current.verification_config_json) : null),
    successCriteriaType: input.successCriteriaType ?? current.success_criteria_type,
    successCriteriaValue: input.successCriteriaValue !== undefined ? input.successCriteriaValue : current.success_criteria_value,
  };
  validateDatesAndMetric(merged);

  await db.execute({
    sql: `UPDATE personal_experiments SET
            title = ?, description = ?, category = ?, hypothesis = ?, motivation = ?, start_date = ?, end_date = ?,
            primary_metric = ?, secondary_metrics_json = ?, linked_habit_id = ?, verification_type = ?, verification_rule = ?,
            verification_config_json = ?, success_criteria_type = ?, success_criteria_value = ?, updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [
      merged.title.trim(), merged.description, merged.category, merged.hypothesis, merged.motivation, merged.startDate, merged.endDate,
      merged.primaryMetric, JSON.stringify(merged.secondaryMetrics), merged.linkedHabitId, merged.verificationType, merged.verificationRule,
      merged.verificationConfig ? JSON.stringify(merged.verificationConfig) : null, merged.successCriteriaType, merged.successCriteriaValue,
      id, ownerId,
    ],
  });
  return mapExperiment(await fetchExperimentRow(db, ownerId, id));
}

export async function deleteExperiment(db: Db, ownerId: string, id: string) {
  await fetchExperimentRow(db, ownerId, id);
  await db.execute({ sql: "DELETE FROM personal_experiments WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
}

const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled", "completed"],
  completed: [],
  cancelled: [],
};

export async function transitionStatus(db: Db, ownerId: string, id: string, next: ExperimentStatus) {
  const current = await fetchExperimentRow(db, ownerId, id);
  if (!VALID_TRANSITIONS[current.status].includes(next)) {
    throw new ExperimentError(`Não é possível mudar de "${current.status}" para "${next}".`);
  }
  await db.execute({ sql: "UPDATE personal_experiments SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [next, id, ownerId] });
  return mapExperiment(await fetchExperimentRow(db, ownerId, id));
}

export async function concludeExperiment(
  db: Db,
  ownerId: string,
  id: string,
  input: { personalConclusion?: string | null; worthContinuing?: "yes" | "maybe" | "no" | null; perceivedResult?: "improved" | "no_change" | "worsened" | null }
) {
  const current = await fetchExperimentRow(db, ownerId, id);
  if (current.status === "draft") throw new ExperimentError("Inicie o experimento antes de concluí-lo.");
  await db.execute({
    sql: `UPDATE personal_experiments SET status = 'completed', personal_conclusion = ?, worth_continuing = ?, perceived_result = ?, updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [input.personalConclusion ?? null, input.worthContinuing ?? null, input.perceivedResult ?? null, id, ownerId],
  });
  return mapExperiment(await fetchExperimentRow(db, ownerId, id));
}

/* ---------------------------- Check-ins e observações ---------------------------- */

export async function upsertLog(
  db: Db,
  ownerId: string,
  experimentId: string,
  input: { logDate: string; checkinStatus?: "done" | "missed" | null; perception?: string | null; notes?: string | null }
) {
  await fetchExperimentRow(db, ownerId, experimentId); // valida ownership
  const existing = await db.execute({
    sql: "SELECT * FROM personal_experiment_logs WHERE experiment_id = ? AND log_date = ?",
    args: [experimentId, input.logDate],
  });
  const prev = existing.rows[0] as unknown as { id: string; checkin_status?: string | null; perception?: string | null; notes?: string | null } | undefined;

  if (prev) {
    await db.execute({
      sql: "UPDATE personal_experiment_logs SET checkin_status = ?, perception = ?, notes = ? WHERE id = ?",
      args: [
        input.checkinStatus !== undefined ? input.checkinStatus : prev.checkin_status ?? null,
        input.perception !== undefined ? input.perception : prev.perception ?? null,
        input.notes !== undefined ? input.notes : prev.notes ?? null,
        prev.id,
      ],
    });
  } else {
    await db.execute({
      sql: "INSERT INTO personal_experiment_logs (id, owner_id, experiment_id, log_date, checkin_status, perception, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [nanoid(), ownerId, experimentId, input.logDate, input.checkinStatus ?? null, input.perception ?? null, input.notes ?? null],
    });
  }
  const result = await db.execute({ sql: "SELECT * FROM personal_experiment_logs WHERE experiment_id = ? AND log_date = ?", args: [experimentId, input.logDate] });
  return result.rows[0];
}

/* ---------------------------- Série temporal para gráfico ---------------------------- */

export async function getExperimentSeries(db: Db, ownerId: string, id: string, metric: ExperimentMetricKey) {
  const row = await fetchExperimentRow(db, ownerId, id);
  const def = METRIC_CATALOG[metric];
  if (!def) throw new ExperimentError("Métrica inválida.");
  const today = isoDate(new Date());
  const duringTo = today < row.end_date ? today : row.end_date;
  const baseline = baselinePeriod(row.start_date, row.end_date);

  const [beforeSeries, duringSeries] = await Promise.all([
    getDailySeries(db, ownerId, metric, baseline.from, baseline.to, row.linked_habit_id),
    getDailySeries(db, ownerId, metric, row.start_date, duringTo, row.linked_habit_id),
  ]);

  return {
    metric,
    label: def.label,
    unit: def.unit,
    points: [
      ...beforeSeries.values.map((p) => ({ ...p, phase: "before" as const })),
      ...duringSeries.values.map((p) => ({ ...p, phase: "during" as const })),
    ],
  };
}

/* ---------------------------- Detalhe completo ---------------------------- */

export async function getExperimentDetail(db: Db, ownerId: string, id: string) {
  const row = await fetchExperimentRow(db, ownerId, id);
  const today = isoDate(new Date());
  const durationDays = daysBetween(row.start_date, row.end_date) + 1;
  const duringTo = today < row.end_date ? today : row.end_date;
  const elapsedRaw = daysBetween(row.start_date, duringTo) + 1;
  const daysElapsed = Math.min(durationDays, Math.max(0, elapsedRaw));
  const progressPct = row.status === "completed" ? 100 : Math.round((daysElapsed / durationDays) * 100);

  const baseline = baselinePeriod(row.start_date, row.end_date);
  const secondaryMetrics: ExperimentMetricKey[] = row.secondary_metrics_json ? JSON.parse(row.secondary_metrics_json) : [];
  const allMetrics = [row.primary_metric, ...secondaryMetrics];

  const comparison: MetricComparison[] = [];
  for (const metric of allMetrics) {
    const def = METRIC_CATALOG[metric];
    if (!def) continue;
    const [beforeSeries, duringSeries] = await Promise.all([
      getDailySeries(db, ownerId, metric, baseline.from, baseline.to, row.linked_habit_id),
      getDailySeries(db, ownerId, metric, row.start_date, duringTo, row.linked_habit_id),
    ]);
    comparison.push(compareMetric(def, aggregateSeries(beforeSeries), aggregateSeries(duringSeries)));
  }

  // Check-ins: automático (regra real) com fallback pro log manual quando houver, senão manual puro.
  const logsResult = await db.execute({ sql: "SELECT * FROM personal_experiment_logs WHERE experiment_id = ? ORDER BY log_date ASC", args: [id] });
  type LogRow = { id: string; log_date: string; checkin_status: "done" | "missed" | null; perception: string | null; notes: string | null; created_at: string };
  const logsByDate = new Map<string, LogRow>();
  for (const l of logsResult.rows as unknown as LogRow[]) logsByDate.set(l.log_date, l);

  const checkinDates: string[] = [];
  for (let d = row.start_date; d <= duringTo; d = addDays(d, 1)) checkinDates.push(d);

  const checkins = await Promise.all(
    checkinDates.map(async (date) => {
      if (date > today) return { date, status: "pending" as const, source: "none" as const };
      if (row.verification_type === "automatic" && row.verification_rule) {
        const config = row.verification_config_json ? JSON.parse(row.verification_config_json) : null;
        const auto = await checkAutomaticRule(db, ownerId, row.verification_rule, config, row.linked_habit_id, date);
        if (auto !== null) return { date, status: (auto ? "done" : "missed") as "done" | "missed", source: "automatic" as const };
      }
      const manual = logsByDate.get(date);
      if (manual?.checkin_status) return { date, status: manual.checkin_status, source: "manual" as const };
      return { date, status: "pending" as const, source: "none" as const };
    })
  );

  const decided = checkins.filter((c) => c.status === "done" || c.status === "missed");
  const consistencyPct = decided.length > 0 ? Math.round((decided.filter((c) => c.status === "done").length / decided.length) * 100) : null;

  const logs = (logsResult.rows as unknown as LogRow[]).map((l) => ({
    id: l.id,
    experiment_id: id,
    log_date: l.log_date,
    checkin_status: l.checkin_status,
    perception: l.perception,
    notes: l.notes,
    created_at: l.created_at,
  }));

  const primaryComparison = comparison.find((c) => c.metric === row.primary_metric) ?? null;
  const positiveSecondary = comparison.filter((c) => c.metric !== row.primary_metric && c.trend === "positive");
  let interpretation: string;
  if (!primaryComparison || primaryComparison.trend === "insufficient_data") {
    interpretation = primaryComparison?.insufficientDataReason ?? "Ainda não há dados suficientes para uma interpretação.";
  } else {
    const parts = [describeComparison(primaryComparison)];
    if (positiveSecondary.length > 0) {
      parts.push(`Também foi observada uma tendência positiva em ${positiveSecondary.map((c) => c.label.toLowerCase()).join(" e ")} no mesmo período.`);
    }
    parts.push("Isso sugere uma associação com a mudança testada, mas não estabelece causalidade.");
    interpretation = parts.join(" ");
  }

  return {
    experiment: mapExperiment(row),
    progressPct,
    daysElapsed,
    durationDays,
    comparison,
    checkins,
    consistencyPct,
    logs,
    interpretation,
  };
}

