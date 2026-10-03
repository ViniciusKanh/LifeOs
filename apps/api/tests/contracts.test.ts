import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { GAMIFICATION_RULES } from "../src/config/gamification.js";
import { dayKeyIn, isExperimentConclusionEligible, sanitizeDifficultyRewards } from "../src/services/gamificationService.js";

const R = GAMIFICATION_RULES;
type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const profile = async (agent: Agent) => (await agent.get("/api/gamification/profile")).body as { totalXp: number; coins: number };
const today = () => dayKeyIn(new Date(), R.defaultTimezone);

describe("Recompensas por dificuldade (Meu Perfil)", () => {
  it("corta valores fora dos limites e completa o que faltar com o padrão", () => {
    const clean = sanitizeDifficultyRewards({ facil: { taskXp: 99999, taskCoins: -5 }, epico: "x" });
    expect(clean.facil.taskXp).toBe(R.difficulty.limits.taskXp);
    expect(clean.facil.taskCoins).toBe(0);
    expect(clean.facil.contractXp).toBe(R.difficulty.defaults.facil.contractXp);
    expect(clean.epico).toEqual(R.difficulty.defaults.epico);
  });

  it("tarefa com dificuldade usa o valor configurado pelo próprio usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const custom = { ...R.difficulty.defaults, dificil: { taskXp: 77, taskCoins: 9, contractXp: 100, contractCoins: 20 } };
    const saved = await agent.put("/api/gamification/settings").send({ difficulty: custom });
    expect(saved.status).toBe(200);
    const t = await agent.post("/api/tasks").send({ title: "Difícil", difficulty: "dificil" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const p = await profile(agent);
    expect(p.totalXp).toBe(77 + R.task.firstOfDayXp);
    expect(p.coins).toBe(9);
  });
});

describe("Contratos", () => {
  it("paga o bônus uma única vez quando todas as tarefas são concluídas", async () => {
    const { agent } = await createAuthenticatedAgent();
    const c = await agent.post("/api/contracts").send({ title: "Preparar a defesa", difficulty: "facil", tasks: [{ title: "Slides" }, { title: "Ensaio" }] });
    expect(c.status).toBe(201);
    const detail = await agent.get(`/api/contracts/${c.body.id}`);
    const [a, b] = detail.body.tasks as Array<{ id: string }>;
    await agent.patch(`/api/tasks/${a.id}`).send({ status: "Concluído" });
    expect((await agent.get(`/api/contracts/${c.body.id}`)).body.contract.status).toBe("ativo");
    await agent.patch(`/api/tasks/${b.id}/move`).send({ status: "Concluído" });
    const done = await agent.get(`/api/contracts/${c.body.id}`);
    expect(done.body.contract.status).toBe("concluido");
    const D = R.difficulty.defaults.facil;
    const xpAfter = (await profile(agent)).totalXp;
    expect(done.body.contract.earned.xp).toBe(D.taskXp * 2 + D.contractXp);

    // Reabrir e concluir de novo não paga o bônus outra vez.
    await agent.patch(`/api/tasks/${b.id}`).send({ status: "A Fazer" });
    expect((await agent.get(`/api/contracts/${c.body.id}`)).body.contract.status).toBe("ativo");
    await agent.patch(`/api/tasks/${b.id}`).send({ status: "Concluído" });
    expect((await profile(agent)).totalXp).toBe(xpAfter);
  });

  it("apagar a última tarefa aberta não rende bônus; contrato de outro usuário é invisível", async () => {
    const { agent } = await createAuthenticatedAgent();
    const c = await agent.post("/api/contracts").send({ title: "Atalho", tasks: [{ title: "A" }, { title: "B" }, { title: "C" }] });
    const tasks = (await agent.get(`/api/contracts/${c.body.id}`)).body.tasks as Array<{ id: string }>;
    await agent.patch(`/api/tasks/${tasks[0].id}`).send({ status: "Concluído" });
    await agent.patch(`/api/tasks/${tasks[1].id}`).send({ status: "Concluído" });
    await agent.delete(`/api/tasks/${tasks[2].id}`);
    const after = (await agent.get(`/api/contracts/${c.body.id}`)).body.contract;
    expect(after.status).toBe("concluido");
    const M = R.difficulty.defaults.medio;
    expect(after.earned.xp).toBe(M.taskXp * 2);

    const other = await createAuthenticatedAgent();
    expect((await other.agent.get(`/api/contracts/${c.body.id}`)).status).toBe(404);
    expect((await other.agent.post("/api/tasks").send({ title: "x", contractId: c.body.id })).status).toBe(400);
    expect((await other.agent.get("/api/contracts")).body).toEqual([]);
  });

  it("IA sem Gemini configurado responde com erro claro e não cria nada", async () => {
    const { agent } = await createAuthenticatedAgent();
    const r = await agent.post("/api/contracts/ai/propose").send({ goal: "Terminar o capítulo 2 da dissertação" });
    expect(r.status).toBe(422);
    expect((await agent.get("/api/contracts")).body).toEqual([]);
  });
});

describe("Laboratório (experimentos)", () => {
  it("conclusão só paga com duração mínima, registros e conclusão escrita", () => {
    const start = new Date(Date.parse(`${today()}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
    const ok = { startDate: start, today: today(), logs: 5, conclusion: "Dormir antes das 23h melhorou meu foco." };
    expect(isExperimentConclusionEligible(ok)).toBe(true);
    expect(isExperimentConclusionEligible({ ...ok, startDate: today() })).toBe(false);
    expect(isExperimentConclusionEligible({ ...ok, logs: 1 })).toBe(false);
    expect(isExperimentConclusionEligible({ ...ok, conclusion: "ok" })).toBe(false);
  });
});

describe("Avatar e preferências RPG (Meu Perfil)", () => {
  it("salvam no backend só para o próprio usuário e recusam valores inválidos", async () => {
    const { agent } = await createAuthenticatedAgent();
    const img = "data:image/png;base64,iVBORw0KGgo=";
    const ok = await agent.patch("/api/auth/me").send({ rpgAvatarImage: img, rpgPrefs: { avatarMode: "custom", avatarId: "mago" } });
    expect(ok.status).toBe(200);
    const me = (await agent.get("/api/auth/me")).body;
    expect(me.rpg_avatar_image).toBe(img);
    expect(me.rpg_prefs).toMatchObject({ avatarMode: "custom", avatarId: "mago" });
    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { avatarMode: "hack" } })).status).toBe(400);
    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { isAdmin: true } })).status).toBe(400);
    const other = await createAuthenticatedAgent();
    expect((await other.agent.get("/api/auth/me")).body.rpg_avatar_image ?? null).toBeNull();
  });
});
