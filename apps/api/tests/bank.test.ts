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

async function forceLoanDue(loanId: string, overdue: boolean) {
  await getDb().execute({
    sql: `UPDATE bank_loans SET due_at = datetime('now', ?) WHERE id = ?`,
    args: [overdue ? "-1 minute" : "+1 day", loanId],
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

describe("Banco — crédito (empréstimos)", () => {
  it("score inicial libera o limite do Escudeiro do Crédito e recusa valor acima dele", async () => {
    const { agent } = await createAuthenticatedAgent();
    const summary = await agent.get("/api/bank");
    expect(summary.body.credit.score).toBe(500);
    expect(summary.body.credit.tier.label).toBe("Escudeiro do Crédito");
    expect(summary.body.credit.tier.maxAmount).toBe(300);

    const tooMuch = await agent.post("/api/bank/loans").send({ amount: 500 });
    expect(tooMuch.status).toBe(400);
  });

  it("pede, não permite um segundo empréstimo simultâneo, e paga em dia sem multa", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 200); // precisa ter moedas de sobra -- o empréstimo nunca deixa o saldo negativo.

    const loan = await agent.post("/api/bank/loans").send({ amount: 100 });
    expect(loan.status).toBe(201);
    expect(loan.body.loan.totalDue).toBe(118); // 100 + 18% de juros (tier Escudeiro)
    expect(loan.body.balance).toBe(300); // 200 de saldo + 100 do empréstimo

    const second = await agent.post("/api/bank/loans").send({ amount: 50 });
    expect(second.status).toBe(409);

    const repay = await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);
    expect(repay.status).toBe(200);
    expect(repay.body.paid).toBe(118); // sem multa, pagou em dia
    expect(repay.body.balance).toBe(182); // 300 - 118

    // Extrato mostra o empréstimo (ganho) e a quitação (gasto).
    const ledger = await agent.get("/api/bank/ledger");
    const labels = ledger.body.entries.map((e: { label: string }) => e.label);
    expect(labels.some((l: string) => l.includes("Empréstimo"))).toBe(true);
    expect(labels.some((l: string) => l.includes("Quitação"))).toBe(true);

    // Agora pode pedir outro, já que o anterior foi quitado.
    const another = await agent.post("/api/bank/loans").send({ amount: 10 });
    expect(another.status).toBe(201);
  });

  it("cobra multa quando o pagamento é feito depois do vencimento, e isso derruba o score", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 100);

    const loan = await agent.post("/api/bank/loans").send({ amount: 100 });
    await forceLoanDue(loan.body.loan.id, true);
    const repay = await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);
    expect(repay.status).toBe(200);
    expect(repay.body.paid).toBe(130); // 118 + 10% de multa (12, arredondado pra cima)
    expect(repay.body.balance).toBe(70); // (100 + 100 do empréstimo) - 130

    const summary = await agent.get("/api/bank");
    expect(summary.body.credit.score).toBe(440); // 500 - 60 por pagar atrasado
  });

  it("recusa a quitação sem moedas suficientes, sem mexer no empréstimo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const loan = await agent.post("/api/bank/loans").send({ amount: 100 }); // balance = 100, precisa de 118
    const repay = await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);
    expect(repay.status).toBe(402);
    const summary = await agent.get("/api/bank");
    expect(summary.body.loan.active.id).toBe(loan.body.loan.id);
  });

  it("isola empréstimos entre usuários diferentes", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const loan = await a.agent.post("/api/bank/loans").send({ amount: 50 });
    const stolen = await b.agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);
    expect(stolen.status).toBe(404);
  });
});
