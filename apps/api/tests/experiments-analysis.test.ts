import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { describe as describeStats, effect, recommendedDuration, tCritical90 } from "../src/services/experimentStats.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

describe("Estatística dos experimentos", () => {
  it("calcula efeito, faixa provável e evidência sem inventar com amostra pequena", () => {
    const before = describeStats([6.5, 6.8, 6.2, 7, 6.4, 6.6, 6.3]);
    const during = describeStats([7.4, 7.6, 7.1, 7.8, 7.2, 7.5, 7.3]);
    const e = effect(before, during, false);
    expect(e.evidence).toBe("strong");
    expect(e.ciLow!).toBeGreaterThan(0);
    expect(e.effectSize!).toBeGreaterThan(0.8);

    // Métrica inversa (estresse): aumentar é piorar → efeito favorável negativo.
    expect(effect(before, during, true).effectSize!).toBeLessThan(0);

    // Menos de 3 dias de um lado: nunca vira conclusão.
    expect(effect(describeStats([1, 2]), during, false).evidence).toBe("insufficient");
    expect(effect(describeStats([3, 3, 4, 3]), describeStats([3, 4, 3, 3]), false).evidence).toBe("none");
  });

  it("valor crítico t e duração recomendada", () => {
    expect(tCritical90(5)).toBeCloseTo(2.015, 1);
    expect(tCritical90(1000)).toBeCloseTo(1.645, 2);
    expect(recommendedDuration(6.5, 0.5)).toBe(7);
    expect(recommendedDuration(30, 25)).toBe(42);
    expect(recommendedDuration(null, null)).toBeNull();
  });
});

describe("GET /api/experiments/:id/analysis", () => {
  it("compara antes × durante, separa dias cumpridos e avalia o critério de sucesso", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    const startD = addDays(today, -6);
    const start = isoDate(startD);
    const end = isoDate(addDays(today, 7)); // 14 dias

    // Período anterior (14 dias antes do início): água ~1500 ml com pequena variação.
    for (let i = 1; i <= 14; i++) {
      await agent.post("/api/health/water").send({ amountMl: 1400 + (i % 3) * 100, recordedAt: `${isoDate(addDays(startD, -i))}T10:00:00.000Z` });
    }
    // Durante: dias cumpridos com ~2600 ml, não cumpridos com ~1600 ml.
    const created = await agent.post("/api/experiments").send({
      title: "Beber mais água",
      category: "hidratacao",
      startDate: start,
      endDate: end,
      primaryMetric: "water_ml",
      verificationType: "manual",
      successCriteriaType: "consistency",
      successCriteriaValue: 60,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    for (let i = 0; i <= 6; i++) {
      const day = isoDate(addDays(startD, i));
      const done = i !== 2 && i !== 5;
      await agent.post("/api/health/water").send({ amountMl: done ? 2500 + (i % 2) * 200 : 1600 + (i % 2) * 100, recordedAt: `${day}T10:00:00.000Z` });
      await agent.post(`/api/experiments/${id}/logs`).send({ logDate: day, checkinStatus: done ? "done" : "missed", perception: done ? "bom" : "neutro" });
    }

    const res = await agent.get(`/api/experiments/${id}/analysis`);
    expect(res.status).toBe(200);
    const primary = res.body.metrics.find((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary.metric).toBe("water_ml");
    expect(primary.before.n).toBe(14);
    expect(primary.during.n).toBe(7);
    expect(["strong", "moderate"]).toContain(primary.effect.evidence);
    expect(primary.adherence.doneDays).toBe(5);
    expect(primary.adherence.missedDays).toBe(2);
    expect(primary.adherence.favorableDiff).toBeGreaterThan(0);

    expect(res.body.verdict.tone).toBe("positive");
    expect(res.body.weekly.length).toBeGreaterThanOrEqual(1);
    expect(res.body.success.type).toBe("consistency");
    expect(["on_track", "at_risk"]).toContain(res.body.success.status);
    expect(res.body.perception.total).toBe(7);
    expect(res.body.streak.best).toBeGreaterThanOrEqual(2);
  });

  it("isola por usuário e devolve prévia de base para o assistente", async () => {
    const owner = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const created = await owner.agent.post("/api/experiments").send({
      title: "Teste",
      category: "sono",
      startDate: isoDate(new Date()),
      endDate: isoDate(addDays(new Date(), 13)),
      primaryMetric: "sleep_duration",
      verificationType: "manual",
    });
    const foreign = await other.agent.get(`/api/experiments/${created.body.id}/analysis`);
    expect(foreign.status).toBe(404);

    const preview = await owner.agent.get("/api/experiments/metrics/water_ml/baseline?days=28");
    expect(preview.status).toBe(200);
    expect(preview.body.daysWithData).toBe(0);
    expect(preview.body.sparkline).toHaveLength(28);
    expect(preview.body.recommendedDurationDays).toBeNull();

    const invalid = await owner.agent.get("/api/experiments/metrics/inventada/baseline");
    expect(invalid.status).toBe(400);
  });
});
