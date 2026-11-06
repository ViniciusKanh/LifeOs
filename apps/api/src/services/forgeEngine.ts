import { applyPrep, classMetrics, fitPrep, mulberry32, type ClassMetrics, type Row } from "./mlEngine.js";

/**
 * Motor de Machine Learning da Forja 3.0 — TypeScript puro, determinístico
 * (semente) e sem dependências. Pensado para dezenas a poucas centenas de
 * observações diárias de UM usuário.
 *
 * Pipeline (runPipeline):
 *   linhas em ordem cronológica → holdout final (últimos dias, nunca usado na
 *   seleção) → validação walk-forward nas dobras de desenvolvimento → busca de
 *   hiperparâmetros por algoritmo (só nas dobras) → arena com a linha de base →
 *   campeão só se superar a base com margem e na maioria das dobras → avaliação
 *   no holdout → modelo final reajustado em todos os dados.
 * Imputação e padronização são ajustadas SOMENTE no treino de cada ajuste
 * (fitPrep dentro de fit), então nada da validação vaza para o treino.
 */

export type Problem = "classification" | "regression";
export type Alg = "baseline" | "persistence" | "logistic" | "naive_bayes" | "knn" | "tree" | "random_forest" | "gradient_boosting" | "linear" | "ridge";
export type Hyper = Record<string, number>;

export const PIPELINE_VERSION = "forja-3.0.0";

export const ALG_LABEL: Record<Alg, string> = {
  baseline: "Linha de base",
  persistence: "Persistência (valor da véspera)",
  logistic: "Regressão Logística",
  naive_bayes: "Naive Bayes Gaussiano",
  knn: "k-Vizinhos (k-NN)",
  tree: "Árvore de Decisão",
  random_forest: "Random Forest",
  gradient_boosting: "Gradient Boosting",
  linear: "Regressão Linear",
  ridge: "Ridge",
};

export const ALGS_FOR: Record<Problem, Alg[]> = {
  classification: ["baseline", "logistic", "naive_bayes", "knn", "tree", "random_forest", "gradient_boosting"],
  regression: ["baseline", "persistence", "linear", "ridge", "knn", "tree", "random_forest", "gradient_boosting"],
};
export const isBaseline = (a: Alg) => a === "baseline" || a === "persistence";

/** Espaços de busca pequenos de propósito: datasets pessoais são pequenos e superajustam fácil. */
export const SPACES: Partial<Record<Alg, Record<string, number[]>>> = {
  logistic: { lambda: [0.001, 0.01, 0.1, 1] },
  ridge: { lambda: [0.1, 1, 10, 100] },
  knn: { k: [3, 5, 9, 15] },
  tree: { maxDepth: [2, 3, 4], minLeaf: [4, 8] },
  random_forest: { trees: [30], maxDepth: [3, 5], featureFrac: [0.5, 0.8] },
  gradient_boosting: { trees: [40, 80], lr: [0.1], maxDepth: [2, 3] },
};
export const DEFAULT_HP: Partial<Record<Alg, Hyper>> = {
  logistic: { lambda: 0.05 },
  ridge: { lambda: 1 },
  knn: { k: 7 },
  tree: { maxDepth: 3, minLeaf: 5 },
  random_forest: { trees: 30, maxDepth: 4, featureFrac: 0.6 },
  gradient_boosting: { trees: 50, lr: 0.1, maxDepth: 2 },
};

/* ───────────────────────── utilidades ───────────────────────── */

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
export const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** FNV-1a de 32 bits — impressão digital do dataset/configuração (reprodutibilidade). */
export function hashOf(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Resolve sistema linear (Gauss com pivoteamento parcial). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r, i) => (Math.abs(r[i]!) < 1e-12 ? 0 : r[n]! / r[i]!));
}

/* ───────────────────────── árvore (CART por variância) ───────────────────────── */

type Node = { v: number } | { f: number; t: number; l: Node; r: Node };

/**
 * Árvore de regressão por redução de variância. Serve para classificação
 * (média de 0/1 = probabilidade; equivale ao Gini), Random Forest e Boosting.
 * Limiares por quantis do nó (até 10) para manter o custo baixo.
 */
