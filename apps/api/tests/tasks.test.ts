import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Tarefas", () => {
  it("cria, lista, atualiza e remove uma tarefa — sempre isolado por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({ title: "Escrever testes", priority: "Alta" });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe("Escrever testes");
    expect(created.body.status).toBe("Backlog");

    const list = await agent.get("/api/tasks");
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: string }) => t.id === created.body.id)).toBe(true);

    // Outro usuário não deve ver (nem conseguir editar) a tarefa alheia.
    const otherList = await other.agent.get("/api/tasks");
    expect(otherList.body.some((t: { id: string }) => t.id === created.body.id)).toBe(false);

    const otherPatch = await other.agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });
    expect(otherPatch.status).toBe(404);

    const patch = await agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Concluído" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("Concluído");
    expect(patch.body.completed_at).not.toBeNull();

    const reopened = await agent.patch(`/api/tasks/${created.body.id}`).send({ status: "Em Andamento" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completed_at).toBeNull();

    const removed = await agent.delete(`/api/tasks/${created.body.id}`);
    expect(removed.status).toBe(204);
  });

  it("mover no Kanban para Concluído grava completed_at e reabrir limpa a conclusão", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({ title: "Mover pelo Kanban" });
    const doneMove = await agent.patch(`/api/tasks/${created.body.id}/move`).send({ status: "Concluído" });
    expect(doneMove.status).toBe(204);

    const done = await agent.get(`/api/tasks/${created.body.id}`);
    expect(done.body.status).toBe("Concluído");
    expect(done.body.completed_at).not.toBeNull();

    const reopenMove = await agent.patch(`/api/tasks/${created.body.id}/move`).send({ status: "A Fazer" });
    expect(reopenMove.status).toBe(204);

    const reopened = await agent.get(`/api/tasks/${created.body.id}`);
    expect(reopened.body.status).toBe("A Fazer");
    expect(reopened.body.completed_at).toBeNull();
  });

  it("recusa criar tarefa sem título", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/tasks").send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("cria tarefa mandando estimateMinutes como null (campo de estimativa deixado em branco no formulário)", async () => {
    // Regressão: o TaskModal manda `estimateMinutes: null` quando o
    // campo de estimativa fica vazio (o caso mais comum ao criar uma
    // tarefa nova) — o schema só aceitava `optional()` (undefined),
    // então TODA criação de tarefa sem estimativa preenchida voltava
    // 400 e o botão "Criar tarefa" parecia simplesmente não funcionar.
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/tasks").send({ title: "Tarefa sem estimativa", estimateMinutes: null });
    expect(res.status).toBe(201);
    expect(res.body.estimate_minutes).toBeNull();
  });

  it("todas as rotas de tarefas exigem sessão", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });
});
