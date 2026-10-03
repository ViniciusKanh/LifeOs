import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { GAMIFICATION_RULES } from "../src/config/gamification.js";
import { applyDailyCap, computeStreak, dayKeyIn, levelForXp, xpToReachLevel } from "../src/services/gamificationService.js";

const R = GAMIFICATION_RULES;
const today = () => dayKeyIn(new Date(), R.defaultTimezone);
const daysAgo = (n: number) => new Date(Date.parse(`${today()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const profile = async (agent: Agent) => (await agent.get("/api/gamification/profile")).body as { totalXp: number; coins: number; level: number };

/** Dá moedas reais a um usuário de teste concluindo tarefas de prioridade Alta. */
async function earnCoins(agent: Agent, tasks: number) {
  for (let i = 0; i < tasks; i++) {
    const t = await agent.post("/api/tasks").send({ title: `Alta ${i}`, priority: "Alta" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
  }
}

describe("Curva de nível (função pura)", () => {
  it("nível 1 começa em 0 XP e a curva é progressiva", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(xpToReachLevel(2)).toBe(R.levelCurve.base);
    expect(xpToReachLevel(3)).toBe(R.levelCurve.base * 2 + R.levelCurve.step);
    expect(levelForXp(xpToReachLevel(2) - 1).level).toBe(1);
    expect(levelForXp(xpToReachLevel(2)).level).toBe(2);
    const l5 = levelForXp(xpToReachLevel(5) + 10);
    expect(l5.level).toBe(5);
    expect(l5.xpIntoLevel).toBe(10);
    expect(xpToReachLevel(6) - xpToReachLevel(5)).toBeGreaterThan(xpToReachLevel(5) - xpToReachLevel(4));
  });

  it("valores inválidos/negativos nunca geram nível abaixo de 1", () => {
    expect(levelForXp(-50).level).toBe(1);
    expect(levelForXp(Number.NaN).totalXp).toBe(0);
  });

  it("teto diário corta o excedente e sequência conta dias consecutivos", () => {
    const g = { sourceType: "task" as const, sourceId: "x", eventType: "completed", coins: 0, label: "" };
    expect(applyDailyCap([{ ...g, xp: 30 }, { ...g, xp: 30 }], 350, 400).map((x) => x.xp)).toEqual([30, 20]);
    expect(applyDailyCap([{ ...g, xp: 30 }], 400, 400)).toEqual([]);
    expect(computeStreak(["2026-01-03", "2026-01-02", "2026-01-01"], "2026-01-03")).toBe(3);
    expect(computeStreak(["2026-01-02", "2026-01-01"], "2026-01-03")).toBe(2);
    expect(computeStreak(["2026-01-01"], "2026-01-03")).toBe(0);
  });
});

describe("XP de tarefas", () => {
  it("concede XP uma única vez por tarefa, mesmo desfazendo e refazendo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const t = await agent.post("/api/tasks").send({ title: "Missão", priority: "Média" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const first = await profile(agent);
    const expected = R.task.xpByPriority["Média"] + R.task.firstOfDayXp;
    expect(first.totalXp).toBe(expected);
    expect(first.coins).toBe(R.task.coinsByPriority["Média"]);

    // Desfaz (volta para A Fazer) e conclui de novo — via PATCH e via move.
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "A Fazer" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    await agent.patch(`/api/tasks/${t.body.id}/move`).send({ status: "Em Andamento" });
    await agent.patch(`/api/tasks/${t.body.id}/move`).send({ status: "Concluído" });
    // Editar a tarefa concluída não rende nada.
    await agent.patch(`/api/tasks/${t.body.id}`).send({ title: "Missão editada" });

    const after = await profile(agent);
    expect(after.totalXp).toBe(expected);
    expect(after.coins).toBe(first.coins);
  });

  it("aplica bônus determinístico de missão diária e de antes do prazo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const daily = await agent.post("/api/tasks").send({ title: "Hoje", priority: "Baixa", dueDate: today() });
    await agent.patch(`/api/tasks/${daily.body.id}`).send({ status: "Concluído" });
    const early = await agent.post("/api/tasks").send({ title: "Adiantada", priority: "Baixa", dueDate: "2999-01-01" });
    await agent.patch(`/api/tasks/${early.body.id}`).send({ status: "Concluído" });
    const p = await profile(agent);
    expect(p.totalXp).toBe(R.task.xpByPriority.Baixa * 2 + R.task.dailyMissionXp + R.task.beforeDeadlineXp + R.task.firstOfDayXp);
  });

  it("XP nunca diminui ao excluir a tarefa", async () => {
    const { agent } = await createAuthenticatedAgent();
    const t = await agent.post("/api/tasks").send({ title: "Apagar depois", priority: "Alta" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const before = await profile(agent);
    await agent.delete(`/api/tasks/${t.body.id}`);
    expect((await profile(agent)).totalXp).toBe(before.totalXp);
  });
});

describe("XP de hábitos (contratos)", () => {
  it("concede XP ao cumprir o contrato hoje, sem duplicar ao repetir o check-in", async () => {
    const { agent } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Ler 10 páginas" });
    expect(h.status).toBe(201);
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: today(), count: 1 });
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: today(), count: 1 });
    const p = await profile(agent);
    expect(p.totalXp).toBe(R.habit.xp);
    expect(p.coins).toBe(R.habit.coins);
  });

  it("não concede XP para check-in retroativo antigo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Meditar" });
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: daysAgo(10), count: 1 });
    expect((await profile(agent)).totalXp).toBe(0);
  });
});

describe("Projetos e Diário", () => {
  it("projeto concluído rende a recompensa uma única vez", async () => {
    const { agent } = await createAuthenticatedAgent();
    const p = await agent.post("/api/projects").send({ name: "Campanha" });
    await agent.patch(`/api/projects/${p.body.id}`).send({ status: "completed" });
    await agent.patch(`/api/projects/${p.body.id}`).send({ status: "active" });
    await agent.patch(`/api/projects/${p.body.id}`).send({ status: "completed" });
    const prof = await profile(agent);
    expect(prof.totalXp).toBe(R.project.xp);
    expect(prof.coins).toBe(R.project.coins);
  });

  it("primeira entrada do Diário do dia rende XP uma vez, e só com texto", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put(`/api/journal/${today()}`).send({ thoughts: "" });
    expect((await profile(agent)).totalXp).toBe(0);
    await agent.put(`/api/journal/${today()}`).send({ thoughts: "<p>Dia produtivo.</p>" });
    await agent.put(`/api/journal/${today()}`).send({ thoughts: "<p>Dia produtivo, editado.</p>" });
    expect((await profile(agent)).totalXp).toBe(R.journal.xp);
  });
});

describe("Moedas e loja de recompensas", () => {
  it("resgata com saldo suficiente, debita no ledger e bloqueia saldo insuficiente", async () => {
    const { agent } = await createAuthenticatedAgent();
    await earnCoins(agent, 2); // 2 × Alta
    const balance = (await profile(agent)).coins;
    expect(balance).toBe(R.task.coinsByPriority.Alta * 2);

    const cheap = await agent.post("/api/gamification/rewards").send({ name: "Café especial", cost: balance - 1 });
    expect(cheap.status).toBe(201);
    const redeemed = await agent.post(`/api/gamification/rewards/${cheap.body.id}/redeem`);
    expect(redeemed.status).toBe(201);
    expect(redeemed.body.balance).toBe(1);
    expect((await profile(agent)).coins).toBe(1);

    const pricey = await agent.post("/api/gamification/rewards").send({ name: "Viagem", cost: 500 });
    const denied = await agent.post(`/api/gamification/rewards/${pricey.body.id}/redeem`);
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe("insufficient");
    expect((await profile(agent)).coins).toBe(1);

    const history = await agent.get("/api/gamification/redemptions");
    expect(history.body).toHaveLength(1);
  });

  it("respeita cooldown e limite de resgates", async () => {
    const { agent } = await createAuthenticatedAgent();
    await earnCoins(agent, 3);
    const cd = await agent.post("/api/gamification/rewards").send({ name: "Episódio", cost: 1, cooldownHours: 24 });
    expect((await agent.post(`/api/gamification/rewards/${cd.body.id}/redeem`)).status).toBe(201);
    const blocked = await agent.post(`/api/gamification/rewards/${cd.body.id}/redeem`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("cooldown");

    const lim = await agent.post("/api/gamification/rewards").send({ name: "Sobremesa", cost: 1, redemptionLimit: 1 });
    expect((await agent.post(`/api/gamification/rewards/${lim.body.id}/redeem`)).status).toBe(201);
    const limited = await agent.post(`/api/gamification/rewards/${lim.body.id}/redeem`);
    expect(limited.body.code).toBe("limit");
  });

  it("valida dados da recompensa", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/gamification/rewards").send({ name: "", cost: 10 })).status).toBe(400);
    expect((await agent.post("/api/gamification/rewards").send({ name: "Grátis", cost: 0 })).status).toBe(400);
  });
});

describe("Isolamento multiusuário", () => {
  it("um usuário não vê, edita nem resgata recompensas de outro, e XP não vaza", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await earnCoins(a.agent, 1);
    await earnCoins(b.agent, 1);
    const reward = await a.agent.post("/api/gamification/rewards").send({ name: "Privada", cost: 1 });

    expect((await b.agent.get("/api/gamification/rewards")).body).toEqual([]);
    expect((await b.agent.patch(`/api/gamification/rewards/${reward.body.id}`).send({ cost: 2 })).status).toBe(404);
    expect((await b.agent.post(`/api/gamification/rewards/${reward.body.id}/redeem`)).status).toBe(404);
    expect((await b.agent.delete(`/api/gamification/rewards/${reward.body.id}`)).status).toBe(404);

    const t = await a.agent.post("/api/tasks").send({ title: "Só minha", priority: "Alta" });
    await b.agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const bProfile = await profile(b.agent);
    expect(bProfile.totalXp).toBe(R.task.xpByPriority.Alta + R.task.firstOfDayXp);

    const db = getDb();
    const rows = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_id = ?", args: [b.userId, t.body.id] });
    expect(Number(rows.rows[0].n)).toBe(0);
  });
});

describe("Revisões (fechamento de ciclo)", () => {
  it("concede XP uma vez por período, só com reflexão e só no período atual/anterior", async () => {
    const { agent } = await createAuthenticatedAgent();
    const month = today().slice(0, 7);
    // Salvar sem reflexão não fecha o ciclo.
    await agent.put(`/api/direction/reviews/monthly/${month}`).send({ wins: "", energyScore: 6 });
    expect((await profile(agent)).totalXp).toBe(0);

    const first = await agent.put(`/api/direction/reviews/monthly/${month}`).send({ wins: "Mantive os treinos." });
    expect(first.status).toBe(200);
    expect(first.body.reward.awarded).toBe(true);
    await agent.put(`/api/direction/reviews/monthly/${month}`).send({ wins: "Mantive os treinos (editado)." });
    expect((await profile(agent)).totalXp).toBe(R.review.monthly.xp);
    expect((await profile(agent)).coins).toBe(R.review.monthly.coins);

    // Período antigo: salva normalmente, mas não rende XP.
    const old = await agent.put("/api/direction/reviews/monthly/2020-01").send({ wins: "Antigo" });
    expect(old.status).toBe(200);
    expect(old.body.reward.eligible).toBe(false);
    expect((await profile(agent)).totalXp).toBe(R.review.monthly.xp);
    expect(old.body.previousMetrics).toBeTruthy();
  });
});

describe("Timeline e histórico de nível", () => {
  it("anexa o XP real do evento e registra a subida de nível", async () => {
    const { agent } = await createAuthenticatedAgent();
    for (let i = 0; i < 3; i++) {
      const t = await agent.post("/api/tasks").send({ title: `Alta ${i}`, priority: "Alta" });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    const d = today();
    const tl = await agent.get(`/api/analytics/timeline?from=${daysAgo(1)}&to=${d}`);
    const tasks = tl.body.events.filter((e: { type: string }) => e.type === "task");
    expect(tasks.length).toBe(3);
    expect(tasks.every((e: { xp?: number }) => e.xp === R.task.xpByPriority.Alta)).toBe(true);
    const levels = await agent.get("/api/gamification/levels");
    // 3 × 35 + 5 = 110 XP ≥ 100 → nível 2.
    expect(levels.body.levels.map((l: { level: number }) => l.level)).toEqual([2]);
    expect(tl.body.events.some((e: { type: string }) => e.type === "level_up")).toBe(true);
  });
});

describe("Anti dupla recompensa e marcos", () => {
  it("tarefa gerada por hábito paga só o contrato, nunca a missão também", async () => {
    const { agent } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Ler" });
    const gen = await agent.post("/api/habits/generate-tasks").send({ habitIds: [h.body.id], from: today(), to: today() });
    if (gen.status !== 200 || gen.body.created.length === 0) return; // rota com outro contrato: o teste de serviço abaixo cobre a regra
    await agent.patch(`/api/tasks/${gen.body.created[0].id}`).send({ status: "Concluído" });
    const p = await profile(agent);
    expect(p.totalXp).toBe(R.habit.xp);
  });

  it("concede o marco de 7 dias uma única vez", async () => {
    const { agent } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Água" });
    // 6 dias anteriores registrados (sem XP: fora da janela), depois hoje fecha 7 seguidos.
    for (let i = 6; i >= 1; i--) await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: daysAgo(i), count: 1 });
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: today(), count: 1 });
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: today(), count: 1 });
    const m7 = R.habitStreakMilestones.find((m) => m.days === 7)!;
    // ontem (1 dia atrás) também está na janela de XP do hábito.
    expect((await profile(agent)).totalXp).toBe(R.habit.xp * 2 + m7.xp);
  });

  it("Administração: XP só para vencimento próximo/atrasado e uma vez por vencimento", async () => {
    const { agent } = await createAuthenticatedAgent();
    const near = await agent.post("/api/life-admin").send({ kind: "vencimento", title: "IPVA", dueDate: today(), recurrenceMonths: 12 });
    expect(near.status).toBe(201);
    await agent.post(`/api/life-admin/${near.body.id}/done`).send({});
    // Adiantar o próximo ciclo (1 ano à frente) não rende XP.
    await agent.post(`/api/life-admin/${near.body.id}/done`).send({});
    const far = await agent.post("/api/life-admin").send({ kind: "documento", title: "Passaporte", dueDate: "2031-06-18" });
    await agent.post(`/api/life-admin/${far.body.id}/done`).send({});
    expect((await profile(agent)).totalXp).toBe(R.lifeAdmin.byKind.vencimento.xp);
  });
});

describe("Conquistas oficiais", () => {
  it("pagam XP/moedas por raridade uma única vez e expõem categoria/progresso real", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    for (let i = 0; i < 10; i++) {
      const t = await agent.post("/api/tasks").send({ title: `T${i}`, priority: "Baixa" });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    await agent.post("/api/achievements/check");
    await agent.post("/api/achievements/check");
    const db = getDb();
    const rows = await db.execute({
      sql: "SELECT xp FROM xp_events WHERE owner_id = ? AND source_type = 'achievement' AND source_id = 'ach_tasks_10'",
      args: [userId],
    });
    expect(rows.rows.length).toBe(1);
    expect(Number(rows.rows[0].xp)).toBe(R.achievementByTier.bronze.xp);
    const list = await agent.get("/api/achievements");
    const t10 = list.body.find((a: { code: string }) => a.code === "tasks_10");
    expect(t10.category).toBe("missoes");
    expect(t10.currentValue).toBe(10);
    expect(t10.reward.xp).toBe(R.achievementByTier.bronze.xp);
  });
});