function growTree(X: number[][], y: number[], idx: number[], depth: number, maxDepth: number, minLeaf: number, rnd: (() => number) | null, featureFrac: number, leaf: (ix: number[]) => number): Node {
  const n = idx.length;
  if (depth >= maxDepth || n < 2 * minLeaf) return { v: leaf(idx) };
  let sum = 0;
  let sq = 0;
  for (const i of idx) (sum += y[i]!), (sq += y[i]! ** 2);
  const parentSse = sq - (sum * sum) / n;
  if (parentSse < 1e-9) return { v: leaf(idx) };
  const d = X[0]!.length;
  let feats = Array.from({ length: d }, (_, j) => j);
  if (rnd && featureFrac < 1) {
    for (let a = feats.length - 1; a > 0; a--) {
      const b = Math.floor(rnd() * (a + 1));
      [feats[a], feats[b]] = [feats[b]!, feats[a]!];
    }
    feats = feats.slice(0, Math.max(1, Math.round(d * featureFrac)));
  }
  let best: { f: number; t: number; gain: number } | null = null;
  for (const f of feats) {
    const vals = idx.map((i) => X[i]![f]!).sort((a, b) => a - b);
    const cands = new Set<number>();
    for (let q = 1; q <= 10; q++) {
      const k = Math.floor((q / 11) * (n - 1));
      if (vals[k]! < vals[k + 1]!) cands.add((vals[k]! + vals[k + 1]!) / 2);
    }
    for (const t of cands) {
      let ln = 0;
      let ls = 0;
      let lq = 0;
      for (const i of idx) {
        if (X[i]![f]! <= t) (ln++, (ls += y[i]!), (lq += y[i]! ** 2));
      }
      const rn = n - ln;
      if (ln < minLeaf || rn < minLeaf) continue;
      const rs = sum - ls;
      const rq = sq - lq;
      const gain = parentSse - (lq - (ls * ls) / ln) - (rq - (rs * rs) / rn);
      if (!best || gain > best.gain) best = { f, t, gain };
    }
  }
  if (!best || best.gain < 1e-9) return { v: leaf(idx) };
  const li = idx.filter((i) => X[i]![best!.f]! <= best!.t);
  const ri = idx.filter((i) => X[i]![best!.f]! > best!.t);
  return { f: best.f, t: round(best.t, 6), l: growTree(X, y, li, depth + 1, maxDepth, minLeaf, rnd, featureFrac, leaf), r: growTree(X, y, ri, depth + 1, maxDepth, minLeaf, rnd, featureFrac, leaf) };
}

function walk(node: Node, x: number[]): number {
  let n = node;
  while (!("v" in n)) n = x[n.f]! <= n.t ? n.l : n.r;
  return n.v;
}

/* ───────────────────────── ajuste e previsão ───────────────────────── */

export type Params =
  | { kind: "const"; v: number }
  | { kind: "persistence"; j: number; fallback: number }
  | { kind: "linear"; w: number[]; b: number; logistic: boolean }
  | { kind: "nb"; prior: number; mu0: number[]; mu1: number[]; v0: number[]; v1: number[] }
  | { kind: "knn"; k: number; X: number[][]; y: number[]; classify: boolean }
  | { kind: "trees"; trees: Node[]; init: number; lr: number; mode: "avg" | "boost"; classify: boolean };

export interface Fitted {
  problem: Problem;
  alg: Alg;
  hp: Hyper;
  prep: { mean: number[]; std: number[] };
  params: Params;
}

export interface FitContext {
  /** Índice da variável "alvo da véspera" (linha de base de persistência na regressão). */
  persistenceIndex?: number | null;
  seed?: number;
}

