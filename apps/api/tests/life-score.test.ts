import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

describe("Life Score (GET /api/analytics/life-score)", () => {
  it("atinge 100 em saúde quando água, sono, movimento e humor estão registrados no dia", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    expect((await agent.post("/api/health/water").send({ amountMl: 2500, recordedAt: `${today}T12:00:00.000Z` })).status).toBe(201);
    expect((await agent.post("/api/health/sleep").send({ wentToBedAt: `${yesterday}T22:00:00.000Z`, wokeUpAt: `${today}T06:00:00.000Z`, quality: 3 })).status).toBe(201);
    expect((await agent.post("/api/health/workouts").send({ kind: "Caminhada", durationMinutes: 20, performedAt: `${today}T12:30:00.000Z` })).status).toBe(201);
    expect((await agent.post("/api/health/mood").send({ mood: 3, energy: 3, recordedAt: `${today}T13:00:00.000Z` })).status).toBe(201);

    const score = await agent.get(`/api/analytics/life-score?date=${today}`);
    expect(score.status).toBe(200);
    expect(score.body.health).toBe(100);
  });

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

  it("usa meta diária de páginas para a dimensão Leitura quando ela existe", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date().toISOString().slice(0, 10);

    const goal = await agent.post("/api/goals").send({
      title: "Ler 20 páginas por dia",
      kind: "numeric",
      targetValue: 20,
      unit: "páginas",
      period: "semanal",
    });
    expect(goal.status).toBe(201);

    const book = await agent.post("/api/books").send({
      title: "Livro em andamento",
      totalPages: 300,
      status: "Lendo",
    });
    expect(book.status).toBe(201);

    const half = await agent.post(`/api/books/${book.body.id}/sessions`).send({
      startedAt: `${today}T12:00:00.000Z`,
      durationMinutes: 20,
      pagesRead: 10,
    });
    expect(half.status).toBe(201);

    const before = await agent.get(`/api/analytics/life-score?date=${today}`);
    expect(before.status).toBe(200);
    expect(before.body.reading).toBe(50);

    const full = await agent.post(`/api/books/${book.body.id}/sessions`).send({
      startedAt: `${today}T13:00:00.000Z`,
      durationMinutes: 20,
      pagesRead: 10,
    });
    expect(full.status).toBe(201);

    const after = await agent.get(`/api/analytics/life-score?date=${today}`);
    expect(after.body.reading).toBe(100);
  });

  it("equilibra metas por período no Life Score em vez de diluir tudo em uma média única", async () => {
    const { agent } = await createAuthenticatedAgent();

    const annual = await agent.post("/api/goals").send({ title: "Meta anual", kind: "binary", period: "anual" });
    const weeklyA = await agent.post("/api/goals").send({ title: "Meta semanal A", kind: "binary", period: "semanal" });
    const weeklyB = await agent.post("/api/goals").send({ title: "Meta semanal B", kind: "binary", period: "semanal" });
    const weeklyC = await agent.post("/api/goals").send({ title: "Meta semanal C", kind: "binary", period: "semanal" });

    await agent.patch(`/api/goals/${annual.body.id}`).send({ status: "done" });

    const score = await agent.get("/api/analytics/life-score");
    expect(score.status).toBe(200);

    // Período anual = 100; período semanal = 0. A média equilibrada
    // dos períodos é 50. A média antiga por meta individual seria 25.
    expect(score.body.goals).toBe(50);
    expect(weeklyA.status).toBe(201);
    expect(weeklyB.status).toBe(201);
    expect(weeklyC.status).toBe(201);
  });

  it("não carrega uma meta semanal concluída em semana antiga para o score atual", async () => {
    const { agent } = await createAuthenticatedAgent();
    const goal = await agent.post("/api/goals").send({ title: "Meta da semana passada", kind: "binary", period: "semanal" });
    await agent.patch(`/api/goals/${goal.body.id}`).send({ status: "done" });
    await getDb().execute({
      sql: "UPDATE goals SET completed_at = date('now', '-14 days') WHERE id = ?",
      args: [goal.body.id],
    });
    const score = await agent.get("/api/analytics/life-score");
    expect(score.status).toBe(200);
    expect(score.body.goals).toBe(0);
  });
});
