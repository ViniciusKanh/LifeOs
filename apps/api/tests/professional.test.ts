import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Área Profissional — Priority Score e anotações de trabalho", () => {
  it("calcula priority_score automaticamente quando impacto/urgência/esforço são preenchidos", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/tasks").send({ title: "Task sem score" });
    expect(created.body.priority_score).toBeNull();

    const withScore = await agent.post("/api/tasks").send({ title: "Task com score", impact: 5, urgency: 4, effort: 2 });
    expect(withScore.body.priority_score).toBeCloseTo((5 * 4) / 2);

    // Editar só um dos três campos recalcula o score com os valores já salvos.
    const updated = await agent.patch(`/api/tasks/${withScore.body.id}`).send({ effort: 5 });
    expect(updated.body.priority_score).toBeCloseTo((5 * 4) / 5);

    // Zerar um dos campos derruba o score de volta pra null.
    const cleared = await agent.patch(`/api/tasks/${created.body.id}`).send({ impact: 3 });
    expect(cleared.body.priority_score).toBeNull();
  });

  it("GET /api/tasks/professional só traz tarefas em aberto de projetos profissionais, ordenadas por score", async () => {
    const { agent } = await createAuthenticatedAgent();

    const proProject = await agent.post("/api/projects").send({ name: "Cliente X", kind: "professional" });
    const personalProject = await agent.post("/api/projects").send({ name: "Casa", kind: "personal" });

    const low = await agent.post("/api/tasks").send({
      title: "Baixo score", projectId: proProject.body.id, impact: 1, urgency: 1, effort: 5,
    });
    const high = await agent.post("/api/tasks").send({
      title: "Alto score", projectId: proProject.body.id, impact: 5, urgency: 5, effort: 1,
    });
    const noScore = await agent.post("/api/tasks").send({ title: "Sem score", projectId: proProject.body.id });
    const done = await agent.post("/api/tasks").send({
      title: "Já concluída", projectId: proProject.body.id, status: "Concluído", impact: 5, urgency: 5, effort: 1,
    });
    await agent.post("/api/tasks").send({ title: "De outro projeto", projectId: personalProject.body.id, impact: 5, urgency: 5, effort: 1 });

    const list = await agent.get("/api/tasks/professional");
    expect(list.status).toBe(200);
    const ids = (list.body as Array<{ id: string }>).map((t) => t.id);

    expect(ids).toContain(high.body.id);
    expect(ids).toContain(low.body.id);
    expect(ids).toContain(noScore.body.id);
    expect(ids).not.toContain(done.body.id);
    expect(ids.filter((id) => id === high.body.id || id === low.body.id).length).toBe(2);

    expect(ids.indexOf(high.body.id)).toBeLessThan(ids.indexOf(low.body.id));
    expect(ids.indexOf(low.body.id)).toBeLessThan(ids.indexOf(noScore.body.id));
  });

  it("cria, lista e exclui anotações de trabalho (1:1s), isoladas por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/work-notes").send({
      title: "1:1 com o gestor",
      content: "Combinamos revisar o roadmap na próxima semana.",
      occurredAt: "2026-09-10",
    });
    expect(created.status).toBe(201);

    const list = await agent.get("/api/work-notes");
    expect(list.body.some((n: { id: string }) => n.id === created.body.id)).toBe(true);

    const otherList = await other.agent.get("/api/work-notes");
    expect(otherList.body.some((n: { id: string }) => n.id === created.body.id)).toBe(false);

    const crossDelete = await other.agent.delete(`/api/work-notes/${created.body.id}`);
    expect(crossDelete.status).toBe(404);

    const del = await agent.delete(`/api/work-notes/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("inclui anotações de reunião profissional na timeline do usuário", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/work-notes").send({
      title: "Entrega da Qualificação",
      content: "Definimos próximos passos.",
      occurredAt: "2026-09-16",
    });
    expect(created.status).toBe(201);

    const timeline = await agent.get("/api/analytics/timeline?from=2026-09-16&to=2026-09-16");
    expect(timeline.status).toBe(200);
    expect(
      timeline.body.events.some((event: { type: string; id: string; label: string }) => (
        event.type === "work_note" && event.id === created.body.id && event.label === "Entrega da Qualificação"
      ))
    ).toBe(true);
  });
});