function fitParams(problem: Problem, alg: Alg, X: number[][], raw: Row[], y: number[], hp: Hyper, ctx: FitContext): Params {
  const classify = problem === "classification";
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const rnd = mulberry32(ctx.seed ?? 42);
  switch (alg) {
    case "baseline":
      return { kind: "const", v: classify ? (y.reduce((s, v) => s + v, 0) + 1) / (n + 2) : mean(y) };
    case "persistence": {
      const j = ctx.persistenceIndex ?? -1;
      return { kind: "persistence", j, fallback: mean(y) };
    }
    case "logistic": {
      const lambda = hp.lambda ?? 0.05;
      const pos = y.reduce((s, v) => s + v, 0);
      // Pesos balanceados: a classe rara pesa mais (evita "sempre prever a maioria").
      const w1 = pos > 0 ? n / (2 * pos) : 1;
      const w0 = n - pos > 0 ? n / (2 * (n - pos)) : 1;
      const w = new Array<number>(d).fill(0);
      let b = 0;
      for (let it = 0; it < 400; it++) {
        const gw = new Array<number>(d).fill(0);
        let gb = 0;
        for (let i = 0; i < n; i++) {
          let z = b;
          for (let j = 0; j < d; j++) z += w[j]! * X[i]![j]!;
          const err = (sigmoid(z) - y[i]!) * (y[i] ? w1 : w0);
          for (let j = 0; j < d; j++) gw[j]! += err * X[i]![j]!;
          gb += err;
        }
        for (let j = 0; j < d; j++) w[j]! -= 0.2 * (gw[j]! / n + lambda * w[j]!);
        b -= 0.2 * (gb / n);
      }
      return { kind: "linear", w: w.map((v) => round(v, 6)), b: round(b, 6), logistic: true };
    }
    case "linear":
    case "ridge": {
      // Mínimos quadrados com penalidade L2 (linear = penalidade desprezível). X já padronizado.
      const lambda = alg === "linear" ? 1e-6 : hp.lambda ?? 1;
      const my = mean(y);
      const A = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => X.reduce((s, r) => s + r[a]! * r[b]!, 0) + (a === b ? lambda : 0)));
      const v = Array.from({ length: d }, (_, a) => X.reduce((s, r, i) => s + r[a]! * (y[i]! - my), 0));
      const w = d ? solve(A, v) : [];
      return { kind: "linear", w: w.map((x) => round(x, 6)), b: round(my, 6), logistic: false };
    }
    case "naive_bayes": {
      const c1 = X.filter((_, i) => y[i] === 1);
      const c0 = X.filter((_, i) => y[i] === 0);
      const st = (rows: number[][]) => {
        const mu = Array.from({ length: d }, (_, j) => mean(rows.map((r) => r[j]!)));
        const v = Array.from({ length: d }, (_, j) => Math.max(0.05, mean(rows.map((r) => (r[j]! - mu[j]!) ** 2))));
        return { mu, v };
      };
      const s0 = st(c0.length ? c0 : X);
      const s1 = st(c1.length ? c1 : X);
      return { kind: "nb", prior: (c1.length + 1) / (n + 2), mu0: s0.mu, mu1: s1.mu, v0: s0.v, v1: s1.v };
    }
    case "knn":
      return { kind: "knn", k: Math.max(1, Math.min(n, Math.round(hp.k ?? 7))), X: X.map((r) => r.map((v) => round(v, 4))), y: [...y], classify };
    case "tree": {
      const leaf = (ix: number[]) => (classify ? (ix.reduce((s, i) => s + y[i]!, 0) + 1) / (ix.length + 2) : mean(ix.map((i) => y[i]!)));
      return { kind: "trees", trees: [growTree(X, y, X.map((_, i) => i), 0, hp.maxDepth ?? 3, hp.minLeaf ?? 5, null, 1, leaf)], init: 0, lr: 1, mode: "avg", classify };
    }
    case "random_forest": {
      const trees: Node[] = [];
      const leaf = (ix: number[]) => (classify ? (ix.reduce((s, i) => s + y[i]!, 0) + 1) / (ix.length + 2) : mean(ix.map((i) => y[i]!)));
      for (let t = 0; t < (hp.trees ?? 30); t++) {
        const boot = Array.from({ length: n }, () => Math.floor(rnd() * n));
        trees.push(growTree(X, y, boot, 0, hp.maxDepth ?? 4, 3, rnd, hp.featureFrac ?? 0.6, leaf));
      }
      return { kind: "trees", trees, init: 0, lr: 1, mode: "avg", classify };
    }
    case "gradient_boosting": {
      // Boosting por gradiente: resíduos em escala log-odds (classificação) ou do valor (regressão).
      const lr = hp.lr ?? 0.1;
      const pos = y.reduce((s, v) => s + v, 0);
      const init = classify ? Math.log((pos + 1) / (n - pos + 1)) : mean(y);
      const F = new Array<number>(n).fill(init);
      const trees: Node[] = [];
      for (let t = 0; t < (hp.trees ?? 50); t++) {
        const r = y.map((v, i) => v - (classify ? sigmoid(F[i]!) : F[i]!));
        const leaf = (ix: number[]) => {
          if (!classify) return mean(ix.map((i) => r[i]!));
          // Passo de Newton por folha (Friedman) para a perda logística.
          const num = ix.reduce((s, i) => s + r[i]!, 0);
          const den = ix.reduce((s, i) => s + sigmoid(F[i]!) * (1 - sigmoid(F[i]!)), 0);
          return Math.max(-4, Math.min(4, num / Math.max(1e-6, den)));
        };
        const tree = growTree(X, r, X.map((_, i) => i), 0, hp.maxDepth ?? 2, 4, null, 1, leaf);
        trees.push(tree);
        for (let i = 0; i < n; i++) F[i]! += lr * walk(tree, X[i]!);
      }
      return { kind: "trees", trees, init, lr, mode: "boost", classify };
    }
  }
}

