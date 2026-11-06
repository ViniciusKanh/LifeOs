import type { Client } from "@libsql/client";
import { getDailySeries, type ExperimentMetricKey } from "./experimentMetricsService.js";
import { balancedThreshold } from "./intelligenceDataset.js";
import type { Row } from "./mlEngine.js";
import type { Problem } from "./forgeEngine.js";

/**
 * Dataset da Forja 3.0 — uma observação por DIA LOCAL, agregada a partir das
 * fontes originais (Saúde, Missões, Hábitos, Educação, Biblioteca e o
 * cronômetro de foco). Nada é copiado para tabelas paralelas.
 *
 * Regra anti-vazamento: para prever o dia D com horizonte h, toda variável
 * usa somente dias ≤ D−h (defasagem h e média móvel terminando em D−h) e o
 * calendário de D (dia da semana é conhecido antecipadamente). O alvo é sempre
 * medido no próprio dia D.
 */

export type SeriesKey = "sleep_duration" | "sleep_quality" | "energy" | "mood" | "stress" | "water_ml" | "exercise_minutes" | "study_minutes" | "reading_pages" | "tasks_completed" | "focus_minutes" | "habits_done";
export const SERIES: Array<{ key: SeriesKey; label: string; unit: string; source: SourceKey; count: boolean; min: number; max: number }> = [
  { key: "sleep_duration", label: "Sono", unit: "h", source: "saude", count: false, min: 0, max: 16 },
  { key: "sleep_quality", label: "Qualidade do sono", unit: "/5", source: "saude", count: false, min: 1, max: 5 },
  { key: "energy", label: "Energia", unit: "/5", source: "saude", count: false, min: 1, max: 5 },
  { key: "mood", label: "Humor", unit: "/5", source: "saude", count: false, min: 1, max: 5 },
  { key: "stress", label: "Estresse", unit: "/5", source: "saude", count: false, min: 1, max: 5 },
  { key: "water_ml", label: "Água", unit: "ml", source: "saude", count: true, min: 0, max: 10000 },
  { key: "exercise_minutes", label: "Exercício", unit: "min", source: "saude", count: true, min: 0, max: 600 },
  { key: "study_minutes", label: "Estudo", unit: "min", source: "educacao", count: true, min: 0, max: 960 },
  { key: "reading_pages", label: "Páginas lidas", unit: "pág.", source: "biblioteca", count: true, min: 0, max: 2000 },
  { key: "tasks_completed", label: "Missões concluídas", unit: "", source: "missoes", count: true, min: 0, max: 200 },
  { key: "focus_minutes", label: "Tempo de foco", unit: "min", source: "missoes", count: true, min: 0, max: 960 },
  { key: "habits_done", label: "Hábitos cumpridos", unit: "", source: "habitos", count: true, min: 0, max: 100 },
];

export type SourceKey = "habitos" | "saude" | "missoes" | "metas" | "educacao" | "biblioteca" | "agenda" | "experimentos";

export interface Day {
  date: string;
  v: Record<SeriesKey, number | null>;
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Carrega a série diária até `to` (inclusive) e corta antes do primeiro registro real. */
export async function loadForgeDays(db: Client, ownerId: string, to: string, daysBack = 365): Promise<Day[]> {
  const from = addDays(to, -(daysBack - 1));
  const metric = SERIES.filter((s) => s.key !== "habits_done").map((s) => s.key as ExperimentMetricKey);
  const [habits, ...series] = await Promise.all([
    db.execute({
      sql: `SELECT e.entry_date AS d, COUNT(*) AS v FROM habit_entries e JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
            WHERE e.owner_id = ? AND e.entry_date BETWEEN ? AND ? AND e.count >= h.target_count GROUP BY e.entry_date`,
      args: [ownerId, from, to],
    }),
    ...metric.map((k) => getDailySeries(db, ownerId, k, from, to)),
  ]);
  const hmap = new Map(habits.rows.map((r) => [String(r.d), Number(r.v)]));
  const maps = metric.map((_, i) => new Map(series[i]!.values.map((p) => [p.date, p.value])));
  const days: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = {} as Record<SeriesKey, number | null>;
    metric.forEach((k, i) => {
      const s = SERIES.find((x) => x.key === k)!;
      const raw = maps[i]!.get(d);
      v[k as SeriesKey] = raw === undefined || raw === null ? (s.count ? 0 : null) : raw;
    });
    v.habits_done = hmap.get(d) ?? 0;
    days.push({ date: d, v });
  }
  const has = (d: Day) => SERIES.some((s) => (s.count ? (d.v[s.key] ?? 0) > 0 : d.v[s.key] !== null));
  const first = days.findIndex(has);
  return first < 0 ? [] : days.slice(first);
}

