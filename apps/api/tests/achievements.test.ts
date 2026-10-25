import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Conquistas (gamificação real)", () => {
  it("destrava 'Produtivo' ao completar 10 tarefas, e nunca antes disso", async () => {
    const { agent } = await createAuthenticatedAgent();

    // 9 tarefas concluídas: ainda não deve destravar.
    for (let i = 0; i < 9; i++) {
      const created = await agent.post("/api/tasks").send({ title: `Tarefa ${i}` });
      await agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });
    }
    const beforeCheck = await agent.post("/api/achievements/check");
    expect(beforeCheck.body.newlyUnlocked).toEqual([]);

    const beforeList = await agent.get("/api/achievements");
    const tasks10Before = beforeList.body.find((a: { code: string }) => a.code === "tasks_10");
    expect(tasks10Before.unlockedAt).toBeNull();
    expect(tasks10Before.progress).toBe(90);

    // A 10ª tarefa deve destravar.
    const tenth = await agent.post("/api/tasks").send({ title: "Tarefa 10" });
    await agent.patch(`/api/tasks/${tenth.body.id}`).send({ status: "Concluído" });

    const afterCheck = await agent.post("/api/achievements/check");
    expect(afterCheck.body.newlyUnlocked.map((a: { code: string }) => a.code)).toContain("tasks_10");

    // Idempotente: rodar de novo não desbloqueia a mesma coisa outra vez.
    const secondCheck = await agent.post("/api/achievements/check");
    expect(secondCheck.body.newlyUnlocked).toEqual([]);

    const afterList = await agent.get("/api/achievements");
    const tasks10After = afterList.body.find((a: { code: string }) => a.code === "tasks_10");
    expect(tasks10After.unlockedAt).not.toBeNull();
    expect(tasks10After.progress).toBe(100);
  });

  it("nunca conta tarefa de outro usuário nas conquistas de alguém", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    for (let i = 0; i < 10; i++) {
      const created = await other.agent.post("/api/tasks").send({ title: `Tarefa alheia ${i}` });
      await other.agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });
    }

    const list = await agent.get("/api/achievements");
    const tasks10 = list.body.find((a: { code: string }) => a.code === "tasks_10");
    expect(tasks10.progress).toBe(0);
    expect(tasks10.unlockedAt).toBeNull();
  });

  it("permite cadastrar um troféu customizado (ex.: concluir 5 tarefas no dia) e destrava sozinho ao ser atingido", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/achievements/custom").send({
      title: "Dia produtivo",
      description: "Conclua 5 tarefas no mesmo dia",
      icon: "🔥",
      metric: "tasks_completed_in_day",
      threshold: 5,
    });
    expect(created.status).toBe(201);
    expect(created.body.unlockedAt).toBeNull();
    expect(created.body.progress).toBe(0);

    // 4 tarefas concluídas hoje: ainda não deve destravar.
    for (let i = 0; i < 4; i++) {
      const task = await agent.post("/api/tasks").send({ title: `Tarefa ${i}` });
      await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });
    }
    const beforeCheck = await agent.post("/api/achievements/check");
    expect(beforeCheck.body.newlyUnlocked).toEqual([]);

    const beforeList = await agent.get("/api/achievements/custom");
    expect(beforeList.body[0].progress).toBe(80);
    expect(beforeList.body[0].unlockedAt).toBeNull();

    // A 5ª tarefa do dia deve destravar o troféu customizado.
    const fifth = await agent.post("/api/tasks").send({ title: "Tarefa 5" });
    await agent.patch(`/api/tasks/${fifth.body.id}`).send({ status: "Concluído" });

    const afterCheck = await agent.post("/api/achievements/check");
    expect(afterCheck.body.newlyUnlocked.some((a: { id: string }) => a.id === created.body.id)).toBe(true);

    const afterList = await agent.get("/api/achievements/custom");
    expect(afterList.body[0].unlockedAt).not.toBeNull();
    expect(afterList.body[0].progress).toBe(100);

    // Idempotente.
    const secondCheck = await agent.post("/api/achievements/check");
    expect(secondCheck.body.newlyUnlocked).toEqual([]);
  });

  it("isola troféus customizados por usuário e recusa métrica fora do catálogo fixo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const mine = await agent.post("/api/achievements/custom").send({
      title: "Meu troféu",
      metric: "tasks_completed_total",
      threshold: 1,
    });
    expect(mine.status).toBe(201);

    const otherList = await other.agent.get("/api/achievements/custom");
    expect(otherList.body).toEqual([]);

    const invalid = await agent.post("/api/achievements/custom").send({
      title: "Métrica inventada",
      metric: "algo_que_nao_existe",
      threshold: 1,
    });
    expect(invalid.status).toBe(400);

    const removed = await other.agent.delete(`/api/achievements/custom/${mine.body.id}`);
    expect(removed.status).toBe(404);
  });

  it("cria um troféu customizado já destravado quando a métrica atual já bateu o limite", async () => {
    const { agent } = await createAuthenticatedAgent();

    const task = await agent.post("/api/tasks").send({ title: "Entrega importante" });
    await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });

    const created = await agent.post("/api/achievements/custom").send({
      title: "Primeira entrega do dia",
      metric: "tasks_completed_in_day",
      threshold: 1,
    });

    expect(created.status).toBe(201);
    expect(created.body.progress).toBe(100);
    expect(created.body.unlockedAt).not.toBeNull();

    const check = await agent.post("/api/achievements/check");
    expect(check.body.newlyUnlocked.some((achievement: { id: string }) => achievement.id === created.body.id)).toBe(false);
  });

  it("conquistas do Banco: resgate de investimento, quitação em dia e pico do score de crédito (via snapshot)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const { getDb } = await import("../src/db/client.js");
    const { nanoid } = await import("nanoid");

    async function giveCoins(amount: number) {
      await getDb().execute({
        sql: "INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label) VALUES (?, ?, ?, 'teste', ?, 'credito', 'teste')",
        args: [nanoid(), userId, amount, nanoid()],
      });
    }

    await giveCoins(10_000);
    // 3 resgates de investimento (threshold do bronze = 3).
    for (let i = 0; i < 3; i++) {
      const dep = await agent.post("/api/bank/deposits").send({ planId: "cofre-aventureiro", amount: 10 });
      await getDb().execute({ sql: "UPDATE bank_deposits SET matures_at = datetime('now', '-1 minute') WHERE id = ?", args: [dep.body.deposit.id] });
      await agent.post(`/api/bank/deposits/${dep.body.deposit.id}/claim`);
    }
    // 3 empréstimos quitados em dia (threshold do bronze = 3).
    for (let i = 0; i < 3; i++) {
      const loan = await agent.post("/api/bank/loans").send({ amount: 10 });
      await agent.post(`/api/bank/loans/${loan.body.loan.id}/repay`);
    }
    // Abrir o Banco grava o snapshot diário do score (nunca armazenado em outro lugar).
    const summary = await agent.get("/api/bank");
    expect(summary.body.credit.score).toBeGreaterThanOrEqual(650);

    const check = await agent.post("/api/achievements/check");
    const unlockedCodes = check.body.newlyUnlocked.map((a: { code: string }) => a.code);
    expect(unlockedCodes).toContain("bank_deposits_3");
    expect(unlockedCodes).toContain("bank_loans_3");
    expect(unlockedCodes).toContain("bank_score_650");

    const list = await agent.get("/api/achievements");
    const depositsAch = list.body.find((a: { code: string }) => a.code === "bank_deposits_3");
    expect(depositsAch.category).toBe("banco");
    expect(depositsAch.unlockedAt).not.toBeNull();

    const scoreHistory = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM bank_credit_score_history WHERE owner_id = ?",
      args: [userId],
    });
    expect(Number(scoreHistory.rows[0]!.n)).toBe(1);

    // Reabrir no mesmo dia não duplica a linha do snapshot (upsert por dia).
    await agent.get("/api/bank");
    const scoreHistoryAfter = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM bank_credit_score_history WHERE owner_id = ?",
      args: [userId],
    });
    expect(Number(scoreHistoryAfter.rows[0]!.n)).toBe(1);
  });
});
