import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { addMonths, urgencyOf } from "../src/services/lifeAdminService.js";
import { extractWikiTitles } from "../src/services/notesService.js";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("Administração da vida", () => {
  it("datas: soma de meses respeita fim de mês e a urgência vem das datas", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 12)).toBe("2027-11-15");
    expect(urgencyOf("2026-10-01", 15, "2026-10-05").urgency).toBe("overdue");
    expect(urgencyOf("2026-10-10", 15, "2026-10-05").urgency).toBe("soon");
    expect(urgencyOf("2026-12-10", 15, "2026-10-05").urgency).toBe("ok");
  });

  it("marcar como feito grava histórico e empurra o vencimento pela recorrência", async () => {
    const { agent } = await createAuthenticatedAgent();
    const due = inDays(5);
    const created = await agent.post("/api/life-admin").send({ kind: "vencimento", title: "IPVA do carro", category: "veiculo", dueDate: due, recurrenceMonths: 12, amount: 1500 });
    expect(created.status).toBe(201);
    expect(created.body.urgency).toBe("soon");

    const summary = await agent.get("/api/life-admin/summary");
    expect(summary.body.dueSoon).toBe(1);

    const done = await agent.post(`/api/life-admin/${created.body.id}/done`).send({ note: "pago no app do banco" });
    expect(done.status).toBe(200);
    expect(done.body.dueDate).toBe(addMonths(due, 12));
    expect(done.body.history).toHaveLength(1);
    expect(done.body.history[0]).toMatchObject({ dueDate: due, amount: 1500, note: "pago no app do banco" });

    const timeline = await agent.get(`/api/analytics/timeline?from=${inDays(-1)}&to=${inDays(1)}`);
    expect(timeline.body.events.some((e: { type: string }) => e.type === "life_admin")).toBe(true);
  });

  it("conta avulsa paga é arquivada e outro usuário não enxerga o item", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const bill = await a.agent.post("/api/life-admin").send({ kind: "conta", title: "Conserto da máquina", dueDate: inDays(2) });
    const done = await a.agent.post(`/api/life-admin/${bill.body.id}/done`).send({});
    expect(done.body.status).toBe("archived");
    expect((await b.agent.get(`/api/life-admin/${bill.body.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/life-admin/${bill.body.id}`).send({ title: "x" })).status).toBe(404);
  });
});

describe("Direção", () => {
  it("cadeia do porquê: tarefa → projeto → meta trimestral → meta anual → área → visão", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put("/api/direction/vision").send({ vision: "Viver com saúde e liberdade", purpose: "Construir coisas úteis", values: [{ name: "Saúde" }] });
    const annual = await agent.post("/api/goals").send({ title: "Correr uma maratona", lifeArea: "saude", cycle: "2026" });
    const quarterly = await agent.post("/api/goals").send({ title: "Correr 21 km", lifeArea: "saude", cycle: "2026-Q4", parentGoalId: annual.body.id });
    const project = await agent.post("/api/projects").send({ name: "Treino meia maratona", goalId: quarterly.body.id });
    expect(project.status).toBe(201);
    const task = await agent.post("/api/tasks").send({ title: "Longão de 15 km", projectId: project.body.id });

    const why = await agent.get(`/api/direction/why?type=task&id=${task.body.id}`);
    expect(why.status).toBe(200);
    expect(why.body.map((s: { type: string }) => s.type)).toEqual(["task", "project", "goal", "goal", "value", "vision"]);
    expect(why.body[2]).toMatchObject({ label: "Correr 21 km", detail: "2026-Q4" });

    const overview = await agent.get("/api/direction");
    expect(overview.body.alignment).toMatchObject({ openTasks: 1, alignedOpenTasks: 1, alignedPct: 100 });
    const q = overview.body.goals.find((g: { id: string }) => g.id === quarterly.body.id);
    expect(q.projects).toHaveLength(1);
    expect(q.openTasks).toBe(1);
  });

  it("roda da vida guarda histórico e não aceita meta/projeto de outro usuário", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await a.agent.put("/api/direction/wheel").send({ assessedOn: "2026-09-01", scores: [{ area: "saude", score: 5 }] });
    const wheel = await a.agent.put("/api/direction/wheel").send({ assessedOn: "2026-10-01", scores: [{ area: "saude", score: 7 }] });
    const saude = wheel.body.latest.find((w: { area: string }) => w.area === "saude");
    expect(saude).toMatchObject({ score: 7, previousScore: 5 });
    expect(wheel.body.history).toHaveLength(2);

    const goalOfA = await a.agent.post("/api/goals").send({ title: "Meta de A" });
    expect((await b.agent.post("/api/projects").send({ name: "Invasor", goalId: goalOfA.body.id })).status).toBe(400);
    expect((await b.agent.post("/api/tasks").send({ title: "Invasora", goalId: goalOfA.body.id })).status).toBe(400);
  });

  it("revisão mensal calcula o retrato real do período e persiste o texto", async () => {
    const { agent } = await createAuthenticatedAgent();
    const month = new Date().toISOString().slice(0, 7);
    const t = await agent.post("/api/tasks").send({ title: "Feita", status: "Concluído" });
    expect(t.status).toBe(201);
    const saved = await agent.put(`/api/direction/reviews/monthly/${month}`).send({ wins: "Muita coisa", energyScore: 8 });
    expect(saved.status).toBe(200);
    expect(saved.body.metrics.tasksCompleted).toBe(1);
    const again = await agent.get(`/api/direction/reviews/monthly/${month}`);
    expect(again.body).toMatchObject({ wins: "Muita coisa", energyScore: 8 });
    expect((await agent.get("/api/direction/reviews/monthly/2026-13")).status).toBe(400);
  });
});

