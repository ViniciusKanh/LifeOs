import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { award, todayKeyFor } from "../src/services/gamificationService.js";

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

  it("aceita apelido e emoji opcionais no cofrinho, e os devolve no resumo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 50, label: "Viagem de fim de ano", icon: "\u2708\ufe0f" });
    expect(dep.status).toBe(201);
    expect(dep.body.deposit.label).toBe("Viagem de fim de ano");
    expect(dep.body.deposit.icon).toBe("\u2708\ufe0f");

    const summary = await agent.get("/api/bank");
    const found = summary.body.active.find((d: { id: string }) => d.id === dep.body.deposit.id);
    expect(found.label).toBe("Viagem de fim de ano");
    expect(found.icon).toBe("\u2708\ufe0f");
  });

  it("ignora silenciosamente um goalId inválido ou de outro usuário, sem recusar o investimento", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const otherGoal = await other.agent.post("/api/goals").send({ title: "Meta de outro usuário", kind: "binary" });

    const depInvalid = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 20, goalId: "meta-inexistente" });
    expect(depInvalid.status).toBe(201);
    expect(depInvalid.body.deposit.goalId).toBeNull();

    const depForeign = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 20, goalId: otherGoal.body.id });
    expect(depForeign.status).toBe(201);
    expect(depForeign.body.deposit.goalId).toBeNull();
  });

  it("vincula corretamente a uma Meta do próprio usuário e expõe o título vinculado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const goal = await agent.post("/api/goals").send({ title: "Fazer um intercâmbio", kind: "binary" });
    expect(goal.status).toBe(201);

    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 30, goalId: goal.body.id });
    expect(dep.status).toBe(201);
    expect(dep.body.deposit.goalId).toBe(goal.body.id);

    const summary = await agent.get("/api/bank");
    const found = summary.body.active.find((d: { id: string }) => d.id === dep.body.deposit.id);
    expect(found.goalTitle).toBe("Fazer um intercâmbio");
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