export function fit(problem: Problem, alg: Alg, X: Row[], y: number[], hp: Hyper = {}, ctx: FitContext = {}): Fitted {
  const prep = fitPrep(X);
  const Z = X.map((r) => applyPrep(prep, r));
  return { problem, alg, hp, prep, params: fitParams(problem, alg, Z, X, y, hp, ctx) };
}

export function predictOne(m: Fitted, row: Row): number {
  const p = m.params;
  if (p.kind === "persistence") {
    const v = p.j >= 0 ? row[p.j] : null;
    return v === null || v === undefined || !Number.isFinite(v) ? p.fallback : v;
  }
  const x = applyPrep(m.prep, row);
  switch (p.kind) {
    case "const":
      return p.v;
    case "linear": {
      const z = p.b + p.w.reduce((s, w, j) => s + w * x[j]!, 0);
      return p.logistic ? sigmoid(z) : z;
    }
    case "nb": {
      let l1 = Math.log(p.prior);
      let l0 = Math.log(1 - p.prior);
      for (let j = 0; j < x.length; j++) {
        l1 += -0.5 * Math.log(2 * Math.PI * p.v1[j]!) - (x[j]! - p.mu1[j]!) ** 2 / (2 * p.v1[j]!);
        l0 += -0.5 * Math.log(2 * Math.PI * p.v0[j]!) - (x[j]! - p.mu0[j]!) ** 2 / (2 * p.v0[j]!);
      }
      return sigmoid(l1 - l0);
    }
    case "knn": {
      const near = p.X.map((r, i) => ({ d: Math.sqrt(r.reduce((s, v, j) => s + (v - x[j]!) ** 2, 0)), y: p.y[i]! }))
        .sort((a, b) => a.d - b.d)
        .slice(0, p.k);
      const wsum = near.reduce((s, q) => s + 1 / (q.d + 0.5), 0);
      const v = near.reduce((s, q) => s + q.y / (q.d + 0.5), 0) / wsum;
      return p.classify ? Math.min(0.97, Math.max(0.03, v)) : v;
    }
    case "trees": {
      if (p.mode === "avg") return mean(p.trees.map((t) => walk(t, x)));
      const F = p.init + p.lr * p.trees.reduce((s, t) => s + walk(t, x), 0);
      return p.classify ? sigmoid(F) : F;
    }
  }
}

/* ───────────────────────── métricas ───────────────────────── */

export interface RegMetrics {
  mae: number;
  rmse: number;
  r2: number | null;
  n: number;
}
export type Metrics = (ClassMetrics & { prAuc: number | null; logLoss: number }) | RegMetrics;

/** Precisão média (área sob a curva Precisão-Revocação). */
export function prAuc(y: number[], p: number[]): number | null {
  const pos = y.filter((v) => v === 1).length;
  if (!pos || pos === y.length) return null;
  const order = p.map((v, i) => ({ v, y: y[i]! })).sort((a, b) => b.v - a.v);
  let tp = 0;
  let ap = 0;
  order.forEach((o, k) => {
    if (o.y === 1) {
      tp++;
      ap += tp / (k + 1);
    }
  });
  return round(ap / pos);
}

export function regMetrics(y: number[], p: number[]): RegMetrics {
  const err = y.map((v, i) => v - p[i]!);
  const my = mean(y);
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const sse = err.reduce((s, e) => s + e * e, 0);
  return { mae: round(mean(err.map(Math.abs))), rmse: round(Math.sqrt(mean(err.map((e) => e * e)))), r2: sst > 1e-9 ? round(1 - sse / sst) : null, n: y.length };
}

export function metricsFor(problem: Problem, y: number[], p: number[]): Metrics {
  if (problem === "regression") return regMetrics(y, p);
  const ll = mean(y.map((v, i) => -(v * Math.log(Math.max(1e-6, p[i]!)) + (1 - v) * Math.log(Math.max(1e-6, 1 - p[i]!)))));
  return { ...classMetrics(y, p), prAuc: prAuc(y, p), logLoss: round(ll) };
}

export type Primary = "balanced_accuracy" | "brier" | "log_loss" | "mae" | "rmse";
/** Valor da métrica principal e se "maior é melhor". */
export function primaryValue(m: Metrics, primary: Primary): number {
  if ("mae" in m) return primary === "rmse" ? m.rmse : m.mae;
  if (primary === "brier") return m.brier;
  if (primary === "log_loss") return m.logLoss;
  return m.balancedAccuracy;
}
export const higherIsBetter = (primary: Primary) => primary === "balanced_accuracy";

