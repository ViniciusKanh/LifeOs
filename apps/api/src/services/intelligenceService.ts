import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { todayKeyFor } from "./gamificationService.js";
import {
  ALGORITHM_LABEL,
  extractRules,
  featureStats,
  fitModel,
  localEffects,
  partialDependence,
  pearson,
  permutationImportance,
  runArena,
  type AlgorithmId,
  type ClassMetrics,
  type FittedModel,
} from "./mlEngine.js";
import { FEATURES, OBJECTIVES, buildDataset, featureRow, loadDays, readinessOf, summarizeGrimoire, type GrimoireSummary, type ObjectiveKey } from "./intelligenceDataset.js";

/**
 * Forja da Inteligência — orquestra treino (forja/reforja), arena, profecia e
 * a progressão dos artefatos. Leituras pesadas (montar o grimório) só
 * acontecem quando o usuário forja ou atualiza; a visão geral lê apenas as
 * tabelas ml_* já calculadas.
 */

export class IntelligenceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export interface Importance {
  key: string;
  label: string;
  source: string;
  importance: number;
  direction: "positive" | "negative" | "neutral";
}
export interface RuleView {
  conditions: Array<{ key: string; label: string; op: "<=" | ">"; value: number }>;
  n: number;
  positives: number;
  rate: number;
}
export interface FeatureStat {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  mean: number | null;
  coverage: number;
}
export interface ArtifactInsights {
  drift: { detected: boolean; text: string | null };
  opportunities: Array<{ feature: string; label: string; coverage: number }>;
  threshold: string;
  baselineCv: number;
  /** Taxa-base do alvo no histórico (para comparar as regras). Ausente em artefatos antigos. */
  baseRate?: number;
  /** Pergaminho de regras (árvore substituta em valores reais). */
  rules?: RuleView[];
  /** Como cada runa principal age no modelo (dependência parcial). */
  pdp?: Array<{ key: string; label: string; points: Array<{ x: number; p: number }> }>;
  /** Faixas reais de cada runa (simulador). */
  stats?: FeatureStat[];
}
export interface ArtifactMetrics extends ClassMetrics {
  cvMean: number;
  cvStd: number;
  folds: number;
}

const DAY_MS = 86_400_000;
const STALE_DAYS = 30;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Nível por XP: o nível n começa em 60·(n−1)² XP. */
export function levelFromXp(xp: number, unit = 60) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / unit)) + 1;
  return { level, levelStartXp: unit * (level - 1) ** 2, nextLevelXp: unit * level ** 2 };
}

/**
 * Raridade NÃO é só acurácia: desempenho acima da taxa-base, estabilidade
 * entre dobras, maturidade (reforjas e idade) e volume de dados.
 */
export function rarityOf(m: { cvMean: number; cvStd: number }, trainings: number, ageDays: number, samples: number): { rarity: Rarity; score: number } {
  const perf = clamp01((m.cvMean - 0.5) / 0.35);
  const stability = clamp01(1 - m.cvStd / 0.15);
  const maturity = clamp01(trainings / 5) * 0.5 + clamp01(ageDays / 60) * 0.5;
  const volume = clamp01(samples / 180);
  const score = 0.45 * perf + 0.2 * stability + 0.2 * maturity + 0.15 * volume;
  const rarity: Rarity = score < 0.3 ? "common" : score < 0.45 ? "uncommon" : score < 0.6 ? "rare" : score < 0.75 ? "epic" : "legendary";
  return { rarity, score: Math.round(score * 100) / 100 };
}

interface ArtifactRow {
  id: string;
  objective: ObjectiveKey;
  algorithm: AlgorithmId;
  status: "production" | "experimental";
  xp: number;
  trainings: number;
  samples: number;
  metrics: ArtifactMetrics;
  importance: Importance[];
  insights: ArtifactInsights;
  firstTrainedAt: string;
  trainedAt: string;
}

const ARTIFACT_COLS = "id, objective, algorithm, status, xp, trainings, samples, metrics_json, importance_json, insights_json, first_trained_at, trained_at";

