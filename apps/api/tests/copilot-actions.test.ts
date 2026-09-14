import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Copilot com ações reais (POST /api/copilot/assist e /assist/confirm)", () => {
  it("exige sessão em ambas as rotas", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    const assist = await request(app).post("/api/copilot/assist").send({ message: "cria uma tarefa" });
    expect(assist.status).toBe(401);
    const confirm = await request(app).post("/api/copilot/assist/confirm").send({ action: "criar_tarefa", args: {} });
    expect(confirm.status).toBe(401);
  });

  it("recusa mensagem vazia com erro claro, sem chamar a IA", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/copilot/assist").send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("sem Gemini configurado, /assist devolve erro claro em vez de tentar agir", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/copilot/assist").send({ message: "cria uma tarefa de revisar o contrato" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Gemini|IA/i);
  });

  it("/assist/confirm nunca escreve nada com uma ação desconhecida", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/copilot/assist/confirm").send({ action: "apagar_tudo", args: {} });
    expect(res.status).toBe(400);
  });

  it("confirmAction(criar_tarefa) grava de verdade só quando chamado (a própria função de execução, sem depender do Gemini)", async () => {
    const { agent } = await createAuthenticatedAgent();

    // Simula o que o frontend faria após o usuário confirmar uma
    // proposta de "criar_tarefa" — chamando /assist/confirm direto,
    // sem depender da IA estar configurada (o propose é que depende
    // do Gemini; confirm é pura execução determinística).
    const confirm = await agent.post("/api/copilot/assist/confirm").send({
      action: "criar_tarefa",
      args: { title: "Tarefa criada pelo Copilot", priority: "Alta" },
    });
    expect(confirm.status).toBe(200);

    const list = await agent.get("/api/tasks");
    const created = list.body.find((t: { title: string }) => t.title === "Tarefa criada pelo Copilot");
    expect(created).toBeDefined();
    expect(created.priority).toBe("Alta");
  });

  it("confirmAction(concluir_tarefa) nunca conclui uma tarefa de outro usuário", async () => {
    const { agent: owner } = await createAuthenticatedAgent();
    const { agent: intruder } = await createAuthenticatedAgent();

    const created = await owner.post("/api/tasks").send({ title: "Tarefa privada do dono" });

    const confirm = await intruder.post("/api/copilot/assist/confirm").send({
      action: "concluir_tarefa",
      args: { taskId: created.body.id },
    });
    expect(confirm.status).toBe(400);

    const stillOpen = await owner.get(`/api/tasks/${created.body.id}`);
    expect(stillOpen.body.status).not.toBe("Concluído");
  });
});