/* ───────────────────────── variáveis (runas) ───────────────────────── */

export interface FeatureDef {
  key: string;
  label: string;
  source: SourceKey | "calendario";
  type: "numérica" | "binária" | "cíclica";
  description: string;
  value: (days: Day[], i: number, h: number) => number | null;
}

const lagF = (s: (typeof SERIES)[number]): FeatureDef => ({
  key: `${s.key}__lag`,
  label: `${s.label} (defasado)`,
  source: s.source,
  type: "numérica",
  description: `${s.label} no dia D−h (o último dia já conhecido no momento da previsão).`,
  value: (days, i, h) => (i - h >= 0 ? days[i - h]!.v[s.key] : null),
});
const avgF = (s: (typeof SERIES)[number]): FeatureDef => ({
  key: `${s.key}__avg7`,
  label: `${s.label} (média 7 dias)`,
  source: s.source,
  type: "numérica",
  description: `Média de ${s.label.toLowerCase()} nos 7 dias que terminam em D−h (dias sem registro ficam de fora).`,
  value: (days, i, h) => {
    const end = i - h;
    if (end < 0) return null;
    const vals = days.slice(Math.max(0, end - 6), end + 1).map((d) => d.v[s.key]).filter((x): x is number => x !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  },
});
const dow = (days: Day[], i: number) => new Date(`${days[i]!.date}T12:00:00Z`).getUTCDay();

export const FEATURES: FeatureDef[] = [
  ...SERIES.flatMap((s) => [lagF(s), avgF(s)]),
  { key: "weekend", label: "Fim de semana", source: "calendario", type: "binária", description: "1 se o dia-alvo é sábado ou domingo (conhecido antecipadamente).", value: (d, i) => (dow(d, i) === 0 || dow(d, i) === 6 ? 1 : 0) },
  { key: "dow_sin", label: "Dia da semana (seno)", source: "calendario", type: "cíclica", description: "Codificação cíclica do dia da semana do dia-alvo.", value: (d, i) => Math.round(Math.sin((2 * Math.PI * dow(d, i)) / 7) * 1000) / 1000 },
  { key: "dow_cos", label: "Dia da semana (cosseno)", source: "calendario", type: "cíclica", description: "Codificação cíclica do dia da semana do dia-alvo.", value: (d, i) => Math.round(Math.cos((2 * Math.PI * dow(d, i)) / 7) * 1000) / 1000 },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

/* ───────────────────────── alvos ───────────────────────── */

export interface TargetDef {
  key: string;
  label: string;
  problem: Problem;
  series: SeriesKey;
  description: string;
  /** Classificação: como o limiar é definido (fixo ou pessoal equilibrado com piso). */
  threshold?: { fixed?: number; floor?: number };
}

export const TARGETS: TargetDef[] = [
  { key: "training", label: "Realização de treino", problem: "classification", series: "exercise_minutes", threshold: { floor: 20 }, description: "Dia com treino registrado em Saúde (minutos ≥ limiar pessoal)." },
  { key: "study", label: "Sessão de estudo", problem: "classification", series: "study_minutes", threshold: { fixed: 1 }, description: "Dia com pelo menos 1 minuto de estudo registrado em Educação." },
  { key: "productivity", label: "Dia produtivo", problem: "classification", series: "tasks_completed", threshold: { floor: 1 }, description: "Missões concluídas no dia ≥ limiar pessoal equilibrado." },
  { key: "habits", label: "Cumprimento de hábitos", problem: "classification", series: "habits_done", threshold: { floor: 1 }, description: "Hábitos cumpridos no dia ≥ limiar pessoal equilibrado." },
  { key: "energy_high", label: "Energia alta", problem: "classification", series: "energy", threshold: { fixed: 4 }, description: "Energia autorrelatada ≥ 4 de 5 (dias sem registro ficam fora)." },
  { key: "energy_level", label: "Nível de energia", problem: "regression", series: "energy", description: "Energia autorrelatada (1 a 5) no dia." },
  { key: "focus_minutes", label: "Tempo de foco", problem: "regression", series: "focus_minutes", description: "Minutos de foco cronometrados no dia." },
  { key: "study_minutes", label: "Minutos de estudo", problem: "regression", series: "study_minutes", description: "Minutos de estudo registrados no dia." },
  { key: "tasks_count", label: "Missões concluídas", problem: "regression", series: "tasks_completed", description: "Quantidade de missões concluídas no dia." },
  { key: "sleep_hours", label: "Horas de sono", problem: "regression", series: "sleep_duration", description: "Duração do sono que começou no dia." },
];

export const targetOf = (key: string) => TARGETS.find((t) => t.key === key) ?? null;

export interface Matrix {
  X: Row[];
  y: number[];
  dates: string[];
  threshold: number | null;
  /** Índice da variável "alvo defasado" (linha de base de persistência). */
  persistenceIndex: number | null;
}

/**
 * Monta X/y em ordem cronológica. O dia corrente nunca entra no treino (ainda
 * está acontecendo). O limiar pessoal é calculado só nos primeiros 80% dos dias
 * (o holdout final não influencia a definição do rótulo).
 */
export function buildMatrix(days: Day[], target: TargetDef, horizon: number, featureKeys: string[], today: string): Matrix {
  const feats = featureKeys.map((k) => FEATURES.find((f) => f.key === k)).filter((f): f is FeatureDef => !!f);
  const past = days.filter((d) => d.date < today);
  let threshold: number | null = null;
  if (target.problem === "classification") {
    const early = past.slice(0, Math.max(1, Math.floor(past.length * 0.8))).map((d) => d.v[target.series]).filter((v): v is number => v !== null);
    threshold = target.threshold?.fixed ?? balancedThreshold(early, target.threshold?.floor ?? 1);
  }
  const X: Row[] = [];
  const y: number[] = [];
  const dates: string[] = [];
  for (let i = horizon; i < days.length; i++) {
    if (days[i]!.date >= today) break;
    const raw = days[i]!.v[target.series];
    if (raw === null) continue;
    y.push(target.problem === "classification" ? (raw >= threshold! ? 1 : 0) : raw);
    X.push(feats.map((f) => f.value(days, i, horizon)));
    dates.push(days[i]!.date);
  }
  const pk = `${target.series}__lag`;
  const pi = feats.findIndex((f) => f.key === pk);
  return { X, y, dates, threshold, persistenceIndex: pi >= 0 ? pi : null };
}

/**
 * Linha de inferência para a data-alvo T. Dias depois de hoje entram vazios;
 * nenhuma variável lê o dia-alvo (só a data, para o calendário). `partial`
 * indica que a linha depende de hoje, que ainda não terminou.
 */
export function inferenceRow(days: Day[], featureKeys: string[], horizon: number, target: string, today: string): { row: Row; partial: boolean } | null {
  const ext = [...days];
  let last = ext[ext.length - 1]?.date;
  if (!last) return null;
  while (last < target) {
    last = addDays(last, 1);
    ext.push({ date: last, v: Object.fromEntries(SERIES.map((s) => [s.key, null])) as Day["v"] });
  }
  const i = ext.findIndex((d) => d.date === target);
  if (i < horizon) return null;
  const feats = featureKeys.map((k) => FEATURES.find((f) => f.key === k)).filter((f): f is FeatureDef => !!f);
  return { row: feats.map((f) => f.value(ext, i, horizon)), partial: addDays(target, -horizon) >= today };
}

/* ───────────────────────── qualidade e fontes ───────────────────────── */

const SOURCE_DEFS: Array<{ key: SourceKey; label: string; sql: string; dateExpr: string; dupSql?: string; usedAsFeature: boolean }> = [
  { key: "habitos", label: "Hábitos", sql: "FROM habit_entries WHERE owner_id = ?", dateExpr: "entry_date", dupSql: "SELECT COUNT(*) AS n FROM (SELECT habit_id, entry_date, COUNT(*) c FROM habit_entries WHERE owner_id = ? GROUP BY habit_id, entry_date HAVING c > 1)", usedAsFeature: true },
  { key: "saude", label: "Saúde", sql: "FROM mood_entries WHERE owner_id = ?", dateExpr: "recorded_at", dupSql: "SELECT COUNT(*) AS n FROM (SELECT recorded_at, COUNT(*) c FROM mood_entries WHERE owner_id = ? GROUP BY recorded_at HAVING c > 1)", usedAsFeature: true },
  { key: "missoes", label: "Missões", sql: "FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL", dateExpr: "completed_at", usedAsFeature: true },
  { key: "metas", label: "Metas", sql: "FROM goal_progress WHERE owner_id = ?", dateExpr: "recorded_at", usedAsFeature: false },
  { key: "educacao", label: "Educação", sql: "FROM study_sessions WHERE owner_id = ?", dateExpr: "occurred_at", usedAsFeature: true },
  { key: "biblioteca", label: "Biblioteca", sql: "FROM reading_sessions WHERE owner_id = ?", dateExpr: "started_at", usedAsFeature: true },
  { key: "agenda", label: "Agenda", sql: "FROM events WHERE owner_id = ?", dateExpr: "starts_at", usedAsFeature: false },
  { key: "experimentos", label: "Experimentos", sql: "FROM personal_experiment_logs WHERE owner_id = ?", dateExpr: "log_date", usedAsFeature: false },
];

export async function sourceInventory(db: Client, ownerId: string, days: Day[], today: string) {
  const recentFrom = addDays(today, -119);
  const out = [];
  for (const s of SOURCE_DEFS) {
    const r = await db
      .execute({ sql: `SELECT COUNT(*) AS n, MIN(substr(${s.dateExpr}, 1, 10)) AS a, MAX(substr(${s.dateExpr}, 1, 10)) AS b, COUNT(DISTINCT CASE WHEN substr(${s.dateExpr}, 1, 10) >= ? THEN substr(${s.dateExpr}, 1, 10) END) AS recent ${s.sql}`, args: [recentFrom, ownerId] })
      .catch(() => ({ rows: [{ n: 0, a: null, b: null, recent: 0 }] }));
    const row = r.rows[0] as Record<string, unknown>;
    const dup = s.dupSql ? Number((await db.execute({ sql: s.dupSql, args: [ownerId] }).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0) : 0;
    const n = Number(row.n ?? 0);
    const recent = Number(row.recent ?? 0);
    const series = SERIES.filter((x) => x.source === s.key);
    const quality = series.length ? seriesQuality(days, series.map((x) => x.key)).score : null;
    out.push({
      key: s.key,
      label: s.label,
      connected: n > 0,
      records: n,
      from: row.a ? String(row.a) : null,
      to: row.b ? String(row.b) : null,
      recentDays: recent,
      duplicates: dup,
      quality,
      usedAsFeature: s.usedAsFeature,
      // Elegível: usada como variável E com registros em 30+ dias distintos nos últimos 120.
      eligible: s.usedAsFeature && recent >= 30,
      eligibility: !s.usedAsFeature ? "Fonte ainda não usada como variável nesta versão do pipeline." : recent >= 30 ? "Pronta: 30+ dias com registro nos últimos 120." : `Faltam ${30 - recent} dia(s) com registro nos últimos 120 para ser elegível.`,
      granularity: "Eventos individuais agregados em uma observação por dia local.",
    });
  }
  return out;
}

/** Qualidade de um conjunto de séries: completude, validade, outliers e lacunas. */
export function seriesQuality(days: Day[], keys: SeriesKey[]) {
  const defs = SERIES.filter((s) => keys.includes(s.key));
  let cells = 0;
  let filled = 0;
  let invalid = 0;
  let outliers = 0;
  for (const s of defs) {
    const vals = days.map((d) => d.v[s.key]);
    const present = vals.filter((v): v is number => v !== null && (!s.count || v > 0));
    cells += vals.length;
    filled += present.length;
    invalid += present.filter((v) => v < s.min || v > s.max).length;
    const m = present.reduce((a, b) => a + b, 0) / (present.length || 1);
    const sd = Math.sqrt(present.reduce((a, b) => a + (b - m) ** 2, 0) / (present.length || 1)) || 1;
    outliers += present.filter((v) => Math.abs((v - m) / sd) > 3).length;
  }
  const completeness = cells ? filled / cells : 0;
  const validity = filled ? 1 - invalid / filled : 1;
  const outlierRate = filled ? outliers / filled : 0;
  return { completeness, validity, outlierRate, score: cells ? Math.round(completeness * validity * (1 - outlierRate) * 100) : null };
}

/** Painel de qualidade dos dados (completude, consistência, unicidade, validade, atualidade, cobertura e alertas). */
export function qualityReport(days: Day[], today: string) {
  const per = SERIES.map((s) => {
    const vals = days.map((d) => d.v[s.key]);
    const present = days.filter((d) => d.v[s.key] !== null && (!s.count || (d.v[s.key] ?? 0) > 0));
    let gap = 0;
    let longest = 0;
    for (const d of days) {
      const ok = d.v[s.key] !== null && (!s.count || (d.v[s.key] ?? 0) > 0);
      gap = ok ? 0 : gap + 1;
      longest = Math.max(longest, gap);
    }
    const nums = present.map((d) => d.v[s.key]!) as number[];
    const m = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
    const sd = Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length || 1));
    const last = present.at(-1)?.date ?? null;
    return {
      key: s.key,
      label: s.label,
      unit: s.unit,
      kind: s.count ? "contagem (0 = não aconteceu)" : "medida (ausente = não registrado)",
      days: vals.length,
      daysWithData: present.length,
      completeness: vals.length ? Math.round((present.length / vals.length) * 100) : 0,
      invalid: nums.filter((v) => v < s.min || v > s.max).length,
      outliers: nums.filter((v) => sd > 0 && Math.abs((v - m) / sd) > 3).length,
      constant: nums.length >= 5 && sd < 1e-9,
      mean: nums.length ? Math.round(m * 100) / 100 : null,
      std: nums.length ? Math.round(sd * 100) / 100 : null,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      lastDate: last,
      staleDays: last ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000)) : null,
      longestGap: longest,
    };
  });
  const overall = seriesQuality(days, SERIES.map((s) => s.key));
  const alerts: Array<{ level: "alto" | "medio" | "baixo"; text: string }> = [];
  if (days.length < 40) alerts.push({ level: "alto", text: `Só ${days.length} dia(s) de histórico — modelos precisam de pelo menos 40 observações.` });
  for (const p of per) {
    if (p.constant) alerts.push({ level: "medio", text: `${p.label} é constante no período: a variável não ajuda o modelo.` });
    if (p.invalid) alerts.push({ level: "medio", text: `${p.label}: ${p.invalid} valor(es) fora da faixa válida.` });
    if (p.daysWithData > 0 && p.longestGap >= 14) alerts.push({ level: "baixo", text: `${p.label}: lacuna de ${p.longestGap} dias seguidos sem registro.` });
    if (p.staleDays !== null && p.staleDays >= 14) alerts.push({ level: "baixo", text: `${p.label}: último registro há ${p.staleDays} dias.` });
  }
  const balance = TARGETS.filter((t) => t.problem === "classification").map((t) => {
    const m = buildMatrix(days, t, 1, ["weekend"], today);
    const pos = m.y.filter((v) => v === 1).length;
    const neg = m.y.length - pos;
    if (m.y.length >= 20 && Math.min(pos, neg) / m.y.length < 0.15) alerts.push({ level: "medio", text: `${t.label}: classes desbalanceadas (${pos} × ${neg}).` });
    return { target: t.key, label: t.label, samples: m.y.length, positives: pos, negatives: neg, threshold: m.threshold };
  });
  return {
    range: { from: days[0]?.date ?? null, to: today, days: days.length },
    scores: { completeness: Math.round(overall.completeness * 100), validity: Math.round(overall.validity * 100), outlierRate: Math.round(overall.outlierRate * 1000) / 10, overall: overall.score },
    series: per,
    balance,
    alerts,
    definitions: {
      completeness: "Dias com registro ÷ dias do período, por série (contagens com zero não contam como registro).",
      validity: "Registros dentro da faixa possível da medida (ex.: energia 1–5, sono 0–16 h).",
      outliers: "Valores a mais de 3 desvios-padrão da média da própria série.",
      overall: "Completude × validade × (1 − taxa de outliers), em %.",
    },
  };
}

