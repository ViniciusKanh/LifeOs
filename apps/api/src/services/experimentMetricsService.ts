import type { getDb } from "../db/client.js";

/**
 * Catálogo central de métricas dos Experimentos Pessoais. Cada chave
 * mapeia para dados que JÁ existem em outro módulo do LifeOS (Saúde,
 * Foco, Biblioteca, Educação, Hábitos, Tarefas) — nunca criamos uma
 * cópia paralela desses números aqui. Toda regra de "o que é uma
 * melhora" (ex.: estresse menor é melhor) fica centralizada em
 * `inverse`, para nunca ser decidida ad-hoc num componente de UI.
 */

type Db = ReturnType<typeof getDb>;

export type ExperimentMetricKey =
  | "sleep_duration"
  | "sleep_quality"
  | "energy"
  | "mood"
  | "stress"
  | "water_ml"
  | "focus_minutes"
  | "focus_sessions"
  | "exercise_minutes"
  | "exercise_sessions"
  | "reading_pages"
  | "reading_minutes"
  | "study_minutes"
  | "tasks_completed"
  | "habit_consistency";

export interface MetricDefinition {
  key: ExperimentMetricKey;
  label: string;
  unit: string | null;
  /** "menor é melhor" (ex.: estresse) — decide o sinal da interpretação, nunca assumido na UI. */
  inverse: boolean;
  requiresHabit: boolean;
  /** Rota real do módulo onde esse dado é efetivamente registrado — usado para orientar o check-in diário. */
  sourcePath: string;
  sourceLabel: string;
  /**
   * Ausência de registro num dia É um dado real (ex.: 0 minutos de foco = não focou)
   * para métricas de contagem/soma; para métricas subjetivas/pontuais (sono, humor)
   * a ausência significa apenas "não registrou" e não deve virar zero.
   */
  fillZeroOnMissingDay: boolean;
  /** Mínimo de dias com dado real para considerar a média confiável o suficiente para exibir. */
  minDaysForBaseline: number;
}

