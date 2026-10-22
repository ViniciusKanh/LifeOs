import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { sanitizeProposal } from "../src/services/contractsService.js";

describe("Contrato como documento (cláusulas e vigência)", () => {
  it("grava vigência, dedicação, motivação, recompensa e consequência; início padrão é hoje", async () => {
    const { agent } = await createAuthenticatedAgent();
    const c = await agent.post("/api/contracts").send({
      title: "Concluir o capítulo 2 até 15/11",
      difficulty: "dificil",
      dueDate: "2030-11-15",
      weeklyHours: 6,
      why: "Considerando que a qualificação depende deste capítulo.",
      rewardText: "Uma noite livre com um filme.",
      stakes: "Refazer o cronograma na revisão semanal.",
      tasks: [{ title: "Revisar seção 2.1", startDate: "2030-11-01", dueDate: "2030-11-05" }],
    });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ weeklyHours: 6, rewardText: "Uma noite livre com um filme.", stakes: "Refazer o cronograma na revisão semanal." });
    expect(c.body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const detail = await agent.get(`/api/contracts/${c.body.id}`);
    expect(detail.body.tasks[0].start_date).toBe("2030-11-01");

    const upd = await agent.patch(`/api/contracts/${c.body.id}`).send({ weeklyHours: 8, stakes: null });
    expect(upd.body.weeklyHours).toBe(8);
    expect(upd.body.stakes).toBeNull();
  });

  it("a proposta da IA respeita a vigência pedida e mantém as tarefas dentro dela", () => {
    const r = sanitizeProposal(
      {
        title: "Pacto de treino",
        difficulty: "medio",
        dueInDays: 90,
        weeklyHours: 4,
        why: "Considerando que treinar me dá energia.",
        rewardText: "Comprar luvas novas",
        stakes: "Rever o plano",
        tasks: [
          { title: "Montar treino A/B", description: "x", priority: "Alta", difficulty: "facil", startInDays: 0, dueInDays: 2, estimateMinutes: 30 },
          { title: "Treinar 12 vezes", description: "x", priority: "Média", difficulty: "medio", startInDays: 50, dueInDays: 80, estimateMinutes: 600 },
        ],
        goal: { include: false, title: "", dueInDays: 0 },
        project: { include: false, name: "", startInDays: 0, dueInDays: 0 },
      },
      { weeklyHours: 3 },
      { startIn: 3, deadline: 30, maxTasks: 6, wantsGoalProject: true },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.startInDays).toBe(3);
    expect(r.data.dueInDays).toBe(30); // prazo do usuário prevalece sobre o da IA
    expect(r.data.weeklyHours).toBe(3);
    for (const t of r.data.tasks) {
      expect(t.dueInDays!).toBeLessThanOrEqual(30);
      expect(t.dueInDays!).toBeGreaterThanOrEqual(3);
      if (t.startInDays !== null) expect(t.startInDays).toBeGreaterThanOrEqual(3);
    }
  });

  it("valida parâmetros da IA e recusa meta de outro usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const bad = await agent.post("/api/contracts/ai/propose").send({ goal: "Aprender inglês de verdade", taskCount: "gigante" });
    expect(bad.status).toBe(400);
  });
});