/** Curva de calibração: probabilidade média prevista × frequência observada por faixa. */
export function calibrationBins(y: number[], p: number[], bins = 5) {
  return Array.from({ length: bins }, (_, b) => {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const ix = p.map((v, i) => i).filter((i) => p[i]! >= lo && (b === bins - 1 ? p[i]! <= hi : p[i]! < hi));
    return { from: round(lo, 2), to: round(hi, 2), n: ix.length, predicted: ix.length ? round(mean(ix.map((i) => p[i]!))) : null, observed: ix.length ? round(mean(ix.map((i) => y[i]!))) : null };
  });
}

/* ───────────────────────── validação temporal ───────────────────────── */

/** Dobras walk-forward (janela crescente). Treino sempre ANTES da validação. */
export function walkForward(n: number, k = 4, minTrain = 20): Array<{ train: number[]; val: number[] }> {
  const start = Math.max(minTrain, Math.floor(n * 0.4));
  const size = Math.floor((n - start) / k);
  if (size < 3) return [];
  return Array.from({ length: k }, (_, f) => {
    const vs = start + f * size;
    const ve = f === k - 1 ? n : vs + size;
    return { train: Array.from({ length: vs }, (_, i) => i), val: Array.from({ length: ve - vs }, (_, i) => vs + i) };
  });
}

/** Divide em desenvolvimento (passado) e holdout final (os dias mais recentes). */
export function temporalHoldout(n: number, pct = 0.2, min = 7) {
  const h = Math.max(min, Math.round(n * pct));
  return { dev: Array.from({ length: Math.max(0, n - h) }, (_, i) => i), test: Array.from({ length: Math.min(n, h) }, (_, i) => n - Math.min(n, h) + i) };
}

/** Combinações de hiperparâmetros: grade completa quando pequena, senão sorteio com semente. */
export function candidates(alg: Alg, mode: "grid" | "random" | "none", budget: number, seed: number): Hyper[] {
  const space = SPACES[alg];
  if (!space || mode === "none") return [DEFAULT_HP[alg] ?? {}];
  const keys = Object.keys(space);
  let all: Hyper[] = [{}];
  for (const k of keys) all = all.flatMap((h) => space[k]!.map((v) => ({ ...h, [k]: v })));
  if (mode === "grid" || all.length <= budget) return all;
  const rnd = mulberry32(seed);
  const picked = new Set<number>();
  while (picked.size < Math.min(budget, all.length)) picked.add(Math.floor(rnd() * all.length));
  return [...picked].sort((a, b) => a - b).map((i) => all[i]!);
}

export interface PipelineConfig {
  problem: Problem;
  algorithms: Alg[];
  folds: number;
  holdoutPct: number;
  search: "grid" | "random" | "none";
  searchBudget: number;
  primary: Primary;
  /** Melhora mínima sobre a linha de base (pontos da métrica principal; relativa para MAE/RMSE). */
  margin: number;
  seed: number;
  persistenceIndex: number | null;
  /** Orçamento de tempo da busca (ms); estourou, usa a configuração padrão restante. */
  timeBudgetMs: number;
}

export interface ArenaEntry {
  algorithm: Alg;
  label: string;
  hp: Hyper;
  cvMean: number;
  cvStd: number;
  foldScores: number[];
  cvMetrics: Metrics | null;
  trials: number;
  trainMs: number;
  isBaseline: boolean;
}

export interface PipelineResult {
  ok: boolean;
  reason: string | null;
  samples: { total: number; dev: number; test: number };
  arena: ArenaEntry[];
  reference: Alg | null;
  champion: Alg | null;
  selected: Alg | null;
  beatsBaseline: boolean;
  holdout: { model: Metrics; baseline: Metrics; n: number } | null;
  calibration: ReturnType<typeof calibrationBins> | null;
  residuals: { q10: number; q90: number } | null;
  importance: Array<{ index: number; importance: number }>;
  coefficients: number[] | null;
  leakage: number[];
  final: Fitted | null;
  log: string[];
}

