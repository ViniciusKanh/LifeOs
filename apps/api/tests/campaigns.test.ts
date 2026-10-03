import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { campaignGamificationConfig as CC } from "../src/config/campaignGamification.js";
import { applyBonus, calculateCampaignProgress, habitAdherence, streakBonus, trailStates, weeklyStreak } from "../src/services/campaignEngine.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const profile = async (agent: Agent) => (await agent.get("/api/gamification/profile")).body as { totalXp: number; coins: number };

describe("Progresso da campanha (puro)", () => {
  const none = { total: 0, done: 0 };
  it("redistribui pesos de dimensões inexistentes e trata zero", () => {
    expect(calculateCampaignProgress({ missions: none, milestones: none, contracts: { expected: 0, met: 0 } }).pct).toBe(0);
    expect(calculateCampaignProgress({ missions: { total: 4, done: 2 }, milestones: none, contracts: { expected: 0, met: 0 } }).pct).toBe(50);
    expect(calculateCampaignProgress({ missions: none, milestones: { total: 4, done: 1 }, contracts: { expected: 0, met: 0 } }).pct).toBe(25);
    const tm = calculateCampaignProgress({ missions: { total: 2, done: 2 }, milestones: { total: 2, done: 0 }, contracts: { expected: 0, met: 0 } });
    expect(tm.weights.missions).toBeCloseTo(0.625);
    expect(tm.pct).toBe(63);
    const all = calculateCampaignProgress({ missions: { total: 10, done: 5 }, milestones: { total: 2, done: 1 }, contracts: { expected: 10, met: 5 } });
    expect(all.pct).toBe(50);
    expect(calculateCampaignProgress({ missions: { total: 1, done: 1 }, milestones: { total: 1, done: 1 }, contracts: { expected: 3, met: 9 } }).pct).toBe(100);
  });

  it("adesão de hábito usa só o período transcorrido; sequência semanal e bônus", () => {
    const a = habitAdherence({ frequency: "daily", targetCount: 1, from: "2026-01-01", today: "2026-01-10", entries: [{ date: "2026-01-02", count: 1 }, { date: "2025-12-31", count: 1 }] });
    expect(a).toEqual({ expected: 10, met: 1 });
    const w = habitAdherence({ frequency: "times_per_week", targetCount: 2, from: "2026-01-05", today: "2026-01-18", entries: [{ date: "2026-01-06", count: 1 }, { date: "2026-01-07", count: 1 }, { date: "2026-01-13", count: 1 }] });
    expect(w).toEqual({ expected: 2, met: 1 });
    // Semana atual sem atividade não quebra a sequência.
    expect(weeklyStreak(["2026-01-07", "2026-01-13", "2026-01-20"], "2026-01-27")).toBe(3);
    expect(weeklyStreak(["2026-01-07", "2026-01-20"], "2026-01-21")).toBe(1);
    expect(streakBonus(1).xpPct).toBe(0);
    expect(streakBonus(3).xpPct).toBe(10);
    expect(streakBonus(9).xpPct).toBe(20);
    expect(applyBonus({ xp: 100, coins: 20 }, { xpPct: 15, coinsPct: 10 })).toEqual({ xp: 115, coins: 22, multiplier: 1.15 });
  });

  it("trilha: 1º incompleto é o atual e dependência pendente bloqueia", () => {
    const t = trailStates([
      { id: "a", position: 0, dueDate: null, status: "completed", dependencyId: null },
      { id: "b", position: 1, dueDate: null, status: "pending", dependencyId: null },
      { id: "c", position: 2, dueDate: null, status: "pending", dependencyId: "b" },
      { id: "d", position: 3, dueDate: null, status: "pending", dependencyId: null },
    ]);
    expect(t.map((x) => x.state)).toEqual(["completed", "current", "blocked", "upcoming"]);
  });
});

