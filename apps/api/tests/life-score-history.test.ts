import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Histórico real do Life Score", () => {
  it("grava um snapshot por dia ao consultar o score de hoje e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    expect((await agent.get("/api/analytics/life-score/history")).body).toEqual([]);

    const score = await agent.get("/api/analytics/life-score");
    await agent.get("/api/analytics/life-score"); // segunda consulta no mesmo dia só atualiza

    const history = await agent.get("/api/analytics/life-score/history?days=7");
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].overall).toBe(Math.round(score.body.overall));

    expect((await other.agent.get("/api/analytics/life-score/history")).body).toEqual([]);
  });

  it("consultar uma data passada não cria snapshot", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.get("/api/analytics/life-score?date=2020-01-01");
    expect((await agent.get("/api/analytics/life-score/history?days=180")).body).toEqual([]);
  });
});
