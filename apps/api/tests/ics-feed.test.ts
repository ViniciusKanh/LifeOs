import { describe, expect, it } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Assinatura de calendário externo (.ics)", () => {
  it("gera a URL do feed, serve o .ics com os itens reais e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    await agent.post("/api/tasks").send({ title: "Tarefa com prazo pro feed", dueDate: tomorrow });
    await agent.post("/api/events").send({
      title: "Reunião importante",
      startsAt: `${tomorrow}T14:00:00.000Z`,
      allDay: false,
    });

    const feed = await agent.get("/api/events/ics-feed");
    expect(feed.status).toBe(200);
    expect(typeof feed.body.url).toBe("string");
    const token = new URL(feed.body.url).pathname.split("/").pop()!.replace(/\.ics$/, "");

    const ics = await agent.get(`/api/ics/${token}.ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.text).toContain("BEGIN:VCALENDAR");
    expect(ics.text).toContain("END:VCALENDAR");
    expect(ics.text).toContain("Tarefa com prazo pro feed");
    expect(ics.text).toContain("Reunião importante");
  });

  it("devolve 404 para um token inexistente e invalida o token antigo ao regenerar", async () => {
    const { agent } = await createAuthenticatedAgent();

    const bogus = await agent.get("/api/ics/token-que-nao-existe.ics");
    expect(bogus.status).toBe(404);

    const first = await agent.get("/api/events/ics-feed");
    const firstToken = new URL(first.body.url).pathname.split("/").pop()!.replace(/\.ics$/, "");
    expect((await agent.get(`/api/ics/${firstToken}.ics`)).status).toBe(200);

    const regenerated = await agent.post("/api/events/ics-feed/regenerate");
    expect(regenerated.status).toBe(200);
    const secondToken = new URL(regenerated.body.url).pathname.split("/").pop()!.replace(/\.ics$/, "");
    expect(secondToken).not.toBe(firstToken);

    expect((await agent.get(`/api/ics/${firstToken}.ics`)).status).toBe(404);
    expect((await agent.get(`/api/ics/${secondToken}.ics`)).status).toBe(200);
  });

  it("não é possível ver o feed de outro usuário pelo token dele", async () => {
    const userA = await createAuthenticatedAgent();
    const userB = await createAuthenticatedAgent();

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await userA.agent.post("/api/tasks").send({ title: "Só de A", dueDate: tomorrow });
    await userB.agent.post("/api/tasks").send({ title: "Só de B", dueDate: tomorrow });

    const feedA = await userA.agent.get("/api/events/ics-feed");
    const tokenA = new URL(feedA.body.url).pathname.split("/").pop()!.replace(/\.ics$/, "");

    // Qualquer cliente (mesmo sem sessão) consegue buscar o feed pelo token — é assim que o Google/Apple Calendar funciona.
    const ics = await userB.agent.get(`/api/ics/${tokenA}.ics`);
    expect(ics.status).toBe(200);
    expect(ics.text).toContain("Só de A");
    expect(ics.text).not.toContain("Só de B");
  });
});