/** Gargalos: últimos 14 dias × 14 anteriores, só com dados suficientes nas duas janelas. */
export function bottlenecks(days: Day[], today: string) {
  const past = days.filter((d) => d.date < today);
  const cur = past.slice(-14);
  const prev = past.slice(-28, -14);
  if (cur.length < 14 || prev.length < 14) return [];
  const out: Array<{ key: string; label: string; current: number; previous: number; diffPct: number; n: [number, number]; text: string; action: string }> = [];
  const add = (key: string, label: string, f: (w: Day[]) => { v: number; n: number }, action: string, unit: string) => {
    const a = f(cur);
    const b = f(prev);
    if (a.n < 5 || b.n < 5 || b.v === 0) return;
    const diff = Math.round(((a.v - b.v) / Math.abs(b.v)) * 100);
    if (Math.abs(diff) < 20) return;
    out.push({ key, label, current: Math.round(a.v * 10) / 10, previous: Math.round(b.v * 10) / 10, diffPct: diff, n: [a.n, b.n], text: `${label} ${diff < 0 ? "menor" : "maior"} que nos 14 dias anteriores (${Math.round(b.v * 10) / 10}${unit} → ${Math.round(a.v * 10) / 10}${unit}).`, action: diff < 0 ? action : "Manter o que mudou para melhor." });
  };
  const daysWith = (k: SeriesKey) => (w: Day[]) => ({ v: w.filter((d) => (d.v[k] ?? 0) > 0).length, n: w.length });
  const sum = (k: SeriesKey) => (w: Day[]) => ({ v: w.reduce((s, d) => s + (d.v[k] ?? 0), 0), n: w.length });
  const avg = (k: SeriesKey) => (w: Day[]) => {
    const v = w.map((d) => d.v[k]).filter((x): x is number => x !== null);
    return { v: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, n: v.length };
  };
  add("training", "Frequência de treino", daysWith("exercise_minutes"), "Reservar dois blocos de treino na Agenda desta semana.", " dias");
  add("study", "Minutos de estudo", sum("study_minutes"), "Planejar sessões curtas de estudo nos dias livres.", " min");
  add("habits", "Hábitos cumpridos", sum("habits_done"), "Revisar o ritual de hábitos e reduzir a meta temporariamente.", "");
  add("tasks", "Missões concluídas", sum("tasks_completed"), "Escolher menos prioridades por dia e protegê-las.", "");
  add("sleep", "Sono médio", avg("sleep_duration"), "Antecipar o horário de dormir em 30 minutos.", " h");
  add("energy", "Energia média", avg("energy"), "Observar sono e carga dos dias de energia baixa.", "/5");
  return out;
}
