import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { classMetrics, crossValidate, rocAuc, runArena, timeFolds } from "../src/services/mlEngine.js";
import { rarityOf, levelFromXp } from "../src/services/intelligenceService.js";
import { balancedThreshold } from "../src/services/intelligenceDataset.js";

/** Semeia N dias em que dormir 7h+ na véspera leva a mais missões concluídas no dia. */
async function seedRoutine(userId: string, days = 75) {
  const db = getDb();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = days; i >= 1; i--) {
    const sleepH = 5 + rnd() * 4;
    await db.execute({
      sql: "INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes) VALUES (?, ?, datetime('now', ?, 'start of day', '+22 hours'), datetime('now', ?, 'start of day', '+30 hours'), ?)",
      args: [nanoid(), userId, `-${i + 1} days`, `-${i + 1} days`, Math.round(sleepH * 60)],
    });
    const done = sleepH >= 7 ? 3 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2);
    for (let k = 0; k < done; k++) {
      await db.execute({
        sql: "INSERT INTO tasks (id, owner_id, title, status, priority, completed_at, updated_at) VALUES (?, ?, 'Missão', 'Concluído', 'Média', datetime('now', ?, 'start of day', '+12 hours'), datetime('now', ?, 'start of day', '+12 hours'))",
        args: [nanoid(), userId, `-${i} days`, `-${i} days`],
      });
    }
  }
}

describe("mlEngine", () => {
  it("dobras temporais nunca treinam com o futuro", () => {
    for (const f of timeFolds(60)) expect(Math.max(...f.train)).toBeLessThan(Math.min(...f.val));
  });
  it("métricas: AUC perfeita e acurácia balanceada", () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    const m = classMetrics([0, 0, 1, 1], [0.1, 0.6, 0.8, 0.9]);
    expect(m.confusion).toEqual({ tp: 2, fp: 1, tn: 1, fn: 0 });
    expect(m.balancedAccuracy).toBe(0.75);
  });
  it("a arena encontra sinal real e a linha de base fica em ~50%", () => {
    const X = Array.from({ length: 80 }, (_, i) => [Math.sin(i * 1.7) * 3, (i * 37) % 11]);
    const y = X.map((r) => (r[0] > 0 ? 1 : 0));
    const { results, winner } = runArena(X, y);
    expect(winner).not.toBe("baseline");
    expect(results.find((r) => r.algorithm === "baseline")!.cvMean).toBe(0.5);
    expect(crossValidate("logistic", X, y)!.cvMean).toBeGreaterThan(0.85);
  });
  it("limiar pessoal equilibra os dias positivos e negativos", () => {
    expect(balancedThreshold([0, 1, 1, 2, 2, 3, 3, 4], 1)).toBe(2);
    expect(balancedThreshold([0, 0, 0, 0, 1], 1)).toBe(1);
    expect(balancedThreshold([30, 40, 60, 90, 120, 0], 25)).toBe(60);
  });

  it("raridade considera estabilidade e maturidade, não só acurácia", () => {
    const novo = rarityOf({ cvMean: 0.9, cvStd: 0.2 }, 1, 0, 40).rarity;
    const maduro = rarityOf({ cvMean: 0.9, cvStd: 0.02 }, 6, 90, 200).rarity;
    expect(["common", "uncommon", "rare"]).toContain(novo);
    expect(maduro).toBe("legendary");
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(240).level).toBe(3);
  });
});

