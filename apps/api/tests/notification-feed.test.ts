import { describe, expect, it } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Sino de notificações (histórico real do que foi disparado)", () => {
  it("lista o que foi disparado, com contagem de não lidas, e marca como lido", async () => {
    const { agent } = await createAuthenticatedAgent();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await agent.post("/api/tasks").send({ title: "Tarefa vencida pro sino", dueDate: yesterday });

    const empty = await agent.get("/api/notifications/feed");
    expect(empty.status).toBe(200);
    expect(empty.body.items).toHaveLength(0);
    expect(empty.body.unreadCount).toBe(0);

    const run = await agent.post("/api/notifications/triggers/run");
    expect(run.status).toBe(200);

    const feed = await agent.get("/api/notifications/feed");
    expect(feed.status).toBe(200);
    expect(feed.body.unreadCount).toBeGreaterThanOrEqual(1);
    const item = feed.body.items.find((i: { eventType: string }) => i.eventType === "task_overdue");
    expect(item).toBeTruthy();
    expect(item.read).toBe(false);
    expect(typeof item.title).toBe("string");

    const markRead = await agent.post(`/api/notifications/feed/${item.id}/read`);
    expect(markRead.status).toBe(200);

    const afterRead = await agent.get("/api/notifications/feed");
    const sameItem = afterRead.body.items.find((i: { id: string }) => i.id === item.id);
    expect(sameItem.read).toBe(true);

    // Rodar de novo no mesmo dia não duplica o disparo (dedupe do notification_delivery_log).
    await agent.post("/api/notifications/triggers/run");
    const afterSecondRun = await agent.get("/api/notifications/feed");
    expect(afterSecondRun.body.items.filter((i: { eventType: string }) => i.eventType === "task_overdue")).toHaveLength(1);
  });

  it("marcar tudo como lido zera a contagem, e um usuário não vê nem marca o sino do outro", async () => {
    const userA = await createAuthenticatedAgent();
    const userB = await createAuthenticatedAgent();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await userA.agent.post("/api/tasks").send({ title: "Atrasada de A", dueDate: yesterday });
    await userA.agent.post("/api/notifications/triggers/run");

    const feedB = await userB.agent.get("/api/notifications/feed");
    expect(feedB.body.items).toHaveLength(0);

    const feedA = await userA.agent.get("/api/notifications/feed");
    const itemA = feedA.body.items[0];
    expect((await userB.agent.post(`/api/notifications/feed/${itemA.id}/read`)).status).toBe(404);

    const markAll = await userA.agent.post("/api/notifications/feed/read-all");
    expect(markAll.status).toBe(200);
    expect(markAll.body.marked).toBeGreaterThanOrEqual(1);

    const finalFeed = await userA.agent.get("/api/notifications/feed");
    expect(finalFeed.body.unreadCount).toBe(0);
  });
});
