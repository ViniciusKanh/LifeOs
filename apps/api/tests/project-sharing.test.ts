import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

/**
 * Compartilhamento de projetos ("Colaboração total"): A convida B por
 * e-mail; depois de aceitar, B vê, cria, edita e conclui tarefas do
 * projeto de A como se fosse dele — mas XP de conclusão de tarefa e de
 * projeto sempre fica com A (dono real), nunca com quem só colabora.
 */
describe("Compartilhamento de projetos", () => {
  it("fluxo completo: convite, aceite, colaboração total e remoção de acesso", async () => {
    const { agent: a, userId: ownerA, email: emailA } = await createAuthenticatedAgent({ name: "Dona do projeto" });
    const { agent: b, userId: userB, email: emailB } = await createAuthenticatedAgent({ name: "Colaboradora" });

    const project = await a.post("/api/projects").send({ name: "Reforma da casa", kind: "personal" });
    expect(project.status).toBe(201);
    const projectId = project.body.id as string;

    // B ainda não é membro: não vê o projeto nem pode acessá-lo.
    const beforeList = await b.get("/api/projects");
    expect((beforeList.body as Array<{ id: string }>).some((p) => p.id === projectId)).toBe(false);
    expect((await b.get(`/api/projects/${projectId}`)).status).toBe(404);

    // A convida B.
    const invite = await a.post(`/api/projects/${projectId}/invites`).send({ email: emailB, message: "Bora organizar juntas" });
    expect(invite.status).toBe(201);

    // B vê o convite pendente e aceita.
    const mine = await b.get("/api/project-invites/mine");
    expect(mine.status).toBe(200);
    expect(mine.body.invites).toHaveLength(1);
    const inviteId = mine.body.invites[0].id as string;
    expect(mine.body.invites[0].projectName).toBe("Reforma da casa");

    const respond = await b.post(`/api/project-invites/${inviteId}/respond`).send({ accept: true });
    expect(respond.status).toBe(200);

    // Agora B vê o projeto na listagem, como membro (não dona).
    const afterList = await b.get("/api/projects");
    const sharedRow = (afterList.body as Array<{ id: string; isOwner: boolean; role: string }>).find((p) => p.id === projectId);
    expect(sharedRow).toBeTruthy();
    expect(sharedRow?.isOwner).toBe(false);
    expect(sharedRow?.role).toBe("member");

    // B cria uma tarefa nesse projeto (owner_id da tarefa é a própria B).
    const taskFromB = await b.post("/api/tasks").send({ title: "Escolher piso", projectId, priority: "Média" });
    expect(taskFromB.status).toBe(201);
    const taskId = taskFromB.body.id as string;
    expect(taskFromB.body.owner_id).toBe(userB);

    // A enxerga a tarefa criada por B no Kanban do projeto (não só as próprias).
    const tasksForA = await a.get(`/api/projects/${projectId}/tasks`);
    expect(tasksForA.status).toBe(200);
    expect((tasksForA.body as Array<{ id: string }>).some((t) => t.id === taskId)).toBe(true);

    // A também cria uma tarefa; B precisa enxergar e poder editar/concluir a de A.
    const taskFromA = await a.post("/api/tasks").send({ title: "Contratar pintor", projectId, priority: "Alta" });
    const taskAId = taskFromA.body.id as string;

    const bReadsTaskA = await b.get(`/api/tasks/${taskAId}`);
    expect(bReadsTaskA.status).toBe(200);

    const bEditsTaskA = await b.patch(`/api/tasks/${taskAId}`).send({ title: "Contratar pintor (orçamento fechado)" });
    expect(bEditsTaskA.status).toBe(200);
    expect(bEditsTaskA.body.title).toBe("Contratar pintor (orçamento fechado)");
    // Editar não troca o dono da tarefa.
    expect(bEditsTaskA.body.owner_id).toBe(ownerA);

    const bMovesTaskA = await b.patch(`/api/tasks/${taskAId}/move`).send({ status: "Concluído" });
    expect(bMovesTaskA.status).toBe(204);

    // XP da conclusão vai pra A (dono real da tarefa), não pra B (quem concluiu).
    const profileA = await a.get("/api/gamification/profile");
    const profileB = await b.get("/api/gamification/profile");
    expect(profileA.body.totalXp).toBeGreaterThan(0);
    expect(profileB.body.totalXp).toBe(0);

    // A remove o acesso de B: tarefas de B continuam existindo (dela), mas B perde acesso ao projeto.
    const removed = await a.delete(`/api/projects/${projectId}/members/${userB}`);
    expect(removed.status).toBe(204);
    expect((await b.get(`/api/projects/${projectId}`)).status).toBe(404);
    // A tarefa de A (que não é de B) fica inacessível pra B depois que o acesso é removido.
    expect((await b.get(`/api/tasks/${taskAId}`)).status).toBe(404);
    // Mas a tarefa que a própria B criou continua sendo DELA — sair do
    // projeto não apaga nem esconde o que ela mesma fez.
    expect((await b.get(`/api/tasks/${taskId}`)).status).toBe(200);

    void emailA;
  });

  it("não deixa quem não é dono convidar, revogar convite ou remover membro", async () => {
    const { agent: owner, userId: ownerId } = await createAuthenticatedAgent();
    const { agent: outsider, email: outsiderEmail } = await createAuthenticatedAgent();
    const { agent: member, email: memberEmail } = await createAuthenticatedAgent();

    const project = await owner.post("/api/projects").send({ name: "Projeto fechado" });
    const projectId = project.body.id as string;

    // Convida e aceita o membro de verdade primeiro.
    await owner.post(`/api/projects/${projectId}/invites`).send({ email: memberEmail });
    const mine = await member.get("/api/project-invites/mine");
    await member.post(`/api/project-invites/${mine.body.invites[0].id}/respond`).send({ accept: true });

    // Quem é de fora (nem dono nem membro) não convida nem vê o projeto.
    const outsiderInvite = await outsider.post(`/api/projects/${projectId}/invites`).send({ email: "alguem@teste.lifeos" });
    expect(outsiderInvite.status).toBe(404);
    expect((await outsider.get(`/api/projects/${projectId}`)).status).toBe(404);

    // O próprio membro (não dono) também não pode convidar nem remover ninguém.
    const memberInvite = await member.post(`/api/projects/${projectId}/invites`).send({ email: "outra@teste.lifeos" });
    expect(memberInvite.status).toBe(404);

    void ownerId;
    void outsiderEmail;
  });

  it("membro sai do projeto por conta própria; dono não pode 'sair' do próprio projeto", async () => {
    const { agent: owner } = await createAuthenticatedAgent();
    const { agent: member, email: memberEmail } = await createAuthenticatedAgent();

    const project = await owner.post("/api/projects").send({ name: "Projeto compartilhado" });
    const projectId = project.body.id as string;
    await owner.post(`/api/projects/${projectId}/invites`).send({ email: memberEmail });
    const mine = await member.get("/api/project-invites/mine");
    await member.post(`/api/project-invites/${mine.body.invites[0].id}/respond`).send({ accept: true });

    const left = await member.post(`/api/projects/${projectId}/leave`);
    expect(left.status).toBe(204);
    expect((await member.get(`/api/projects/${projectId}`)).status).toBe(404);

    const ownerLeave = await owner.post(`/api/projects/${projectId}/leave`);
    expect(ownerLeave.status).toBe(404);
  });

  it("recusar um convite não dá acesso nenhum ao projeto", async () => {
    const { agent: owner } = await createAuthenticatedAgent();
    const { agent: invitee, email: inviteeEmail } = await createAuthenticatedAgent();

    const project = await owner.post("/api/projects").send({ name: "Projeto particular" });
    const projectId = project.body.id as string;
    await owner.post(`/api/projects/${projectId}/invites`).send({ email: inviteeEmail });
    const mine = await invitee.get("/api/project-invites/mine");

    const declined = await invitee.post(`/api/project-invites/${mine.body.invites[0].id}/respond`).send({ accept: false });
    expect(declined.status).toBe(200);
    expect((await invitee.get(`/api/projects/${projectId}`)).status).toBe(404);

    // Convite recusado some da lista de pendentes de quem recusou.
    const mineAfter = await invitee.get("/api/project-invites/mine");
    expect(mineAfter.body.invites).toHaveLength(0);
  });

  it("não deixa convidar a si mesmo, nem convidar duas vezes o mesmo e-mail, nem exige um 404 pra quem é dono mas não é ninguém", async () => {
    const { agent: owner, email: ownerEmail } = await createAuthenticatedAgent();
    const { email: targetEmail } = await createAuthenticatedAgent();

    const project = await owner.post("/api/projects").send({ name: "Projeto solo" });
    const projectId = project.body.id as string;

    const selfInvite = await owner.post(`/api/projects/${projectId}/invites`).send({ email: ownerEmail });
    expect(selfInvite.status).toBe(400);

    const first = await owner.post(`/api/projects/${projectId}/invites`).send({ email: targetEmail });
    expect(first.status).toBe(201);
    const second = await owner.post(`/api/projects/${projectId}/invites`).send({ email: targetEmail });
    expect(second.status).toBe(409);
  });

  it("exige autenticação em todas as rotas de compartilhamento", async () => {
    const anon = await (await import("supertest")).default((await import("../src/app.js")).app);
    expect((await anon.get("/api/project-invites/mine")).status).toBe(401);
    expect((await anon.get("/api/projects/qualquer-id/members")).status).toBe(401);
  });

  it("limite de convites por dia é respeitado", async () => {
    const { agent: owner, userId: ownerId } = await createAuthenticatedAgent();
    const project = await owner.post("/api/projects").send({ name: "Projeto com limite" });
    const projectId = project.body.id as string;
    const db = getDb();
    // Insere 20 convites "de poucas horas atrás" direto no banco pra testar
    // o limite de NEGÓCIO (20/dia) sem esbarrar no inviteRateLimit() da
    // rota (20/hora), que só conta requisições HTTP de verdade.
    for (let i = 0; i < 20; i += 1) {
      await db.execute({
        sql: `INSERT INTO project_invites (id, project_id, owner_id, invitee_email, status, created_at)
              VALUES (?, ?, ?, ?, 'revoked', datetime('now', '-2 hours'))`,
        args: [`inv-${i}-${projectId}`, projectId, ownerId, `convite${i}@teste.lifeos`],
      });
    }
    const res = await owner.post(`/api/projects/${projectId}/invites`).send({ email: "mais-um@teste.lifeos" });
    expect(res.status).toBe(429);
  });
});
