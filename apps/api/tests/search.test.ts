import { describe, it, expect } from "vitest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Busca global (GET /api/search)", () => {
  it("exige sessão", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app).get("/api/search?q=teste");
    expect(res.status).toBe(401);
  });

  it("retorna lista vazia para termos muito curtos", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("encontra uma tarefa criada pelo usuário pelo título", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({ title: "Revisar contrato de aluguel importante" });
    expect(created.status).toBe(201);

    const res = await agent.get("/api/search?q=contrato de aluguel");
    expect(res.status).toBe(200);
    const hit = res.body.results.find((r: { type: string; title: string }) => r.type === "task");
    expect(hit).toBeDefined();
    expect(hit.title).toContain("contrato de aluguel");
    expect(hit.link).toBe("/tarefas");
  });

  it("não retorna itens de outro usuário", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();

    await agentA.post("/api/tasks").send({ title: "Tarefa exclusiva do usuário A xyz123" });

    const res = await agentB.get("/api/search?q=exclusiva do usuário A");
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(0);
  });
});
