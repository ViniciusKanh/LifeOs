import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("Capacity Planner", () => {
  it("calcula capacidade e sobrecarga a partir de eventos fixos e tarefas reais", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());

    await agent.post("/api/events").send({ title: "Reunião", startsAt: `${today}T14:00:00.000Z`, endsAt: `${today}T15:00:00.000Z` });
    await agent.post("/api/tasks").send({ title: "Tarefa A", dueDate: today, estimateMinutes: 300, priority: "Alta" });
    await agent.post("/api/tasks").send({ title: "Tarefa B", dueDate: today, estimateMinutes: 240, priority: "Média" });

    const res = await agent.get(`/api/capacity/day?date=${today}`);
    expect(res.status).toBe(200);
    // Janela padrão 08:00-22:00 = 840min; evento de 60min ocupado -> livre 780min.
    expect(res.body.summary.totalMinutes).toBe(840);
    expect(res.body.summary.busyMinutes).toBe(60);
    expect(res.body.summary.freeMinutes).toBe(780);
    expect(res.body.summary.plannedMinutes).toBe(540);
    expect(res.body.summary.overloadMinutes).toBe(0);
    expect(res.body.overloadMessage).toBeNull();
  });

  it("mostra mensagem de sobrecarga quando carga planejada excede capacidade livre", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    for (let i = 0; i < 15; i++) {
      await agent.post("/api/tasks").send({ title: `Tarefa ${i}`, dueDate: today, estimateMinutes: 60, priority: "Média" });
    }
    const res = await agent.get(`/api/capacity/day?date=${today}`);
    expect(res.body.summary.overloadMinutes).toBeGreaterThan(0);
    expect(res.body.overloadMessage).toMatch(/carga acima da sua capacidade/);
    expect(res.body.summary.workloadLevel).toBe("sobrecarga");
  });

  it("tarefa sem estimateMinutes aparece na lista mas não entra no cálculo de carga", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agent.post("/api/tasks").send({ title: "Sem estimativa", dueDate: today, priority: "Média" });
    const res = await agent.get(`/api/capacity/day?date=${today}`);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.tasks[0].estimateMinutes).toBeNull();
    expect(res.body.summary.plannedMinutes).toBe(0);
  });

  it("detecta conflito entre bloco planejado e evento fixo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agent.post("/api/events").send({ title: "Reunião", startsAt: `${today}T14:00:00.000Z`, endsAt: `${today}T15:00:00.000Z` });
    const task = await agent.post("/api/tasks").send({ title: "Tarefa X", estimateMinutes: 60, priority: "Alta" });
    await agent.post("/api/capacity/blocks").send({ date: today, startTime: "14:30", endTime: "15:30", entityType: "task", entityId: task.body.id, blockType: "normal" });

    const res = await agent.get(`/api/capacity/day?date=${today}`);
    expect(res.body.conflicts.length).toBeGreaterThan(0);
    expect(res.body.conflicts[0].reason).toMatch(/evento fixo/);
  });

  it("janelas livres nunca se sobrepõem a eventos fixos", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agent.post("/api/events").send({ title: "Reunião", startsAt: `${today}T14:00:00.000Z`, endsAt: `${today}T15:00:00.000Z` });
    const res = await agent.get(`/api/capacity/day?date=${today}`);
    for (const w of res.body.freeWindows) {
      const overlap = w.start < "15:00" && w.end > "14:00";
      expect(overlap).toBe(false);
    }
  });

  it("plano automático não sobrepõe tarefas e nunca persiste sem confirmação explícita", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agent.post("/api/tasks").send({ title: "Deep work", dueDate: today, estimateMinutes: 90, priority: "Alta" });
    await agent.post("/api/tasks").send({ title: "Leve", dueDate: today, estimateMinutes: 20, priority: "Baixa" });

    const preview = await agent.get(`/api/capacity/plan/preview?date=${today}`);
    expect(preview.status).toBe(200);
    expect(preview.body.proposed.length).toBe(2);

    const dayBefore = await agent.get(`/api/capacity/day?date=${today}`);
    expect(dayBefore.body.blocks.length).toBe(0); // preview não gravou nada

    const apply = await agent.post("/api/capacity/plan/apply").send({ date: today, blocks: preview.body.proposed });
    expect(apply.status).toBe(201);
    const dayAfter = await agent.get(`/api/capacity/day?date=${today}`);
    expect(dayAfter.body.blocks.length).toBe(2);
  });

  it("isola dados de capacidade por usuário", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agentA.post("/api/tasks").send({ title: "Tarefa de A", dueDate: today, estimateMinutes: 120, priority: "Alta" });

    const resB = await agentB.get(`/api/capacity/day?date=${today}`);
    expect(resB.body.tasks.length).toBe(0);
    expect(resB.body.summary.plannedMinutes).toBe(0);
  });
});