function parseArtifact(r: Record<string, unknown>): ArtifactRow {
  return {
    id: String(r.id),
    objective: String(r.objective) as ObjectiveKey,
    algorithm: String(r.algorithm) as AlgorithmId,
    status: String(r.status) as ArtifactRow["status"],
    xp: Number(r.xp),
    trainings: Number(r.trainings),
    samples: Number(r.samples),
    metrics: JSON.parse(String(r.metrics_json)) as ArtifactMetrics,
    importance: JSON.parse(String(r.importance_json)) as Importance[],
    insights: JSON.parse(String(r.insights_json)) as ArtifactInsights,
    firstTrainedAt: String(r.first_trained_at),
    trainedAt: String(r.trained_at),
  };
}

const sqlDate = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
const daysSince = (s: string, now = Date.now()) => Math.max(0, Math.floor((now - sqlDate(s).getTime()) / DAY_MS));

export function summarizeArtifact(a: ArtifactRow) {
  const o = OBJECTIVES.find((x) => x.key === a.objective)!;
  const lv = levelFromXp(a.xp);
  const age = daysSince(a.firstTrainedAt);
  return {
    id: a.id,
    objective: a.objective,
    name: o.name,
    description: o.description,
    targetLabel: o.targetLabel,
    icon: o.icon,
    algorithm: a.algorithm,
    algorithmLabel: ALGORITHM_LABEL[a.algorithm],
    status: a.status,
    xp: a.xp,
    ...lv,
    ...rarityOf(a.metrics, a.trainings, age, a.samples),
    metrics: a.metrics,
    samples: a.samples,
    trainings: a.trainings,
    trainedAt: a.trainedAt,
    daysSinceTraining: daysSince(a.trainedAt),
  };
}
export type ArtifactSummary = ReturnType<typeof summarizeArtifact>;

async function getArtifacts(db: Client, ownerId: string): Promise<ArtifactRow[]> {
  const r = await db.execute({ sql: `SELECT ${ARTIFACT_COLS} FROM ml_artifacts WHERE owner_id = ? ORDER BY trained_at DESC`, args: [ownerId] });
  return r.rows.map((row) => parseArtifact(row as unknown as Record<string, unknown>));
}

async function saveGrimoire(db: Client, ownerId: string, summary: GrimoireSummary) {
  await db.execute({
    sql: `INSERT INTO ml_grimoire_snapshots (owner_id, summary_json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(owner_id) DO UPDATE SET summary_json = excluded.summary_json, updated_at = excluded.updated_at`,
    args: [ownerId, JSON.stringify(summary)],
  });
}

/** Atualiza o grimório (contagens, qualidade, prontidão por objetivo). */
export async function refreshGrimoire(db: Client, ownerId: string) {
  const today = await todayKeyFor(db, ownerId);
  const days = await loadDays(db, ownerId, today);
  const summary = await summarizeGrimoire(db, ownerId, days, today);
  await saveGrimoire(db, ownerId, summary);
  return { ...summary, updatedAt: new Date().toISOString() };
}

/** Mudança de padrão: taxa do alvo ou runas principais nas últimas 30 amostras × histórico anterior. */
function detectDrift(X: Array<Array<number | null>>, y: number[], topIdx: number[], targetLabel: string): ArtifactInsights["drift"] {
  const cut = y.length - 30;
  if (cut < 20) return { detected: false, text: null };
  const rate = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const before = rate(y.slice(0, cut));
  const after = rate(y.slice(cut));
  if (Math.abs(after - before) >= 0.2) {
    return { detected: true, text: `A frequência de "${targetLabel.toLowerCase()}" mudou de ${Math.round(before * 100)}% para ${Math.round(after * 100)}% nas últimas semanas.` };
  }
  for (const j of topIdx) {
    const col = (rows: typeof X) => rows.map((r) => r[j]).filter((v): v is number => v !== null);
    const a = col(X.slice(0, cut));
    const b = col(X.slice(cut));
    if (a.length < 10 || b.length < 10) continue;
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) / a.length) || 1;
    if (Math.abs(mb - ma) / sd >= 0.8) return { detected: true, text: `A runa "${FEATURES[j].label}" mudou bastante nas últimas semanas — o modelo pode estar desatualizado.` };
  }
  return { detected: false, text: null };
}

const SUBJECTIVE = new Set(["sleep_duration", "sleep_quality", "energy", "mood", "stress"]);