export const METRIC_CATALOG: Record<ExperimentMetricKey, MetricDefinition> = {
  sleep_duration: { key: "sleep_duration", label: "Sono (duração)", unit: "h", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: false, minDaysForBaseline: 3 },
  sleep_quality: { key: "sleep_quality", label: "Qualidade do sono", unit: "/5", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: false, minDaysForBaseline: 3 },
  energy: { key: "energy", label: "Energia", unit: "/5", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: false, minDaysForBaseline: 3 },
  mood: { key: "mood", label: "Humor", unit: "/5", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: false, minDaysForBaseline: 3 },
  stress: { key: "stress", label: "Estresse", unit: "/5", inverse: true, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: false, minDaysForBaseline: 3 },
  water_ml: { key: "water_ml", label: "Água", unit: "ml", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  focus_minutes: { key: "focus_minutes", label: "Foco (minutos)", unit: "min", inverse: false, requiresHabit: false, sourcePath: "/foco", sourceLabel: "Foco", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  focus_sessions: { key: "focus_sessions", label: "Sessões de Foco", unit: null, inverse: false, requiresHabit: false, sourcePath: "/foco", sourceLabel: "Foco", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  exercise_minutes: { key: "exercise_minutes", label: "Exercício (minutos)", unit: "min", inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  exercise_sessions: { key: "exercise_sessions", label: "Atividades físicas", unit: null, inverse: false, requiresHabit: false, sourcePath: "/saude", sourceLabel: "Saúde", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  reading_pages: { key: "reading_pages", label: "Páginas lidas", unit: "pág.", inverse: false, requiresHabit: false, sourcePath: "/biblioteca", sourceLabel: "Biblioteca", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  reading_minutes: { key: "reading_minutes", label: "Leitura (minutos)", unit: "min", inverse: false, requiresHabit: false, sourcePath: "/biblioteca", sourceLabel: "Biblioteca", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  study_minutes: { key: "study_minutes", label: "Estudo (minutos)", unit: "min", inverse: false, requiresHabit: false, sourcePath: "/educacao", sourceLabel: "Educação", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  tasks_completed: { key: "tasks_completed", label: "Tarefas concluídas", unit: null, inverse: false, requiresHabit: false, sourcePath: "/tarefas", sourceLabel: "Tarefas", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
  habit_consistency: { key: "habit_consistency", label: "Consistência do hábito", unit: "%", inverse: false, requiresHabit: true, sourcePath: "/habitos", sourceLabel: "Hábitos", fillZeroOnMissingDay: true, minDaysForBaseline: 3 },
};

export const METRIC_KEYS = Object.keys(METRIC_CATALOG) as ExperimentMetricKey[];

/** Todas as datas YYYY-MM-DD no intervalo [from, to], inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

type RowMap = Record<string, unknown>;

/** Roda a query de série diária para uma métrica e devolve data → valor (só dias com dado real, sem preencher zero ainda). */
async function rawDailySeries(db: Db, ownerId: string, metric: ExperimentMetricKey, from: string, to: string, linkedHabitId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const put = (rows: RowMap[], dateKey: string, valueKey: string) => {
    for (const r of rows) {
      const d = r[dateKey];
      const v = r[valueKey];
      if (d != null && v != null) map.set(String(d), Number(v));
    }
  };

  switch (metric) {
    case "sleep_duration": {
      const r = await db.execute({
        sql: "SELECT date(went_to_bed_at) AS d, AVG(duration_minutes) / 60.0 AS v FROM sleep_entries WHERE owner_id = ? AND duration_minutes IS NOT NULL AND date(went_to_bed_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "sleep_quality": {
      const r = await db.execute({
        sql: "SELECT date(went_to_bed_at) AS d, AVG(quality) AS v FROM sleep_entries WHERE owner_id = ? AND quality IS NOT NULL AND date(went_to_bed_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "energy": {
      const r = await db.execute({
        sql: "SELECT date(recorded_at) AS d, AVG(energy) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "mood": {
      const r = await db.execute({
        sql: "SELECT date(recorded_at) AS d, AVG(mood) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "stress": {
      const r = await db.execute({
        sql: "SELECT date(recorded_at) AS d, AVG(stress) AS v FROM mood_entries WHERE owner_id = ? AND stress IS NOT NULL AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "water_ml": {
      const r = await db.execute({
        sql: "SELECT date(recorded_at) AS d, SUM(amount_ml) AS v FROM water_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "focus_minutes": {
      const r = await db.execute({
        sql: "SELECT date(started_at) AS d, SUM(actual_minutes) AS v FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "focus_sessions": {
      const r = await db.execute({
        sql: "SELECT date(started_at) AS d, COUNT(*) AS v FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "exercise_minutes": {
      const r = await db.execute({
        sql: "SELECT date(performed_at) AS d, SUM(duration_minutes) AS v FROM workouts WHERE owner_id = ? AND date(performed_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "exercise_sessions": {
      const r = await db.execute({
        sql: "SELECT date(performed_at) AS d, COUNT(*) AS v FROM workouts WHERE owner_id = ? AND date(performed_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "reading_pages": {
      const r = await db.execute({
        sql: "SELECT date(started_at) AS d, SUM(pages_read) AS v FROM reading_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "reading_minutes": {
      const r = await db.execute({
        sql: "SELECT date(started_at) AS d, SUM(duration_minutes) AS v FROM reading_sessions WHERE owner_id = ? AND duration_minutes IS NOT NULL AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "study_minutes": {
      const r = await db.execute({
        sql: "SELECT date(occurred_at) AS d, SUM(duration_minutes) AS v FROM study_sessions WHERE owner_id = ? AND date(occurred_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "tasks_completed": {
      const r = await db.execute({
        sql: "SELECT date(updated_at) AS d, COUNT(*) AS v FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) BETWEEN date(?) AND date(?) GROUP BY d",
        args: [ownerId, from, to],
      });
      put(r.rows as unknown as RowMap[], "d", "v");
      break;
    }
    case "habit_consistency": {
      if (!linkedHabitId) break;
      const habitRow = await db.execute({ sql: "SELECT target_count FROM habits WHERE id = ? AND owner_id = ?", args: [linkedHabitId, ownerId] });
      const targetCount = Number((habitRow.rows[0] as unknown as { target_count?: number })?.target_count ?? 1);
      const r = await db.execute({
        sql: "SELECT entry_date AS d, count AS v FROM habit_entries WHERE owner_id = ? AND habit_id = ? AND entry_date BETWEEN ? AND ?",
        args: [ownerId, linkedHabitId, from, to],
      });
      for (const row of r.rows as unknown as RowMap[]) {
        const d = String(row.d);
        const v = Number(row.v) >= targetCount ? 100 : 0;
        map.set(d, v);
      }
      break;
    }
  }

  return map;
}

export interface DailySeriesResult {
  values: Array<{ date: string; value: number | null }>;
  daysWithData: number;
}

/** Série diária pronta para gráfico: preenche zero nos dias sem dado quando fillZeroOnMissingDay=true, senão deixa null (não fabrica). */
export async function getDailySeries(
  db: Db,
  ownerId: string,
  metric: ExperimentMetricKey,
  from: string,
  to: string,
  linkedHabitId: string | null = null
): Promise<DailySeriesResult> {
  const def = METRIC_CATALOG[metric];
  const raw = await rawDailySeries(db, ownerId, metric, from, to, linkedHabitId);
  const days = dateRange(from, to);
  const values = days.map((date) => {
    const v = raw.get(date);
    if (v !== undefined) return { date, value: v };
    return { date, value: def.fillZeroOnMissingDay ? 0 : null };
  });
  return { values, daysWithData: raw.size };
}

export interface AggregateResult {
  avg: number | null;
  daysWithData: number;
  daysInRange: number;
}

export function aggregateSeries(series: DailySeriesResult): AggregateResult {
  const withValue = series.values.filter((p) => p.value !== null) as Array<{ date: string; value: number }>;
  const avg = withValue.length > 0 ? withValue.reduce((s, p) => s + p.value, 0) / withValue.length : null;
  return { avg, daysWithData: series.daysWithData, daysInRange: series.values.length };
}

export interface MetricComparison {
  metric: ExperimentMetricKey;
  label: string;
  unit: string | null;
  inverse: boolean;
  beforeAvg: number | null;
  duringAvg: number | null;
  beforeDays: number;
  duringDays: number;
  diffAbs: number | null;
  diffPct: number | null;
  trend: "positive" | "negative" | "neutral" | "insufficient_data";
  insufficientDataReason: string | null;
}

/**
 * Compara baseline (período imediatamente anterior, mesma duração) x
 * período do experimento para uma métrica. Nunca inventa valor: sem
 * amostra mínima dos dois lados, o trend volta 'insufficient_data' com
 * o motivo em português para exibir na tela em vez de um número falso.
 */
export function compareMetric(def: MetricDefinition, before: AggregateResult, during: AggregateResult): MetricComparison {
  const base: MetricComparison = {
    metric: def.key,
    label: def.label,
    unit: def.unit,
    inverse: def.inverse,
    beforeAvg: before.avg,
    duringAvg: during.avg,
    beforeDays: before.daysWithData,
    duringDays: during.daysWithData,
    diffAbs: null,
    diffPct: null,
    trend: "insufficient_data",
    insufficientDataReason: null,
  };

  if (before.daysWithData < def.minDaysForBaseline) {
    base.insufficientDataReason = `Você possui apenas ${before.daysWithData} dia(s) de registros de ${def.label.toLowerCase()} antes deste experimento. Ainda não há baseline suficiente para comparação.`;
    return base;
  }
  if (during.daysWithData < 1 || before.avg === null || during.avg === null) {
    base.insufficientDataReason = "Ainda não há dados suficientes durante o experimento para comparar.";
    return base;
  }

  const diffAbs = during.avg - before.avg;
  const diffPct = before.avg !== 0 ? Math.round((diffAbs / Math.abs(before.avg)) * 1000) / 10 : null;
  base.diffAbs = Math.round(diffAbs * 100) / 100;
  base.diffPct = diffPct;

  const favorable = def.inverse ? diffAbs < 0 : diffAbs > 0;
  const neutral = Math.abs(diffAbs) < 0.001;
  base.trend = neutral ? "neutral" : favorable ? "positive" : "negative";
  return base;
}

/** Frase segura sobre a comparação — nunca afirma causalidade, sempre fala em tendência/associação (seção 32/63). */
export function describeComparison(c: MetricComparison): string {
  if (c.trend === "insufficient_data") return c.insufficientDataReason ?? "Não há dados suficientes para concluir.";
  if (c.trend === "neutral" || c.diffPct === null) {
    return `Durante este período, ${c.label.toLowerCase()} ficou praticamente estável em relação ao período anterior.`;
  }
  const direction = c.diffPct > 0 ? "maior" : "menor";
  return `Durante o experimento, sua média de ${c.label.toLowerCase()} foi ${Math.abs(c.diffPct)}% ${direction} que no período anterior.`;
}
