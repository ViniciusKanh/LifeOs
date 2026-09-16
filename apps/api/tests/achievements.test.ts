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
});