describe("Notas e conhecimento", () => {
  it("[[links]] viram vínculos, geram backlinks e são resolvidos quando a nota citada nasce", async () => {
    expect(extractWikiTitles("<p>ver [[Ideia A]] e [[Ideia A]] e [[ B ]]</p>")).toEqual(["Ideia A", "B"]);
    const { agent } = await createAuthenticatedAgent();
    const a = await agent.post("/api/notes").send({ title: "Ideia A", content: "<p>Base</p>" });
    const b = await agent.post("/api/notes").send({ title: "Projeto X", content: "<p>Usa a [[Ideia A]] e a [[Ideia B]]</p>" });
    expect(b.body.links.map((l: { label: string }) => l.label)).toEqual(["Ideia A"]);
    expect(b.body.unresolvedWikiLinks).toEqual(["Ideia B"]);

    const aDetail = await agent.get(`/api/notes/${a.body.id}`);
    expect(aDetail.body.backlinks.map((x: { title: string }) => x.title)).toEqual(["Projeto X"]);

    await agent.post("/api/notes").send({ title: "Ideia B" });
    const bAgain = await agent.get(`/api/notes/${b.body.id}`);
    expect(bAgain.body.unresolvedWikiLinks).toEqual([]);
    expect(bAgain.body.links).toHaveLength(2);
  });

  it("vínculo manual só aceita itens do próprio usuário e aparece no item de origem", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const note = await a.agent.post("/api/notes").send({ title: "Aprendizados do projeto" });
    const project = await a.agent.post("/api/projects").send({ name: "LifeOS" });
    const foreign = await b.agent.post("/api/projects").send({ name: "De outro" });

    expect((await a.agent.post(`/api/notes/${note.body.id}/links`).send({ targetType: "project", targetId: foreign.body.id })).status).toBe(400);
    const linked = await a.agent.post(`/api/notes/${note.body.id}/links`).send({ targetType: "project", targetId: project.body.id });
    expect(linked.status).toBe(201);
    expect(linked.body.links[0]).toMatchObject({ targetType: "project", label: "LifeOS" });

    const fromProject = await a.agent.get(`/api/notes/linked?type=project&id=${project.body.id}`);
    expect(fromProject.body.map((n: { title: string }) => n.title)).toEqual(["Aprendizados do projeto"]);
    expect((await b.agent.get(`/api/notes/${note.body.id}`)).status).toBe(404);
  });
});

describe("Importação de tarefas", () => {
  it("cria tarefas, reaproveita projeto existente pelo nome e cria os que faltam", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/projects").send({ name: "Casa" });
    const res = await agent.post("/api/import/tasks").send({
      source: "todoist",
      items: [
        { title: "Trocar lâmpada", projectName: "casa", priority: "Alta" },
        { title: "Estudar React", projectName: "Estudos", dueDate: "2026-12-01" },
        { title: "Já feita", status: "Concluído" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ imported: 3, projectsCreated: 1 });
    const projects = await agent.get("/api/projects");
    expect(projects.body.map((p: { name: string }) => p.name).sort()).toEqual(["Casa", "Estudos"]);
  });
});
