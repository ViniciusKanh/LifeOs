import { describe, expect, it } from "vitest";
import { calibrationBins, candidates, fit, hashOf, metricsFor, predictOne, prAuc, psi, psiNoise, referenceBins, regMetrics, runPipeline, temporalHoldout, walkForward, type PipelineConfig } from "../src/services/forgeEngine.js";
import { buildMatrix, inferenceRow, TARGETS, type Day } from "../src/services/forgeDataset.js";
import { freeWindows } from "../src/services/tavern3Service.js";

const cfg = (over: Partial<PipelineConfig> = {}): PipelineConfig => ({ problem: "classification", algorithms: ["logistic", "tree", "random_forest", "gradient_boosting", "naive_bayes", "knn"], folds: 4, holdoutPct: 0.2, search: "random", searchBudget: 3, primary: "balanced_accuracy", margin: 0.03, seed: 1, persistenceIndex: null, timeBudgetMs: 20000, ...over });

/** Série sintética com sinal: y = 1 quando x0 > 0 (com ruído determinístico). */
function synth(n: number, seed = 3) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const X: Array<Array<number | null>> = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * 2 - 1;
    X.push([a, r(), r() < 0.1 ? null : r()]);
    y.push(a + (r() - 0.5) * 0.3 > 0 ? 1 : 0);
  }
  return { X, y };
}

const day = (date: string, v: Partial<Day["v"]>): Day => ({
  date,
  v: { sleep_duration: null, sleep_quality: null, energy: null, mood: null, stress: null, water_ml: 0, exercise_minutes: 0, study_minutes: 0, reading_pages: 0, tasks_completed: 0, focus_minutes: 0, habits_done: 0, ...v },
});
const dates = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

describe("Forja 3.0 — divisão temporal", () => {
  it("holdout são os dias mais recentes e as dobras treinam só no passado", () => {
    const h = temporalHoldout(100, 0.2);
    expect(h.test[0]).toBe(80);
    expect(h.dev.at(-1)).toBe(79);
    for (const f of walkForward(80, 4)) expect(Math.max(...f.train)).toBeLessThan(Math.min(...f.val));
  });
  it("imputação/padronização são ajustadas só no treino", () => {
    const m = fit("classification", "logistic", [[0], [2]], [0, 1]);
    expect(m.prep.mean[0]).toBe(1);
    predictOne(m, [100]);
    expect(m.prep.mean[0]).toBe(1);
  });
});

describe("Forja 3.0 — sem vazamento no dataset", () => {
  it("variáveis do dia D usam só D−h", () => {
    const ds = dates(10).map((d, i) => day(d, { exercise_minutes: i === 5 ? 999 : 0 }));
    const target = TARGETS.find((t) => t.key === "tasks_count")!;
    const m = buildMatrix(ds, target, 1, ["exercise_minutes__lag"], "2026-01-11");
    const idxDay5 = m.dates.indexOf(ds[5]!.date);
    const idxDay6 = m.dates.indexOf(ds[6]!.date);
    expect(m.X[idxDay5]![0]).toBe(0);
    expect(m.X[idxDay6]![0]).toBe(999);
    const m3 = buildMatrix(ds, target, 3, ["exercise_minutes__lag"], "2026-01-11");
    expect(m3.X[m3.dates.indexOf(ds[8]!.date)]![0]).toBe(999);
  });
  it("o dia corrente nunca entra no treino", () => {
    const ds = dates(10).map((d) => day(d, { tasks_completed: 2 }));
    const m = buildMatrix(ds, TARGETS.find((t) => t.key === "tasks_count")!, 1, ["weekend"], ds[9]!.date);
    expect(m.dates).not.toContain(ds[9]!.date);
  });
  it("inferência sem histórico suficiente não inventa previsão", () => {
    expect(inferenceRow([], ["weekend"], 1, "2026-01-02", "2026-01-01")).toBeNull();
    const inf = inferenceRow([day("2026-01-01", {})], ["weekend"], 1, "2026-01-02", "2026-01-01");
    expect(inf?.partial).toBe(true);
  });
});

