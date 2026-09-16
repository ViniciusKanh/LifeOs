import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

/**
 * Cobre o bug de "lixo de projeto de educação" relatado pelo usuário:
 * apagar um projeto acadêmico (ou a formação inteira) precisa apagar
 * também o projeto genérico vinculado (Kanban/Gantt em /api/projects),
 * senão ele fica órfão em Projetos pra sempre, sem nenhum jeito de
 * removê-lo pela tela de Educação.
 */
describe("Exclusão de projetos acadêmicos e formações", () => {
  it("criar um projeto acadêmico sem projectId cria automaticamente um projeto genérico vinculado", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/academic-projects").send({
      kind: "tcc",
      title: "TCC de Engenharia",
    });
    expect(created.status).toBe(201);
    expect(created.body.project_id).toBeTruthy();

    const project = await agent.get("/api/projects?includeArchived=true");
    expect(project.body.some((p: { id: string }) => p.id === created.body.project_id)).toBe(true);
  });

  it("excluir o projeto acadêmico também apaga o projeto genérico vinculado (sem órfão em Projetos)", async () => {
    const { agent } = await createAuthenticatedAgent();

    const created = await agent.post("/api/academic-projects").send({
      kind: "dissertacao",
      title: "Dissertação de Mestrado",
    });
    const projectId = created.body.project_id as string;

    const del = await agent.delete(`/api/academic-projects/${created.body.id}`);
    expect(del.status).toBe(204);

    const projects = await agent.get("/api/projects?includeArchived=true");
    expect(projects.body.some((p: { id: string }) => p.id === projectId)).toBe(false);

    const academicList = await agent.get("/api/academic-projects");
    expect(academicList.body.some((p: { id: string }) => p.id === created.body.id)).toBe(false);
  });

  it("excluir uma formação apaga os projetos acadêmicos vinculados e seus projetos genéricos", async () => {
    const { agent } = await createAuthenticatedAgent();

    const education = await agent.post("/api/educations").send({
      kind: "mestrado",
      courseName: "Mestrado em Ciência da Computação",
    });
    expect(education.status).toBe(201);

    const academicProject = await agent.post("/api/academic-projects").send({
      kind: "dissertacao",
      title: "Dissertação vinculada à formação",
      educationId: education.body.id,
    });
    expect(academicProject.status).toBe(201);
    const projectId = academicProject.body.project_id as string;

    const del = await agent.delete(`/api/educations/${education.body.id}`);
    expect(del.status).toBe(204);

    const projects = await agent.get("/api/projects?includeArchived=true");
    expect(projects.body.some((p: { id: string }) => p.id === projectId)).toBe(false);

    const academicList = await agent.get("/api/academic-projects");
    expect(academicList.body.some((p: { id: string }) => p.id === academicProject.body.id)).toBe(false);
  });

  it("calcula progresso da formação e do projeto acadêmico pela quantidade de tarefas concluídas", async () => {
    const { agent } = await createAuthenticatedAgent();

    const education = await agent.post("/api/educations").send({
      kind: "mestrado",
      courseName: "Mestrado orientado por tarefas",
    });
    expect(education.status).toBe(201);

    const academicProject = await agent.post("/api/academic-projects").send({
      kind: "dissertacao",
      title: "Dissertação com Kanban",
      educationId: education.body.id,
    });
    expect(academicProject.status).toBe(201);
    const projectId = academicProject.body.project_id as string;

    const firstTask = await agent.post("/api/tasks").send({ title: "Escrever revisão", projectId });
    const secondTask = await agent.post("/api/tasks").send({ title: "Rodar experimentos", projectId });

    const initialDetail = await agent.get(`/api/educations/${education.body.id}`);
    expect(initialDetail.body.progress_pct).toBe(0);
    expect(initialDetail.body.academicProjects[0].progress_pct).toBe(0);

    await agent.patch(`/api/tasks/${firstTask.body.id}/move`).send({ status: "Concluído" });

    const halfDetail = await agent.get(`/api/educations/${education.body.id}`);
    expect(halfDetail.body.progress_pct).toBe(50);
    expect(halfDetail.body.academicProjects[0].progress_pct).toBe(50);

    const halfProjectList = await agent.get(`/api/academic-projects?educationId=${education.body.id}`);
    expect(halfProjectList.body[0].progress_pct).toBe(50);

    await agent.patch(`/api/tasks/${secondTask.body.id}`).send({ status: "Concluído" });

    const finalList = await agent.get("/api/educations");
    const finalEducation = finalList.body.find((e: { id: string }) => e.id === education.body.id);
    expect(finalEducation.progress_pct).toBe(100);
    expect(finalEducation.phase).toBe("concluida");
  });

  it("nunca deixa um usuário apagar formação ou projeto acadêmico de outra pessoa", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const education = await agent.post("/api/educations").send({
      kind: "graduacao",
      courseName: "Graduação de outra pessoa",
    });

    const crossDelete = await other.agent.delete(`/api/educations/${education.body.id}`);
    expect(crossDelete.status).toBe(404);

    const stillThere = await agent.get("/api/educations");
    expect(stillThere.body.some((e: { id: string }) => e.id === education.body.id)).toBe(true);
  });
});
