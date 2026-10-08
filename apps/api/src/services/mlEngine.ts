/**
 * Motor de Machine Learning da Forja da Inteligência — TypeScript puro,
 * sem dependências, pensado para dezenas a poucas centenas de dias de dados
 * de UM usuário. Tudo aqui é determinístico (RNG com semente) e testável.
 *
 * Decisões importantes:
 * - Validação temporal (janelas crescentes): o modelo nunca "vê o futuro".
 * - Imputação e padronização são ajustadas só no treino de cada dobra.
 * - "Equilíbrio" = acurácia balanceada; "Confiança" = Brier Skill Score
 *   (quanto o modelo é mais bem calibrado que sempre chutar a taxa-base).
 *   Assim um modelo que só acerta "por acaso" fica perto de 50% / 0%.
 */

export type AlgorithmId = "baseline" | "logistic" | "naive_bayes" | "knn" | "tree";
export const ALGORITHMS: AlgorithmId[] = ["baseline", "logistic", "naive_bayes", "knn", "tree"];
export const ALGORITHM_LABEL: Record<AlgorithmId, string> = {
  baseline: "Linha de base (taxa-base)",
  logistic: "Regressão Logística",
  naive_bayes: "Naive Bayes Gaussiano",
  knn: "k-Vizinhos (k-NN)",
  tree: "Árvore de Decisão",
};

/** Linha de dados: valores podem faltar (null = dia sem registro daquela runa). */
export type Row = Array<number | null>;

interface Prep {
  mean: number[];
  std: number[];
}

type TreeNode = { leaf: true; p: number; n: number } | { leaf: false; f: number; t: number; l: TreeNode; r: TreeNode };

export type ModelParams =
  | { alg: "baseline"; p: number }
  | { alg: "logistic"; w: number[]; b: number }
  | { alg: "naive_bayes"; prior: number; mu0: number[]; mu1: number[]; v0: number[]; v1: number[] }
  | { alg: "knn"; k: number; X: number[][]; y: number[] }
  | { alg: "tree"; root: TreeNode };

/** Modelo pronto para uso: parâmetros + a preparação dos dados (imputação/padronização) do treino. */
export interface FittedModel {
  prep: Prep;
  params: ModelParams;
}

export interface ClassMetrics {
  accuracy: number;
  balancedAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  brier: number;
  /** Brier Skill Score em [0,1] — 0 = não melhor que a taxa-base. */
  confidence: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  n: number;
}

export interface CvResult {
  algorithm: AlgorithmId;
  metrics: ClassMetrics;
  cvMean: number;
  cvStd: number;
  folds: number;
}

/* ---------------- utilidades ---------------- */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** Média/desvio por coluna ignorando nulos (desvio 1 quando a coluna é constante). */
export function fitPrep(X: Row[]): Prep {
  const cols = X[0]?.length ?? 0;
  const m: number[] = [];
  const s: number[] = [];
  for (let j = 0; j < cols; j++) {
    const vals = X.map((r) => r[j]).filter((v): v is number => v !== null && Number.isFinite(v));
    const mu = mean(vals);
    const sd = Math.sqrt(mean(vals.map((v) => (v - mu) ** 2)));
    m.push(vals.length ? mu : 0);
    s.push(sd > 1e-9 ? sd : 1);
  }
  return { mean: m, std: s };
}

/** Imputa pela média do treino e padroniza (z-score). */
export function applyPrep(prep: Prep, row: Row): number[] {
  return row.map((v, j) => ((v === null || !Number.isFinite(v) ? prep.mean[j] : v) - prep.mean[j]) / prep.std[j]);
}

/* ---------------- algoritmos ---------------- */

function fitLogistic(X: number[][], y: number[]): ModelParams {
  const n = X.length;
  const d = X[0].length;
  const pos = y.reduce((s, v) => s + v, 0);
  // Pesos balanceados: a classe rara pesa mais (evita "sempre prever a maioria").
  const w1 = pos > 0 ? n / (2 * pos) : 1;
  const w0 = n - pos > 0 ? n / (2 * (n - pos)) : 1;
  const w = new Array<number>(d).fill(0);
  let b = 0;
  const lambda = 0.05;
  const lr = 0.2;
  for (let it = 0; it < 500; it++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const err = (sigmoid(z) - y[i]) * (y[i] ? w1 : w0);
      for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + lambda * w[j]);
    b -= lr * (gb / n);
  }
  return { alg: "logistic", w: w.map((v) => round(v, 6)), b: round(b, 6) };
}

