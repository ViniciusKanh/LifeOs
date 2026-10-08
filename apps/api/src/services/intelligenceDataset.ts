import type { Client } from "@libsql/client";
import { getDailySeries, type ExperimentMetricKey } from "./experimentMetricsService.js";
import type { Row } from "./mlEngine.js";

/**
 * Grimório (dataset) da Forja da Inteligência. Monta uma linha por dia a
 * partir das fontes ORIGINAIS dos módulos (Saúde, Foco, Tarefas, Hábitos,
 * Educação, Biblioteca) — nada é copiado para tabelas paralelas. Só roda
 * quando o usuário pede (forjar/atualizar), para não gastar leituras a cada visita.
 *
 * Regra anti-vazamento: as runas de um dia D usam apenas dados de D-1
 * (véspera) e o calendário de D. O alvo é sempre medido no próprio dia D.
 */

type SeriesKey = ExperimentMetricKey | "habits_done";
const SERIES: SeriesKey[] = ["sleep_duration", "sleep_quality", "energy", "mood", "stress", "water_ml", "focus_minutes", "exercise_minutes", "study_minutes", "reading_pages", "tasks_completed", "habits_done"];
/** Séries de contagem (0 = não aconteceu). As demais: ausência = não registrou. */
const COUNT_SERIES = new Set<SeriesKey>(["water_ml", "focus_minutes", "exercise_minutes", "study_minutes", "reading_pages", "tasks_completed", "habits_done"]);

export interface DayData {
  date: string;
  v: Record<SeriesKey, number | null>;
}

export type FeatureSource = "saude" | "foco" | "tarefas" | "habitos" | "educacao" | "leitura" | "calendario";
export interface FeatureDef {
  key: string;
  label: string;
  source: FeatureSource;
  /** Valor da runa para o dia de índice i (só usa dias anteriores). */
  value: (days: DayData[], i: number) => number | null;
}

const lag = (k: SeriesKey) => (days: DayData[], i: number) => (i > 0 ? days[i - 1].v[k] : null);

export const FEATURES: FeatureDef[] = [
  { key: "sleep_duration", label: "Sono (horas)", source: "saude", value: lag("sleep_duration") },
  { key: "sleep_quality", label: "Qualidade do sono", source: "saude", value: lag("sleep_quality") },
  { key: "energy", label: "Energia da véspera", source: "saude", value: lag("energy") },
  { key: "mood", label: "Humor da véspera", source: "saude", value: lag("mood") },
  { key: "stress", label: "Estresse da véspera", source: "saude", value: lag("stress") },
  { key: "water_ml", label: "Água da véspera", source: "saude", value: lag("water_ml") },
  { key: "exercise_minutes", label: "Exercício recente", source: "saude", value: lag("exercise_minutes") },
  { key: "focus_minutes", label: "Foco da véspera", source: "foco", value: lag("focus_minutes") },
  { key: "study_minutes", label: "Horas de estudo", source: "educacao", value: lag("study_minutes") },
  { key: "reading_pages", label: "Páginas lidas", source: "leitura", value: lag("reading_pages") },
  { key: "tasks_completed", label: "Missões concluídas na véspera", source: "tarefas", value: lag("tasks_completed") },
  {
    key: "tasks_7d",
    label: "Carga semanal (média 7 dias)",
    source: "tarefas",
    value: (days, i) => {
      const w = days.slice(Math.max(0, i - 7), i).map((d) => d.v.tasks_completed ?? 0);
      return w.length ? w.reduce((s, v) => s + v, 0) / w.length : null;
    },
  },
  { key: "habits_done", label: "Streak de hábitos (véspera)", source: "habitos", value: lag("habits_done") },
  {
    key: "weekend",
    label: "Fim de semana",
    source: "calendario",
    value: (days, i) => {
      const dow = new Date(`${days[i].date}T12:00:00Z`).getUTCDay();
      return dow === 0 || dow === 6 ? 1 : 0;
    },
  },
];