function pearsonIdx(X: Row[], y: number[], j: number): number {
  const pts = X.map((r, i) => [r[j], y[i]] as const).filter((p): p is readonly [number, number] => p[0] !== null && p[0] !== undefined);
  if (pts.length < 5) return 0;
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  let a = 0;
  let b = 0;
  let c = 0;
  for (const [x, v] of pts) (a += (x - mx) * (v - my)), (b += (x - mx) ** 2), (c += (v - my) ** 2);
  return b && c ? a / Math.sqrt(b * c) : 0;
}

/** Executa o pipeline completo. Não toca no banco — puro e testável. */
export function runPipeline(X: Row[], y: number[], cfg: PipelineConfig): PipelineResult {
  const log: string[] = [];
  const t0 = Date.now();
  const empty = (reason: string): PipelineResult => ({ ok: false, reason, samples: { total: X.length, dev: 0, test: 0 }, arena: [], reference: null, champion: null, selected: null, beatsBaseline: false, holdout: null, calibration: null, residuals: null, importance: [], coefficients: null, leakage: [], final: null, log: [...log, reason] });
  const { dev, test } = temporalHoldout(X.length, cfg.holdoutPct);
  if (dev.length < 30) return empty(`Dados insuficientes: ${X.length} observações (mínimo 40 para separar treino, validação e teste).`);
  const devX = dev.map((i) => X[i]!);
  const devY = dev.map((i) => y[i]!);
  if (cfg.problem === "classification") {
    const pos = devY.filter((v) => v === 1).length;
    if (pos < 8 || devY.length - pos < 8) return empty(`Classes desbalanceadas demais para validar: ${pos} positivos × ${devY.length - pos} negativos no desenvolvimento (mínimo 8 de cada).`);
  } else if (std(devY) < 1e-9) return empty("O alvo não varia no período: não há o que prever.");
  log.push(`Linhas: ${X.length} (desenvolvimento ${dev.length}, holdout final ${test.length}).`);

  const folds = walkForward(dev.length, cfg.folds);
  if (!folds.length) return empty("Observações insuficientes para as dobras de validação temporal.");
  log.push(`Validação walk-forward: ${folds.length} dobras com treino sempre anterior à validação.`);

  const hb = higherIsBetter(cfg.primary);
  const better = (a: number, b: number) => (hb ? a > b : a < b);
  const ctx: FitContext = { persistenceIndex: cfg.persistenceIndex, seed: cfg.seed };
  const evalCv = (alg: Alg, hp: Hyper) => {
    const scores: number[] = [];
    const oofY: number[] = [];
    const oofP: number[] = [];
    for (const f of folds) {
      const ty = f.train.map((i) => devY[i]!);
      if (cfg.problem === "classification") {
        const pos = ty.reduce((s, v) => s + v, 0);
        if (pos === 0 || pos === ty.length) continue;
      }
      const m = fit(cfg.problem, alg, f.train.map((i) => devX[i]!), ty, hp, ctx);
      const vy = f.val.map((i) => devY[i]!);
      const vp = f.val.map((i) => predictOne(m, devX[i]!));
      oofY.push(...vy);
      oofP.push(...vp);
      scores.push(primaryValue(metricsFor(cfg.problem, vy, vp), cfg.primary));
    }
    return { scores, oofY, oofP };
  };

  const algs = [...new Set<Alg>(["baseline", ...(cfg.problem === "regression" && cfg.persistenceIndex !== null ? (["persistence"] as Alg[]) : []), ...cfg.algorithms])].filter((a) => ALGS_FOR[cfg.problem].includes(a));
  const arena: ArenaEntry[] = [];
  const oofBy = new Map<Alg, { y: number[]; p: number[] }>();
  for (const alg of algs) {
    const ts = Date.now();
    const cands = Date.now() - t0 > cfg.timeBudgetMs ? [DEFAULT_HP[alg] ?? {}] : candidates(alg, cfg.search, cfg.searchBudget, cfg.seed);
    let best: { hp: Hyper; scores: number[]; oofY: number[]; oofP: number[] } | null = null;
    for (const hp of cands) {
      const r = evalCv(alg, hp);
      if (!r.scores.length) continue;
      if (!best || better(mean(r.scores), mean(best.scores))) best = { hp, ...r };
    }
    if (!best) continue;
    oofBy.set(alg, { y: best.oofY, p: best.oofP });
    arena.push({
      algorithm: alg,
      label: ALG_LABEL[alg],
      hp: best.hp,
      cvMean: round(mean(best.scores)),
      cvStd: round(std(best.scores)),
      foldScores: best.scores.map((s) => round(s)),
      cvMetrics: best.oofY.length ? metricsFor(cfg.problem, best.oofY, best.oofP) : null,
      trials: cands.length,
      trainMs: Date.now() - ts,
      isBaseline: isBaseline(alg),
    });
    log.push(`${ALG_LABEL[alg]}: ${cands.length} configuração(ões) testada(s), média ${round(mean(best.scores))} (±${round(std(best.scores))}).`);
  }

  const baselines = arena.filter((a) => a.isBaseline);
  const reference = baselines.sort((a, b) => (better(a.cvMean, b.cvMean) ? -1 : 1))[0];
  if (!reference) return empty("A linha de base não pôde ser avaliada nas dobras.");
  const contenders = arena.filter((a) => !a.isBaseline).sort((a, b) => (better(a.cvMean, b.cvMean) ? -1 : better(b.cvMean, a.cvMean) ? 1 : a.cvStd - b.cvStd));
  const top = contenders[0] ?? null;
  // Campeão só se superar a referência com margem E na maioria das dobras.
  const improvement = top ? (hb ? top.cvMean - reference.cvMean : (reference.cvMean - top.cvMean) / Math.max(1e-9, Math.abs(reference.cvMean))) : 0;
  const foldWins = top ? top.foldScores.filter((s, i) => better(s, reference.foldScores[i] ?? (hb ? -Infinity : Infinity))).length : 0;
  // Teste t pareado nas dobras (vários algoritmos e configurações competem: sem isso, ruído vira "campeão").
  const diffs = top ? top.foldScores.map((s, i) => (hb ? s - (reference.foldScores[i] ?? 0) : (reference.foldScores[i] ?? 0) - s)) : [];
  const sdDiff = std(diffs) * Math.sqrt(diffs.length / Math.max(1, diffs.length - 1));
  const pairedT = diffs.length ? (sdDiff > 1e-9 ? mean(diffs) / (sdDiff / Math.sqrt(diffs.length)) : mean(diffs) > 0 ? Infinity : 0) : 0;
  const champion = top && improvement >= cfg.margin && foldWins > top.foldScores.length / 2 && pairedT >= 2 ? top.algorithm : null;
  log.push(
    champion
      ? `Campeão: ${ALG_LABEL[champion]} (melhora ${round(improvement, 3)} sobre ${reference.label}, venceu ${foldWins}/${top!.foldScores.length} dobras, t pareado ${Number.isFinite(pairedT) ? round(pairedT, 2) : "∞"}).`
      : `Nenhum modelo superou ${reference.label} com a margem e a consistência exigidas (melhora ${round(improvement, 3)}, t pareado ${Number.isFinite(pairedT) ? round(pairedT, 2) : "∞"}) — sem campeão superior.`,
  );

  const selected = champion ?? top?.algorithm ?? reference.algorithm;
  const selEntry = arena.find((a) => a.algorithm === selected)!;
  // Avaliação final no holdout (nunca usado na seleção acima).
  let holdout: PipelineResult["holdout"] = null;
  let calibration: PipelineResult["calibration"] = null;
  let devModel: Fitted | null = null;
  if (test.length) {
    devModel = fit(cfg.problem, selected, devX, devY, selEntry.hp, ctx);
    const refModel = fit(cfg.problem, reference.algorithm, devX, devY, reference.hp, ctx);
    const ty = test.map((i) => y[i]!);
    const tp = test.map((i) => predictOne(devModel!, X[i]!));
    const bp = test.map((i) => predictOne(refModel, X[i]!));
    holdout = { model: metricsFor(cfg.problem, ty, tp), baseline: metricsFor(cfg.problem, ty, bp), n: ty.length };
    if (cfg.problem === "classification") calibration = calibrationBins(ty, tp);
    log.push(`Holdout final (${ty.length} dias mais recentes): ${cfg.primary} modelo ${primaryValue(holdout.model, cfg.primary)} × base ${primaryValue(holdout.baseline, cfg.primary)}.`);
  }
  // No teste final o campeão também precisa superar a base pela margem (não basta empatar).
  const holdoutGain = holdout ? (hb ? primaryValue(holdout.model, cfg.primary) - primaryValue(holdout.baseline, cfg.primary) : (primaryValue(holdout.baseline, cfg.primary) - primaryValue(holdout.model, cfg.primary)) / Math.max(1e-9, Math.abs(primaryValue(holdout.baseline, cfg.primary)))) : 0;
  const beatsBaseline = !!champion && !!holdout && holdoutGain >= cfg.margin;
  if (champion && holdout && !beatsBaseline) log.push("O campeão da validação não manteve a vantagem no teste final — versão fica experimental.");

  // Incerteza da regressão: quantis empíricos dos resíduos fora da dobra.
  let residuals: PipelineResult["residuals"] = null;
  const oof = oofBy.get(selected);
  if (cfg.problem === "regression" && oof && oof.y.length >= 10) {
    const r = oof.y.map((v, i) => v - oof.p[i]!).sort((a, b) => a - b);
    const q = (f: number) => r[Math.min(r.length - 1, Math.max(0, Math.round(f * (r.length - 1))))]!;
    residuals = { q10: round(q(0.1)), q90: round(q(0.9)) };
  }

  // Importância por permutação no holdout (ou nas dobras, se o holdout for pequeno).
  const importance: PipelineResult["importance"] = [];
  const d = X[0]?.length ?? 0;
  if (devModel && test.length >= 10) {
    const rnd = mulberry32(cfg.seed + 7);
    const ty = test.map((i) => y[i]!);
    const base = primaryValue(metricsFor(cfg.problem, ty, test.map((i) => predictOne(devModel!, X[i]!))), cfg.primary);
    for (let j = 0; j < d; j++) {
      let drop = 0;
      for (let rep = 0; rep < 3; rep++) {
        const col = test.map((i) => X[i]![j]);
        for (let a = col.length - 1; a > 0; a--) {
          const b = Math.floor(rnd() * (a + 1));
          [col[a], col[b]] = [col[b]!, col[a]!];
        }
        const s = primaryValue(metricsFor(cfg.problem, ty, test.map((i, k) => predictOne(devModel!, X[i]!.map((v, c) => (c === j ? col[k]! : v))))), cfg.primary);
        drop += hb ? base - s : s - base;
      }
      importance.push({ index: j, importance: round(Math.max(0, drop / 3)) });
    }
  }

  const final = fit(cfg.problem, selected, X, y, selEntry.hp, ctx);
  const coefficients = final.params.kind === "linear" ? final.params.w : null;
  // Alerta de vazamento: variável quase idêntica ao alvo no desenvolvimento.
  const leakage = Array.from({ length: d }, (_, j) => j).filter((j) => j !== cfg.persistenceIndex && Math.abs(pearsonIdx(devX, devY, j)) >= 0.98);
  if (leakage.length) log.push(`Atenção: ${leakage.length} variável(is) quase idêntica(s) ao alvo — possível vazamento.`);
  log.push(`Modelo final reajustado em ${X.length} linhas em ${Date.now() - t0} ms.`);
  return { ok: true, reason: null, samples: { total: X.length, dev: dev.length, test: test.length }, arena, reference: reference.algorithm, champion, selected, beatsBaseline, holdout, calibration, residuals, importance, coefficients, leakage, final, log };
}

