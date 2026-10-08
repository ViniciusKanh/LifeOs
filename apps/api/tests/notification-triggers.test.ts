import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client.js";
import { matchingCustomTasks } from "../src/services/notificationTriggersService.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Gatilhos de notificação", () => {
  it("lista regras padrão e atualiza canais", async () => {
    const { agent } = await createAuthenticatedAgent();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const created = await agent.post("/api/tasks").send({
      title: "Enviar relatório atrasado",
      dueDate: yesterday,
      priority: "Alta",
    });
    expect(created.status).toBe(201);

    const initial = await agent.get("/api/notifications/triggers");
    expect(initial.status).toBe(200);
    expect(initial.body.some((rule: { eventType: string }) => rule.eventType === "task_overdue")).toBe(true);

    const updated = await agent.patch("/api/notifications/triggers/task_overdue").send({
      channelInApp: false,
      alertLevel: "critical",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.channelInApp).toBe(false);
    expect(updated.body.alertLevel).toBe("critical");
  });

  it("executa checagem manual de tarefas vencidas sem exigir SMTP/push configurado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await agent.post("/api/tasks").send({ title: "Contrato vencido", dueDate: yesterday });

    const result = await agent.post("/api/notifications/triggers/run");
    expect(result.status).toBe(200);
    expect(result.body.results.some((item: { eventType: string; count: number }) => item.eventType === "task_overdue" && item.count >= 1)).toBe(true);

    const deliveryLog = await getDb().execute({
      sql: "SELECT channel FROM notification_delivery_log WHERE owner_id = ? AND event_type = 'task_overdue'",
      args: [userId],
    });
    expect(deliveryLog.rows).toHaveLength(0);

    const retry = await agent.post("/api/notifications/triggers/run");
    expect(retry.status).toBe(200);
  });

  it("cria gatilho condicional por prazo e prioridade, isolado entre usuários", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await agent.post("/api/tasks").send({ title: "Entrega alta", dueDate: tomorrow, priority: "Alta" });
    await agent.post("/api/tasks").send({ title: "Entrega baixa", dueDate: tomorrow, priority: "Baixa" });

    const created = await agent.post("/api/notifications/triggers/custom").send({
      name: "Amanhã com prioridade alta", conditionType: "task_due_in", days: 1,
      priority: "Alta", channelEmail: false, channelPush: false, channelInApp: true, active: true,
    });
    expect(created.status).toBe(201);
    expect((await other.agent.get("/api/notifications/triggers/custom")).body).toHaveLength(0);

    // O sino saiu do app; a regra continua valendo para push/e-mail (cron).
    const matched = (await matchingCustomTasks(userId, created.body, today)) as Array<{ title: string }>;
    expect(matched.map((t) => t.title)).toEqual(["Entrega alta"]);

    expect((await other.agent.patch(`/api/notifications/triggers/custom/${created.body.id}`).send({ active: false })).status).toBe(404);
    const edited = await agent.patch(`/api/notifications/triggers/custom/${created.body.id}`).send({ name: "Entrega crítica amanhã", days: 2 });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe("Entrega crítica amanhã");
    expect((await agent.patch(`/api/notifications/triggers/custom/${created.body.id}`).send({ channelInApp: false })).status).toBe(400);
    expect((await agent.patch(`/api/notifications/triggers/custom/${created.body.id}`).send({ active: false })).status).toBe(200);

    expect((await agent.post("/api/notifications/triggers/custom").send({
      name: "Sem canal", conditionType: "task_due_in", days: 1,
      priority: null, channelEmail: false, channelPush: false, channelInApp: false, active: true,
    })).status).toBe(400);
  });
});
