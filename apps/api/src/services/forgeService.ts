import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { notifyFromAutomation } from "./automationService.js";
import { award } from "./gamificationService.js";
import { userDayContext } from "./localDayService.js";
import { tierRank } from "./planningHubService.js";
import type { Row } from "./mlEngine.js";
import {
  ALG_LABEL,
  ALGS_FOR,
  PIPELINE_VERSION,
  fit,
  hashOf,
  metricsFor,
  predictOne,
  primaryValue,
  psi,
  psiNoise,
  referenceBins,
  round,
  runPipeline,
  twoProportionZ,
  type Alg,
  type Fitted,
  type Metrics,
  type Primary,
  type Problem,
} from "./forgeEngine.js";
import { FEATURES, FEATURE_KEYS, TARGETS, addDays, bottlenecks, buildMatrix, inferenceRow, loadForgeDays, qualityReport, sourceInventory, targetOf, type Day } from "./forgeDataset.js";

/**
 * Forja da Inteligência 3.0 — orquestração (banco ⇄ motor).
 *
 * - Treinos são sempre disparados por ação do usuário ou por automação
 *   configurada; abrir a tela nunca treina nada.
 * - Cada treino válido gera uma VERSÃO reprodutível (hash da configuração +
 *   hash dos dados + semente). Treino idêntico não gera versão nova nem XP.
 * - Uma versão só pode ser ATIVADA se superou a linha de base na validação e
 *   no holdout final. Previsões vêm só de versões ativas.
 * - Recompensas oficiais apenas por marcos únicos (primeiro modelo válido,
 *   primeira base superada…), nunca por métrica alta nem por reexecução.
 */

export class ForgeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type DbRow = Record<string, unknown>;
const J = <T>(v: unknown, fb: T): T => {
  try {
    return v == null ? fb : (JSON.parse(String(v)) as T);
  } catch {
    return fb;
  }
};

export interface Validation {
  folds: number;
  holdoutPct: number;
  search: "grid" | "random" | "none";
  searchBudget: number;
  primary: Primary;
  margin: number;
}
export interface ModelInput {
  name: string;
  problem: Problem;
  target: string;
  horizon: number;
  features: string[];
  algorithms: Alg[];
  validation: Validation;
  schedule: "manual" | "weekly" | "monthly";
  templateKey?: string | null;
}

export const DEFAULT_VALIDATION = (problem: Problem): Validation => ({
  folds: 4,
  holdoutPct: 0.2,
  search: "random",
  searchBudget: 4,
  primary: problem === "classification" ? "balanced_accuracy" : "mae",
  margin: problem === "classification" ? 0.03 : 0.05,
});

/** Artefatos sugeridos (modelos pré-configurados). O usuário decide criar. */
export const TEMPLATES: Array<{ key: string; name: string; icon: string; target: string; description: string }> = [
  { key: "chama_treino", name: "Chama do Treino", icon: "flame", target: "training", description: "Prevê se haverá treino no dia, usando só informação disponível antes dele." },
  { key: "mentor_academico", name: "Mentor Acadêmico", icon: "book", target: "study", description: "Estima a probabilidade de uma sessão de estudo no dia." },
  { key: "espelho_energia", name: "Espelho da Energia", icon: "bolt", target: "energy_level", description: "Estima a energia autorrelatada (1–5) do dia." },
  { key: "oraculo_produtividade", name: "Oráculo da Produtividade", icon: "sun", target: "productivity", description: "Probabilidade de o dia atingir o seu limiar pessoal de missões concluídas." },
  { key: "guardiao_habitos", name: "Guardião dos Hábitos", icon: "leaf", target: "habits", description: "Probabilidade de cumprir seus hábitos no dia." },
];

export const RESEARCHER_RANKS = [
  { min: 0, title: "Aprendiz das Runas" },
  { min: 100, title: "Analista Arcano" },
  { min: 300, title: "Alquimista de Dados" },
  { min: 700, title: "Mestre dos Modelos" },
  { min: 1400, title: "Guardião das Previsões" },
  { min: 2500, title: "Arquiteto da Inteligência" },
] as const;

export const MILESTONES: Array<{ code: string; title: string; description: string }> = [
  { code: "first_model", title: "Primeiro modelo válido", description: "Um treino concluído com validação temporal e holdout final." },
  { code: "first_reproducible", title: "Primeira avaliação reprodutível", description: "Reexecutou um treino e obteve a mesma versão (mesmos dados, configuração e semente)." },
  { code: "first_beat", title: "Primeira base superada", description: "Um modelo superou a linha de base na validação e no teste final." },
  { code: "first_backtest", title: "Primeiro backtest documentado", description: "Avaliou um modelo dia a dia contra o histórico." },
  { code: "first_quality", title: "Primeiro relatório de qualidade", description: "Analisou a qualidade dos seus dados." },
  { code: "first_explanation", title: "Primeira explicação de modelo", description: "Abriu as runas (importância por permutação) de um modelo treinado." },
];

/** Marco único → recompensa oficial idempotente (source forge + código). */
async function milestone(db: Client, ownerId: string, code: string): Promise<boolean> {
  const m = MILESTONES.find((x) => x.code === code);
  if (!m) return false;
  const R = GAMIFICATION_RULES.forge.milestone;
  const { today } = await userDayContext(db, ownerId);
  return award(db, ownerId, { sourceType: "forge", sourceId: code, eventType: "milestone", xp: R.xp, coins: R.coins, label: `Forja: ${m.title}` }, today).catch(() => false);
}

/* ───────────────────────────── modelos ───────────────────────────── */

function validateInput(input: ModelInput): ModelInput {
  const t = targetOf(input.target);
  if (!t) throw new ForgeError(400, "Variável-alvo desconhecida.");
  if (t.problem !== input.problem) throw new ForgeError(400, `“${t.label}” é um problema de ${t.problem === "classification" ? "classificação" : "regressão"}.`);
  const features = [...new Set(input.features)].filter((k) => FEATURE_KEYS.includes(k));
  if (features.length < 2) throw new ForgeError(400, "Selecione pelo menos 2 variáveis.");
  const algorithms = [...new Set(input.algorithms)].filter((a) => ALGS_FOR[input.problem].includes(a));
  if (!algorithms.some((a) => a !== "baseline" && a !== "persistence")) throw new ForgeError(400, "Selecione pelo menos um algoritmo além da linha de base.");
  const v = input.validation;
  const primaryOk = input.problem === "classification" ? ["balanced_accuracy", "brier", "log_loss"].includes(v.primary) : ["mae", "rmse"].includes(v.primary);
  if (!primaryOk) throw new ForgeError(400, "Métrica principal incompatível com o tipo de problema.");
  return {
    ...input,
    name: input.name.trim().slice(0, 80),
    horizon: Math.min(7, Math.max(1, Math.round(input.horizon))),
    features,
    algorithms,
    validation: { folds: Math.min(6, Math.max(3, v.folds)), holdoutPct: Math.min(0.3, Math.max(0.1, v.holdoutPct)), search: v.search, searchBudget: Math.min(8, Math.max(1, v.searchBudget)), primary: v.primary, margin: Math.min(0.5, Math.max(0, v.margin)) },
  };
}