function fitNaiveBayes(X: number[][], y: number[]): ModelParams {
  const d = X[0].length;
  const c1 = X.filter((_, i) => y[i] === 1);
  const c0 = X.filter((_, i) => y[i] === 0);
  const stats = (rows: number[][]) => {
    const mu = Array.from({ length: d }, (_, j) => mean(rows.map((r) => r[j])));
    const v = Array.from({ length: d }, (_, j) => Math.max(0.05, mean(rows.map((r) => (r[j] - mu[j]) ** 2))));
    return { mu, v };
  };
  const s0 = stats(c0.length ? c0 : X);
  const s1 = stats(c1.length ? c1 : X);
  return { alg: "naive_bayes", prior: (c1.length + 1) / (X.length + 2), mu0: s0.mu, mu1: s1.mu, v0: s0.v, v1: s1.v };
}

function fitKnn(X: number[][], y: number[]): ModelParams {
  const k = Math.max(3, Math.min(9, Math.round(Math.sqrt(X.length) / 2) * 2 + 1));
  return { alg: "knn", k, X: X.map((r) => r.map((v) => round(v, 4))), y };
}

function gini(pos: number, n: number) {
  if (n === 0) return 0;
  const p = pos / n;
  return 1 - p * p - (1 - p) * (1 - p);
}

function buildTree(X: number[][], y: number[], idx: number[], depth: number): TreeNode {
  const n = idx.length;
  const pos = idx.reduce((s, i) => s + y[i], 0);
  const leaf: TreeNode = { leaf: true, p: (pos + 1) / (n + 2), n };
  if (depth >= 3 || n < 12 || pos === 0 || pos === n) return leaf;
  const parent = gini(pos, n);
  let best: { f: number; t: number; gain: number } | null = null;
  const d = X[0].length;
  for (let f = 0; f < d; f++) {
    const vals = [...new Set(idx.map((i) => X[i][f]))].sort((a, b) => a - b);
    if (vals.length < 2) continue;
    const step = Math.max(1, Math.floor(vals.length / 16));
    for (let q = step; q < vals.length; q += step) {
      const t = (vals[q - 1] + vals[q]) / 2;
      let ln = 0;
      let lp = 0;
      for (const i of idx) if (X[i][f] <= t) (ln++, (lp += y[i]));
      const rn = n - ln;
      if (ln < 5 || rn < 5) continue;
      const gain = parent - (ln / n) * gini(lp, ln) - (rn / n) * gini(pos - lp, rn);
      if (!best || gain > best.gain) best = { f, t, gain };
    }
  }
  if (!best || best.gain < 1e-4) return leaf;
  const li = idx.filter((i) => X[i][best!.f] <= best!.t);
  const ri = idx.filter((i) => X[i][best!.f] > best!.t);
  return { leaf: false, f: best.f, t: round(best.t, 4), l: buildTree(X, y, li, depth + 1), r: buildTree(X, y, ri, depth + 1) };
}

export function fitParams(alg: AlgorithmId, X: number[][], y: number[]): ModelParams {
  switch (alg) {
    case "baseline":
      return { alg, p: (y.reduce((s, v) => s + v, 0) + 1) / (y.length + 2) };
    case "logistic":
      return fitLogistic(X, y);
    case "naive_bayes":
      return fitNaiveBayes(X, y);
    case "knn":
      return fitKnn(X, y);
    case "tree":
      return { alg, root: buildTree(X, y, X.map((_, i) => i), 0) };
  }
}