/** Forja (ou reforja) um artefato: arena completa, campeão treinado em todos os dados. */
export async function forgeArtifact(db: Client, ownerId: string, objectiveKey: ObjectiveKey) {
  const objective = OBJECTIVES.find((o) => o.key === objectiveKey);
  if (!objective) throw new IntelligenceError(400, "Objetivo desconhecido.");
  const today = await todayKeyFor(db, ownerId);
  const days = await loadDays(db, ownerId, today);
  const ready = readinessOf(days, objective, today);
  if (!ready.ready) throw new IntelligenceError(422, ready.reason ?? "Dados insuficientes.");

  const ds = buildDataset(days, objective, today);
  const arena = runArena(ds.X, ds.y);
  if (!arena.winner) throw new IntelligenceError(422, "Não houve variação suficiente nas dobras de validação para comparar modelos.");
  const winner = arena.results.find((r) => r.algorithm === arena.winner)!;
  const baselineCv = arena.results.find((r) => r.algorithm === "baseline")?.cvMean ?? 0.5;

  const shares = permutationImportance(arena.winner, ds.X, ds.y);
  const importance: Importance[] = FEATURES.map((f, j) => {
    const r = pearson(ds.X.map((row) => row[j]), ds.y);
    return { key: f.key, label: f.label, source: f.source, importance: shares[j], direction: (Math.abs(r) < 0.05 ? "neutral" : r > 0 ? "positive" : "negative") as Importance["direction"] };
  }).sort((a, b) => b.importance - a.importance);
  const topIdx = importance.slice(0, 3).map((i) => FEATURES.findIndex((f) => f.key === i.key));

  const opportunities = FEATURES.map((f, j) => ({ feature: f.key, label: f.label, coverage: Math.round((ds.X.filter((r) => r[j] !== null).length / ds.X.length) * 100) }))
    .filter((o) => SUBJECTIVE.has(o.feature) && o.coverage < 40)
    .sort((a, b) => a.coverage - b.coverage);
  const model: FittedModel = fitModel(arena.winner, ds.X, ds.y);
  const stats = featureStats(ds.X);
  const insights: ArtifactInsights = {
    drift: detectDrift(ds.X, ds.y, topIdx, objective.targetLabel),
    opportunities,
    threshold: ready.thresholdText,
    baselineCv,
    baseRate: Math.round((ds.y.reduce((a, b) => a + b, 0) / ds.y.length) * 1000) / 1000,
    rules: extractRules(ds.X, ds.y)
      .slice(0, 4)
      .map((r) => ({ ...r, conditions: r.conditions.map((c) => ({ key: FEATURES[c.feature].key, label: FEATURES[c.feature].label, op: c.op, value: Math.round(c.value * 100) / 100 })) })),
    pdp: topIdx
      .filter((j) => j >= 0 && FEATURES[j].key !== "weekend")
      .map((j) => ({ key: FEATURES[j].key, label: FEATURES[j].label, points: partialDependence(model, ds.X, j) }))
      .filter((d) => d.points.length >= 2),
    stats: FEATURES.map((f, j) => ({ key: f.key, label: f.label, ...stats[j] })),
  };

  const metrics: ArtifactMetrics = { ...winner.metrics, cvMean: winner.cvMean, cvStd: winner.cvStd, folds: winner.folds };
  // Só vira "produção" se superar a linha de base com folga; senão é honesto chamar de experimental.
  const status = winner.cvMean - baselineCv >= 0.05 && arena.winner !== "baseline" ? "production" : "experimental";

  const prevRes = await db.execute({ sql: `SELECT ${ARTIFACT_COLS} FROM ml_artifacts WHERE owner_id = ? AND objective = ?`, args: [ownerId, objective.key] });
  const prev = prevRes.rows[0] ? parseArtifact(prevRes.rows[0] as unknown as Record<string, unknown>) : null;

  // Profecias passadas conferidas com o que de fato aconteceu.
  let confirmed = 0;
  if (prev) {
    const pending = await db.execute({
      sql: "SELECT id, target_date, probability FROM ml_predictions WHERE owner_id = ? AND artifact_id = ? AND actual IS NULL AND target_date < ?",
      args: [ownerId, prev.id, today],
    });
    const labelByDate = new Map(ds.dates.map((d, i) => [d, ds.y[i]]));
    for (const p of pending.rows) {
      const actual = labelByDate.get(String(p.target_date));
      if (actual === undefined) continue;
      if ((Number(p.probability) >= 0.5 ? 1 : 0) === actual) confirmed++;
      await db.execute({ sql: "UPDATE ml_predictions SET actual = ? WHERE id = ? AND owner_id = ?", args: [actual, String(p.id), ownerId] });
    }
  }

  // XP do artefato: validação + novas observações + melhora + profecias confirmadas.
  const xpGain = 50 + Math.max(0, ds.y.length - (prev?.samples ?? 0)) * 5 + (prev && winner.cvMean - prev.metrics.cvMean > 0.01 ? 100 : 0) + confirmed * 20;
  const id = prev?.id ?? nanoid();
  const args = [arena.winner, status, xpGain, ds.y.length, JSON.stringify(metrics), JSON.stringify(model), JSON.stringify(importance), JSON.stringify(insights)];
  if (prev) {
    await db.execute({
      sql: `UPDATE ml_artifacts SET algorithm = ?, status = ?, xp = xp + ?, trainings = trainings + 1, samples = ?, metrics_json = ?, model_json = ?, importance_json = ?, insights_json = ?, trained_at = datetime('now')
            WHERE id = ? AND owner_id = ?`,
      args: [...args, id, ownerId],
    });
    // A profecia de hoje é refeita com o novo modelo.
    await db.execute({ sql: "DELETE FROM ml_predictions WHERE owner_id = ? AND artifact_id = ? AND target_date >= ? AND actual IS NULL", args: [ownerId, id, today] });
  } else {
    await db.execute({
      sql: `INSERT INTO ml_artifacts (algorithm, status, xp, trainings, samples, metrics_json, model_json, importance_json, insights_json, id, owner_id, objective)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [...args, id, ownerId, objective.key],
    });
  }

  const results = arena.results.map(({ oof: _oof, ...r }) => ({ ...r, label: ALGORITHM_LABEL[r.algorithm] }));
  const experimentId = nanoid();
  await db.execute({
    sql: "INSERT INTO ml_experiments (id, owner_id, artifact_id, objective, winner, samples, results_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [experimentId, ownerId, id, objective.key, arena.winner, ds.y.length, JSON.stringify(results)],
  });
  await saveGrimoire(db, ownerId, await summarizeGrimoire(db, ownerId, days, today));

  const saved = (await getArtifacts(db, ownerId)).find((a) => a.id === id)!;
  return { artifact: summarizeArtifact(saved), xpGain, confirmed, experiment: { id: experimentId, objective: objective.key, winner: arena.winner, samples: ds.y.length, results } };
}

type ExperimentResult = { algorithm: AlgorithmId; label: string; metrics: ClassMetrics; cvMean: number; cvStd: number; folds: number };
function parseExperiment(r: Record<string, unknown>) {
  const o = OBJECTIVES.find((x) => x.key === r.objective);
  return {
    id: String(r.id),
    artifactId: r.artifact_id ? String(r.artifact_id) : null,
    objective: String(r.objective),
    objectiveLabel: o?.targetLabel ?? String(r.objective),
    winner: (r.winner ? String(r.winner) : null) as AlgorithmId | null,
    samples: Number(r.samples),
    results: JSON.parse(String(r.results_json)) as ExperimentResult[],
    createdAt: String(r.created_at),
  };
}

export async function listExperiments(db: Client, ownerId: string, limit = 30) {
  const r = await db.execute({ sql: "SELECT * FROM ml_experiments WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?", args: [ownerId, limit] });
  return r.rows.map((row) => parseExperiment(row as unknown as Record<string, unknown>));
}

/** Profecia do dia com o artefato escolhido; calculada uma vez por dia e guardada. */
async function prophecyFor(db: Client, ownerId: string, a: ArtifactRow, today: string) {
  const o = OBJECTIVES.find((x) => x.key === a.objective)!;
  const base = { artifactId: a.id, artifactName: o.name, targetLabel: o.targetLabel, targetDate: today, confidence: a.metrics.confidence, status: a.status };
  const cached = await db.execute({ sql: "SELECT probability, explanation_json FROM ml_predictions WHERE owner_id = ? AND artifact_id = ? AND target_date = ?", args: [ownerId, a.id, today] });
  if (cached.rows[0]) {
    return { ...base, probability: Number(cached.rows[0].probability), factors: JSON.parse(String(cached.rows[0].explanation_json)) as Factor[] };
  }
  const modelRes = await db.execute({ sql: "SELECT model_json FROM ml_artifacts WHERE id = ? AND owner_id = ?", args: [a.id, ownerId] });
  if (!modelRes.rows[0]) return null;
  const model = JSON.parse(String(modelRes.rows[0].model_json)) as FittedModel;
  // Só os últimos 9 dias: véspera + janela de 7 dias da carga semanal.
  const days = await loadDays(db, ownerId, today, 9);
  const idx = days.findIndex((d) => d.date === today);
  if (idx < 1) return { ...base, probability: null, factors: [], reason: "Sem registros na véspera para basear a profecia." };
  const row = featureRow(days, idx);
  const { p, effects } = localEffects(model, row);
  const factors: Factor[] = FEATURES.map((f, j) => ({ key: f.key, label: f.label, effect: Math.round(effects[j] * 100), value: row[j] }))
    .filter((f) => f.effect !== 0)
    .sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect))
    .slice(0, 5);
  await db.execute({
    sql: "INSERT OR IGNORE INTO ml_predictions (id, owner_id, artifact_id, target_date, probability, explanation_json) VALUES (?, ?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, a.id, today, p, JSON.stringify(factors)],
  });
  return { ...base, probability: p, factors };
}
interface Factor {
  key: string;
  label: string;
  /** Efeito na probabilidade, em pontos percentuais. */
  effect: number;
  value: number | null;
}

type AlertType = "drift" | "reforge" | "experimental" | "opportunity";
function buildAlerts(artifacts: ArtifactRow[]) {
  const alerts: Array<{ type: AlertType; severity: "high" | "medium" | "low"; title: string; description: string; artifactId: string }> = [];
  for (const a of artifacts) {
    const name = OBJECTIVES.find((o) => o.key === a.objective)!.name;
    if (a.insights.drift.detected) alerts.push({ type: "drift", severity: "high", title: "Deriva detectada", description: `${name}: ${a.insights.drift.text}`, artifactId: a.id });
    const since = daysSince(a.trainedAt);
    if (since >= STALE_DAYS) alerts.push({ type: "reforge", severity: "medium", title: "Reforja recomendada", description: `${name} está há ${since} dias sem treino.`, artifactId: a.id });
    if (a.status === "experimental") alerts.push({ type: "experimental", severity: "medium", title: "Sem vantagem sobre o acaso", description: `${name} ainda não supera a linha de base — siga registrando para reforjar.`, artifactId: a.id });
  }
  const opp = artifacts.flatMap((a) => a.insights.opportunities.map((o) => ({ ...o, artifactId: a.id })))[0];
  if (opp) alerts.push({ type: "opportunity", severity: "low", title: "Oportunidade", description: `Registrar "${opp.label.toLowerCase()}" com mais frequência (hoje em ${opp.coverage}% dos dias) pode melhorar a precisão.`, artifactId: opp.artifactId });
  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((x, y) => order[x.severity] - order[y.severity]);
}

export async function getOverview(db: Client, ownerId: string) {
  const today = await todayKeyFor(db, ownerId);
  const [rows, expCount, latestExp, snap] = await Promise.all([
    getArtifacts(db, ownerId),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM ml_experiments WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT * FROM ml_experiments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", args: [ownerId] }),
    db.execute({ sql: "SELECT summary_json, updated_at FROM ml_grimoire_snapshots WHERE owner_id = ?", args: [ownerId] }),
  ]);
  const artifacts = rows.map(summarizeArtifact);
  const production = artifacts.filter((a) => a.status === "production");
  const grimoire = snap.rows[0] ? { ...(JSON.parse(String(snap.rows[0].summary_json)) as GrimoireSummary), updatedAt: String(snap.rows[0].updated_at) } : null;
  const totalXp = artifacts.reduce((s, a) => s + a.xp, 0);

  // Profecia: Oráculo de Produtividade quando existir; senão o melhor artefato em produção.
  const pick = rows.find((a) => a.objective === "productivity") ?? rows.find((a) => a.status === "production") ?? rows[0];
  const best = [...rows].sort((a, b) => b.metrics.cvMean - a.metrics.cvMean)[0];

  return {
    today,
    summary: {
      artifactsActive: production.length,
      artifactsTotal: artifacts.length,
      experiments: Number(expCount.rows[0]?.n ?? 0),
      avgAccuracy: production.length ? Math.round((production.reduce((s, a) => s + a.metrics.accuracy, 0) / production.length) * 1000) / 1000 : null,
      corePower: grimoire?.corePower ?? null,
    },
    core: { totalXp, ...levelFromXp(totalXp, 150), areas: grimoire?.areas ?? [] },
    artifacts,
    objectives: OBJECTIVES.map((o) => ({ key: o.key, name: o.name, description: o.description, targetLabel: o.targetLabel, icon: o.icon, forged: rows.some((a) => a.objective === o.key) })),
    arena: latestExp.rows[0] ? parseExperiment(latestExp.rows[0] as unknown as Record<string, unknown>) : null,
    grimoire,
    runes: best ? { artifactId: best.id, artifactName: OBJECTIVES.find((o) => o.key === best.objective)!.name, items: best.importance } : null,
    alerts: buildAlerts(rows),
    prophecy: pick ? await prophecyFor(db, ownerId, pick, today) : null,
  };
}

export async function getArtifactDetail(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: `SELECT ${ARTIFACT_COLS} FROM ml_artifacts WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  if (!r.rows[0]) throw new IntelligenceError(404, "Artefato não encontrado.");
  const a = parseArtifact(r.rows[0] as unknown as Record<string, unknown>);
  const [exps, preds] = await Promise.all([
    db.execute({ sql: "SELECT * FROM ml_experiments WHERE owner_id = ? AND objective = ? ORDER BY created_at DESC LIMIT 10", args: [ownerId, a.objective] }),
    db.execute({
      sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN actual IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
                   SUM(CASE WHEN actual IS NOT NULL AND (probability >= 0.5) = (actual = 1) THEN 1 ELSE 0 END) AS correct
            FROM ml_predictions WHERE owner_id = ? AND artifact_id = ?`,
      args: [ownerId, a.id],
    }),
  ]);
  const p = preds.rows[0];
  return {
    ...summarizeArtifact(a),
    importance: a.importance,
    insights: a.insights,
    experiments: exps.rows.map((row) => parseExperiment(row as unknown as Record<string, unknown>)),
    predictions: { total: Number(p?.total ?? 0), resolved: Number(p?.resolved ?? 0), correct: Number(p?.correct ?? 0) },
  };
}

/**
 * Alquimia de runas (simulador): o usuário ajusta valores das runas e vê a
 * probabilidade que o artefato atribuiria. Sem `values`, devolve as runas
 * de hoje (véspera real) como ponto de partida. Nada é gravado.
 */
export async function simulateArtifact(db: Client, ownerId: string, id: string, values?: Record<string, number | null>) {
  const r = await db.execute({ sql: `SELECT ${ARTIFACT_COLS}, model_json FROM ml_artifacts WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  if (!r.rows[0]) throw new IntelligenceError(404, "Artefato não encontrado.");
  const a = parseArtifact(r.rows[0] as unknown as Record<string, unknown>);
  const model = JSON.parse(String(r.rows[0].model_json)) as FittedModel;
  let base: Record<string, number | null> = {};
  if (!values) {
    const today = await todayKeyFor(db, ownerId);
    const days = await loadDays(db, ownerId, today, 9);
    const idx = days.findIndex((d) => d.date === today);
    if (idx >= 1) {
      const row = featureRow(days, idx);
      base = Object.fromEntries(FEATURES.map((f, j) => [f.key, row[j]]));
    } else base = Object.fromEntries(FEATURES.map((f) => [f.key, null]));
  }
  const input = values ?? base;
  const row = FEATURES.map((f) => {
    const v = input[f.key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
  const { p, effects } = localEffects(model, row);
  return {
    artifactId: a.id,
    targetLabel: OBJECTIVES.find((o) => o.key === a.objective)!.targetLabel,
    values: Object.fromEntries(FEATURES.map((f, j) => [f.key, row[j]])),
    probability: p,
    effects: FEATURES.map((f, j) => ({ key: f.key, label: f.label, effect: Math.round(effects[j] * 100) })).filter((e) => e.effect !== 0).sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)),
    stats: a.insights.stats ?? null,
    baseRate: a.insights.baseRate ?? null,
  };
}
