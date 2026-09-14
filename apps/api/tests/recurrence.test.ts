import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Recorrência de tarefas", () => {
  it("recusa uma regra de recorrência inválida", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/tasks").send({ title: "Tarefa", recurrenceRule: "FREQ=YEARLY" });
    expect(res.status).toBe(400);
  });

  it("concluir uma tarefa diária gera a próxima ocorrência pro dia seguinte", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({
      title: "Revisar métricas", dueDate: "2026-09-10", recurrenceRule: "FREQ=DAILY",
    });
    expect(created.status).toBe(201);

    const done = await agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("Concluído");

    const list = await agent.get("/api/tasks");
    const next = (list.body as Array<{ id: string; title: string; due_date: string; status: string; recurrence_rule: string }>).find(
      (t) => t.title === "Revisar métricas" && t.id !== created.body.id
    );
    expect(next).toBeTruthy();
    expect(next!.due_date).toBe("2026-09-11");
    expect(next!.status).toBe("Backlog");
    expect(next!.recurrence_rule).toBe("FREQ=DAILY");
  });

  it("concluir pelo endpoint de move (drag and drop do Kanban) também gera a próxima ocorrência", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({
      title: "Reunião semanal", dueDate: "2026-09-08", recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
    });
    // 2026-09-08 é uma terça — a próxima terça é 2026-09-15.
    const move = await agent.patch(`/api/tasks/${created.body.id}/move`).send({ status: "Concluído" });
    expect(move.status).toBe(204);

    const list = await agent.get("/api/tasks");
    const next = (list.body as Array<{ title: string; due_date: string }>).find(
      (t) => t.title === "Reunião semanal" && t.due_date !== "2026-09-08"
    );
    expect(next?.due_date).toBe("2026-09-15");
  });

  it("tarefa sem recurrence_rule não gera nada ao ser concluída", async () => {
    const { agent } = await createAuthenticatedAgent();
    const created = await agent.post("/api/tasks").send({ title: "Tarefa única" });
    await agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });

    const list = await agent.get("/api/tasks");
    expect((list.body as Array<{ title: string }>).filter((t) => t.title === "Tarefa única")).toHaveLength(1);
  });

  it("mandar recurrenceRule vazio remove uma regra existente", async () => {
    const { agent } = await createAuthenticatedAgent();
    const created = await agent.post("/api/tasks").send({ title: "Tarefa", recurrenceRule: "FREQ=DAILY" });
    const updated = await agent.patch(`/api/tasks/${created.body.id}`).send({ recurrenceRule: "" });
    expect(updated.body.recurrence_rule).toBeNull();
  });
});