describe("Forja da Inteligência (API)", () => {
  it("conta nova: visão geral vazia e forja recusada por falta de dados", async () => {
    const { agent } = await createAuthenticatedAgent();
    const ov = await agent.get("/api/intelligence/overview");
    expect(ov.status).toBe(200);
    expect(ov.body.artifacts).toEqual([]);
    expect(ov.body.prophecy).toBeNull();
    expect(ov.body.summary.avgAccuracy).toBeNull();
    const f = await agent.post("/api/intelligence/forge").send({ objective: "productivity" });
    expect(f.status).toBe(422);
  });

  it("forja com dados reais, gera profecia, reforja e isola por usuário", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await seedRoutine(userId);

    const g = await agent.post("/api/intelligence/grimoire/refresh");
    expect(g.status).toBe(200);
    expect(g.body.readiness.find((r: { objective: string }) => r.objective === "productivity").ready).toBe(true);
    expect(g.body.sources.find((s: { key: string }) => s.key === "sono").records).toBe(75);

    const f = await agent.post("/api/intelligence/forge").send({ objective: "productivity" });
    expect(f.status).toBe(201);
    expect(f.body.experiment.results).toHaveLength(5);
    expect(f.body.artifact.status).toBe("production");
    expect(f.body.artifact.metrics.cvMean).toBeGreaterThan(0.7);

    const detail = await agent.get(`/api/intelligence/artifacts/${f.body.artifact.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.importance[0].key).toBe("sleep_duration");
    expect(detail.body.importance[0].direction).toBe("positive");

    const ov = await agent.get("/api/intelligence/overview");
    expect(ov.body.summary.artifactsActive).toBe(1);
    expect(ov.body.arena.winner).toBe(f.body.experiment.winner);
    expect(typeof ov.body.prophecy.probability).toBe("number");
    expect(ov.body.runes.items.length).toBeGreaterThan(5);

    // Interpretabilidade: regras legíveis e "como a runa age".
    expect(detail.body.insights.rules.length).toBeGreaterThan(0);
    expect(detail.body.insights.rules[0].conditions[0].label).toBeTruthy();
    expect(detail.body.insights.pdp.length).toBeGreaterThan(0);
    // Alquimia: sem valores parte da véspera real; dormir mais aumenta a chance.
    const sim0 = await agent.post(`/api/intelligence/artifacts/${f.body.artifact.id}/simulate`).send({});
    expect(sim0.status).toBe(200);
    expect(typeof sim0.body.probability).toBe("number");
    const low = await agent.post(`/api/intelligence/artifacts/${f.body.artifact.id}/simulate`).send({ values: { ...sim0.body.values, sleep_duration: 5 } });
    const high = await agent.post(`/api/intelligence/artifacts/${f.body.artifact.id}/simulate`).send({ values: { ...sim0.body.values, sleep_duration: 8.5 } });
    expect(high.body.probability).toBeGreaterThan(low.body.probability);

    const re = await agent.post("/api/intelligence/forge").send({ objective: "productivity" });
    expect(re.body.artifact.trainings).toBe(2);
    expect(re.body.artifact.xp).toBeGreaterThan(f.body.artifact.xp);

    const other = await createAuthenticatedAgent();
    expect((await other.agent.get(`/api/intelligence/artifacts/${f.body.artifact.id}`)).status).toBe(404);
    const ov2 = await other.agent.get("/api/intelligence/overview");
    expect(ov2.body.artifacts).toEqual([]);
    expect((await other.agent.get("/api/intelligence/experiments")).body).toEqual([]);
    expect((await other.agent.post(`/api/intelligence/artifacts/${f.body.artifact.id}/simulate`).send({})).status).toBe(404);
  }, 60_000);

  it("valida o objetivo", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/intelligence/forge").send({ objective: "x" })).status).toBe(400);
  });
});

describe("Forja sem o módulo Foco", () => {
  it("modelos antigos (14 runas) leem a runa de foco como ausente", async () => {
    const { FEATURES, rowForModel, effectsForFeatures } = await import("../src/services/intelligenceDataset.js");
    const row = FEATURES.map((_, j) => j + 1);
    const legacy = { prep: { mean: new Array(FEATURES.length + 1).fill(0) } };
    const adapted = rowForModel(legacy, row);
    expect(adapted).toHaveLength(FEATURES.length + 1);
    expect(adapted[7]).toBeNull(); // posição antiga de focus_minutes
    expect(adapted.filter((v) => v !== null)).toHaveLength(FEATURES.length);
    const back = effectsForFeatures(legacy, adapted.map((v) => v ?? 99));
    expect(back).toEqual(row);
    expect(rowForModel({ prep: { mean: new Array(FEATURES.length).fill(0) } }, row)).toBe(row);
  });

  it("artefato de Foco antigo some da Forja e o objetivo Treino pode ser forjado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO ml_artifacts (id, owner_id, objective, algorithm, status, xp, trainings, samples, metrics_json, model_json, importance_json, insights_json)
            VALUES (?, ?, 'focus', 'baseline', 'production', 10, 1, 30, '{}', '{}', '[]', '{}')`,
      args: [nanoid(), userId],
    });
    const ov = await agent.get("/api/intelligence/overview");
    expect(ov.status).toBe(200);
    expect(ov.body.artifacts).toHaveLength(0);
    expect(ov.body.objectives.map((o: { key: string }) => o.key)).toContain("training");
    expect(ov.body.objectives.map((o: { key: string }) => o.key)).not.toContain("focus");
    expect((await agent.post("/api/intelligence/forge").send({ objective: "focus" })).status).toBe(400);
  });
});

describe("Grimório salvo por versão anterior", () => {
  it("snapshot com área/objetivo de Foco é recalculado ao abrir a Forja", async () => {
    const { isStaleGrimoire } = await import("../src/services/intelligenceService.js");
    expect(isStaleGrimoire({ areas: [{ key: "foco", label: "Foco", days: 0, active: false }], readiness: [] } as never)).toBe(true);

    const { agent, userId } = await createAuthenticatedAgent();
    const old = {
      rangeFrom: null, rangeTo: "2026-10-01", records: 0, features: 14, daysObserved: 0, sources: [], qualityScore: null, missingRate: null, outlierRate: null,
      areas: ["metas", "habitos", "saude", "educacao", "foco", "energia"].map((key) => ({ key, label: key, days: 0, active: false })),
      corePower: 0, readiness: [{ objective: "focus" }], featureCoverage: [],
    };
    await getDb().execute({ sql: "INSERT INTO ml_grimoire_snapshots (owner_id, summary_json, updated_at) VALUES (?, ?, datetime('now'))", args: [userId, JSON.stringify(old)] });
    const ov = await agent.get("/api/intelligence/overview");
    expect(ov.status).toBe(200);
    const keys = ov.body.core.areas.map((a: { key: string }) => a.key);
    expect(keys).toContain("treino");
    expect(keys).not.toContain("foco");
    expect(ov.body.grimoire.readiness.map((r: { objective: string }) => r.objective)).not.toContain("focus");
  });
});