function parseModel(r: DbRow) {
  return {
    id: String(r.id),
    templateKey: r.template_key ? String(r.template_key) : null,
    name: String(r.name),
    problem: String(r.problem) as Problem,
    target: String(r.target),
    targetLabel: targetOf(String(r.target))?.label ?? String(r.target),
    horizon: Number(r.horizon_days),
    features: J<string[]>(r.features_json, []),
    algorithms: J<Alg[]>(r.algorithms_json, []),
    validation: J<Validation>(r.validation_json, DEFAULT_VALIDATION(String(r.problem) as Problem)),
    status: String(r.status),
    activeVersionId: r.active_version_id ? String(r.active_version_id) : null,
    schedule: String(r.schedule) as ModelInput["schedule"],
    lastTrainedAt: r.last_trained_at ? String(r.last_trained_at) : null,
    createdAt: String(r.created_at),
  };
}
export type ForgeModel = ReturnType<typeof parseModel>;

async function getModel(db: Client, ownerId: string, id: string): Promise<ForgeModel> {
  const r = await db.execute({ sql: "SELECT * FROM ml_models WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new ForgeError(404, "Modelo não encontrado.");
  return parseModel(r.rows[0] as unknown as DbRow);
}

export async function createModel(db: Client, ownerId: string, raw: ModelInput) {
  const input = validateInput(raw);
  if (input.templateKey) {
    const ex = await db.execute({ sql: "SELECT id FROM ml_models WHERE owner_id = ? AND template_key = ?", args: [ownerId, input.templateKey] });
    if (ex.rows[0]) throw new ForgeError(409, "Este artefato já foi criado — abra-o em Artefatos.");
  }
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO ml_models (id, owner_id, template_key, name, problem, target, horizon_days, features_json, algorithms_json, validation_json, status, schedule)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?)`,
    args: [id, ownerId, input.templateKey ?? null, input.name, input.problem, input.target, input.horizon, JSON.stringify(input.features), JSON.stringify(input.algorithms), JSON.stringify(input.validation), input.schedule],
  });
  return getModel(db, ownerId, id);
}

/** Cria a partir de um artefato sugerido (configuração padrão completa). */
export async function createFromTemplate(db: Client, ownerId: string, key: string) {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new ForgeError(404, "Artefato desconhecido.");
  const target = targetOf(t.target)!;
  return createModel(db, ownerId, { name: t.name, problem: target.problem, target: t.target, horizon: 1, features: FEATURE_KEYS, algorithms: ALGS_FOR[target.problem], validation: DEFAULT_VALIDATION(target.problem), schedule: "manual", templateKey: t.key });
}

export async function updateModel(db: Client, ownerId: string, id: string, raw: Partial<ModelInput>) {
  const cur = await getModel(db, ownerId, id);
  const input = validateInput({ name: raw.name ?? cur.name, problem: cur.problem, target: raw.target ?? cur.target, horizon: raw.horizon ?? cur.horizon, features: raw.features ?? cur.features, algorithms: raw.algorithms ?? cur.algorithms, validation: raw.validation ?? cur.validation, schedule: raw.schedule ?? cur.schedule });
  await db.execute({
    sql: "UPDATE ml_models SET name = ?, target = ?, horizon_days = ?, features_json = ?, algorithms_json = ?, validation_json = ?, schedule = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [input.name, input.target, input.horizon, JSON.stringify(input.features), JSON.stringify(input.algorithms), JSON.stringify(input.validation), input.schedule, id, ownerId],
  });
  return getModel(db, ownerId, id);
}

export async function setArchived(db: Client, ownerId: string, id: string, archived: boolean) {
  const m = await getModel(db, ownerId, id);
  const status = archived ? "arquivado" : m.activeVersionId ? "ativo" : m.lastTrainedAt ? "experimental" : "rascunho";
  await db.execute({ sql: "UPDATE ml_models SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [status, id, ownerId] });
  return getModel(db, ownerId, id);
}

export async function deleteModel(db: Client, ownerId: string, id: string) {
  await getModel(db, ownerId, id);
  await db.execute({ sql: "DELETE FROM ml_models WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
}

/* ───────────────────────────── treino ───────────────────────────── */

const SEED = 20261106;

async function startRun(db: Client, ownerId: string, modelId: string | null, kind: "train" | "backtest" | "inference" | "monitor" | "quality", trigger: string, config: unknown, idem: string | null) {
  const id = nanoid();
  try {
    await db.execute({ sql: "INSERT INTO ml_runs (id, owner_id, model_id, kind, status, trigger, config_json, idempotency_key) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)", args: [id, ownerId, modelId, kind, trigger, JSON.stringify(config ?? null), idem] });
  } catch {
    return null; // idempotência: execução automática já registrada
  }
  return id;
}
async function finishRun(db: Client, ownerId: string, id: string, status: "done" | "failed" | "insufficient" | "cancelled", result: unknown, log: string[], error: string | null, t0: number) {
  await db.execute({
    sql: "UPDATE ml_runs SET status = ?, result_json = ?, log_json = ?, error = ?, finished_at = datetime('now'), duration_ms = ? WHERE id = ? AND owner_id = ?",
    args: [status, JSON.stringify(result ?? null), JSON.stringify(log), error, Date.now() - t0, id, ownerId],
  });
}

/** Valores de referência por variável (para o PSI no monitoramento). */
function referenceOf(X: Row[], features: string[]) {
  return Object.fromEntries(
    features.map((k, j) => {
      const vals = X.map((r) => r[j]).filter((v): v is number => v !== null && Number.isFinite(v));
      const sample = vals.slice(-200).map((v) => round(v, 3));
      return [k, { edges: referenceBins(vals), sample }];
    }),
  );
}

export async function trainModel(db: Client, ownerId: string, id: string, trigger = "manual", idem: string | null = null) {
  const model = await getModel(db, ownerId, id);
  if (model.status === "arquivado") throw new ForgeError(409, "Desarquive o modelo antes de treinar.");
  const target = targetOf(model.target)!;
  const t0 = Date.now();
  const runId = await startRun(db, ownerId, id, "train", trigger, { features: model.features, algorithms: model.algorithms, validation: model.validation, horizon: model.horizon, seed: SEED }, idem);
  if (!runId) return { status: "skipped" as const, message: "Treino automático já executado neste período." };
  const prevStatus = model.status;
  await db.execute({ sql: "UPDATE ml_models SET status = 'treinando' WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  try {
    const { today } = await userDayContext(db, ownerId);
    const days = await loadForgeDays(db, ownerId, today);
    const mx = buildMatrix(days, target, model.horizon, model.features, today);
    const res = runPipeline(mx.X, mx.y, {
      problem: model.problem,
      algorithms: model.algorithms,
      folds: model.validation.folds,
      holdoutPct: model.validation.holdoutPct,
      search: model.validation.search,
      searchBudget: model.validation.searchBudget,
      primary: model.validation.primary,
      margin: model.validation.margin,
      seed: SEED,
      persistenceIndex: mx.persistenceIndex,
      timeBudgetMs: 15_000,
    });
    if (!res.ok || !res.final) {
      await finishRun(db, ownerId, runId, "insufficient", { samples: mx.y.length }, res.log, res.reason, t0);
      await db.execute({ sql: "UPDATE ml_models SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [model.activeVersionId ? "ativo" : "aguardando_dados", id, ownerId] });
      return { status: "insufficient" as const, message: res.reason ?? "Dados insuficientes.", runId };
    }
    const configHash = hashOf({ f: model.features, a: model.algorithms, v: model.validation, h: model.horizon, t: model.target, p: PIPELINE_VERSION, s: SEED });
    const dataHash = hashOf({ X: mx.X, y: mx.y, d: mx.dates });
    const same = await db.execute({ sql: "SELECT id, version FROM ml_model_versions WHERE owner_id = ? AND model_id = ? AND config_hash = ? AND data_hash = ?", args: [ownerId, id, configHash, dataHash] });
    if (same.rows[0]) {
      // Reprodutibilidade verificada: mesmo dado + configuração + semente → mesma versão, sem XP novo.
      await finishRun(db, ownerId, runId, "done", { identical: String(same.rows[0].id), version: Number(same.rows[0].version) }, [...res.log, "Treino idêntico a uma versão existente: nenhuma versão nova foi criada."], null, t0);
      await db.execute({ sql: "UPDATE ml_models SET status = ? WHERE id = ? AND owner_id = ?", args: [prevStatus === "treinando" ? "experimental" : prevStatus, id, ownerId] });
      await milestone(db, ownerId, "first_reproducible");
      return { status: "identical" as const, message: `Mesmo resultado da versão ${Number(same.rows[0].version)} (dados e configuração inalterados).`, runId, versionId: String(same.rows[0].id) };
    }
    const vr = await db.execute({ sql: "SELECT COALESCE(MAX(version), 0) AS v FROM ml_model_versions WHERE model_id = ? AND owner_id = ?", args: [id, ownerId] });
    const version = Number(vr.rows[0]?.v ?? 0) + 1;
    const versionId = nanoid();
    const featLabel = (k: string) => FEATURES.find((f) => f.key === k)?.label ?? k;
    const importance = model.features.map((k, j) => ({ key: k, label: featLabel(k), importance: res.importance.find((x) => x.index === j)?.importance ?? 0, coefficient: res.coefficients ? round(res.coefficients[j] ?? 0, 4) : null })).sort((a, b) => b.importance - a.importance);
    const posRate = model.problem === "classification" ? round(mx.y.reduce((a, b) => a + b, 0) / mx.y.length) : null;
    const yMean = round(mx.y.reduce((a, b) => a + b, 0) / mx.y.length);
    const metrics = {
      primary: model.validation.primary,
      arena: res.arena,
      reference: res.reference,
      champion: res.champion,
      selected: res.selected,
      beatsBaseline: res.beatsBaseline,
      holdout: res.holdout,
      calibration: res.calibration,
      residuals: res.residuals,
      leakage: res.leakage.map((j) => model.features[j]),
      samples: res.samples,
    };
    const dataset = { target: model.target, threshold: mx.threshold, horizon: model.horizon, from: mx.dates[0] ?? null, to: mx.dates.at(-1) ?? null, samples: mx.y.length, positiveRate: posRate, yMean, granularity: "1 observação por dia local" };
    const selEntry = res.arena.find((a) => a.algorithm === res.selected)!;
    await db.execute({
      sql: `INSERT INTO ml_model_versions (id, owner_id, model_id, version, algorithm, hyperparams_json, features_json, metrics_json, dataset_json, pipeline_version, config_hash, data_hash, seed, model_json, importance_json, reference_json, status, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidata', ?)`,
      args: [versionId, ownerId, id, version, res.selected!, JSON.stringify(selEntry.hp), JSON.stringify(model.features), JSON.stringify(metrics), JSON.stringify(dataset), PIPELINE_VERSION, configHash, dataHash, SEED, JSON.stringify(res.final), JSON.stringify(importance), JSON.stringify(referenceOf(mx.X, model.features)), Date.now() - t0],
    });
    const status = model.activeVersionId ? (prevStatus === "degradado" ? "degradado" : "ativo") : res.beatsBaseline ? "aprovado" : "experimental";
    await db.execute({ sql: "UPDATE ml_models SET status = ?, last_trained_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [status, id, ownerId] });
    await finishRun(db, ownerId, runId, "done", { versionId, version, selected: res.selected, champion: res.champion, beatsBaseline: res.beatsBaseline, samples: res.samples }, res.log, null, t0);
    await milestone(db, ownerId, "first_model");
    if (res.beatsBaseline) await milestone(db, ownerId, "first_beat");
    return { status: "trained" as const, message: res.beatsBaseline ? `Versão ${version}: ${ALG_LABEL[res.selected!]} superou a linha de base. Pode ser ativada.` : `Versão ${version} registrada como experimental: nenhum modelo superou a linha de base com confiança.`, runId, versionId, version };
  } catch (err) {
    await finishRun(db, ownerId, runId, "failed", null, [], err instanceof Error ? err.message : "erro", t0);
    await db.execute({ sql: "UPDATE ml_models SET status = ? WHERE id = ? AND owner_id = ?", args: [prevStatus === "treinando" ? "rascunho" : prevStatus, id, ownerId] });
    throw err;
  }
}

/** Ativa (ou reverte para) uma versão. Só versões que superaram a linha de base. */
export async function activateVersion(db: Client, ownerId: string, modelId: string, versionId: string) {
  await getModel(db, ownerId, modelId);
  const v = await db.execute({ sql: "SELECT metrics_json FROM ml_model_versions WHERE id = ? AND model_id = ? AND owner_id = ?", args: [versionId, modelId, ownerId] });
  if (!v.rows[0]) throw new ForgeError(404, "Versão não encontrada.");
  if (!J<{ beatsBaseline?: boolean }>(v.rows[0].metrics_json, {}).beatsBaseline) throw new ForgeError(422, "Esta versão não superou a linha de base no teste final — não pode ir para produção.");
  await db.batch(
    [
      { sql: "UPDATE ml_model_versions SET status = 'candidata' WHERE model_id = ? AND owner_id = ? AND status = 'ativa'", args: [modelId, ownerId] },
      { sql: "UPDATE ml_model_versions SET status = 'ativa' WHERE id = ? AND owner_id = ?", args: [versionId, ownerId] },
      { sql: "UPDATE ml_models SET active_version_id = ?, status = 'ativo', updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [versionId, modelId, ownerId] },
      // Previsões futuras da versão anterior saem; as passadas ficam para auditoria.
      { sql: "DELETE FROM ml_model_predictions WHERE model_id = ? AND owner_id = ? AND actual IS NULL AND version_id != ? AND target_date >= date('now')", args: [modelId, ownerId, versionId] },
    ],
    "write",
  );
  await generatePredictions(db, ownerId, modelId);
}

export async function deactivate(db: Client, ownerId: string, modelId: string) {
  await getModel(db, ownerId, modelId);
  const { today } = await userDayContext(db, ownerId);
  await db.batch(
    [
      { sql: "UPDATE ml_model_versions SET status = 'candidata' WHERE model_id = ? AND owner_id = ? AND status = 'ativa'", args: [modelId, ownerId] },
      // Previsões futuras ainda não resolvidas deixam de valer (a Taverna não as exibe mais); o histórico com valor real é mantido.
      { sql: "DELETE FROM ml_model_predictions WHERE model_id = ? AND owner_id = ? AND target_date >= ? AND actual IS NULL", args: [modelId, ownerId, today] },
      { sql: "UPDATE ml_models SET active_version_id = NULL, status = 'experimental', updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [modelId, ownerId] },
    ],
    "write",
  );
}

export async function archiveVersion(db: Client, ownerId: string, modelId: string, versionId: string) {
  const m = await getModel(db, ownerId, modelId);
  if (m.activeVersionId === versionId) throw new ForgeError(409, "Desative a versão antes de arquivá-la.");
  await db.execute({ sql: "UPDATE ml_model_versions SET status = 'arquivada' WHERE id = ? AND model_id = ? AND owner_id = ?", args: [versionId, modelId, ownerId] });
}

/* ───────────────────────────── inferência ───────────────────────────── */

async function loadVersion(db: Client, ownerId: string, versionId: string) {
  const r = await db.execute({ sql: "SELECT * FROM ml_model_versions WHERE id = ? AND owner_id = ?", args: [versionId, ownerId] });
  const row = r.rows[0] as unknown as DbRow | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    version: Number(row.version),
    algorithm: String(row.algorithm) as Alg,
    features: J<string[]>(row.features_json, []),
    metrics: J<{ residuals: { q10: number; q90: number } | null; holdout: { model: Metrics } | null; primary: Primary }>(row.metrics_json, { residuals: null, holdout: null, primary: "mae" }),
    dataset: J<{ threshold: number | null; positiveRate: number | null; yMean: number; samples: number; to: string | null }>(row.dataset_json, { threshold: null, positiveRate: null, yMean: 0, samples: 0, to: null }),
    model: J<Fitted | null>(row.model_json, null),
    reference: J<Record<string, { edges: number[]; sample: number[] }>>(row.reference_json, {}),
  };
}

/** Contribuição local por oclusão: valor previsto − previsto com a variável ausente (imputada pela média do treino). */
function explain(model: Fitted, row: Row, features: string[]) {
  const p = predictOne(model, row);
  return features
    .map((k, j) => ({ key: k, label: FEATURES.find((f) => f.key === k)?.label ?? k, value: row[j] ?? null, effect: row[j] === null ? 0 : round(p - predictOne(model, row.map((v, c) => (c === j ? null : v)))) }))
    .filter((e) => e.effect !== 0)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 6);
}

/**
 * Previsões dos modelos ativos: data-alvo completa (hoje+h−1, usa só dias
 * encerrados) e preliminar (hoje+h, depende de hoje). A completa nunca é
 * sobrescrita pela preliminar.
 */
export async function generatePredictions(db: Client, ownerId: string, onlyModel?: string) {
  const { today } = await userDayContext(db, ownerId);
  const models = (await db.execute({ sql: `SELECT * FROM ml_models WHERE owner_id = ? AND active_version_id IS NOT NULL AND status IN ('ativo', 'degradado') ${onlyModel ? "AND id = ?" : ""}`, args: onlyModel ? [ownerId, onlyModel] : [ownerId] })).rows.map((r) => parseModel(r as unknown as DbRow));
  if (!models.length) return 0;
  const days = await loadForgeDays(db, ownerId, today, 30);
  let n = 0;
  for (const m of models) {
    const v = await loadVersion(db, ownerId, m.activeVersionId!);
    if (!v?.model) continue;
    for (const target of [addDays(today, m.horizon - 1), addDays(today, m.horizon)]) {
      const inf = inferenceRow(days, v.features, m.horizon, target, today);
      if (!inf) continue;
      const existing = await db.execute({ sql: "SELECT partial, version_id FROM ml_model_predictions WHERE model_id = ? AND target_date = ? AND owner_id = ?", args: [m.id, target, ownerId] });
      const ex = existing.rows[0];
      if (ex && Number(ex.partial) === 0 && String(ex.version_id) === v.id) continue;
      if (ex && Number(ex.partial) === 0 && inf.partial) continue;
      const value = predictOne(v.model, inf.row);
      const lower = m.problem === "regression" && v.metrics.residuals ? round(value + v.metrics.residuals.q10, 3) : null;
      const upper = m.problem === "regression" && v.metrics.residuals ? round(value + v.metrics.residuals.q90, 3) : null;
      const explanation = { factors: explain(v.model, inf.row, v.features), missing: v.features.filter((_, j) => inf.row[j] === null).length, version: v.version, horizon: m.horizon };
      await db.execute({
        sql: `INSERT INTO ml_model_predictions (id, owner_id, model_id, version_id, target_date, value, lower, upper, partial, explanation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(model_id, target_date) DO UPDATE SET version_id = excluded.version_id, value = excluded.value, lower = excluded.lower, upper = excluded.upper, partial = excluded.partial, explanation_json = excluded.explanation_json, created_at = datetime('now')`,
        args: [nanoid(), ownerId, m.id, v.id, target, round(value, 4), lower, upper, inf.partial ? 1 : 0, JSON.stringify(explanation)],
      });
      n++;
    }
  }
  return n;
}

/** Confere previsões passadas com o que aconteceu (rótulo do próprio dia, com o limiar da versão). */
export async function resolveActuals(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const pend = await db.execute({
    sql: `SELECT p.id, p.target_date, p.version_id, m.target, m.problem FROM ml_model_predictions p JOIN ml_models m ON m.id = p.model_id AND m.owner_id = p.owner_id
          WHERE p.owner_id = ? AND p.actual IS NULL AND p.target_date < ? AND p.target_date >= ?`,
    args: [ownerId, today, addDays(today, -60)],
  });
  if (!pend.rows.length) return 0;
  const days = await loadForgeDays(db, ownerId, addDays(today, -1), 62);
  const byDate = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  for (const p of pend.rows) {
    const t = targetOf(String(p.target));
    const d = byDate.get(String(p.target_date));
    if (!t || !d) continue;
    const raw = d.v[t.series];
    if (raw === null) continue;
    let actual = raw;
    if (t.problem === "classification") {
      const v = await loadVersion(db, ownerId, String(p.version_id));
      if (v?.dataset.threshold == null) continue;
      actual = raw >= v.dataset.threshold ? 1 : 0;
    }
    await db.execute({ sql: "UPDATE ml_model_predictions SET actual = ? WHERE id = ? AND owner_id = ?", args: [actual, String(p.id), ownerId] });
    n++;
  }
  return n;
}

/* ───────────────────────────── backtest e monitoramento ───────────────────────────── */

/** Backtest dia a dia (origem móvel): para cada um dos últimos N dias, treina com o passado e prevê o dia. */
export async function backtestModel(db: Client, ownerId: string, modelId: string, trigger = "manual", idem: string | null = null) {
  const m = await getModel(db, ownerId, modelId);
  const versionId = m.activeVersionId ?? (await db.execute({ sql: "SELECT id FROM ml_model_versions WHERE model_id = ? AND owner_id = ? ORDER BY version DESC LIMIT 1", args: [modelId, ownerId] })).rows[0]?.id;
  if (!versionId) throw new ForgeError(422, "Treine o modelo antes do backtest.");
  const v = await loadVersion(db, ownerId, String(versionId));
  if (!v?.model) throw new ForgeError(404, "Versão não encontrada.");
  const t0 = Date.now();
  const runId = await startRun(db, ownerId, modelId, "backtest", trigger, { versionId: v.id }, idem);
  if (!runId) return null;
  const { today } = await userDayContext(db, ownerId);
  const days = await loadForgeDays(db, ownerId, today);
  const mx = buildMatrix(days, targetOf(m.target)!, m.horizon, v.features, today);
  const N = Math.min(30, mx.y.length - 30);
  if (N < 7) {
    await finishRun(db, ownerId, runId, "insufficient", null, [], "Histórico curto para backtest (mínimo 37 observações).", t0);
    return { status: "insufficient" as const };
  }
  const ys: number[] = [];
  const ps: number[] = [];
  const bs: number[] = [];
  const dates: string[] = [];
  for (let i = mx.y.length - N; i < mx.y.length; i++) {
    const tx = mx.X.slice(0, i);
    const ty = mx.y.slice(0, i);
    if (m.problem === "classification" && (ty.every((y) => y === 1) || ty.every((y) => y === 0))) continue;
    const model = fit(m.problem, v.algorithm, tx, ty, v.model.hp, { persistenceIndex: mx.persistenceIndex, seed: SEED });
    const base = fit(m.problem, "baseline", tx, ty);
    ys.push(mx.y[i]!);
    ps.push(predictOne(model, mx.X[i]!));
    bs.push(predictOne(base, mx.X[i]!));
    dates.push(mx.dates[i]!);
  }
  const weekly: Array<{ week: string; n: number; model: number; baseline: number }> = [];
  for (let s = 0; s < ys.length; s += 7) {
    const sl = (a: number[]) => a.slice(s, s + 7);
    if (sl(ys).length < 3) continue;
    weekly.push({ week: dates[s]!, n: sl(ys).length, model: primaryValue(metricsFor(m.problem, sl(ys), sl(ps)), v.metrics.primary), baseline: primaryValue(metricsFor(m.problem, sl(ys), sl(bs)), v.metrics.primary) });
  }
  const result = { versionId: v.id, version: v.version, n: ys.length, model: metricsFor(m.problem, ys, ps), baseline: metricsFor(m.problem, ys, bs), weekly, primary: v.metrics.primary };
  await finishRun(db, ownerId, runId, "done", result, [`Backtest de origem móvel em ${ys.length} dias (treino sempre anterior ao dia previsto).`], null, t0);
  await milestone(db, ownerId, "first_backtest");
  return { status: "done" as const, result };
}

/**
 * Monitoramento: PSI das variáveis (referência = treino × últimos 30 dias),
 * mudança do alvo (teste z / média) e desempenho observado das previsões
 * conferidas. Só anuncia mudança com amostra mínima; degradação só com 15+
 * previsões conferidas.
 */
export async function monitorModel(db: Client, ownerId: string, modelId: string) {
  const m = await getModel(db, ownerId, modelId);
  if (!m.activeVersionId) return null;
  const v = await loadVersion(db, ownerId, m.activeVersionId);
  if (!v) return null;
  const { today } = await userDayContext(db, ownerId);
  const days = await loadForgeDays(db, ownerId, today, 90);
  const mx = buildMatrix(days, targetOf(m.target)!, m.horizon, v.features, today);
  // Só dias POSTERIORES ao período de treino (até 60): comparar com dados já vistos no treino esconderia a mudança.
  const after = v.dataset.to ?? addDays(today, -31);
  const recentIdx = mx.dates.map((d, i) => (d > after ? i : -1)).filter((i) => i >= 0).slice(-60);
  const features = v.features.map((k, j) => {
    const ref = v.reference[k];
    const recent = recentIdx.map((i) => mx.X[i]![j]).filter((x): x is number => x !== null);
    const value = ref && recent.length >= 30 ? psi(ref.sample, ref.edges, recent) : null;
    const noise = ref ? psiNoise(ref.edges.length + 1, ref.sample.length, recent.length) : 0;
    const net = value === null ? null : Math.max(0, value - noise);
    // Médias móveis são autocorrelacionadas: o PSI delas é só informativo e não dispara alerta.
    const smoothed = k.endsWith("__avg7");
    return { key: k, label: FEATURES.find((f) => f.key === k)?.label ?? k, psi: value, noise, n: recent.length, smoothed, level: net === null ? "sem_dados" : smoothed ? "informativo" : net > 0.25 ? "forte" : net > 0.1 ? "moderada" : "estavel" };
  });
  const ry = recentIdx.map((i) => mx.y[i]!);
  let target: { text: string; changed: boolean; n: number } = { text: `Aguardando dados novos: ${ry.length} dia(s) após o treino (mínimo 20).`, changed: false, n: ry.length };
  if (ry.length >= 20) {
    if (m.problem === "classification" && v.dataset.positiveRate !== null) {
      const rate = ry.reduce((a, b) => a + b, 0) / ry.length;
      const z = twoProportionZ(v.dataset.positiveRate, v.dataset.samples, rate, ry.length);
      target = { text: `Taxa do alvo: ${Math.round(v.dataset.positiveRate * 100)}% no treino × ${Math.round(rate * 100)}% após o treino (z = ${z}).`, changed: Math.abs(z) >= 2, n: ry.length };
    } else {
      const mean = ry.reduce((a, b) => a + b, 0) / ry.length;
      const diff = v.dataset.yMean ? (mean - v.dataset.yMean) / Math.abs(v.dataset.yMean) : 0;
      target = { text: `Média do alvo: ${round(v.dataset.yMean, 2)} no treino × ${round(mean, 2)} após o treino.`, changed: Math.abs(diff) >= 0.25, n: ry.length };
    }
  }
  const resolved = await db.execute({ sql: "SELECT value, actual FROM ml_model_predictions WHERE model_id = ? AND owner_id = ? AND version_id = ? AND actual IS NOT NULL AND partial = 0 AND target_date >= ?", args: [modelId, ownerId, v.id, addDays(today, -45)] });
  let perf: { n: number; observed: number | null; expected: number | null; degraded: boolean; text: string } = { n: resolved.rows.length, observed: null, expected: null, degraded: false, text: "Menos de 15 previsões conferidas — desempenho observado ainda não é avaliado." };
  const expected = v.metrics.holdout ? primaryValue(v.metrics.holdout.model, v.metrics.primary) : null;
  if (resolved.rows.length >= 15 && expected !== null) {
    const obs = primaryValue(metricsFor(m.problem, resolved.rows.map((r) => Number(r.actual)), resolved.rows.map((r) => Number(r.value))), v.metrics.primary);
    const degraded = v.metrics.primary === "balanced_accuracy" ? expected - obs >= 0.1 : (obs - expected) / Math.max(1e-9, Math.abs(expected)) >= 0.25;
    perf = { n: resolved.rows.length, observed: round(obs), expected: round(expected), degraded, text: `${v.metrics.primary}: ${round(obs, 3)} observado × ${round(expected, 3)} no teste final.` };
  }
  const strong = features.filter((f) => f.level === "forte");
  const status = perf.degraded ? "degradado" : strong.length || target.changed ? "atencao" : features.every((f) => f.level === "sem_dados") && perf.observed === null ? "sem_dados" : "ok";
  const drift = { features, target, thresholds: "PSI em quintis do treino, descontado o ruído esperado de amostra ((k−1)/n de cada lado): < 0,1 estável · 0,1–0,25 moderado · > 0,25 forte. Só dias posteriores ao treino, mínimo de 30. Médias móveis são só informativas." };
  await db.execute({ sql: "INSERT INTO ml_monitor_snapshots (id, owner_id, model_id, version_id, drift_json, perf_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [nanoid(), ownerId, modelId, v.id, JSON.stringify(drift), JSON.stringify(perf), status] });
  if (perf.degraded && m.status === "ativo") await db.execute({ sql: "UPDATE ml_models SET status = 'degradado' WHERE id = ? AND owner_id = ?", args: [modelId, ownerId] });
  if (!perf.degraded && m.status === "degradado") await db.execute({ sql: "UPDATE ml_models SET status = 'ativo' WHERE id = ? AND owner_id = ?", args: [modelId, ownerId] });
  return { status, drift, perf };
}

/* ───────────────────────────── dados (grimório) ───────────────────────────── */

/** Análise pesada dos dados — só sob pedido ("Analisar meus dados") ou pela automação diária. */
export async function analyzeData(db: Client, ownerId: string, trigger = "manual") {
  const t0 = Date.now();
  const runId = await startRun(db, ownerId, null, "quality", trigger, null, null);
  const { today } = await userDayContext(db, ownerId);
  const days = await loadForgeDays(db, ownerId, today);
  const [sources] = await Promise.all([sourceInventory(db, ownerId, days, today)]);
  const quality = qualityReport(days, today);
  const sample = days.slice(-14).reverse().map((d) => ({ date: d.date, ...d.v }));
  const result = { analyzedAt: new Date().toISOString(), sources, quality, bottlenecks: bottlenecks(days, today), sample };
  if (runId) await finishRun(db, ownerId, runId, "done", result, [`${days.length} dias analisados em ${SERIES_COUNT} séries.`], null, t0);
  await milestone(db, ownerId, "first_quality");
  return result;
}
const SERIES_COUNT = 12;

export function dictionary() {
  return {
    features: FEATURES.map((f) => ({ key: f.key, label: f.label, source: f.source, type: f.type, description: f.description })),
    targets: TARGETS.map((t) => ({ key: t.key, label: t.label, problem: t.problem, description: t.description })),
    algorithms: { classification: ALGS_FOR.classification.map((a) => ({ key: a, label: ALG_LABEL[a] })), regression: ALGS_FOR.regression.map((a) => ({ key: a, label: ALG_LABEL[a] })) },
    leakageRule: "Para prever o dia D com horizonte h, as variáveis usam só dias até D−h (defasagem e média móvel) e o calendário de D.",
  };
}

/* ───────────────────────────── visão geral ───────────────────────────── */

async function latestQuality(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT result_json, finished_at FROM ml_runs WHERE owner_id = ? AND kind = 'quality' AND status = 'done' ORDER BY started_at DESC LIMIT 1", args: [ownerId] });
  return r.rows[0] ? J<Awaited<ReturnType<typeof analyzeData>> | null>(r.rows[0].result_json, null) : null;
}

export async function getForgeOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [modelsR, versionsR, runsR, predsR, monR, legacyR, xpR, quality] = await Promise.all([
    db.execute({ sql: "SELECT * FROM ml_models WHERE owner_id = ? ORDER BY created_at", args: [ownerId] }),
    db.execute({ sql: "SELECT id, model_id, version, algorithm, hyperparams_json, metrics_json, dataset_json, importance_json, status, trained_at, duration_ms, pipeline_version, config_hash, data_hash, seed FROM ml_model_versions WHERE owner_id = ? ORDER BY model_id, version DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT id, model_id, kind, status, trigger, error, started_at, finished_at, duration_ms, result_json, log_json, archived FROM ml_runs WHERE owner_id = ? ORDER BY started_at DESC LIMIT 60", args: [ownerId] }),
    db.execute({ sql: "SELECT model_id, version_id, target_date, value, lower, upper, partial, explanation_json, actual FROM ml_model_predictions WHERE owner_id = ? AND target_date >= ? ORDER BY target_date DESC", args: [ownerId, addDays(today, -45)] }),
    db.execute({ sql: "SELECT model_id, drift_json, perf_json, status, checked_at FROM ml_monitor_snapshots WHERE owner_id = ? AND checked_at >= ? ORDER BY checked_at DESC", args: [ownerId, addDays(today, -60)] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM ml_artifacts WHERE owner_id = ?", args: [ownerId] }).catch(() => ({ rows: [{ n: 0 }] })),
    db.execute({ sql: "SELECT source_id FROM xp_events WHERE owner_id = ? AND source_type = 'forge'", args: [ownerId] }),
    latestQuality(db, ownerId),
  ]);
  const models = modelsR.rows.map((r) => parseModel(r as unknown as DbRow));
  const versions = versionsR.rows.map((r) => ({
    id: String(r.id),
    modelId: String(r.model_id),
    version: Number(r.version),
    algorithm: String(r.algorithm) as Alg,
    algorithmLabel: ALG_LABEL[String(r.algorithm) as Alg] ?? String(r.algorithm),
    hyperparams: J<Record<string, number>>(r.hyperparams_json, {}),
    metrics: J<Record<string, unknown>>(r.metrics_json, {}),
    dataset: J<Record<string, unknown>>(r.dataset_json, {}),
    importance: J<Array<{ key: string; label: string; importance: number; coefficient: number | null }>>(r.importance_json, []),
    status: String(r.status),
    trainedAt: String(r.trained_at),
    durationMs: Number(r.duration_ms ?? 0),
    pipelineVersion: String(r.pipeline_version),
    configHash: String(r.config_hash),
    dataHash: String(r.data_hash),
    seed: Number(r.seed),
  }));
  const runs = runsR.rows.map((r) => ({ id: String(r.id), modelId: r.model_id ? String(r.model_id) : null, kind: String(r.kind), status: String(r.status), trigger: String(r.trigger), error: r.error ? String(r.error) : null, startedAt: String(r.started_at), finishedAt: r.finished_at ? String(r.finished_at) : null, durationMs: r.duration_ms == null ? null : Number(r.duration_ms), result: r.kind === "quality" ? null : J<unknown>(r.result_json, null), log: J<string[]>(r.log_json, []), archived: Number(r.archived) === 1 }));
  const predictions = predsR.rows.map((r) => ({ modelId: String(r.model_id), versionId: String(r.version_id), targetDate: String(r.target_date), value: Number(r.value), lower: r.lower == null ? null : Number(r.lower), upper: r.upper == null ? null : Number(r.upper), partial: Number(r.partial) === 1, explanation: J<{ factors: Array<{ key: string; label: string; value: number | null; effect: number }>; missing: number; version: number; horizon: number }>(r.explanation_json, { factors: [], missing: 0, version: 0, horizon: 1 }), actual: r.actual == null ? null : Number(r.actual) }));
  const monitors = monR.rows.map((r) => ({ modelId: String(r.model_id), drift: J<unknown>(r.drift_json, null), perf: J<unknown>(r.perf_json, null), status: String(r.status), checkedAt: String(r.checked_at) }));
  const lastMonitor = (id: string) => monitors.find((x) => x.modelId === id) ?? null;

  const trained = models.filter((m) => versions.some((v) => v.modelId === m.id));
  const active = models.filter((m) => m.activeVersionId && (m.status === "ativo" || m.status === "degradado"));
  const beat = models.filter((m) => versions.some((v) => v.modelId === m.id && (v.metrics as { beatsBaseline?: boolean }).beatsBaseline));
  const backtests = runs.filter((r) => r.kind === "backtest" && r.status === "done").length;
  const points = models.length * 20 + versions.length * 10 + beat.length * 40 + backtests * 10;
  const alerts: Array<{ level: "alto" | "medio" | "baixo"; text: string; modelId: string | null }> = [];
  for (const m of models) {
    const mon = lastMonitor(m.id);
    if (m.status === "degradado") alerts.push({ level: "alto", text: `${m.name}: desempenho observado caiu em relação ao teste final.`, modelId: m.id });
    else if (mon?.status === "atencao") alerts.push({ level: "medio", text: `${m.name}: mudança nas distribuições dos dados (ver Monitoramento).`, modelId: m.id });
    if (m.status === "aguardando_dados") alerts.push({ level: "baixo", text: `${m.name}: aguardando dados suficientes para treinar.`, modelId: m.id });
    const lastFail = runs.find((r) => r.modelId === m.id && r.status === "failed");
    if (lastFail && runs.find((r) => r.modelId === m.id) === lastFail) alerts.push({ level: "alto", text: `${m.name}: o último treino falhou (${lastFail.error ?? "erro"}).`, modelId: m.id });
  }
  const milestones = MILESTONES.map((x) => ({ ...x, done: xpR.rows.some((r) => String(r.source_id) === x.code) }));
  return {
    today,
    indicators: {
      artifactsActive: active.length,
      modelsTrained: trained.length,
      models: models.filter((m) => m.status !== "arquivado").length,
      experiments: runs.filter((r) => r.kind === "train").length,
      dataQuality: quality?.quality.scores.overall ?? null,
      beatBaseline: beat.length,
      predictionsToday: predictions.filter((p) => p.targetDate === today || p.targetDate === addDays(today, 1)).length,
      alerts: alerts.length,
    },
    researcher: { ...tierRank(RESEARCHER_RANKS, points), breakdown: { models: models.length, versions: versions.length, beatBaseline: beat.length, backtests }, rule: "20 por modelo configurado + 10 por versão treinada + 40 por modelo que superou a base + 10 por backtest. Não gera XP extra." },
    milestones,
    milestoneReward: GAMIFICATION_RULES.forge.milestone,
    models: models.map((m) => ({ ...m, versions: versions.filter((v) => v.modelId === m.id).length, active: versions.find((v) => v.id === m.activeVersionId) ?? null, latest: versions.find((v) => v.modelId === m.id) ?? null, monitor: lastMonitor(m.id), nextTraining: m.schedule === "manual" || !m.lastTrainedAt ? null : addDays(m.lastTrainedAt.slice(0, 10), m.schedule === "weekly" ? 7 : 30) })),
    versions,
    runs,
    predictions,
    monitors,
    quality,
    templates: TEMPLATES.map((t) => ({ ...t, problem: targetOf(t.target)!.problem, created: models.some((m) => m.templateKey === t.key) })),
    legacyArtifacts: Number(legacyR.rows[0]?.n ?? 0),
    alerts,
  };
}

export async function getModelReport(db: Client, ownerId: string, modelId: string) {
  const m = await getModel(db, ownerId, modelId);
  const [versions, preds, runs] = await Promise.all([
    db.execute({ sql: "SELECT id, version, algorithm, hyperparams_json, metrics_json, dataset_json, importance_json, status, trained_at, pipeline_version, config_hash, data_hash, seed FROM ml_model_versions WHERE model_id = ? AND owner_id = ? ORDER BY version", args: [modelId, ownerId] }),
    db.execute({ sql: "SELECT target_date, value, lower, upper, partial, actual, version_id FROM ml_model_predictions WHERE model_id = ? AND owner_id = ? ORDER BY target_date", args: [modelId, ownerId] }),
    db.execute({ sql: "SELECT kind, status, trigger, started_at, duration_ms, error FROM ml_runs WHERE model_id = ? AND owner_id = ? ORDER BY started_at", args: [modelId, ownerId] }),
  ]);
  const t = targetOf(m.target)!;
  return {
    modelCard: {
      name: m.name,
      objective: t.description,
      problem: m.problem,
      target: t.label,
      horizonDays: m.horizon,
      features: m.features.map((k) => FEATURES.find((f) => f.key === k)?.label ?? k),
      validation: m.validation,
      pipeline: PIPELINE_VERSION,
      intendedUse: "Apoiar o planejamento pessoal. Não é diagnóstico nem certeza: estima padrões passados do próprio usuário.",
      limitations: ["Dados de um único usuário, autorrelatados e com lacunas.", "Importância de variáveis indica associação no modelo, não causa.", "Mudanças de rotina podem degradar o modelo (ver Monitoramento)."],
      leakageRule: dictionary().leakageRule,
    },
    versions: versions.rows.map((v) => ({ id: String(v.id), version: Number(v.version), algorithm: String(v.algorithm), status: String(v.status), trainedAt: String(v.trained_at), hyperparams: J(v.hyperparams_json, {}), metrics: J(v.metrics_json, {}), dataset: J(v.dataset_json, {}), importance: J(v.importance_json, []), pipeline: String(v.pipeline_version), configHash: String(v.config_hash), dataHash: String(v.data_hash), seed: Number(v.seed) })),
    predictions: preds.rows.map((p) => ({ date: String(p.target_date), value: Number(p.value), lower: p.lower == null ? null : Number(p.lower), upper: p.upper == null ? null : Number(p.upper), partial: Number(p.partial) === 1, actual: p.actual == null ? null : Number(p.actual), versionId: String(p.version_id) })),
    runs: runs.rows.map((r) => ({ kind: String(r.kind), status: String(r.status), trigger: String(r.trigger), startedAt: String(r.started_at), durationMs: r.duration_ms == null ? null : Number(r.duration_ms), error: r.error ? String(r.error) : null })),
  };
}

/** CSV das versões (métricas) e previsões do modelo — só dados do próprio usuário. */
export function reportCsv(report: Awaited<ReturnType<typeof getModelReport>>): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["tipo;versao_ou_data;algoritmo;status;metrica_principal;holdout_modelo;holdout_base;valor;real"];
  for (const v of report.versions) {
    const mt = v.metrics as { primary?: Primary; holdout?: { model: Metrics; baseline: Metrics } | null };
    const p = mt.primary ?? "mae";
    lines.push([esc("versao"), esc(v.version), esc(v.algorithm), esc(v.status), esc(p), esc(mt.holdout ? primaryValue(mt.holdout.model, p) : ""), esc(mt.holdout ? primaryValue(mt.holdout.baseline, p) : ""), esc(""), esc("")].join(";"));
  }
  for (const p of report.predictions) lines.push([esc("previsao"), esc(p.date), esc(""), esc(p.partial ? "preliminar" : "completa"), esc(""), esc(""), esc(""), esc(p.value), esc(p.actual ?? "")].join(";"));
  return lines.join("\n");
}

export async function markExplanationViewed(db: Client, ownerId: string) {
  await milestone(db, ownerId, "first_explanation");
}

export async function archiveRun(db: Client, ownerId: string, runId: string) {
  await db.execute({ sql: "UPDATE ml_runs SET archived = 1 WHERE id = ? AND owner_id = ?", args: [runId, ownerId] });
}

/** Previsões para a Taverna: data-alvo de amanhã, só de modelos ativos. */
export async function predictionsFor(db: Client, ownerId: string, date: string) {
  const r = await db.execute({
    sql: `SELECT p.*, m.name, m.problem, m.target, m.status AS model_status, v.version, v.metrics_json, v.dataset_json FROM ml_model_predictions p
          JOIN ml_models m ON m.id = p.model_id AND m.owner_id = p.owner_id JOIN ml_model_versions v ON v.id = p.version_id AND v.owner_id = p.owner_id
          WHERE p.owner_id = ? AND p.target_date = ? AND m.active_version_id = p.version_id`,
    args: [ownerId, date],
  });
  return r.rows.map((p) => {
    const mt = J<{ holdout: { model: Metrics; baseline: Metrics } | null; primary: Primary }>(p.metrics_json, { holdout: null, primary: "mae" });
    return {
      modelId: String(p.model_id),
      name: String(p.name),
      problem: String(p.problem) as Problem,
      targetLabel: targetOf(String(p.target))?.label ?? String(p.target),
      value: Number(p.value),
      lower: p.lower == null ? null : Number(p.lower),
      upper: p.upper == null ? null : Number(p.upper),
      partial: Number(p.partial) === 1,
      degraded: String(p.model_status) === "degradado",
      version: Number(p.version),
      validation: mt.holdout ? { primary: mt.primary, model: primaryValue(mt.holdout.model, mt.primary), baseline: primaryValue(mt.holdout.baseline, mt.primary) } : null,
      factors: J<{ factors: Array<{ label: string; effect: number }> }>(p.explanation_json, { factors: [] }).factors.slice(0, 3),
    };
  });
}

/* ───────────────────────────── automações ───────────────────────────── */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };
const weekKey = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

export async function runQualityCheck(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const prev = await latestQuality(db, ownerId);
  const cur = await analyzeData(db, ownerId, "automation");
  const high = cur.quality.alerts.filter((a) => a.level === "alto" || a.level === "medio");
  const dropped = prev?.quality.scores.overall != null && cur.quality.scores.overall != null && prev.quality.scores.overall - cur.quality.scores.overall >= 10;
  if ((dropped || high.length) && config.inApp !== false) await notifyFromAutomation(db, ownerId, { eventType: "forge_quality", title: "🔮 Qualidade dos dados da Forja", body: dropped ? `Qualidade caiu de ${prev!.quality.scores.overall}% para ${cur.quality.scores.overall}%.` : high[0]!.text, url: "/forja-inteligencia?aba=qualidade", inApp: true, push: config.push === true });
  return { status: "ok", summary: `Qualidade ${cur.quality.scores.overall ?? "—"}% · ${cur.quality.alerts.length} alerta(s).` };
}

export async function runScheduledTraining(db: Client, ownerId: string): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const due = (await db.execute({ sql: "SELECT * FROM ml_models WHERE owner_id = ? AND schedule != 'manual' AND status != 'arquivado'", args: [ownerId] })).rows.map((r) => parseModel(r as unknown as DbRow));
  let n = 0;
  for (const m of due.slice(0, 3)) {
    const period = m.schedule === "weekly" ? weekKey(today) : today.slice(0, 7);
    const r = await trainModel(db, ownerId, m.id, "automation", `train:${m.id}:${period}`).catch(() => null);
    if (r && r.status !== "skipped") n++;
  }
  return n ? { status: "ok", summary: `${n} treino(s) programado(s) executado(s).` } : { status: "skipped", summary: "Nenhum treino programado pendente." };
}

export async function runBacktests(db: Client, ownerId: string): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const resolved = await resolveActuals(db, ownerId);
  const active = (await db.execute({ sql: "SELECT id FROM ml_models WHERE owner_id = ? AND active_version_id IS NOT NULL", args: [ownerId] })).rows;
  let n = 0;
  for (const a of active.slice(0, 3)) if (await backtestModel(db, ownerId, String(a.id), "automation", `backtest:${String(a.id)}:${weekKey(today)}`).catch(() => null)) n++;
  return { status: "ok", summary: `${resolved} previsão(ões) conferida(s) · ${n} backtest(s).` };
}

