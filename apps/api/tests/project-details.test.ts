import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { sanitizeSuggestion } from "../src/services/journalAIService.js";

// PNG 1x1 transparente — suficiente para testar o fluxo de anexo.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%%EOF").toString("base64")}`;

describe("Projetos — cadastro completo, visão geral e documentos", () => {
  it("salva metadados completos e devolve links/tags como arrays", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/projects").send({
      name: "Dissertação",
      kind: "academic",
      status: "active",
      priority: "Alta",
      startDate: "2030-01-01",
      dueDate: "2030-06-30",
      objective: "Defender a dissertação",
      client: "UNESP",
      budget: 1500,
      repositoryUrl: "https://github.com/exemplo/repo",
      links: [{ label: "Overleaf", url: "https://overleaf.com/x" }],
      tags: ["mestrado", "ia"],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    expect(res.body.tags).toEqual(["mestrado", "ia"]);
    expect(res.body.links[0].label).toBe("Overleaf");
    expect(res.body.due_date).toBe("2030-06-30");

    const done = await agent.patch(`/api/projects/${res.body.id}`).send({ status: "completed" });
    expect(done.body.completed_at).not.toBeNull();
  });

  it("recusa prazo anterior ao início", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/projects").send({ name: "X", startDate: "2030-02-01", dueDate: "2030-01-01" });
    expect(res.status).toBe(400);
  });

  it("deriva documentos do projeto a partir dos anexos das tarefas e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Site" });
    const task = await agent.post("/api/tasks").send({ title: "Layout", projectId: project.body.id });

    const img = await agent.post(`/api/tasks/${task.body.id}/attachments`).send({ dataUri: TINY_PNG, fileName: "print.png" });
    expect(img.status).toBe(201);
    expect(img.body.kind).toBe("image");
    const pdf = await agent.post(`/api/tasks/${task.body.id}/attachments`).send({ dataUri: TINY_PDF, fileName: "briefing.pdf" });
    expect(pdf.body.kind).toBe("document");

    const invalid = await agent.post(`/api/tasks/${task.body.id}/attachments`).send({ dataUri: "data:text/html;base64,PGI+" });
    expect(invalid.status).toBe(400);

    const docs = await agent.get(`/api/projects/${project.body.id}/documents`);
    expect(docs.body).toHaveLength(2);
    expect(docs.body[0].taskTitle).toBe("Layout");

    const overview = await agent.get(`/api/projects/${project.body.id}/overview`);
    expect(overview.body.totals.tasks).toBe(1);
    expect(overview.body.totals.attachments).toBe(2);

    const tasks = await agent.get(`/api/projects/${project.body.id}/tasks`);
    expect(Number(tasks.body[0].attachment_count)).toBe(2);

    // Outro usuário não enxerga nem anexa em tarefa/projeto alheio.
    expect((await other.agent.get(`/api/projects/${project.body.id}/documents`)).status).toBe(404);
    expect((await other.agent.get(`/api/tasks/${task.body.id}/attachments`)).status).toBe(404);
    expect((await other.agent.post(`/api/tasks/${task.body.id}/attachments`).send({ dataUri: TINY_PNG })).status).toBe(404);
    expect((await other.agent.delete(`/api/tasks/${task.body.id}/attachments/${img.body.id}`)).status).toBe(404);

    const del = await agent.delete(`/api/tasks/${task.body.id}/attachments/${img.body.id}`);
    expect(del.status).toBe(204);
  });
});

describe("Diário — mídias com história e organização por IA", () => {
  it("aceita vídeo e PDF, guarda a história e deduz o tipo pelo MIME", async () => {
    const { agent } = await createAuthenticatedAgent();
    const video = `data:video/mp4;base64,${Buffer.from("fake-mp4").toString("base64")}`;
    const res = await agent.post("/api/journal/2030-03-10/media").send({ dataUri: video, fileName: "praia.mp4", story: "Fim de tarde na praia." });
    expect(res.status).toBe(201);
    const item = res.body.media[0];
    expect(item.kind).toBe("video");
    expect(item.story).toBe("Fim de tarde na praia.");

    const pdfRes = await agent.post("/api/journal/2030-03-10/media").send({ dataUri: TINY_PDF, fileName: "ingresso.pdf" });
    expect(pdfRes.body.media[1].kind).toBe("document");

    const patched = await agent.patch(`/api/journal/2030-03-10/media/${item.id}`).send({ story: "Nova história" });
    expect(patched.body.media[0].story).toBe("Nova história");
  });

  it("aplica somente a organização confirmada e ignora mídia de outro usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    await agent.put("/api/journal/2030-03-11").send({ thoughts: "Dia produtivo no trabalho." });
    const otherMedia = await other.agent.post("/api/journal/2030-03-11/media").send({ dataUri: TINY_PNG });
    const otherId = otherMedia.body.media[0].id;

    const applied = await agent.post("/api/journal/2030-03-11/ai/organize/apply").send({
      title: "Dia produtivo",
      summary: "Trabalho rendeu.",
      categories: [{ name: "Trabalho", points: ["Dia produtivo"] }],
      mediaCategories: [{ id: otherId, category: "Invasão" }],
      tagsToAdd: ["trabalho"],
    });
    expect(applied.status).toBe(200);
    expect(applied.body.ai.title).toBe("Dia produtivo");
    expect(applied.body.tags).toContain("trabalho");

    const otherDay = await other.agent.get("/api/journal/2030-03-11");
    expect(otherDay.body.media[0].aiCategory).toBeNull();

    const cleared = await agent.delete("/api/journal/2030-03-11/ai/organize");
    expect(cleared.body.ai).toBeNull();
  });

  it("sanitiza a resposta do modelo descartando ids de mídia desconhecidos", () => {
    const s = sanitizeSuggestion(
      { title: "T", categories: [{ name: "Saúde", points: ["Caminhei"] }, { name: "", points: [] }], mediaCategories: [{ id: "x", category: "A" }, { id: "ok", category: "B" }] },
      new Set(["ok"])
    );
    expect(s?.categories).toHaveLength(1);
    expect(s?.mediaCategories).toEqual([{ id: "ok", category: "B" }]);
  });
});
