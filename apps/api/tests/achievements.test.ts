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
});