/** Probabilidade da classe positiva para uma linha JÁ padronizada. */
export function predictParams(params: ModelParams, x: number[]): number {
  switch (params.alg) {
    case "baseline":
      return params.p;
    case "logistic":
      return sigmoid(params.b + params.w.reduce((s, w, j) => s + w * x[j], 0));
    case "naive_bayes": {
      let l1 = Math.log(params.prior);
      let l0 = Math.log(1 - params.prior);
      for (let j = 0; j < x.length; j++) {
        l1 += -0.5 * Math.log(2 * Math.PI * params.v1[j]) - (x[j] - params.mu1[j]) ** 2 / (2 * params.v1[j]);
        l0 += -0.5 * Math.log(2 * Math.PI * params.v0[j]) - (x[j] - params.mu0[j]) ** 2 / (2 * params.v0[j]);
      }
      return sigmoid(l1 - l0);
    }
    case "knn": {
      const dist = params.X.map((r, i) => ({ d: Math.sqrt(r.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)), y: params.y[i] }));
      dist.sort((a, b) => a.d - b.d);
      const near = dist.slice(0, params.k);
      const wsum = near.reduce((s, p) => s + 1 / (p.d + 0.5), 0);
      const p = near.reduce((s, p) => s + p.y / (p.d + 0.5), 0) / wsum;
      return Math.min(0.97, Math.max(0.03, p));
    }
    case "tree": {
      let node = params.root;
      while (!node.leaf) node = x[node.f] <= node.t ? node.l : node.r;
      return node.p;
    }
  }
}

export function fitModel(alg: AlgorithmId, X: Row[], y: number[]): FittedModel {
  const prep = fitPrep(X);
  return { prep, params: fitParams(alg, X.map((r) => applyPrep(prep, r)), y) };
}

export function predict(model: FittedModel, row: Row): number {
  return predictParams(model.params, applyPrep(model.prep, row));
}

/* ---------------- métricas ---------------- */