export async function runInference(db: Client, ownerId: string): Promise<Outcome> {
  await resolveActuals(db, ownerId);
  const n = await generatePredictions(db, ownerId);
  return n ? { status: "ok", summary: `${n} previsão(ões) gerada(s).` } : { status: "skipped", summary: "Nenhum modelo ativo para prever." };
}

export async function runMonitoring(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const active = (await db.execute({ sql: "SELECT id, name FROM ml_models WHERE owner_id = ? AND active_version_id IS NOT NULL", args: [ownerId] })).rows;
  if (!active.length) return { status: "skipped", summary: "Nenhum modelo ativo para monitorar." };
  await resolveActuals(db, ownerId);
  const issues: string[] = [];
  for (const a of active) {
    const r = await monitorModel(db, ownerId, String(a.id)).catch(() => null);
    if (r && (r.status === "degradado" || r.status === "atencao")) issues.push(`${String(a.name)}: ${r.status === "degradado" ? "desempenho caiu" : "dados mudaram"}`);
  }
  if (issues.length && config.inApp !== false) await notifyFromAutomation(db, ownerId, { eventType: "forge_monitor", title: "🔮 Monitoramento da Forja", body: issues.join(" · "), url: "/forja-inteligencia?aba=monitoramento", inApp: true, push: config.push === true });
  return { status: "ok", summary: issues.length ? issues.join(" · ") : `${active.length} modelo(s) sem alertas.` };
}

export async function runForgeAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const o = await getForgeOverview(db, ownerId);
  const high = o.alerts.filter((a) => a.level === "alto");
  if (!high.length) return { status: "skipped", summary: "Sem alertas graves." };
  await notifyFromAutomation(db, ownerId, { eventType: "forge_alert", title: "🔮 Alertas da Forja", body: high.map((a) => a.text).slice(0, 2).join(" · "), url: "/forja-inteligencia", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${high.length} alerta(s) enviado(s).` };
}