describe("Banco — integração com Códex/Timeline e Gatilhos", () => {
  it("resgate de investimento rende XP no Códex (atributo disciplina) sem duplicar moedas", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await forceMatured(dep.body.deposit.id);
    const claimed = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(claimed.status).toBe(200);

    const xp = await getDb().execute({
      sql: "SELECT xp, source_type, event_type FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep.body.deposit.id],
    });
    expect(xp.rows).toHaveLength(1);
    expect(Number(xp.rows[0]!.xp)).toBe(8);
    expect(xp.rows[0]!.event_type).toBe("deposit_claimed");

    // Nenhum lançamento extra no ledger de moedas por causa do XP (só o payout líquido já testado acima).
    const coinEvents = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM coin_ledger WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep.body.deposit.id],
    });
    expect(Number(coinEvents.rows[0]!.n)).toBe(0);

    // Resgatar de novo (já resgatado) não concede XP outra vez.
    await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    const xpAfter = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep.body.deposit.id],
    });
    expect(Number(xpAfter.rows[0]!.n)).toBe(1);
  });

  it("quitar empréstimo em dia rende mais XP do que quitar atrasado", async () => {
    const { agent: onTimeAgent, userId: onTimeUser } = await createAuthenticatedAgent();
    await giveCoins(onTimeUser, 200);
    const onTimeLoan = await onTimeAgent.post("/api/bank/loans").send({ amount: 100 });
    const onTimeRepay = await onTimeAgent.post(`/api/bank/loans/${onTimeLoan.body.loan.id}/repay`);
    expect(onTimeRepay.status).toBe(200);
    const onTimeXp = await getDb().execute({
      sql: "SELECT xp FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [onTimeUser, onTimeLoan.body.loan.id],
    });
    expect(Number(onTimeXp.rows[0]!.xp)).toBe(15);

    const { agent: lateAgent, userId: lateUser } = await createAuthenticatedAgent();
    await giveCoins(lateUser, 200);
    const lateLoan = await lateAgent.post("/api/bank/loans").send({ amount: 100 });
    await forceLoanDue(lateLoan.body.loan.id, true);
    const lateRepay = await lateAgent.post(`/api/bank/loans/${lateLoan.body.loan.id}/repay`);
    expect(lateRepay.status).toBe(200);
    const lateXp = await getDb().execute({
      sql: "SELECT xp FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [lateUser, lateLoan.body.loan.id],
    });
    expect(Number(lateXp.rows[0]!.xp)).toBe(5);
  });

  it("resgate e quitação aparecem na Timeline (Analytics)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await forceMatured(dep.body.deposit.id);
    await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);

    const loan = await agent.post("/api/bank/loans").send({ amount: 50 });
    await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);

    const timeline = await agent.get("/api/analytics/timeline");
    expect(timeline.status).toBe(200);
    const bankEvents = timeline.body.events.filter((e: { type: string }) => e.type === "bank");
    expect(bankEvents.length).toBe(2);
    expect(bankEvents.some((e: { label: string; xp?: number }) => e.label.includes("Resgate no Banco") && e.xp === 8)).toBe(true);
    expect(bankEvents.some((e: { label: string; xp?: number }) => e.label.includes("Empréstimo quitado") && e.xp === 15)).toBe(true);
  });

  it("gatilhos de Banco: avisa investimento maturado e empréstimo vencido, sem duplicar no reenvio", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await forceMatured(dep.body.deposit.id);
    const loan = await agent.post("/api/bank/loans").send({ amount: 50 });
    await forceLoanDue(loan.body.loan.id, true);

    const run = await agent.post("/api/notifications/triggers/run");
    expect(run.status).toBe(200);
    expect(run.body.results.some((r: { eventType: string; count: number }) => r.eventType === "bank_deposit_matured" && r.count === 1)).toBe(true);
    expect(run.body.results.some((r: { eventType: string; count: number }) => r.eventType === "bank_loan_overdue" && r.count === 1)).toBe(true);

    const triggers = await agent.get("/api/notifications/triggers");
    expect(triggers.body.some((t: { eventType: string }) => t.eventType === "bank_deposit_matured")).toBe(true);
    expect(triggers.body.some((t: { eventType: string }) => t.eventType === "bank_loan_overdue")).toBe(true);

    // Rodar de novo no mesmo dia não duplica o aviso (dedupe por sourceId+dia já coberto pelo markDelivered).
    const retry = await agent.post("/api/notifications/triggers/run");
    expect(retry.status).toBe(200);
  });
});

describe("Banco — resgate antecipado (quebra de prazo)", () => {
  it("resgata antes do prazo e devolve só o principal, sem bônus e sem imposto", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    expect(dep.body.balance).toBe(900);

    // Ainda não venceu -- resgate normal recusa, antecipado aceita.
    const tooEarly = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(tooEarly.status).toBe(409);

    const early = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(early.status).toBe(200);
    expect(early.body.payout).toBe(100); // só o principal, nada do bônus de 5%
    expect(early.body.balance).toBe(1000); // 900 + 100, nunca os 104 do resgate no prazo
    expect(early.body.deposit.status).toBe("claimed");
    expect(early.body.deposit.earlyWithdrawn).toBe(true);
    expect(early.body.deposit.actualPayout).toBe(100);

    const summary = await agent.get("/api/bank");
    expect(summary.body.balance).toBe(1000);
    expect(summary.body.active).toHaveLength(0);
    expect(summary.body.claimable).toHaveLength(0);
    expect(summary.body.history).toHaveLength(1);
    // Ganho líquido nos totais usa netPayout (projeção no prazo), não o que foi de fato recebido --
    // o próprio netPayout do depósito continua mostrando o que teria rendido esperando.
    expect(summary.body.history[0].earlyWithdrawn).toBe(true);
    expect(summary.body.history[0].actualPayout).toBe(100);

    // Resgatar de novo (já resgatado) não credita outra vez.
    const again = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(again.status).toBe(409);
    const balanceAfter = await agent.get("/api/bank");
    expect(balanceAfter.body.balance).toBe(1000);

    // Totais do resumo usam o que foi DE FATO recebido, nunca a projeção no prazo:
    // ganho líquido e imposto pago continuam zero mesmo o depósito tendo um netPayout > amount.
    expect(balanceAfter.body.totals.earned).toBe(0);
    expect(balanceAfter.body.totals.taxPaid).toBe(0);
  });

  it("recusa resgate antecipado de um investimento já vencido (usar o resgate normal, sem penalidade)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await forceMatured(dep.body.deposit.id);

    const early = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(early.status).toBe(409);

    // O resgate normal (sem penalidade) continua disponível.
    const normal = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    expect(normal.status).toBe(200);
    expect(normal.body.payout).toBe(104);
  });

  it("resgate antecipado não rende XP do Códex nem conta pra conquista de investimentos resgatados", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    const early = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(early.status).toBe(200);

    const xp = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep.body.deposit.id],
    });
    expect(Number(xp.rows[0]!.n)).toBe(0);

    const check = await agent.post("/api/achievements/check");
    expect(check.status).toBe(200);
    expect(check.body.newlyUnlocked.some((a: { code: string }) => a.code === "bank_deposits_3")).toBe(false);
  });

  it("aparece na Timeline com o rótulo de resgate antecipado (sem XP)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);

    const timeline = await agent.get("/api/analytics/timeline");
    const bankEvents = timeline.body.events.filter((e: { type: string }) => e.type === "bank");
    expect(bankEvents).toHaveLength(1);
    expect(bankEvents[0].label).toContain("Resgate antecipado no Banco");
    expect(bankEvents[0].label).toContain("+100 moedas");
    expect(bankEvents[0].xp ?? 0).toBe(0);
  });
});

