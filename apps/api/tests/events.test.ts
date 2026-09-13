import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Calendário (eventos)", () => {
  it("cria um evento manual e o encontra na janela de datas certa", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/events").send({
      title: "Consulta médica",
      startsAt: "2030-06-15 10:00:00",
      allDay: false,
    });
    expect(created.status).toBe(201);

    const inRange = await agent.get("/api/events?from=2030-06-01&to=2030-06-30");
    expect(inRange.body.some((e: { id: string }) => e.id === created.body.id)).toBe(true);

    const outOfRange = await agent.get("/api/events?from=2030-01-01&to=2030-01-31");
    expect(outOfRange.body.some((e: { id: string }) => e.id === created.body.id)).toBe(false);
  });

  it("uma tarefa com prazo aparece no calendário junto dos eventos manuais", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/tasks").send({ title: "Entregar relatório", dueDate: "2030-07-10" });

    const res = await agent.get("/api/events?from=2030-07-01&to=2030-07-31");
    const taskItem = res.body.find((e: { sourceType: string; title: string }) => e.sourceType === "task");
    expect(taskItem).toBeDefined();
    expect(taskItem.title).toBe("Entregar relatório");
  });

  it("só remove (ou edita) eventos manuais — nunca os derivados de outro módulo", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/tasks").send({ title: "Prova final", dueDate: "2030-08-05" });

    const res = await agent.get("/api/events?from=2030-08-01&to=2030-08-31");
    const taskItem = res.body.find((e: { sourceType: string }) => e.sourceType === "task");

    const removeAttempt = await agent.delete(`/api/events/${taskItem.id}`);
    expect(removeAttempt.status).toBe(404);
  });
});
