import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Banco — configurações (saldo e limite de crédito próprios)", () => {
  it("ajusta o saldo com um lançamento de diferença e respeita o limite de crédito definido", async () => {
    const { agent } = await createAuthenticatedAgent();

    const set = await agent.put("/api/bank/settings").send({ balance: 1200, creditLimit: 500 });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ balance: 1200, creditLimit: 500 });

    const summary = await agent.get("/api/bank");
    expect(summary.body.balance).toBe(1200);
    expect(summary.body.credit.manualLimit).toBe(500);
    expect(summary.body.credit.tier.maxAmount).toBe(500);

    // Acima do limite definido: recusa. Dentro: libera mesmo sem score.
    expect((await agent.post("/api/bank/loans").send({ amount: 501 })).status).toBe(400);
    const loan = await agent.post("/api/bank/loans").send({ amount: 400 });
    expect(loan.status).toBe(201);
    expect(loan.body.balance).toBe(1600);

    // Limite vazio volta ao limite pelo score.
    const reset = await agent.put("/api/bank/settings").send({ creditLimit: null });
    expect(reset.body.creditLimit).toBeNull();
  });

  it("investir com apelido/ícone/meta vazios (null) não dá mais 'Expected string, received null'", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put("/api/bank/settings").send({ balance: 1000 });
    const plans = (await agent.get("/api/bank")).body.plans as Array<{ id: string; minAmount: number }>;
    const res = await agent.post("/api/bank/deposits").send({ planId: plans[0]!.id, amount: Math.max(plans[0]!.minAmount, 50), label: null, icon: null, goalId: null });
    expect(res.status).toBe(201);
  });
});
