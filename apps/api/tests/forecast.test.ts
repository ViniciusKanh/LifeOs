import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

/** Ajusta recorded_at de um registro de progresso pra simular histórico no passado. */
async function setProgressRecordedAt(goalId: string, value: number, daysAgo: number) {
  const db = getDb();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  await db.execute({
    sql: "UPDATE goal_progress SET recorded_at = ? WHERE goal_id = ? AND value = ?",
    args: [date.toISOString(), goalId, value],
  });
}

/** Ajusta completed_at/updated_at de uma tarefa pra simular conclusão no passado. */
async function setTaskCompletedAt(taskId: string, daysAgo: number) {
  const db = getDb();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  await db.execute({
    sql: "UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?",
    args: [date.toISOString(), date.toISOString(), taskId],
  });
}

describe("Previsão de conclusão — Metas (GET /api/goals/:id/forecast)", () => {
  it("devolve forecast: null quando não há progresso suficiente registrado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const goal = await agent.post("/api/goals").send({ title: "Ler 20 livros", kind: "numeric", targetValue: 20 });

    const res = await agent.get(`/api/goals/${goal.body.id}/forecast`);
    expect(res.status).toBe(200);
    expect(res.body.forecast).toBeNull();
    expect(res.body.reason).toBeTruthy();
  });

  it("projeta uma data real quando há ritmo de progresso claro e ascendente", async () => {
    const { agent } = await createAuthenticatedAgent();
    const goal = await agent.post("/api/goals").send({ title: "Ler 20 livros", kind: "numeric", targetValue: 20 });
    const goalId = goal.body.id;

    await agent.post(`/api/goals/${goalId}/progress`).send({ value: 2 });
    await setProgressRecordedAt(goalId, 2, 10);
    await agent.post(`/api/goals/${goalId}/progress`).send({ value: 10 });
    await setProgressRecordedAt(goalId, 10, 0);

    const res = await agent.get(`/api/goals/${goalId}/forecast`);
    expect(res.status).toBe(200);
    expect(res.body.reason).toBeNull();
    expect(res.body.forecast).not.toBeNull();
    expect(res.body.forecast.ratePerDay).toBeCloseTo(0.8, 5); // (10-2)/10 dias
    expect(typeof res.body.forecast.date).toBe("string");
    expect(res.body.forecast.daysRemaining).toBeGreaterThan(0);
  });

  it("devolve forecast: null para meta já concluída", async () => {
    const { agent } = await createAuthenticatedAgent();
    const goal = await agent.post("/api/goals").send({ title: "Meta concluída", kind: "numeric", targetValue: 5 });
    const goalId = goal.body.id;

    await agent.post(`/api/goals/${goalId}/progress`).send({ value: 1 });
    await setProgressRecordedAt(goalId, 1, 10);
    await agent.post(`/api/goals/${goalId}/progress`).send({ value: 5 });
    await setProgressRecordedAt(goalId, 5, 0);
    await agent.patch(`/api/goals/${goalId}`).send({ status: "done" });

    const res = await agent.get(`/api/goals/${goalId}/forecast`);
    expect(res.status).toBe(200);
    expect(res.body.forecast).toBeNull();
    expect(res.body.reason).toBeTruthy();
  });

  it("nunca mistura metas de outro usuário — 404 na mesma linha das outras rotas :id", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const goal = await other.agent.post("/api/goals").send({ title: "Meta alheia", kind: "numeric", targetValue: 5 });

    const res = await agent.get(`/api/goals/${goal.body.id}/forecast`);
    expect(res.status).toBe(404);
  });
});

describe("Previsão de conclusão — Projetos (GET /api/projects/:id/forecast)", () => {
  it("projeta uma data real quando há tarefas concluídas ao longo de 2+ semanas", async () => {
    const { agent } = await createAuthenticatedAgent();
    const project = await agent.post("/api/projects").send({ name: "Projeto com ritmo" });
    const projectId = project.body.id;

    const t1 = await agent.post("/api/tasks").send({ title: "Tarefa 1", projectId });
    const t2 = await agent.post("/api/tasks").send({ title: "Tarefa 2", projectId });
    await agent.post("/api/tasks").send({ title: "Tarefa aberta 1", projectId });
    await agent.post("/api/tasks").send({ title: "Tarefa aberta 2", projectId });

    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    await setTaskCompletedAt(t1.body.id, 20);
    await agent.patch(`/api/tasks/${t2.body.id}`).send({ status: "Concluído" });
    await setTaskCompletedAt(t2.body.id, 1);

    const res = await agent.get(`/api/projects/${projectId}/forecast`);
    expect(res.status).toBe(200);
    expect(res.body.reason).toBeNull();
    expect(res.body.forecast).not.toBeNull();
    expect(res.body.forecast.remainingTasks).toBe(2);
    expect(res.body.forecast.completionsPerWeek).toBeGreaterThan(0);
    expect(typeof res.body.forecast.date).toBe("string");
  });

  it("devolve forecast: null quando o projeto não tem nenhuma tarefa concluída", async () => {
    const { agent } = await createAuthenticatedAgent();
    const project = await agent.post("/api/projects").send({ name: "Projeto sem histórico" });
    await agent.post("/api/tasks").send({ title: "Tarefa aberta", projectId: project.body.id });

    const res = await agent.get(`/api/projects/${project.body.id}/forecast`);
    expect(res.status).toBe(200);
    expect(res.body.forecast).toBeNull();
    expect(res.body.reason).toBeTruthy();
  });

  it("nunca mistura projetos de outro usuário — 404 na mesma linha das outras rotas :id", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const project = await other.agent.post("/api/projects").send({ name: "Projeto alheio" });

    const res = await agent.get(`/api/projects/${project.body.id}/forecast`);
    expect(res.status).toBe(404);
  });
});