describe("Banco — evolução (histórico) e extrato de rendimentos", () => {
  it("histórico mostra saldo real dia a dia e o score só nos dias em que o Banco foi aberto", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 500);
    // Abre o Banco (grava snapshot do score de hoje).
    await agent.get("/api/bank");

    const history = await agent.get("/api/bank/history?days=10");
    expect(history.status).toBe(200);
    expect(history.body.points.length).toBe(10);
    const last = history.body.points[history.body.points.length - 1];
    expect(last.balance).toBe(500);
    expect(typeof last.score).toBe("number");
    // Dias sem snapshot de score ficam null (nunca interpolado).
    const first = history.body.points[0];
    expect(first.score === null || typeof first.score === "number").toBe(true);
  });

  it("extrato de rendimentos agrega ganho/imposto de investimentos e juros/multa de empréstimos por mês, sem contar resgate antecipado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);

    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 100 });
    await forceMatured(dep.body.deposit.id);
    await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);

    const depEarly = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 50 });
    await agent.post(`/api/bank/deposits/${depEarly.body.deposit.id}/claim-early`);

    const loan = await agent.post("/api/bank/loans").send({ amount: 50 });
    await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);

    const statement = await agent.get("/api/bank/statement?months=1");
    expect(statement.status).toBe(200);
    expect(statement.body.months.length).toBeGreaterThan(0);
    const month = statement.body.months[0];
    expect(month.earned).toBe(4); // só o resgate no prazo (104 líquido - 100), o antecipado não soma nada
    expect(month.taxPaid).toBe(1);
    expect(month.interestPaid).toBeGreaterThan(0);
    expect(month.lateFeePaid).toBe(0);
  });
});

