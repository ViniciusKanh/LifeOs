import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { GAMIFICATION_RULES } from "../src/config/gamification.js";
import { sanitizePriorityRewards } from "../src/services/gamificationService.js";

const R = GAMIFICATION_RULES;
type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const profile = async (agent: Agent) => (await agent.get("/api/gamification/profile")).body as { totalXp: number; coins: number };

describe("Valor das missões por prioridade", () => {
  it("corta valores fora dos limites e completa o que faltar com o padrão", () => {
    const clean = sanitizePriorityRewards({ Alta: { xp: 99999, coins: -3 }, Baixa: "x" });
    expect(clean.Alta.xp).toBe(R.task.priorityLimits.xp);
    expect(clean.Alta.coins).toBe(0);
    expect(clean.Baixa).toEqual({ xp: R.task.xpByPriority.Baixa, coins: R.task.coinsByPriority.Baixa });
    expect(clean["Média"].xp).toBe(R.task.xpByPriority["Média"]);
  });

  it("tarefa sem dificuldade usa o valor da prioridade definido pelo usuário, sem afetar outros usuários", async () => {
    const { agent } = await createAuthenticatedAgent();
    const before = (await agent.get("/api/gamification/settings")).body;
    const priority = { Baixa: { xp: 5, coins: 1 }, "Média": { xp: 20, coins: 4 }, Alta: { xp: 120, coins: 25 } };
    const saved = await agent.put("/api/gamification/settings").send({ priority });
    expect(saved.status).toBe(200);
    expect(saved.body.priority).toEqual(priority);
    // Salvar prioridade não mexe na balança por dificuldade.
    expect(saved.body.difficulty).toEqual(before.difficulty);

    const t = await agent.post("/api/tasks").send({ title: "Alta", priority: "Alta" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const p = await profile(agent);
    expect(p.totalXp).toBe(120 + R.task.firstOfDayXp);
    expect(p.coins).toBe(25);

    const wallet = (await agent.get("/api/gamification/wallet")).body;
    expect(wallet.balance).toBe(25);
    expect(wallet.earned30).toBe(25);
    expect(wallet.spent30).toBe(0);

    const other = await createAuthenticatedAgent();
    const otherSettings = (await other.agent.get("/api/gamification/settings")).body;
    expect(otherSettings.priority.Alta.xp).toBe(R.task.xpByPriority.Alta);
  });

  it("rejeita valores inválidos", async () => {
    const { agent } = await createAuthenticatedAgent();
    const bad = await agent.put("/api/gamification/settings").send({ priority: { Alta: { xp: "muito" } } });
    expect(bad.status).toBe(400);
  });
});
