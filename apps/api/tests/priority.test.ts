import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Priorização automática de tarefas (GET /api/tasks/focus)", () => {
  it("usuário sem tarefas em aberto recebe lista vazia, não erro", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/tasks/focus");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });

  it("tarefa atrasada fica à frente de uma tarefa que só vence no mês que vem", async () => {
    const { agent } = await createAuthenticatedAgent();

    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 3);
    const farDate = new Date();
    farDate.setDate(farDate.getDate() + 30);

    const overdue = await agent.post("/api/tasks").send({
      title: "Tarefa atrasada",
      dueDate: overdueDate.toISOString(),
    });
    const farAway = await agent.post("/api/tasks").send({
      title: "Tarefa distante",
      dueDate: farDate.toISOString(),
    });
    expect(overdue.status).toBe(201);
    expect(farAway.status).toBe(201);

    const res = await agent.get("/api/tasks/focus");
    expect(res.status).toBe(200);
    const ids = res.body.tasks.map((t: { id: string }) => t.id);
    expect(ids.indexOf(overdue.body.id)).toBeLessThan(ids.indexOf(farAway.body.id));

    const overdueEntry = res.body.tasks.find((t: { id: string }) => t.id === overdue.body.id);
    expect(overdueEntry.reasons.some((r: string) => r.toLowerCase().includes("atrasada"))).toBe(true);
  });

  it("tarefa bloqueada por dependência incompleta não fica à frente de tarefas prontas para execução", async () => {
    const { agent } = await createAuthenticatedAgent();

    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 5);

    // Tarefa "bloqueadora" ainda não concluída.
    const blocker = await agent.post("/api/tasks").send({ title: "Pré-requisito" });
    // Tarefa bloqueada, mas com prazo bem atrasado (se não fosse pelo
    // bloqueio, teria um score altíssimo).
    const blocked = await agent.post("/api/tasks").send({
      title: "Tarefa bloqueada e atrasada",
      dueDate: overdueDate.toISOString(),
    });
    await agent.post(`/api/tasks/${blocked.body.id}/dependencies`).send({ dependsOnId: blocker.body.id });

    // Tarefa pronta para execução, sem atraso nem prioridade alta —
    // score baixo, mas deve ficar à frente da bloqueada mesmo assim.
    const ready = await agent.post("/api/tasks").send({ title: "Tarefa pronta, sem prazo" });

    const res = await agent.get("/api/tasks/focus?limit=20");
    expect(res.status).toBe(200);
    const ids = res.body.tasks.map((t: { id: string }) => t.id);

    expect(ids.indexOf(ready.body.id)).toBeLessThan(ids.indexOf(blocked.body.id));

    const blockedEntry = res.body.tasks.find((t: { id: string }) => t.id === blocked.body.id);
    expect(blockedEntry.reasons.some((r: string) => r.toLowerCase().includes("bloqueada"))).toBe(true);
  });

  it("reasons refletem prioridade Alta quando não há outro sinal", async () => {
    const { agent } = await createAuthenticatedAgent();
    const task = await agent.post("/api/tasks").send({ title: "Tarefa importante", priority: "Alta" });

    const res = await agent.get("/api/tasks/focus");
    expect(res.status).toBe(200);
    const entry = res.body.tasks.find((t: { id: string }) => t.id === task.body.id);
    expect(entry).toBeTruthy();
    expect(entry.reasons).toContain("Prioridade Alta");
  });

  it("nunca mistura tarefas de usuários diferentes", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    await other.agent.post("/api/tasks").send({ title: "Tarefa de outro usuário", priority: "Alta" });
    await agent.post("/api/tasks").send({ title: "Minha tarefa" });

    const res = await agent.get("/api/tasks/focus?limit=20");
    expect(res.status).toBe(200);
    expect(res.body.tasks.some((t: { title: string }) => t.title === "Tarefa de outro usuário")).toBe(false);
  });

  it("todas as rotas de tarefas exigem sessão, inclusive /focus", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const res = await request(app).get("/api/tasks/focus");
    expect(res.status).toBe(401);
  });
});
