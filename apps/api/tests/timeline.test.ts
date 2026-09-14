import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Timeline — feed cronológico", () => {
  it("inclui água e humor no feed, e mostra o nome do projeto de uma tarefa concluída", async () => {
    const { agent } = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Lançamento do site", kind: "professional" });
    const task = await agent.post("/api/tasks").send({ title: "Escrever briefing", projectId: project.body.id });
    await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });

    await agent.post("/api/health/water").send({ amountMl: 300 });
    await agent.post("/api/health/mood").send({ mood: 4, energy: 3 });

    const today = new Date().toISOString().slice(0, 10);
    const res = await agent.get(`/api/analytics/timeline?from=${today}&to=${today}`);
    expect(res.status).toBe(200);

    const taskEvent = res.body.events.find((e: { type: string; id: string }) => e.type === "task" && e.id === task.body.id);
    expect(taskEvent.project_name).toBe("Lançamento do site");

    expect(res.body.events.some((e: { type: string }) => e.type === "water")).toBe(true);
    expect(res.body.events.some((e: { type: string }) => e.type === "mood")).toBe(true);
  });
});