export type ObjectiveKey = "productivity" | "habits" | "focus" | "energy" | "study";
export interface ObjectiveDef {
  key: ObjectiveKey;
  name: string;
  description: string;
  targetLabel: string;
  icon: "sun" | "leaf" | "flame" | "bolt" | "book";
  /** Rótulo 1/0 do dia (null = dia sem medida do alvo, fica fora do treino). */
  label: (days: DayData[], i: number, threshold: number) => 0 | 1 | null;
  /** Limiar pessoal derivado dos próprios dados (mediana) — explicado na UI. */
  threshold: (days: DayData[]) => number;
  thresholdText: (t: number) => string;
}

/**
 * Limiar pessoal que deixa as classes o mais equilibradas possível (≥ piso).
 * Ex.: se metade dos dias tem 2+ missões, o alvo vira "2+". Com dados muito
 * concentrados (quase todo dia igual), nenhum limiar resolve — e a prontidão
 * explica o que falta registrar.
 */
export function balancedThreshold(values: number[], floor: number): number {
  const candidates = [...new Set(values.filter((v) => v >= floor).map((v) => Math.ceil(v)))].sort((a, b) => a - b);
  let best = floor;
  let bestScore = -1;
  for (const t of candidates.length ? candidates : [floor]) {
    const pos = values.filter((v) => v >= t).length;
    const score = Math.min(pos, values.length - pos);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

const countLabel = (k: SeriesKey) => (days: DayData[], i: number, t: number) => ((days[i].v[k] ?? 0) >= t ? 1 : 0) as 0 | 1;

export const OBJECTIVES: ObjectiveDef[] = [
  {
    key: "productivity",
    name: "Oráculo de Produtividade",
    description: "Prevê dias de alta produtividade com base na véspera e na sua rotina.",
    targetLabel: "Dia de alta produtividade",
    icon: "sun",
    threshold: (days) => balancedThreshold(days.map((d) => d.v.tasks_completed ?? 0), 1),
    label: countLabel("tasks_completed"),
    thresholdText: (t) => `${t}+ missões concluídas no dia (seu limiar pessoal)`,
  },
  {
    key: "habits",
    name: "Guardião dos Hábitos",
    description: "Prevê os dias em que seus hábitos tendem a ser cumpridos.",
    targetLabel: "Dia de hábitos cumpridos",
    icon: "leaf",
    threshold: (days) => balancedThreshold(days.map((d) => d.v.habits_done ?? 0), 1),
    label: countLabel("habits_done"),
    thresholdText: (t) => `${t}+ hábitos cumpridos no dia (seu limiar pessoal)`,
  },
  {
    key: "focus",
    name: "Chama do Foco",
    description: "Prevê dias de foco profundo a partir do seu ritmo recente.",
    targetLabel: "Dia de foco profundo",
    icon: "flame",
    threshold: (days) => balancedThreshold(days.map((d) => d.v.focus_minutes ?? 0), 25),
    label: countLabel("focus_minutes"),
    thresholdText: (t) => `${t}+ minutos de foco no dia`,
  },
  {
    key: "energy",
    name: "Espelho da Energia",
    description: "Prevê dias de energia alta usando sono, rotina e carga.",
    targetLabel: "Dia de energia alta",
    icon: "bolt",
    threshold: () => 4,
    label: (days, i, t) => (days[i].v.energy === null ? null : days[i].v.energy! >= t ? 1 : 0),
    thresholdText: () => "energia registrada ≥ 4 de 5",
  },
  {
    key: "study",
    name: "Mentor Acadêmico",
    description: "Prevê se o dia tende a ter sessão de estudo, para planejar quando estudar.",
    targetLabel: "Dia com estudo",
    icon: "book",
    threshold: () => 1,
    label: countLabel("study_minutes"),
    thresholdText: () => "pelo menos 1 minuto de estudo registrado",
  },
];

export const MIN_SAMPLES = 30;
export const MIN_PER_CLASS = 6;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function habitsDoneSeries(db: Client, ownerId: string, from: string, to: string): Promise<Map<string, number>> {
  const r = await db.execute({
    sql: `SELECT e.entry_date AS d, COUNT(*) AS v FROM habit_entries e JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
          WHERE e.owner_id = ? AND e.entry_date BETWEEN ? AND ? AND e.count >= h.target_count GROUP BY e.entry_date`,
    args: [ownerId, from, to],
  });
  return new Map(r.rows.map((row) => [String(row.d), Number(row.v)]));
}

/** Carrega até `daysBack` dias (até `to`, inclusive) e corta o período antes do primeiro registro real. */
export async function loadDays(db: Client, ownerId: string, to: string, daysBack = 365): Promise<DayData[]> {
  const from = addDays(to, -(daysBack - 1));
  const metricKeys = SERIES.filter((k): k is ExperimentMetricKey => k !== "habits_done");
  const [habits, ...series] = await Promise.all([habitsDoneSeries(db, ownerId, from, to), ...metricKeys.map((k) => getDailySeries(db, ownerId, k, from, to))]);
  const byKey = new Map<SeriesKey, Map<string, number | null>>();
  metricKeys.forEach((k, i) => byKey.set(k, new Map(series[i].values.map((p) => [p.date, p.value]))));
  const days: DayData[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = {} as Record<SeriesKey, number | null>;
    for (const k of metricKeys) v[k] = byKey.get(k)?.get(d) ?? (COUNT_SERIES.has(k) ? 0 : null);
    v.habits_done = habits.get(d) ?? 0;
    days.push({ date: d, v });
  }
  const has = (d: DayData) => SERIES.some((k) => (COUNT_SERIES.has(k) ? (d.v[k] ?? 0) > 0 : d.v[k] !== null));
  const first = days.findIndex(has);
  return first < 0 ? [] : days.slice(first);
}

export interface Dataset {
  X: Row[];
  y: number[];
  dates: string[];
  threshold: number;
}

/** Linhas de treino de um objetivo (ordem cronológica). O dia corrente nunca entra (ainda está acontecendo). */
export function buildDataset(days: DayData[], objective: ObjectiveDef, today: string): Dataset {
  const usable = days.filter((d) => d.date < today);
  const threshold = objective.threshold(usable);
  const X: Row[] = [];
  const y: number[] = [];
  const dates: string[] = [];
  for (let i = 1; i < days.length; i++) {
    if (days[i].date >= today) break;
    const label = objective.label(days, i, threshold);
    if (label === null) continue;
    X.push(FEATURES.map((f) => f.value(days, i)));
    y.push(label);
    dates.push(days[i].date);
  }
  return { X, y, dates, threshold };
}

/** Runas do dia `index` (pode ser hoje: usa a véspera, que já está completa). */
export function featureRow(days: DayData[], index: number): Row {
  return FEATURES.map((f) => f.value(days, index));
}

export interface Readiness {
  objective: ObjectiveKey;
  samples: number;
  positives: number;
  negatives: number;
  ready: boolean;
  reason: string | null;
  thresholdText: string;
  /** Ritual de desbloqueio: o que ainda falta registrar (0 = ok). */
  missing: { samples: number; positives: number; negatives: number };
  /** Próximo passo concreto e gamificado para destravar o artefato. */
  hint: string | null;
}

const UNLOCK_HINT: Record<ObjectiveKey, { pos: string; neg: string; sample: string }> = {
  productivity: { pos: "dias em que você bata o limiar de missões concluídas", neg: "dias mais leves (abaixo do limiar)", sample: "dias com registros (tarefas, sono, foco…)" },
  habits: { pos: "dias com seus hábitos cumpridos", neg: "dias com menos hábitos", sample: "dias com check-in de hábitos" },
  focus: { pos: "dias com sessões de Foco de 25+ min", neg: "dias sem foco profundo", sample: "dias com registros" },
  energy: { pos: "registros de energia alta (4–5)", neg: "registros de energia baixa ou média (1–3)", sample: "dias com energia registrada em Saúde" },
  study: { pos: "dias com sessão de estudo registrada em Educação", neg: "dias sem estudo", sample: "dias com registros" },
};

export function readinessOf(days: DayData[], objective: ObjectiveDef, today: string): Readiness {
  const ds = buildDataset(days, objective, today);
  const positives = ds.y.filter((v) => v === 1).length;
  const negatives = ds.y.length - positives;
  const missing = {
    samples: Math.max(0, MIN_SAMPLES - ds.y.length),
    positives: Math.max(0, MIN_PER_CLASS - positives),
    negatives: Math.max(0, MIN_PER_CLASS - negatives),
  };
  const h = UNLOCK_HINT[objective.key];
  let reason: string | null = null;
  let hint: string | null = null;
  if (missing.samples > 0) {
    reason = `Faltam ${missing.samples} dia(s) com registro para treinar (mínimo ${MIN_SAMPLES}).`;
    hint = `Registre mais ${missing.samples} ${h.sample}.`;
  } else if (missing.positives > 0 || missing.negatives > 0) {
    reason = `Os dias são muito parecidos entre si (${positives} positivos × ${negatives} negativos). São necessários pelo menos ${MIN_PER_CLASS} de cada tipo.`;
    hint = missing.positives > 0 ? `Conquiste mais ${missing.positives} ${h.pos}.` : `Faltam ${missing.negatives} ${h.neg} para o artefato comparar.`;
  }
  return { objective: objective.key, samples: ds.y.length, positives, negatives, ready: reason === null, reason, thresholdText: objective.thresholdText(ds.threshold), missing, hint };
}

/* ---------------- resumo do Grimório ---------------- */

const SOURCE_COUNTS: Array<{ key: string; label: string; sql: string }> = [
  { key: "tarefas", label: "Tarefas", sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND created_at >= date(?)" },
  { key: "habitos", label: "Hábitos", sql: "SELECT COUNT(*) AS n FROM habit_entries WHERE owner_id = ? AND entry_date >= ?" },
  { key: "sono", label: "Sono", sql: "SELECT COUNT(*) AS n FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= date(?)" },
  { key: "humor", label: "Humor e energia", sql: "SELECT COUNT(*) AS n FROM mood_entries WHERE owner_id = ? AND recorded_at >= date(?)" },
  { key: "agua", label: "Água", sql: "SELECT COUNT(*) AS n FROM water_entries WHERE owner_id = ? AND recorded_at >= date(?)" },
  { key: "exercicios", label: "Exercícios", sql: "SELECT COUNT(*) AS n FROM workouts WHERE owner_id = ? AND performed_at >= date(?)" },
  { key: "foco", label: "Foco", sql: "SELECT COUNT(*) AS n FROM focus_sessions WHERE owner_id = ? AND started_at >= date(?)" },
  { key: "educacao", label: "Educação", sql: "SELECT COUNT(*) AS n FROM study_sessions WHERE owner_id = ? AND occurred_at >= date(?)" },
  { key: "leitura", label: "Leitura", sql: "SELECT COUNT(*) AS n FROM reading_sessions WHERE owner_id = ? AND started_at >= date(?)" },
  { key: "journal", label: "Journal", sql: "SELECT COUNT(*) AS n FROM journal_entries WHERE owner_id = ? AND entry_date >= ?" },
  { key: "metas", label: "Metas", sql: "SELECT COUNT(*) AS n FROM goal_progress WHERE owner_id = ? AND recorded_at >= date(?)" },
];

export interface GrimoireSummary {
  rangeFrom: string | null;
  rangeTo: string;
  records: number;
  features: number;
  daysObserved: number;
  sources: Array<{ key: string; label: string; records: number; pct: number }>;
  qualityScore: number | null;
  missingRate: number | null;
  outlierRate: number | null;
  areas: Array<{ key: string; label: string; days: number; active: boolean }>;
  corePower: number;
  readiness: Readiness[];
  featureCoverage: Array<{ key: string; label: string; coverage: number }>;
}

/** Núcleo: área "acesa" quando tem 14+ dias com registro nos últimos 90. */
const AREA_MIN_DAYS = 14;

export async function summarizeGrimoire(db: Client, ownerId: string, days: DayData[], today: string): Promise<GrimoireSummary> {
  const from = days[0]?.date ?? null;
  const counts = from ? await Promise.all(SOURCE_COUNTS.map((s) => db.execute({ sql: s.sql, args: [ownerId, from] }).then((r) => Number(r.rows[0]?.n ?? 0)))) : SOURCE_COUNTS.map(() => 0);
  const records = counts.reduce((s, v) => s + v, 0);
  const sources = SOURCE_COUNTS.map((s, i) => ({ key: s.key, label: s.label, records: counts[i], pct: records ? Math.round((counts[i] / records) * 1000) / 10 : 0 }));

  // Qualidade = completude das runas × (1 − taxa de outliers |z|>3).
  const rows = days.slice(1).map((_, k) => FEATURES.map((f) => f.value(days, k + 1)));
  let cells = 0, filled = 0, outliers = 0;
  const coverage = FEATURES.map((f, j) => {
    const col = rows.map((r) => r[j]).filter((v): v is number => v !== null);
    const mu = col.reduce((s, v) => s + v, 0) / (col.length || 1);
    const sd = Math.sqrt(col.reduce((s, v) => s + (v - mu) ** 2, 0) / (col.length || 1)) || 1;
    cells += rows.length;
    filled += col.length;
    if (f.key !== "weekend") outliers += col.filter((v) => Math.abs((v - mu) / sd) > 3).length;
    return { key: f.key, label: f.label, coverage: rows.length ? Math.round((col.length / rows.length) * 100) : 0 };
  });
  const missingRate = cells ? 1 - filled / cells : null;
  const outlierRate = filled ? outliers / filled : null;

  const recent = days.slice(-90);
  const count = (pred: (d: DayData) => boolean) => recent.filter(pred).length;
  const goalDays = from
    ? Number((await db.execute({ sql: "SELECT COUNT(DISTINCT date(recorded_at)) AS n FROM goal_progress WHERE owner_id = ? AND recorded_at >= date(?, '-89 days')", args: [ownerId, today] })).rows[0]?.n ?? 0)
    : 0;
  const areaDays: Array<[string, string, number]> = [
    ["metas", "Metas", goalDays],
    ["habitos", "Hábitos", count((d) => (d.v.habits_done ?? 0) > 0)],
    ["saude", "Saúde", count((d) => d.v.sleep_duration !== null || (d.v.water_ml ?? 0) > 0 || (d.v.exercise_minutes ?? 0) > 0)],
    ["educacao", "Educação", count((d) => (d.v.study_minutes ?? 0) > 0)],
    ["foco", "Foco", count((d) => (d.v.focus_minutes ?? 0) > 0)],
    ["energia", "Energia", count((d) => d.v.energy !== null)],
  ];
  const areas = areaDays.map(([key, label, n]) => ({ key, label, days: n, active: n >= AREA_MIN_DAYS }));

  return {
    rangeFrom: from,
    rangeTo: today,
    records,
    features: FEATURES.length,
    daysObserved: days.filter((d) => d.date < today).length,
    sources,
    qualityScore: missingRate === null ? null : Math.round((1 - missingRate) * (1 - (outlierRate ?? 0)) * 100),
    missingRate: missingRate === null ? null : Math.round(missingRate * 1000) / 1000,
    outlierRate: outlierRate === null ? null : Math.round(outlierRate * 1000) / 1000,
    areas,
    corePower: Math.round((areas.filter((a) => a.active).length / areas.length) * 100),
    readiness: OBJECTIVES.map((o) => readinessOf(days, o, today)),
    featureCoverage: coverage,
  };
}