/* ───────────────────────── monitoramento ───────────────────────── */

/** Referência de distribuição (decis do treino) para o PSI. */
export function referenceBins(values: number[], bins = 5): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length < 10) return [];
  const edges: number[] = [];
  for (let b = 1; b < bins; b++) edges.push(v[Math.floor((b / bins) * (v.length - 1))]!);
  return [...new Set(edges)];
}

/**
 * Population Stability Index entre referência (treino) e janela recente (quintis do treino).
 * Limiares documentados: < 0,1 estável · 0,1–0,25 mudança moderada · > 0,25 mudança forte,
 * aplicados ao PSI acima do ruído esperado de amostra pequena (ver psiNoise).
 */
export function psi(reference: number[], edges: number[], recent: number[]): number | null {
  if (!edges.length || reference.length < 20 || recent.length < 20) return null;
  const bucket = (vals: number[]) => {
    const c = new Array<number>(edges.length + 1).fill(0);
    for (const x of vals) {
      let b = 0;
      while (b < edges.length && x > edges[b]!) b++;
      c[b]!++;
    }
    return c.map((n) => Math.max(1e-4, n / vals.length));
  };
  const a = bucket(reference);
  const b = bucket(recent);
  return round(a.reduce((s, p, i) => s + (b[i]! - p) * Math.log(b[i]! / p), 0), 3);
}

/** Ruído esperado do PSI só pelo tamanho das amostras (≈ (k−1)/n de cada lado). */
export function psiNoise(bins: number, nRef: number, nRecent: number): number {
  return round((bins - 1) / Math.max(1, nRecent) + (bins - 1) / Math.max(1, nRef), 3);
}

/** Teste z de duas proporções (mudança na taxa do alvo). */
export function twoProportionZ(p1: number, n1: number, p2: number, n2: number): number {
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? round((p2 - p1) / se, 3) : 0;
}
