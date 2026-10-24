import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

/** Credita moedas direto no ledger, simulando XP de missões já concedido. */
async function giveCoins(userId: string, amount: number) {
  await getDb().execute({
    sql: "INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label) VALUES (?, ?, ?, 'teste', ?, 'credito', 'teste')",
    args: [nanoid(), userId, amount, nanoid()],
  });
}

async function forceMatured(depositId: string) {
  await getDb().execute({
    sql: "UPDATE bank_deposits SET matures_at = datetime('now', '-1 minute') WHERE id = ?",
    args: [depositId],
  });
}

describe("Banco — investimentos de moedas", () => {
  it("lista os planos e o saldo mesmo sem nenhum depósito", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/bank");
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
    expect(res.body.plans.length).toBeGreaterThan(0);
    expect(res.body.active).toEqual([]);
  });

  it("recusa investimento sem saldo suficiente, sem debitar nada", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 5);
    const res = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 10 });
    expect(res.status).toBe(402);
    const after = await agent.get("/api/bank");
    expect(after.body.balance).toBe(5);
  });

  it("recusa quantia fora do mínimo/máximo do plano", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const res = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 1 });
    expect(res.status).toBe(400);
  });

  it("investe, debita o saldo na hora e só libera o resgate depois do prazo (líquido, com imposto)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);

    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    expect(dep.status).toBe(201);
    // cofre-aventureiro: +5% bruto (105), imposto 22,5% sobre o ganho de 5 = 1 -> líquido 104.
    expect(dep.body.deposit.payout).toBe(105);
    expect(dep.body.deposit.taxBps).toBe(2250);
    expect(dep.body.deposit.netPayout).toBe(104);
    expect(dep.body.balance).toBe(900);

    const summary = await agent.get("/api/bank");
    expect(summary.body.balance).toBe(900);
    expect(summary.body.active).toHaveLength(1);
    expect(summary.body.claimable).toHaveLength(0);

    const tooEarly = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(tooEarly.status).toBe(409);

    await forceMatured(dep.body.deposit.id);
    const claimed = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(claimed.status).toBe(200);
    expect(claimed.body.payout).toBe(104); // líquido, já com o imposto descontado
    expect(claimed.body.balance).toBe(1004); // 900 + 104

    // Resgatar de novo não credita outra vez (idempotente).
    const again = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(again.status).toBe(409);
    const final = await agent.get("/api/bank");
    expect(final.body.balance).toBe(1004);
    expect(final.body.history).toHaveLength(1);
    expect(final.body.totals.earned).toBe(4); // 104 líquido - 100 principal
    expect(final.body.totals.taxPaid).toBe(1);

    // Extrato mostra o depósito (gasto) e o resgate (ganho) na ordem certa.
    const ledger = await agent.get("/api/bank/ledger");
    expect(ledger.status).toBe(200);
    const labels = ledger.body.entries.map((e: { label: string }) => e.label);
    expect(labels.some((l: string) => l.includes("Investido"))).toBe(true);
    expect(labels.some((l: string) => l.includes("Resgate"))).toBe(true);
  });

  it("respeita o limite de investimentos ativos por plano", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 100_000);
    // cofre-aventureiro: maxActive = 5
    for (let i = 0; i < 5; i++) {
      const r = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 10 });
      expect(r.status).toBe(201);
    }
    const sixth = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 10 });
    expect(sixth.status).toBe(409);
  });

  it("isola investimentos entre usuários diferentes", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await giveCoins(a.userId, 1000);
    const dep = await a.agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 50 });
    await forceMatured(dep.body.deposit.id);
    const stolen = await b.agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(stolen.status).toBe(404);
  });
});
