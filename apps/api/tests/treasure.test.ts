import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { getRewardAvailability, isSimilarRewardName, periodWindow } from "../src/services/treasureEngine.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];

/** Crédito direto no ledger (simula moedas/gemas ganhas por ações reais). */
async function credit(userId: string, amount: number, ledger: "coin_ledger" | "gem_ledger" = "coin_ledger") {
  await getDb().execute({
    sql: `INSERT INTO ${ledger} (id, owner_id, amount, source_type, source_id, event_type, label) VALUES (?, ?, ?, 'teste', ?, 'earned', 'teste')`,
    args: [nanoid(), userId, amount, nanoid()],
  });
}
const wallet = async (agent: Agent) => (await agent.get("/api/gamification/treasure")).body.summary as { coins: number; gems: number; availableCount: number; level: number };
const newReward = async (agent: Agent, body: Record<string, unknown>) => (await agent.post("/api/gamification/rewards").send({ name: `R ${nanoid(5)}`, ...body })).body as { id: string };

const baseReward = {
  isActive: true,
  cost: 10,
  currency: "coin" as const,
  requiredLevel: null,
  requiredXp: null,
  requiredAchievementId: null,
  redemptionLimit: null,
  timesRedeemed: 0,
  cooldownHours: 0,
  lastRedeemedAt: null,
  limitPeriod: "none" as const,
  redeemedInPeriod: 0,
};
const baseWallet = { coins: 50, gems: 0, level: 3, totalXp: 900, achievementIds: new Set<string>() };

describe("Regras puras do Tesouro", () => {
  it("getRewardAvailability explica o bloqueio e o que falta", () => {
    const now = new Date();
    expect(getRewardAvailability(baseReward, baseWallet, now, null).available).toBe(true);
    const lvl = getRewardAvailability({ ...baseReward, requiredLevel: 5 }, baseWallet, now, null);
    expect([lvl.code, lvl.missingLevel]).toEqual(["level", 2]);
    const coins = getRewardAvailability({ ...baseReward, cost: 80 }, baseWallet, now, null);
    expect([coins.code, coins.missingCoins]).toEqual(["insufficient", 30]);
    const gems = getRewardAvailability({ ...baseReward, currency: "gem", cost: 2 }, baseWallet, now, null);
    expect([gems.code, gems.missingGems]).toEqual(["insufficient", 2]);
    const cd = getRewardAvailability({ ...baseReward, cooldownHours: 24, lastRedeemedAt: now.toISOString() }, baseWallet, now, null);
    expect(cd.code).toBe("cooldown");
    expect(cd.nextAvailableAt).not.toBeNull();
    expect(getRewardAvailability({ ...baseReward, limitPeriod: "week", redeemedInPeriod: 1 }, baseWallet, now, new Date()).code).toBe("period_limit");
    expect(getRewardAvailability({ ...baseReward, redemptionLimit: 1, timesRedeemed: 1 }, baseWallet, now, null).code).toBe("sold_out");
    expect(getRewardAvailability({ ...baseReward, requiredAchievementId: "a1" }, baseWallet, now, null).code).toBe("achievement");
  });

  it("janelas de período no fuso do usuário e nomes parecidos", () => {
    const at = new Date("2026-10-07T15:00:00Z"); // quarta
    const w = periodWindow("week", at, "America/Sao_Paulo");
    expect(w.start.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    expect(periodWindow("month", at, "America/Sao_Paulo").start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(isSimilarRewardName("Café Especial!", "cafe especial")).toBe(true);
    expect(isSimilarRewardName("1h de videogame", "Tempo de videogame")).toBe(false);
    expect(isSimilarRewardName("Netflix", "1h extra de Netflix")).toBe(true);
  });
});

describe("Resgate transacional", () => {
  it("mesma requestId não gasta duas vezes (clique duplo/refresh)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 30);
    const r = await newReward(agent, { cost: 10 });
    const first = await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({ requestId: "req-12345678" });
    const again = await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({ requestId: "req-12345678" });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.redemptionId).toBe(first.body.redemptionId);
    expect((await wallet(agent)).coins).toBe(20);
  });

  it("corrida entre dois resgates nunca deixa saldo negativo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 10);
    const r = await newReward(agent, { cost: 10 });
    const results = await Promise.all([
      agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({ requestId: "par-aaaaaaaa" }),
      agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({ requestId: "par-bbbbbbbb" }),
    ]);
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect((await wallet(agent)).coins).toBe(0);
  });

  it("bloqueia nível insuficiente e limite por período", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 100);
    const locked = await newReward(agent, { cost: 5, requiredLevel: 4 });
    const denied = await agent.post(`/api/gamification/rewards/${locked.id}/redeem`).send({});
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe("requirement");

    const daily = await newReward(agent, { cost: 5, limitPeriod: "day" });
    expect((await agent.post(`/api/gamification/rewards/${daily.id}/redeem`).send({})).status).toBe(201);
    const second = await agent.post(`/api/gamification/rewards/${daily.id}/redeem`).send({});
    expect(second.body.code).toBe("period_limit");
    expect((await wallet(agent)).coins).toBe(95);
  });

  it("recompensa em gemas debita só gemas", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 50);
    const r = await newReward(agent, { cost: 3, currency: "gem", rarity: "lendario" });
    expect((await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({})).body.code).toBe("insufficient");
    await credit(userId, 5, "gem_ledger");
    const ok = await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({});
    expect(ok.status).toBe(201);
    const w = await wallet(agent);
    expect([w.coins, w.gems]).toEqual([50, 2]);
    expect((await agent.post("/api/gamification/rewards").send({ name: "Cara demais", cost: 999, currency: "gem" })).status).toBe(400);
  });
});

