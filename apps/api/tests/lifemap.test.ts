import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Life Map", () => {
  it("começa vazio (sem itens) e mostra as 6 áreas com zero itens ativos", async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.get("/api/lifemap");
    expect(res.status).toBe(200);
    expect(res.body.summary.areasCount).toBe(6);
    expect(res.body.summary.areasActiveCount).toBe(0);
    // nó central + 6 nós de área + 3 sub-nós fixos de resumo de saúde (água/sono/exercício)
    expect(res.body.nodes.length).toBe(10);
    expect(res.body.edges).toEqual([]);
  });

  it("isola os dados por usuário — o mapa de um usuário nunca inclui itens de outro", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();

    await agentA.post("/api/goals").send({ title: "Meta da usuária A", kind: "task_based" });

    const mapB = await agentB.get("/api/lifemap");
    const goalNodes = mapB.body.nodes.filter((n: { kind: string }) => n.kind === "goal");
    expect(goalNodes.length).toBe(0);
  });

  it("liga hábito e meta com a mesma categoria e conta os órfãos corretamente", async () => {
    const { agent } = await createAuthenticatedAgent();

    await agent.post("/api/goals").send({ title: "Melhorar saúde", category: "Saúde", kind: "task_based" });
    await agent.post("/api/habits").send({ name: "Beber água", category: "Saúde" });
    await agent.post("/api/habits").send({ name: "Ler 20 min", category: "Leitura" });

    const res = await agent.get("/api/lifemap");
    expect(res.status).toBe(200);

    const goalHabitEdges = res.body.edges.filter((e: { kind: string }) => e.kind === "goal_habit");
    expect(goalHabitEdges.length).toBe(1);

    // O hábito "Ler 20 min" não bate com a categoria de nenhuma meta —
    // deve contar como não vinculado.
    expect(res.body.orphans.habitsUnlinked).toBeGreaterThanOrEqual(1);
  });

  it("conta tarefa sem projeto como órfã e projeto sem prazo em nenhuma tarefa", async () => {
    const { agent } = await createAuthenticatedAgent();

    await agent.post("/api/tasks").send({ title: "Tarefa solta" });
    const project = await agent.post("/api/projects").send({ name: "Projeto sem prazos" });
    await agent.post("/api/tasks").send({ title: "Tarefa do projeto", projectId: project.body.id });

    const res = await agent.get("/api/lifemap");
    expect(res.body.orphans.tasksWithoutProject).toBeGreaterThanOrEqual(1);
    expect(res.body.orphans.projectsWithoutDeadline).toBeGreaterThanOrEqual(1);
  });

  it("exige autenticação", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const res = await request(app).get("/api/lifemap");
    expect(res.status).toBe(401);
  });
});
