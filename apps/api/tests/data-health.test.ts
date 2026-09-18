import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { computeDataHealthScore, classifyScore } from "../src/services/dataHealthScoreService.js";

describe("Data Health Score — cálculo (unitário)", () => {
  it("classifica as faixas de score", () => {
    expect(classifyScore(95)).toBe("Saudável");
    expect(classifyScore(80)).toBe("Bom");
    expect(classifyScore(65)).toBe("Atenção");
    expect(classifyScore(30)).toBe("Crítico");
  });

  it("calcula a média ponderada das 6 dimensões", () => {
    const { score, label } = computeDataHealthScore({
      completeness: 100,
      consistency: 100,
      integrity: 100,
      freshness: 100,
      sync: 100,
      history: 100,
    });
    expect(score).toBe(100);
    expect(label).toBe("Saudável");
  });

  it("pesa mais completude/consistência/integridade do que sincronização/histórico", () => {
    const { score } = computeDataHealthScore({
      completeness: 0,
      consistency: 100,
      integrity: 100,
      freshness: 100,
      sync: 100,
      history: 100,
    });
    // Completude tem peso 25% — zerá-la derruba o score bem mais que zerar sync (10%) ou histórico (10%).
    expect(score).toBeLessThan(80);
  });
});

describe("Data Health — API (isolamento e regras reais)", () => {
  it("exige autenticação", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const res = await request(app).get("/api/data-health");
    expect(res.status).toBe(401);
  });

  it("usuário novo (poucos dados) não recebe rótulo crítico só por falta de histórico", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/data-health");
    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.diagnosis).toMatch(/construindo sua base de dados/);
  });

  it("isolamento multiusuário: alertas de um usuário nunca aparecem para outro", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();

    await agentA.post("/api/tasks").send({ title: "Tarefa da usuária A", dueDate: "2020-01-01" });

    const resB = await agentB.get("/api/data-health");
    const titlesB = resB.body.issues.map((i: { title: string }) => i.title);
    expect(titlesB.join(" ")).not.toMatch(/prazo anterior à criação/);
  });

  it("detecta tarefa com prazo anterior à criação (timestamp inválido)", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/tasks").send({ title: "Tarefa com prazo impossível", dueDate: "2000-01-01" });

    const res = await agent.get("/api/data-health");
    const issue = res.body.issues.find((i: { id: string }) => i.id === "task_due_before_created");
    expect(issue).toBeTruthy();
    expect(issue.affectedCount).toBeGreaterThanOrEqual(1);
  });

  it("detecta possível duplicado (mesmo título, criadas em sequência)", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/goals").send({ title: "Meta Duplicada", kind: "task_based" });
    await agent.post("/api/goals").send({ title: "Meta Duplicada", kind: "task_based" });

    const res = await agent.get("/api/data-health");
    const issue = res.body.issues.find((i: { id: string }) => i.id === "goals_possible_duplicate");
    expect(issue).toBeTruthy();
  });

  it("goal forecast readiness fica insuficiente sem metas ativas", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/data-health");
    const readiness = res.body.readiness.find((r: { tool: string }) => r.tool === "Goal Forecast");
    expect(readiness.status).toBe("insufficient");
  });

  it("recheck cria no máximo um snapshot por dia e alimenta o histórico", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/data-health/recheck");
    const res = await agent.post("/api/data-health/recheck");
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBe(1);
  });
});