describe("Forja 3.0 — pipeline", () => {
  it("encontra sinal real, supera a base e é reprodutível com a mesma semente", () => {
    const { X, y } = synth(160);
    const a = runPipeline(X, y, cfg());
    const b = runPipeline(X, y, cfg());
    expect(a.ok).toBe(true);
    expect(a.champion).not.toBeNull();
    expect(a.beatsBaseline).toBe(true);
    expect(a.arena.find((e) => e.algorithm === "baseline")).toBeTruthy();
    expect(a.holdout!.n).toBe(32);
    expect(JSON.stringify(a.arena.map((e) => e.cvMean))).toBe(JSON.stringify(b.arena.map((e) => e.cvMean)));
    expect(hashOf(a.final)).toBe(hashOf(b.final));
  });
  it("sem sinal: não declara campeão superior", () => {
    let s = 9;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const X = Array.from({ length: 160 }, () => [r(), r()]);
    const y = X.map(() => (r() < 0.5 ? 1 : 0));
    const res = runPipeline(X, y, cfg());
    expect(res.ok).toBe(true);
    expect(res.beatsBaseline).toBe(false);
  });
  it("amostra insuficiente ou classe ausente vira estado honesto", () => {
    const { X, y } = synth(30);
    expect(runPipeline(X, y, cfg()).ok).toBe(false);
    const big = synth(120);
    const res = runPipeline(big.X, big.y.map(() => 1), cfg());
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Classes/);
  });
  it("regressão com linha de base de persistência e intervalo empírico", () => {
    const X = Array.from({ length: 120 }, (_, i) => [Math.sin(i / 5), i % 7]);
    const y = X.map((r) => 3 * r[0]! + 1);
    const res = runPipeline(X, y, cfg({ problem: "regression", algorithms: ["linear", "ridge", "random_forest"], primary: "mae", margin: 0.05, persistenceIndex: 0 }));
    expect(res.ok).toBe(true);
    expect(res.arena.some((e) => e.algorithm === "persistence")).toBe(true);
    expect(res.residuals).not.toBeNull();
    expect((res.holdout!.model as { mae: number }).mae).toBeLessThan(0.2);
  });
  it("modelo persistido (JSON) prevê igual ao original", () => {
    const { X, y } = synth(80);
    for (const alg of ["logistic", "random_forest", "gradient_boosting", "knn", "naive_bayes", "tree"] as const) {
      const m = fit("classification", alg, X, y, {}, { seed: 2 });
      const back = JSON.parse(JSON.stringify(m));
      expect(predictOne(back, X[5]!)).toBeCloseTo(predictOne(m, X[5]!), 10);
    }
  });
  it("busca de hiperparâmetros é determinística e respeita o orçamento", () => {
    expect(candidates("tree", "random", 3, 5)).toEqual(candidates("tree", "random", 3, 5));
    expect(candidates("tree", "random", 3, 5)).toHaveLength(3);
    expect(candidates("tree", "grid", 3, 5)).toHaveLength(6);
  });
});

describe("Forja 3.0 — métricas", () => {
  it("regressão: MAE, RMSE e R² conhecidos", () => {
    const m = regMetrics([1, 2, 3], [1, 2, 4]);
    expect(m.mae).toBeCloseTo(0.3333, 3);
    expect(m.rmse).toBeCloseTo(0.5774, 3);
    expect(m.r2).toBeCloseTo(0.5, 3);
  });
  it("classificação: PR-AUC perfeita e calibração por faixas", () => {
    expect(prAuc([1, 0, 1, 0], [0.9, 0.1, 0.8, 0.2])).toBe(1);
    const bins = calibrationBins([1, 0], [0.95, 0.05]);
    expect(bins[4]!.observed).toBe(1);
    expect(bins[0]!.observed).toBe(0);
    const cm = metricsFor("classification", [1, 0, 1, 0], [0.9, 0.1, 0.2, 0.8]);
    expect("balancedAccuracy" in cm && cm.balancedAccuracy).toBe(0.5);
  });
  it("PSI: distribuição igual ≈ 0, deslocada > limiar, e ruído esperado documentado", () => {
    const ref = Array.from({ length: 200 }, (_, i) => i % 50);
    const edges = referenceBins(ref);
    expect(psi(ref, edges, ref.slice(0, 50))!).toBeLessThan(0.1);
    expect(psi(ref, edges, Array.from({ length: 50 }, () => 49))!).toBeGreaterThan(0.25);
    expect(psi(ref, edges, [1, 2])).toBeNull();
    expect(psiNoise(5, 200, 40)).toBeCloseTo(0.12, 2);
  });
});

describe("Taverna 3.0", () => {
  it("janelas livres respeitam a agenda real", () => {
    const w = freeWindows([{ start: 9 * 60, end: 12 * 60 }]);
    expect(w[0]).toEqual({ start: "08:00", end: "08:50" });
    expect(w[1]).toEqual({ start: "12:00", end: "12:50" });
    expect(freeWindows([{ start: 8 * 60, end: 20 * 60 }])).toEqual([]);
  });
});
