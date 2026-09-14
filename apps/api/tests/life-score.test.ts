import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

describe("Life Score (GET /api/analytics/life-score)", () => {
  it("não deixa dimensões sem nenhum dado (profissional, educação, leitura, metas) derrubarem a nota geral", async () => {
    const { agent } = await createAuthenticatedAgent();

    // Usuário que só usa tarefas e hábitos — nenhuma tarefa vinculada
    // a projeto profissional, nenhuma formação, nenhum livro em
    // leitura, nenhuma meta ativa. Antes da correção, essas 4
    // dimensões entravam como 0 na média e o "overall" ficava bem
    // menor do que o que o usuário realmente fez.
    const t1 = await agent.post("/api/tasks").send({ title: "Tarefa concluída 1" });
    const t2 = await agent.post("/api/tasks").send({ title: "Tarefa concluída 2" });
    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    await agent.patch(`/api/tasks/${t2.body.id}`).send({ status: "Concluído" });

    const res = await agent.get("/api/analytics/life-score");
    expect(res.status).toBe(200);

    // Sem tarefa profissional/educação/leitura/meta cadastrada: essas
    // dimensões voltam 0 (nenhum dado), mas NÃO entram na média geral.
    expect(res.body.professional).toBe(0);
    expect(res.body.education).toBe(0);
    expect(res.body.reading).toBe(0);
    expect(res.body.goals).toBe(0);
    expect(res.body.productivity).toBe(100);

    // "overall" deve refletir só as dimensões com dado real: aqui,
    // produtividade (100%, tem dado) e saúde (0%, "do dia", sempre
    // conta) — hábitos fica de fora porque o usuário não tem nenhum
    // hábito cadastrado (sem dado, assim como profissional/educação/
    // leitura/metas). Média = (100 + 0) / 2 = 50. Antes da correção,
    // as 4 dimensões vazias entravam como 0% "de verdade" e o
    // overall ficava em (100 + 0*6) / 7 ≈ 14 — bem menor do que o
    // usuário realmente fez.
    expect(res.body.overall).toBe(50);
  });

  it("conta uma tarefa vinculada a um projeto profissional na dimensão Profissional", async () => {
    const { agent } = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Cliente X", kind: "professional" });
    expect(project.status).toBe(201);

    const task = await agent.post("/api/tasks").send({ title: "Reunião com cliente", projectId: project.body.id });
    await agent.patch(`/api/tasks/${task.body.id}`).send({ status: "Concluído" });

    const res = await agent.get("/api/analytics/life-score");
    expect(res.status).toBe(200);
    expect(res.body.professional).toBe(100);
  });

  it("sessões de Focus Mode contam na dimensão Produtividade (antes, o foco não influenciava o score em nada)", async () => {
    const { agent } = await createAuthenticatedAgent();

    const t1 = await agent.post("/api/tasks").send({ title: "Tarefa A" });
    const t2 = await agent.post("/api/tasks").send({ title: "Tarefa B" });
    // Só 1 de 2 concluída — taskRatio puro seria 50.
    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    void t2;

    const before = await agent.get("/api/analytics/life-score");
    expect(before.body.productivity).toBe(50);

    const started = await agent.post("/api/focus/sessions/start").send({ mode: "pomodoro", plannedMinutes: 25 });
    expect(started.status).toBe(201);
    const stopped = await agent.patch(`/api/focus/sessions/${started.body.id}/stop`).send({ perceivedProductivity: 5 });
    expect(stopped.status).toBe(200);

    // Sessões de teste duram milissegundos — forçamos actual_minutes
    // pra um valor real (750min em 30 dias = bônus de foco máximo)
    // pra verificar a mistura de forma determinística, sem esperar o
    // relógio de verdade passar.
    const db = getDb();
    await db.execute({
      sql: "UPDATE focus_sessions SET actual_minutes = 750 WHERE id = ?",
      args: [started.body.id],
    });

    const after = await agent.get("/api/analytics/life-score");
    // taskRatio=50, focusBonus=100 → 50*0.8 + 100*0.2 = 60.
    expect(after.body.productivity).toBe(60);
  });
});
