import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { classifyStatus } from "../src/services/deadlineRadarService.js";
import { computeRiskScore, classifyRisk } from "../src/services/deadlineRiskService.js";

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("Deadline Radar — classificação de status (unitário)", () => {
  const today = "2026-09-17";

  it("classifica atrasado quando due_date < hoje e não concluído", () => {
    expect(classifyStatus(addDays(today, -2), today, false)).toBe("atrasado");
  });
  it("classifica vence hoje", () => {
    expect(classifyStatus(today, today, false)).toBe("vence_hoje");
  });
  it("classifica vence em 7 dias (1-7)", () => {
    expect(classifyStatus(addDays(today, 5), today, false)).toBe("vence_7d");
  });
  it("classifica vence em 8-30 dias", () => {
    expect(classifyStatus(addDays(today, 15), today, false)).toBe("vence_30d");
  });
  it("classifica no prazo quando > 30 dias", () => {
    expect(classifyStatus(addDays(today, 45), today, false)).toBe("no_prazo");
  });
  it("item concluído nunca é atrasado, mesmo com due_date no passado", () => {
    expect(classifyStatus(addDays(today, -10), today, true)).toBe("concluido");
  });
});

describe("Deadline Radar — risk score determinístico", () => {
  it("sem progresso não inventa deficit — usa apenas pressão de prazo e prioridade", () => {
    const score = computeRiskScore({ daysRemaining: 2, totalSpanDays: null, progressPct: null, openItemsRatio: null, priority: "Alta" });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
  it("progresso muito abaixo do esperado aumenta o score", () => {
    const low = computeRiskScore({ daysRemaining: 5, totalSpanDays: 30, progressPct: 10, openItemsRatio: 0.8, priority: "Alta" });
    const high = computeRiskScore({ daysRemaining: 5, totalSpanDays: 30, progressPct: 90, openItemsRatio: 0.1, priority: "Alta" });
    expect(low).toBeGreaterThan(high);
  });
  it("classifica faixas de risco corretamente", () => {
    expect(classifyRisk(10)).toBe("low");
    expect(classifyRisk(45)).toBe("medium");
    expect(classifyRisk(65)).toBe("high");
    expect(classifyRisk(90)).toBe("critical");
  });
});

describe("Deadline Radar — API", () => {
  it("agrega prazos reais de tasks, goals e educação, sem inventar dados", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    const overdue = addDays(today, -3);
    const soon = addDays(today, 3);

    await agent.post("/api/tasks").send({ title: "Tarefa atrasada", dueDate: overdue, priority: "Alta" });
    await agent.post("/api/tasks").send({ title: "Tarefa próxima", dueDate: soon, priority: "Média" });
    await agent.post("/api/goals").send({ title: "Meta do trimestre", kind: "binary", dueDate: soon });

    const eduRes = await agent.post("/api/educations").send({ kind: "mestrado", courseName: "Mestrado em CC" });
    await agent.post(`/api/educations/${eduRes.body.id}/deadlines`).send({ title: "Prova final", dueDate: overdue });

    const res = await agent.get(`/api/deadline-radar?period=all&today=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.overdue).toBe(2); // tarefa atrasada + prova final
    expect(res.body.summary.due7d).toBe(2); // tarefa próxima + meta
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain("Tarefa atrasada");
    expect(titles).toContain("Prova final");
  });

  it("timezone: usa a data local enviada pelo frontend, não UTC do servidor", async () => {
    const { agent } = await createAuthenticatedAgent();
    const localToday = "2026-01-10";
    await agent.post("/api/tasks").send({ title: "Vence hoje (local)", dueDate: localToday, priority: "Alta" });
    const res = await agent.get(`/api/deadline-radar?period=all&today=${localToday}`);
    const item = res.body.items.find((i: { title: string }) => i.title === "Vence hoje (local)");
    expect(item.status).toBe("vence_hoje");
  });

  it("completed_at vs due_date determina taxa de prazos em dia (não usa status isolado)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    const past = addDays(today, -5);
    const createdOnTime = await agent.post("/api/tasks").send({ title: "No prazo", dueDate: today, priority: "Média" });
    await agent.patch(`/api/tasks/${createdOnTime.body.id}`).send({ status: "Concluído" });

    const res = await agent.get(`/api/deadline-radar?period=all&today=${today}`);
    expect(res.body.summary.onTimeRate).not.toBeNull();
    expect(res.body.summary.onTimeRate.completedWithDeadline).toBeGreaterThanOrEqual(1);
  });

  it("isolamento multiusuário: usuário não vê prazos de outro", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    await agentA.post("/api/tasks").send({ title: "Só de A", dueDate: today, priority: "Alta" });

    const resB = await agentB.get(`/api/deadline-radar?period=all&today=${today}`);
    const titlesB = resB.body.items.map((i: { title: string }) => i.title);
    expect(titlesB).not.toContain("Só de A");
  });

  it("área por projeto: tarefa em projeto profissional cai na área Profissional", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    const project = await agent.post("/api/projects").send({ name: "Projeto Prof", kind: "professional" });
    await agent.post("/api/tasks").send({ title: "Entrega prof", dueDate: today, priority: "Alta", projectId: project.body.id });

    const res = await agent.get(`/api/deadline-radar?period=all&today=${today}`);
    const item = res.body.items.find((i: { title: string }) => i.title === "Entrega prof");
    expect(item.area).toBe("Profissional");
  });
});