describe("Forja de Campanhas (API)", () => {
  it("cria com vínculos reais, conta missões dos projetos e calcula progresso", async () => {
    const { agent } = await createAuthenticatedAgent();
    const p = await agent.post("/api/projects").send({ name: "Dissertação" });
    expect(p.status).toBe(201);
    const t1 = await agent.post("/api/tasks").send({ title: "Revisar introdução", projectId: p.body.id });
    const loose = await agent.post("/api/tasks").send({ title: "Ler artigo base" });
    const c = await agent.post("/api/campaigns").send({
      title: "O Mestrado do Conhecimento",
      term: "longo",
      projectIds: [p.body.id],
      taskIds: [loose.body.id],
      newTasks: [{ title: "Executar experimentos" }],
      milestones: [{ title: "Qualificação", isMajor: true }, { title: "Defesa final", isMajor: true, dependsOnIndex: 0 }],
    });
    expect(c.status).toBe(201);
    expect(c.body.counts.missions).toBe(3);
    expect(c.body.milestones.map((m: { state: string }) => m.state)).toEqual(["current", "blocked"]);
    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    const after = (await agent.get(`/api/campaigns/${c.body.id}`)).body.campaign;
    expect(after.counts.missionsDone).toBe(1);
    expect(after.progress.pct).toBe(Math.round((1 / 3) * 0.625 * 100));
    expect(after.earned.xp).toBeGreaterThan(0);
    expect(after.readyToComplete).toBe(false);
    expect((await agent.post(`/api/campaigns/${c.body.id}/complete`)).status).toBe(400);
  });

  it("marco paga uma única vez (reabrir, clique duplo) e conclusão só com tudo feito", async () => {
    const { agent } = await createAuthenticatedAgent();
    const c = await agent.post("/api/campaigns").send({ title: "Vida em Equilíbrio", milestones: [{ title: "Primeiro mês", xpReward: 99999, coinReward: 5 }] });
    const mid = c.body.milestones[0].id;
    expect(c.body.milestones[0].xpReward).toBe(CC.milestone.limits.xp);
    const [r1, r2] = await Promise.all([
      agent.post(`/api/campaigns/${c.body.id}/milestones/${mid}/done`).send({ done: true }),
      agent.post(`/api/campaigns/${c.body.id}/milestones/${mid}/done`).send({ done: true }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const p1 = await profile(agent);
    expect(p1.totalXp).toBe(CC.milestone.limits.xp);
    await agent.post(`/api/campaigns/${c.body.id}/milestones/${mid}/done`).send({ done: false });
    await agent.post(`/api/campaigns/${c.body.id}/milestones/${mid}/done`).send({ done: true });
    expect((await profile(agent)).totalXp).toBe(p1.totalXp);
    const ev = await getDb().execute({ sql: "SELECT base_xp, multiplier FROM xp_events WHERE source_type = 'campaign' AND source_id = ?", args: [`${c.body.id}:${mid}`] });
    expect(Number(ev.rows[0]?.base_xp)).toBe(CC.milestone.limits.xp);

    // Pronta para concluir; recompensa de conclusão exige dias mínimos desde o início.
    const ready = (await agent.get(`/api/campaigns/${c.body.id}`)).body.campaign;
    expect(ready.readyToComplete).toBe(true);
    const done = await agent.post(`/api/campaigns/${c.body.id}/complete`);
    expect(done.body.campaign.status).toBe("completed");
    expect(done.body.reward).toBeNull();
    const again = await agent.post(`/api/campaigns/${c.body.id}/complete`);
    expect(again.status).toBe(200);
    expect((await profile(agent)).totalXp).toBe(p1.totalXp);
  });

  it("conclusão antiga paga recompensa uma vez; pausar/retomar vão para a Timeline", async () => {
    const { agent } = await createAuthenticatedAgent();
    const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const c = await agent.post("/api/campaigns").send({ title: "Explorador do Mundo", startDate: start, completionXp: 300, completionCoins: 60, newTasks: [{ title: "Planejar viagem" }] });
    await agent.post(`/api/campaigns/${c.body.id}/status`).send({ status: "paused" });
    await agent.post(`/api/campaigns/${c.body.id}/status`).send({ status: "active" });
    const task = (await agent.get(`/api/campaigns/${c.body.id}`)).body.tasks[0];
    await agent.patch(`/api/tasks/${task.id}`).send({ status: "Concluído" });
    const before = await profile(agent);
    const done = await agent.post(`/api/campaigns/${c.body.id}/complete`);
    expect(done.body.reward.xp).toBeGreaterThanOrEqual(300);
    const [x, y] = await Promise.all([agent.post(`/api/campaigns/${c.body.id}/complete`), agent.post(`/api/campaigns/${c.body.id}/complete`)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const after = await profile(agent);
    expect(after.totalXp - before.totalXp).toBe(done.body.reward.xp);
    const tl = await agent.get(`/api/analytics/timeline?from=${start}&to=${new Date().toISOString().slice(0, 10)}`);
    const kinds = (tl.body.events as Array<{ type: string; kind?: string }>).filter((e) => e.type === "campaign").map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["created", "paused", "resumed", "completed"]));
  });

  it("isola usuários: não vê, não vincula itens de outro e não reordena marcos alheios", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const otherTask = await b.agent.post("/api/tasks").send({ title: "Tarefa de B" });
    expect((await a.agent.post("/api/campaigns").send({ title: "Invasão", taskIds: [otherTask.body.id] })).status).toBe(400);
    const c = await a.agent.post("/api/campaigns").send({ title: "Minha", milestones: [{ title: "M1" }, { title: "M2" }] });
    expect((await b.agent.get(`/api/campaigns/${c.body.id}`)).status).toBe(404);
    expect((await b.agent.post(`/api/campaigns/${c.body.id}/milestones/${c.body.milestones[0].id}/done`).send({ done: true })).status).toBe(404);
    expect((await b.agent.get("/api/campaigns")).body).toEqual([]);
    const ids = c.body.milestones.map((m: { id: string }) => m.id).reverse();
    const re = await a.agent.post(`/api/campaigns/${c.body.id}/milestones/reorder`).send({ ids });
    expect(re.body.milestones.map((m: { id: string }) => m.id)).toEqual(ids);
    expect((await a.agent.post(`/api/campaigns/${c.body.id}/links`).send({ kind: "tasks", ids: [otherTask.body.id], linked: true })).status).toBe(400);
  });
});