describe("Inventário, uso, estorno e histórico", () => {
  it("resgate vai para o inventário; usar consome; cancelar estorna uma única vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 40);
    const r = await newReward(agent, { cost: 10 });
    const a = await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({});
    const b = await agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({});
    let inv = (await agent.get("/api/gamification/inventory")).body;
    expect(inv).toHaveLength(1);
    expect(inv[0].quantity).toBe(2);

    expect((await agent.post(`/api/gamification/redemptions/${a.body.redemptionId}/use`)).status).toBe(200);
    expect((await agent.post(`/api/gamification/redemptions/${a.body.redemptionId}/use`)).status).toBe(409);
    expect((await agent.post(`/api/gamification/redemptions/${a.body.redemptionId}/cancel`)).status).toBe(409);

    const cancel = await agent.post(`/api/gamification/redemptions/${b.body.redemptionId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.balance).toBe(30);
    expect((await agent.post(`/api/gamification/redemptions/${b.body.redemptionId}/cancel`)).status).toBe(409);
    expect((await wallet(agent)).coins).toBe(30);

    inv = (await agent.get("/api/gamification/inventory")).body;
    expect(inv).toHaveLength(0);
    const used = (await agent.get("/api/gamification/redemptions?status=used")).body;
    const canceled = (await agent.get("/api/gamification/redemptions?status=canceled")).body;
    expect([used.length, canceled.length]).toEqual([1, 1]);
  });

  it("isolamento: outro usuário não usa, cancela nem vê o inventário", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await credit(a.userId, 20);
    const r = await newReward(a.agent, { cost: 5 });
    const red = await a.agent.post(`/api/gamification/rewards/${r.id}/redeem`).send({});
    expect((await b.agent.post(`/api/gamification/redemptions/${red.body.redemptionId}/use`)).status).toBe(409);
    expect((await b.agent.post(`/api/gamification/redemptions/${red.body.redemptionId}/cancel`)).status).toBe(409);
    expect((await b.agent.get("/api/gamification/inventory")).body).toEqual([]);
    expect((await b.agent.get("/api/gamification/redemptions")).body).toEqual([]);
    expect((await b.agent.get("/api/gamification/treasure")).body.rewards).toEqual([]);
  });
});

describe("Tesouro: KPIs e gemas", () => {
  it("resumo conta recompensas disponíveis e gemas vêm de marcos reais (idempotente)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await credit(userId, 12);
    await newReward(agent, { cost: 10 });
    await newReward(agent, { cost: 50 });
    let t = (await agent.get("/api/gamification/treasure")).body;
    expect(t.summary.availableCount).toBe(1);
    expect(t.summary.gems).toBe(0);
    expect(t.goals.length).toBeGreaterThan(0);

    // Sobe de nível com tarefas reais → 1 gema por nível alcançado.
    for (let i = 0; i < 30 && (await wallet(agent)).level < 2; i++) {
      const task = await agent.post("/api/tasks").send({ title: `Alta ${i}`, priority: "Alta" });
      await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });
    }
    t = (await agent.get("/api/gamification/treasure")).body;
    expect(t.summary.level).toBeGreaterThanOrEqual(2);
    expect(t.summary.gems).toBe(t.summary.level - 1);
    await agent.get("/api/gamification/treasure");
    expect((await wallet(agent)).gems).toBe(t.summary.level - 1);
  });
});
