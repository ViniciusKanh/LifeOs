import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Projetos e Gantt", () => {
  it("cria um projeto, vincula tarefas com datas e monta os dados do Gantt", async () => {
    const { agent } = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Lançamento do site", kind: "professional" });
    expect(project.status).toBe(201);
    const projectId = project.body.id;

    const taskA = await agent.post("/api/tasks").send({
      title: "Definir escopo",
      projectId,
      startDate: "2030-01-01",
      dueDate: "2030-01-05",
    });
    const taskB = await agent.post("/api/tasks").send({
      title: "Construir a página",
      projectId,
      startDate: "2030-01-06",
      dueDate: "2030-01-15",
    });
    // Tarefa sem nenhuma data — não deve aparecer no Gantt.
    await agent.post("/api/tasks").send({ title: "Ideia solta", projectId });

    const depRes = await agent.post(`/api/tasks/${taskB.body.id}/dependencies`).send({ dependsOnId: taskA.body.id });
    expect(depRes.status).toBe(201);

    const gantt = await agent.get(`/api/projects/${projectId}/gantt`);
    expect(gantt.status).toBe(200);
    expect(gantt.body.tasks).toHaveLength(2);
    const taskBInGantt = gantt.body.tasks.find((t: { id: string }) => t.id === taskB.body.id);
    expect(taskBInGantt.dependsOn).toEqual([taskA.body.id]);
  });

  it("recusa uma tarefa depender dela mesma e nunca mistura tarefas de outro usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const task = await agent.post("/api/tasks").send({ title: "Minha tarefa" });
    const selfDep = await agent.post(`/api/tasks/${task.body.id}/dependencies`).send({ dependsOnId: task.body.id });
    expect(selfDep.status).toBe(400);

    const otherTask = await other.agent.post("/api/tasks").send({ title: "Tarefa alheia" });
    const crossDep = await agent.post(`/api/tasks/${task.body.id}/dependencies`).send({ dependsOnId: otherTask.body.id });
    expect(crossDep.status).toBe(404);
  });

  it("isola projetos por usuário e arquiva em vez de exigir exclusão", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Projeto pessoal" });
    const otherList = await other.agent.get("/api/projects");
    expect(otherList.body.some((p: { id: string }) => p.id === project.body.id)).toBe(false);

    const archived = await agent.patch(`/api/projects/${project.body.id}`).send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.archived_at).not.toBeNull();

    const activeList = await agent.get("/api/projects");
    expect(activeList.body.some((p: { id: string }) => p.id === project.body.id)).toBe(false);

    const fullList = await agent.get("/api/projects?includeArchived=true");
    expect(fullList.body.some((p: { id: string }) => p.id === project.body.id)).toBe(true);
  });

  it("permite flegar um projeto já existente como profissional (e as tarefas dele passam a contar no Life Score)", async () => {
    // Regressão: updateProjectSchema não tinha o campo `kind`, então um
    // projeto criado como "Pessoal" nunca podia virar "Profissional"
    // depois — a única forma de flegar era recriando o projeto do zero.
    const { agent } = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Projeto qualquer", kind: "personal" });
    expect(project.body.kind).toBe("personal");

    const task = await agent.post("/api/tasks").send({ title: "Trabalho de verdade", projectId: project.body.id });
    await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });

    const beforeFlag = await agent.get("/api/analytics/life-score");
    expect(beforeFlag.body.professional).toBe(0); // ainda "sem dado" — nenhuma tarefa profissional

    const flagged = await agent.patch(`/api/projects/${project.body.id}`).send({ kind: "professional" });
    expect(flagged.status).toBe(200);
    expect(flagged.body.kind).toBe("professional");

    const afterFlag = await agent.get("/api/analytics/life-score");
    expect(afterFlag.body.professional).toBe(100);
  });
});