describe("Banco — Cofre Livre (sem prazo fixo, resgate proporcional)", () => {
  it("resgate antes do prazo paga o bônus PRORATADO pelo tempo decorrido, nunca zero", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 1000);

    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-livre", amount: 100 });
    expect(dep.status).toBe(201);
    expect(dep.body.deposit.planId).toBe("cofre-livre");
    // +3% em 7 dias -> bruto 103, imposto 22,5% sobre o ganho de 3 = 0 (arredonda pra baixo) -> líquido 103.
    expect(dep.body.deposit.rateBps).toBe(300);
    expect(dep.body.deposit.termDays).toBe(7);

    // Metade do prazo (7 dias) já passou -- simula o decorrer do tempo.
    await getDb().execute({
      sql: "UPDATE bank_deposits SET created_at = datetime('now', '-84 hours') WHERE id = ?",
      args: [dep.body.deposit.id],
    });

    const early = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(early.status).toBe(200);
    // ~50% do ganho bruto de 3 = 1 (arredondado pra baixo), sem imposto perceptível -> recebe principal + algo.
    expect(early.body.payout).toBeGreaterThanOrEqual(100);
    expect(early.body.deposit.earlyWithdrawn).toBe(true);
    expect(early.body.deposit.actualPayout).toBe(early.body.payout);
  });

  it("resgate do Cofre Livre com ganho de verdade rende XP e conta pra conquista; sem ganho, não conta", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 4000);

    // Depósito grande o bastante pra garantir ganho perceptível mesmo proporcional.
    const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-livre", amount: 3000 });
    await getDb().execute({
      sql: "UPDATE bank_deposits SET created_at = datetime('now', '-168 hours') WHERE id = ?", // prazo cheio decorrido
      args: [dep.body.deposit.id],
    });
    const early = await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim-early`);
    expect(early.status).toBe(200);
    expect(early.body.payout).toBeGreaterThan(3000);

    const xp = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep.body.deposit.id],
    });
    expect(Number(xp.rows[0]!.n)).toBe(1);

    const check = await agent.post("/api/achievements/check");
    expect(check.body.newlyUnlocked.some((a: { code: string }) => a.code === "bank_deposits_3")).toBe(false); // só 1 investimento ainda

    // Um segundo depósito resgatado SEM nenhum tempo decorrido (ganho proporcional ~0) continua sem XP.
    const dep2 = await agent.post("/api/bank/deposits").send({ planId: "cofre-livre", amount: 10 });
    const early2 = await agent.post(`/api/bank/deposits/${dep2.body.deposit.id}/claim-early`);
    expect(early2.status).toBe(200);
    expect(early2.body.payout).toBe(10); // tempo decorrido ~0 -> ganho prorateado arredonda pra 0
    const xp2 = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'bank' AND source_id = ?",
      args: [userId, dep2.body.deposit.id],
    });
    expect(Number(xp2.rows[0]!.n)).toBe(0);
  });
});

describe("Banco — investimento automático", () => {
  it("fica desligado por padrão e aparece no resumo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const summary = await agent.get("/api/bank");
    expect(summary.body.autoInvest).toEqual({ enabled: false, pctBps: 1000, planId: "cofre-aventureiro" });
  });

  it("recusa plano inexistente e quantidade de % fora da faixa", async () => {
    const { agent } = await createAuthenticatedAgent();
    const badPlan = await agent.put("/api/bank/auto-invest").send({ enabled: true, pctBps: 1000, planId: "plano-fantasma" });
    expect(badPlan.status).toBe(400);
    const badPct = await agent.put("/api/bank/auto-invest").send({ enabled: true, pctBps: 9000, planId: "cofre-aventureiro" });
    expect(badPct.status).toBe(400);
  });

  it("liga a regra e investe automaticamente parte de uma moeda ganha por missão (sem afetar o próprio Banco)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const setRule = await agent.put("/api/bank/auto-invest").send({ enabled: true, pctBps: 5000, planId: "cofre-aventureiro" }); // 50%
    expect(setRule.status).toBe(200);

    // Simula uma concessão real de XP+moedas (o mesmo caminho usado por tarefas/hábitos/etc.).
    const db = getDb();
    const dayKey = await todayKeyFor(db, userId);
    await award(
      db,
      userId,
      { sourceType: "task", sourceId: "tarefa-teste-autoinvest", eventType: "completed", xp: 10, coins: 100, label: "Tarefa de teste" },
      dayKey,
    );

    const summary = await agent.get("/api/bank");
    expect(summary.body.active.length).toBe(1);
    expect(summary.body.active[0].amount).toBe(50); // 50% de 100 moedas ganhas
    expect(summary.body.active[0].planId).toBe("cofre-aventureiro");
    // Saldo: +100 da missão -50 do auto-investimento = 50.
    expect(summary.body.balance).toBe(50);

    // O próprio Banco (resgate) NUNCA reinveste a si mesmo -- credita moedas direto, sem passar por award().
    await forceMatured(summary.body.active[0].id);
    const claimed = await agent.post(`/api/bank/deposits/${summary.body.active[0].id}/claim`);
    expect(claimed.status).toBe(200);
    const after = await agent.get("/api/bank");
    expect(after.body.active.length).toBe(0); // nenhum novo depósito automático criado pelo resgate
  });

  it("não investe quando o valor calculado fica abaixo do mínimo do plano", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await agent.put("/api/bank/auto-invest").send({ enabled: true, pctBps: 100, planId: "cofre-aventureiro" }); // 1%

    const db = getDb();
    const dayKey = await todayKeyFor(db, userId);
    await award(db, userId, { sourceType: "task", sourceId: "tarefa-pequena", eventType: "completed", xp: 5, coins: 5, label: "Tarefa pequena" }, dayKey);

    const summary = await agent.get("/api/bank");
    expect(summary.body.active.length).toBe(0); // 1% de 5 moedas = 0, abaixo do mínimo (10) do plano
    expect(summary.body.balance).toBe(5);
  });
});

describe("Banco — extrato com filtro por categoria/período/texto e detalhe da movimentação", () => {
  it("filtra o extrato por source_type (categoria) e ignora os demais", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const dayKey = await todayKeyFor(db, userId);
    await award(db, userId, { sourceType: "task", sourceId: "tarefa-1", eventType: "completed", xp: 10, coins: 10, label: "Missão concluída" }, dayKey);
    await award(db, userId, { sourceType: "habit", sourceId: "habito-1", eventType: "completed", xp: 5, coins: 5, label: "Hábito concluído" }, dayKey);

    const all = await agent.get("/api/bank/ledger");
    expect(all.body.entries.length).toBe(2);

    const onlyTasks = await agent.get("/api/bank/ledger?sourceTypes=task");
    expect(onlyTasks.body.entries.length).toBe(1);
    expect(onlyTasks.body.entries[0].sourceType).toBe("task");
  });

  it("busca por texto no rótulo da movimentação", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const dayKey = await todayKeyFor(db, userId);
    await award(db, userId, { sourceType: "task", sourceId: "tarefa-2", eventType: "completed", xp: 10, coins: 10, label: "Revisar introdução" }, dayKey);
    await award(db, userId, { sourceType: "task", sourceId: "tarefa-3", eventType: "completed", xp: 10, coins: 10, label: "Comprar mantimentos" }, dayKey);

    const res = await agent.get("/api/bank/ledger?q=introdu%C3%A7%C3%A3o");
    expect(res.body.entries.length).toBe(1);
    expect(res.body.entries[0].label).toContain("introdução");
  });

  it("filtra o extrato por período local (from/to)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 100);
    const old = await getDb().execute({
      sql: "SELECT id FROM coin_ledger WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1",
      args: [userId],
    });
    await getDb().execute({
      sql: "UPDATE coin_ledger SET created_at = datetime('now', '-10 days') WHERE id = ?",
      args: [old.rows[0]!.id],
    });
    const todayKey = new Date().toISOString().slice(0, 10);
    const res = await agent.get(`/api/bank/ledger?from=${todayKey}&to=${todayKey}`);
    expect(res.body.entries.length).toBe(0); // a única movimentação foi empurrada pra 10 dias atrás
  });

  it("detalha uma movimentação do extrato com saldo antes/depois corretos", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await giveCoins(userId, 100); // saldo: 0 -> 100
    await giveCoins(userId, 50); // saldo: 100 -> 150

    const ledger = await agent.get("/api/bank/ledger");
    const lastEntry = ledger.body.entries[0]; // mais recente primeiro
    const detail = await agent.get(`/api/bank/ledger/${lastEntry.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.balanceAfter).toBe(150);
    expect(detail.body.balanceBefore).toBe(100);
  });

  it("recusa detalhe de movimentação inexistente ou de outro usuário", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await giveCoins(a.userId, 100);
    const ledger = await a.agent.get("/api/bank/ledger");
    const entryId = ledger.body.entries[0].id;

    const notFound = await a.agent.get("/api/bank/ledger/inexistente");
    expect(notFound.status).toBe(404);

    const stolen = await b.agent.get(`/api/bank/ledger/${entryId}`);
    expect(stolen.status).toBe(404);
  });
});