export function rocAuc(y: number[], p: number[]): number | null {
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  if (!pos || !neg) return null;
  // Mann–Whitney com média de postos para empates.
  const order = p.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(p.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    for (let k = i; k <= j; k++) ranks[order[k].i] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const sumPos = y.reduce((s, v, i) => s + (v === 1 ? ranks[i] : 0), 0);
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function classMetrics(y: number[], p: number[]): ClassMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  y.forEach((v, i) => {
    const hat = p[i] >= 0.5 ? 1 : 0;
    if (hat === 1 && v === 1) tp++;
    else if (hat === 1) fp++;
    else if (v === 1) fn++;
    else tn++;
  });
  const n = y.length || 1;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const spec = tn + fp ? tn / (tn + fp) : 0;
  const brier = mean(y.map((v, i) => (p[i] - v) ** 2));
  const base = mean(y);
  const ref = base * (1 - base);
  return {
    accuracy: round((tp + tn) / n),
    balancedAccuracy: round((recall + spec) / 2),
    precision: round(precision),
    recall: round(recall),
    f1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    rocAuc: (() => {
      const a = rocAuc(y, p);
      return a === null ? null : round(a);
    })(),
    brier: round(brier),
    confidence: round(ref > 0 ? Math.max(0, 1 - brier / ref) : 0),
    confusion: { tp, fp, tn, fn },
    n: y.length,
  };
}

/* ---------------- validação temporal ---------------- */

/** Dobras de janela crescente: treino = tudo antes, validação = bloco seguinte. Linhas já em ordem cronológica. */
export function timeFolds(n: number, k = 4): Array<{ train: number[]; val: number[] }> {
  const start = Math.max(15, Math.floor(n * 0.4));
  const size = Math.floor((n - start) / k);
  if (size < 3) return [];
  return Array.from({ length: k }, (_, f) => {
    const vs = start + f * size;
    const ve = f === k - 1 ? n : vs + size;
    return { train: Array.from({ length: vs }, (_, i) => i), val: Array.from({ length: ve - vs }, (_, i) => vs + i) };
  });
}

export interface CvRun extends CvResult {
  /** Previsões fora da dobra (índice da linha → probabilidade), usadas na importância. */
  oof: Map<number, number>;
}

export function crossValidate(alg: AlgorithmId, X: Row[], y: number[], k = 4): CvRun | null {
  const folds = timeFolds(X.length, k);
  const oof = new Map<number, number>();
  const perFold: number[] = [];
  for (const f of folds) {
    const ty = f.train.map((i) => y[i]);
    const pos = ty.reduce((s, v) => s + v, 0);
    if (pos === 0 || pos === ty.length) continue;
    const m = fitModel(alg, f.train.map((i) => X[i]), ty);
    const vp = f.val.map((i) => predict(m, X[i]));
    f.val.forEach((i, j) => oof.set(i, vp[j]));
    perFold.push(classMetrics(f.val.map((i) => y[i]), vp).balancedAccuracy);
  }
  if (!perFold.length) return null;
  const idx = [...oof.keys()];
  const metrics = classMetrics(idx.map((i) => y[i]), idx.map((i) => oof.get(i)!));
  const mu = mean(perFold);
  const sd = Math.sqrt(mean(perFold.map((v) => (v - mu) ** 2)));
  return { algorithm: alg, metrics, cvMean: round(mu), cvStd: round(sd), folds: perFold.length, oof };
}

/** Arena: todos os algoritmos na mesma validação. Vencedor = maior acurácia balanceada (desempate: Brier). */
export function runArena(X: Row[], y: number[]): { results: CvRun[]; winner: AlgorithmId | null } {
  const results = ALGORITHMS.map((a) => crossValidate(a, X, y)).filter((r): r is CvRun => r !== null);
  const ranked = [...results].sort((a, b) => b.cvMean - a.cvMean || b.metrics.balancedAccuracy - a.metrics.balancedAccuracy || a.metrics.brier - b.metrics.brier);
  return { results, winner: ranked[0]?.algorithm ?? null };
}

/* ---------------- explicabilidade ---------------- */

const logLoss = (y: number[], p: number[]) => mean(y.map((v, i) => -(v * Math.log(Math.max(1e-6, p[i])) + (1 - v) * Math.log(Math.max(1e-6, 1 - p[i])))));

/**
 * Importância por permutação nas dobras temporais (quanto a perda logarítmica
 * piora ao embaralhar cada runa). Devolve participação relativa (soma 1).
 */
export function permutationImportance(alg: AlgorithmId, X: Row[], y: number[], seed = 42): number[] {
  const d = X[0]?.length ?? 0;
  const acc = new Array<number>(d).fill(0);
  const rnd = mulberry32(seed);
  for (const f of timeFolds(X.length)) {
    const ty = f.train.map((i) => y[i]);
    const pos = ty.reduce((s, v) => s + v, 0);
    if (pos === 0 || pos === ty.length) continue;
    const m = fitModel(alg, f.train.map((i) => X[i]), ty);
    const vy = f.val.map((i) => y[i]);
    const base = logLoss(vy, f.val.map((i) => predict(m, X[i])));
    for (let j = 0; j < d; j++) {
      let drop = 0;
      for (let rep = 0; rep < 3; rep++) {
        const col = f.val.map((i) => X[i][j]);
        for (let a = col.length - 1; a > 0; a--) {
          const b = Math.floor(rnd() * (a + 1));
          [col[a], col[b]] = [col[b], col[a]];
        }
        const pp = f.val.map((i, k) => predict(m, X[i].map((v, c) => (c === j ? col[k] : v))));
        drop += logLoss(vy, pp) - base;
      }
      acc[j] += Math.max(0, drop / 3);
    }
  }
  const total = acc.reduce((s, v) => s + v, 0);
  return total > 0 ? acc.map((v) => round(v / total)) : acc.map(() => 0);
}

/**
 * Explicação local por oclusão: efeito de cada runa = p(x) − p(x com a runa na
 * média do treino). Funciona para qualquer algoritmo; runas ausentes têm efeito 0.
 */
export function localEffects(model: FittedModel, row: Row): { p: number; effects: number[] } {
  const p = predict(model, row);
  const effects = row.map((v, j) => (v === null ? 0 : round(p - predict(model, row.map((u, c) => (c === j ? null : u))))));
  return { p: round(p), effects };
}

/** Correlação de Pearson ignorando nulos (sinal = direção da relação runa × alvo). */
export function pearson(xs: Array<number | null>, ys: number[]): number {
  const pairs = xs.map((x, i) => [x, ys[i]] as const).filter((p): p is readonly [number, number] => p[0] !== null);
  if (pairs.length < 3) return 0;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? round(sxy / Math.sqrt(sxx * syy)) : 0;
}
