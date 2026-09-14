import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Inbox (notas rápidas)", () => {
  it("captura um item, lista só os pendentes por padrão e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/inbox").send({ content: "Ligar pro dentista" });
    expect(created.status).toBe(201);
    expect(created.body.processed_at).toBeNull();

    const list = await agent.get("/api/inbox");
    expect(list.body.some((i: { id: string }) => i.id === created.body.id)).toBe(true);

    const otherList = await other.agent.get("/api/inbox");
    expect(otherList.body.some((i: { id: string }) => i.id === created.body.id)).toBe(false);
  });

  it("recusa captura vazia", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/inbox").send({ content: "   " });
    expect(res.status).toBe(400);
  });

  it("processar com action=task cria uma tarefa de verdade e some da lista de pendentes", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/inbox").send({ content: "Revisar contrato" });
    const process = await agent.patch(`/api/inbox/${created.body.id}/process`).send({ action: "task", priority: "Alta" });
    expect(process.status).toBe(200);
    expect(process.body.taskId).toBeTruthy();

    const task = await agent.get("/api/tasks");
    const found = task.body.find((t: { id: string }) => t.id === process.body.taskId);
    expect(found).toBeTruthy();
    expect(found.title).toBe("Revisar contrato");
    expect(found.priority).toBe("Alta");

    const pending = await agent.get("/api/inbox");
    expect(pending.body.some((i: { id: string }) => i.id === created.body.id)).toBe(false);

    const all = await agent.get("/api/inbox?includeProcessed=true");
    const processedItem = all.body.find((i: { id: string }) => i.id === created.body.id);
    expect(processedItem.processed_at).not.toBeNull();
  });

  it("processar com action=discard não cria tarefa nenhuma", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/inbox").send({ content: "Ideia que não vou seguir" });
    const process = await agent.patch(`/api/inbox/${created.body.id}/process`).send({ action: "discard" });
    expect(process.status).toBe(200);
    expect(process.body.taskId).toBeNull();

    const pending = await agent.get("/api/inbox");
    expect(pending.body.some((i: { id: string }) => i.id === created.body.id)).toBe(false);
  });

  it("exclui um item sem processar e nunca deixa apagar item de outro usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/inbox").send({ content: "Capturado por engano" });

    const crossDelete = await other.agent.delete(`/api/inbox/${created.body.id}`);
    expect(crossDelete.status).toBe(404);

    const del = await agent.delete(`/api/inbox/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await agent.get("/api/inbox?includeProcessed=true");
    expect(list.body.some((i: { id: string }) => i.id === created.body.id)).toBe(false);
  });
});
