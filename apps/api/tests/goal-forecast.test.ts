import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import {
  computeGoalForecast,
  classifyGoalForecastStatus,
  computeRequiredPace,
  computeExpectedProgressPct,
} from "../src/services/goalForecastService.js";
import { computeGoalRiskScore, classifyGoalRisk } from "../src/services/goalRiskService.js";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

describe("Goal Forecast — cálculo de previsão (unitário)", () => {
  const baseGoal = { kind: "numeric" as const, status: "active" as const, targetValue: 12, currentValue: 5, dueDate: null };

  it("com ritmo válido, projeta uma data de conclusão", () => {
    const progress = [
      { value: 2, recordedAt: daysAgo(60) },
      { value: 5, recordedAt: daysAgo(0) },
    ];
    const { forecast, reason } = computeGoalForecast(baseGoal, progress);
    expect(reason).toBeNull();
    expect(forecast).not.toBeNull();
    expect(forecast!.ratePerDay).toBeGreaterThan(0);
  });

  it("ritmo zero ou negativo não gera previsão", () => {
    const progress = [
      { value: 5, recordedAt: daysAgo(30) },
      { value: 5, recordedAt: daysAgo(0) },
    ];
    const { forecast, reason } = computeGoalForecast(baseGoal, progress);
    expect(forecast).toBeNull();
    expect(reason).toMatch(/ritmo atual não indica avanço/);
  });

  it("meta concluída não projeta e é classificada como completed", () => {
    const goal = { ...baseGoal, status: "done" as const };
    const { forecast, reason } = computeGoalForecast(goal, []);
    expect(forecast).toBeNull();
    expect(reason).toMatch(/já concluída/);
    expect(classifyGoalForecastStatus(goal, null, "2026-01-01")).toBe("completed");
  });

  it("meta sem prazo ainda recebe previsão (estimada), sem virar atrasada/em risco por prazo", () => {
    const progress = [
      { value: 2, recordedAt: daysAgo(60) },
      { value: 5, recordedAt: daysAgo(0) },
    ];
    const { forecast } = computeGoalForecast(baseGoal, progress);
    const status = classifyGoalForecastStatus(baseGoal, forecast, "2026-01-01");
    expect(status).toBe("on_track");
  });

  it("meta sem histórico suficiente retorna dados insuficientes", () => {
    const { forecast, reason } = computeGoalForecast(baseGoal, [{ value: 5, recordedAt: daysAgo(0) }]);
    expect(forecast).toBeNull();
    expect(reason).toMatch(/progresso suficiente/);
    expect(classifyGoalForecastStatus(baseGoal, forecast, "2026-01-01")).toBe("insufficient_data");
  });

  it("ritmo necessário é calculado a partir do prazo e do restante", () => {
    const today = "2026-01-01";
    const goal = { ...baseGoal, dueDate: "2026-03-02" }; // ~60 dias à frente
    const pace = computeRequiredPace(goal, today);
    expect(pace).not.toBeNull();
    expect(pace).toBeGreaterThan(0);
  });

  it("progresso esperado usa tempo decorrido entre início e prazo", () => {
    const pct = computeExpectedProgressPct("2026-01-01", "2026-01-11", "2026-01-06");
    expect(pct).toBe(50);
  });

  it("status: no ritmo quando a previsão cai dentro do prazo", () => {
    const goal = { ...baseGoal, dueDate: "2026-06-01" };
    const forecast = { date: "2026-05-01", ratePerDay: 1, daysRemaining: 10, aheadOrBehindDays: 31 };
    expect(classifyGoalForecastStatus(goal, forecast, "2026-01-01")).toBe("ahead");
  });

  it("status: em risco quando a previsão fica muito além do prazo", () => {
    const goal = { ...baseGoal, dueDate: "2026-06-01" };
    const forecast = { date: "2026-09-01", ratePerDay: 0.1, daysRemaining: 200, aheadOrBehindDays: -92 };
    expect(classifyGoalForecastStatus(goal, forecast, "2026-01-01")).toBe("at_risk");
  });

  it("status: atrasada quando due_date já passou e a meta não foi concluída", () => {
    const goal = { ...baseGoal, dueDate: "2025-01-01" };
    expect(classifyGoalForecastStatus(goal, null, "2026-01-01")).toBe("overdue");
  });

  it("meta binária não tem previsão numérica", () => {
    const goal = { ...baseGoal, kind: "binary" as const };
    const { forecast, reason } = computeGoalForecast(goal, []);
    expect(forecast).toBeNull();
    expect(reason).toMatch(/binária/);
  });
});

describe("Goal Forecast — risco (unitário)", () => {
  it("classifica faixas de risco", () => {
    expect(classifyGoalRisk(10)).toBe("low");
    expect(classifyGoalRisk(45)).toBe("medium");
    expect(classifyGoalRisk(65)).toBe("high");
    expect(classifyGoalRisk(90)).toBe("critical");
  });

  it("meta atrasada sempre soma o teto de pressão de cronograma", () => {
    const score = computeGoalRiskScore({ scheduleDeltaDays: null, currentPace: null, requiredPace: null, progressDeficitPct: null, overdue: true });
    expect(score).toBeGreaterThanOrEqual(45);
  });
});

describe("Goal Forecast — API (timezone e isolamento)", () => {
  it("usa a data local enviada pelo frontend para classificar atraso, não UTC do servidor", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/goals").send({ title: "Meta antiga", kind: "numeric", targetValue: 10, dueDate: "2020-01-01" });
    const res = await agent.get("/api/goal-forecast?period=all&today=2026-01-10");
    expect(res.status).toBe(200);
    const goal = res.body.goals.find((g: { title: string }) => g.title === "Meta antiga");
    expect(goal.status).toBe("overdue");
  });

  it("isolamento multiusuário: metas de um usuário não aparecem para outro", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();
    await agentA.post("/api/goals").send({ title: "Só de A", kind: "task_based" });

    const resB = await agentB.get("/api/goal-forecast?period=all");
    const titlesB = resB.body.goals.map((g: { title: string }) => g.title);
    expect(titlesB).not.toContain("Só de A");
  });

  it("KPIs nunca são hardcoded — refletem a quantidade real de metas ativas", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/goals").send({ title: "Meta 1", kind: "task_based" });
    await agent.post("/api/goals").send({ title: "Meta 2", kind: "task_based" });
    const res = await agent.get("/api/goal-forecast?period=all");
    expect(res.body.summary.activeGoals).toBe(2);
  });
});
