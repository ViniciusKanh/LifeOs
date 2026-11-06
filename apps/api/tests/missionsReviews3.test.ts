import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { difficultyFor, lexicalScores, parseDue, parseDuration, priorityFor, titleFrom } from "../src/services/missionAdvisorService.js";
import { bucketsOf, compareIndicators, isValidKey, mondayOf, type WindowMetrics } from "../src/services/journeyReviewService.js";

const today = () => new Date().toISOString().slice(0, 10);

describe("Conselheiro de Missões — regras puras", () => {
  it("lê duração e prazo do pedido", () => {
    expect(parseDuration("Quero estudar duas horas de Machine Learning hoje")).toBe(120);
    expect(parseDuration("revisar por 1h30")).toBe(90);
    expect(parseDuration("45 min de leitura")).toBe(45);
    expect(parseDuration("organizar a mesa")).toBeNull();
    expect(parseDue("entregar hoje até 20h", "2026-11-06")).toEqual({ date: "2026-11-06", time: "20:00" });
    expect(parseDue("amanhã", "2026-11-06")?.date).toBe("2026-11-07");
    expect(parseDue("até sexta", "2026-11-04")?.date).toBe("2026-11-06");
    expect(parseDue("dia 10/12", "2026-11-06")?.date).toBe("2026-12-10");
  });
  it("título objetivo, dificuldade por esforço e prioridade por prazo", () => {
    expect(titleFrom("Preciso estudar 2 horas de Machine Learning hoje")).toBe("Estudar 2 horas de Machine Learning");
    expect(difficultyFor(20, 0)).toBe("facil");
    expect(difficultyFor(120, 0)).toBe("medio");
    expect(difficultyFor(200, 6)).toBe("epico");
    expect(priorityFor({ text: "estudar", due: "2026-11-06", today: "2026-11-06", linkedToGoalOrContract: false }).value).toBe("Alta");
    expect(priorityFor({ text: "estudar sem pressa", due: null, today: "2026-11-06", linkedToGoalOrContract: true }).value).toBe("Baixa");
  });
  it("aderência lexical favorece a entidade certa e não só palavra solta", () => {
    const s = lexicalScores("Associar ao meu mestrado em ciência da computação", [
      { key: "a", title: "Mestrado em Ciência da Computação", text: "pesquisa em mineração de dados" },
      { key: "b", title: "Reforma da casa", text: "pintura e computação de custos" },
    ]);
    expect(s.find((x) => x.key === "a")!.score).toBeGreaterThan(s.find((x) => x.key === "b")!.score);
  });
});

describe("Revisões — regras puras", () => {
  it("chaves e semanas começam na segunda", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(isValidKey("weekly", "2026-11-02")).toBe(true);
    expect(isValidKey("weekly", "2026-11-03")).toBe(false);
    expect(isValidKey("quarterly", "2026-Q4")).toBe(true);
    expect(bucketsOf("annual", "2026-01-01", "2026-12-31")).toHaveLength(12);
    expect(bucketsOf("weekly", "2026-11-02", "2026-11-08")).toHaveLength(7);
  });
  it("sem base anterior não vira −100% nem +∞", () => {
    const base = { xp: 0, coins: 0, tasksDone: 0, habitsDone: 0, habitDays: 0, workouts: 0, workoutMinutes: 0, pagesRead: 0, readingDays: 0, studyMinutes: 0, focusMinutes: 0, sleepAvgMinutes: null, moodAvg: null, energyAvg: null, journalDays: 0, goalsCompleted: 0, contractsFulfilled: 0, projectsCompleted: 0, lifeScore: null, lifeScoreDays: 0, dims: {}, days: 7 } as unknown as WindowMetrics;
    const ind = compareIndicators({ ...base, tasksDone: 5, lifeScore: 70 }, base, false);
    const tasks = ind.find((i) => i.key === "tasksDone")!;
    expect(tasks.deltaPct).toBeNull();
    expect(tasks.note).toMatch(/Sem base/);
    expect(ind.find((i) => i.key === "lifeScore")!.delta).toBeNull();
    const drop = compareIndicators({ ...base, tasksDone: 0 }, { ...base, tasksDone: 4 }, true).find((i) => i.key === "tasksDone")!;
    expect(drop.deltaPct).toBe(-100);
    expect(drop.note).toMatch(/parcial/);
  });
});

async function seed(userId: string) {
  const db = getDb();
  const project = nanoid();
  const decoy = nanoid();
  const goal = nanoid();
  const contract = nanoid();
  await db.batch(
    [
      { sql: "INSERT INTO projects (id, owner_id, name, description) VALUES (?, ?, 'Carreira em Dados', 'Transição para ciência de dados e machine learning')", args: [project, userId] },
      { sql: "INSERT INTO projects (id, owner_id, name, description) VALUES (?, ?, 'Reforma da casa', 'Pintura da sala')", args: [decoy, userId] },
      { sql: "INSERT INTO goals (id, owner_id, title, description) VALUES (?, ?, 'Evoluir em Machine Learning até Q2', 'Estudar machine learning toda semana')", args: [goal, userId] },
      { sql: "INSERT INTO contracts (id, owner_id, title, description) VALUES (?, ?, 'Desenvolvimento Profissional', 'Estudos de machine learning e dados')", args: [contract, userId] },
    ],
    "write",
  );
  return { project, decoy, goal, contract };
}

describe("Conselheiro de Missões — HTTP", () => {
  it("propõe com vínculos reais, aplica uma vez só e isola por usuário", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const ids = await seed(userId);
    const r = await agent.post("/api/mission-advisor/propose").send({ mode: "create", message: "Quero estudar 2 horas de Machine Learning hoje para avançar na carreira em dados", detail: "padrao" });
    expect(r.status).toBe(200);
    const p = r.body.items[0];
    expect(r.body.ai.used).toBe(false); // sem chave Gemini nos testes: regras locais, dito explicitamente
    expect(p.estimateMinutes).toBe(120);
    expect(p.dueDate).toBe(today());
    expect(p.priority).toBe("Alta");
    expect(p.links.goal.id).toBe(ids.goal);
    expect(p.links.project.id).toBe(ids.project);
    expect(p.links.project.id).not.toBe(ids.decoy);
    expect(p.reward.xp).toBeGreaterThan(0);
    expect(p.steps.length).toBeGreaterThan(0);

    // Outro usuário não enxerga entidades alheias como candidatas nem aplica a sessão.
    const o = await other.agent.post("/api/mission-advisor/propose").send({ mode: "create", message: "Estudar machine learning na carreira em dados" });
    expect(o.body.items[0].links.goal.id).toBeNull();
    const steal = await other.agent.post("/api/mission-advisor/apply").send({ sessionId: r.body.sessionId, mode: "create", items: [p] });
    expect(steal.status).toBe(404);

    const a1 = await agent.post("/api/mission-advisor/apply").send({ sessionId: r.body.sessionId, mode: "create", items: [p] });
    expect(a1.status).toBe(200);
    expect(a1.body.taskIds).toHaveLength(1);
    const a2 = await agent.post("/api/mission-advisor/apply").send({ sessionId: r.body.sessionId, mode: "create", items: [p] });
    expect(a2.body.duplicated).toBe(true);
    const tasks = await agent.get("/api/tasks");
    const created = tasks.body.filter((t: { title: string }) => t.title === p.title);
    expect(created).toHaveLength(1);
    expect(created[0].goal_id).toBe(ids.goal);
    expect(created[0].project_id).toBe(ids.project);
    expect(created[0].description).toMatch(/Critérios de conclusão/);
    const subs = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM subtasks WHERE task_id = ?", args: [created[0].id] });
    expect(Number(subs.rows[0]!.n)).toBe(p.subtasks.length);
    // Criar a missão não paga XP: recompensa só ao concluir.
    const xp = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_id = ?", args: [userId, created[0].id] });
    expect(Number(xp.rows[0]!.n)).toBe(0);
  });

  it("sem vínculo adequado diz isso em vez de inventar", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await seed(userId);
    const r = await agent.post("/api/mission-advisor/propose").send({ mode: "create", message: "Comprar pão na padaria" });
    expect(r.body.items[0].links.project.id).toBeNull();
    expect(r.body.items[0].links.project.reason).toMatch(/Não encontrei um vínculo suficientemente adequado/);
  });

  it("quebra em etapas, melhora e planeja sequência com dependências", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await seed(userId);
    const t = await agent.post("/api/tasks").send({ title: "Preparar apresentação científica", priority: "Média" });
    const b = await agent.post("/api/mission-advisor/propose").send({ mode: "breakdown", message: "Divida em etapas", taskId: t.body.id });
    expect(b.body.items[0].subtasks.length).toBeGreaterThanOrEqual(3);
    const ab = await agent.post("/api/mission-advisor/apply").send({ sessionId: b.body.sessionId, mode: "breakdown", items: b.body.items, targetTaskId: t.body.id });
    expect(ab.status).toBe(200);
    const subs = await getDb().execute({ sql: "SELECT COUNT(*) AS n, COUNT(depends_on_id) AS d FROM subtasks WHERE task_id = ? AND owner_id = ?", args: [t.body.id, userId] });
    expect(Number(subs.rows[0]!.n)).toBe(b.body.items[0].subtasks.length);
    expect(Number(subs.rows[0]!.d)).toBeGreaterThan(0);

    const imp = await agent.post("/api/mission-advisor/propose").send({ mode: "improve", message: "Deixe a descrição mais técnica", taskId: t.body.id, detail: "tecnico" });
    const item = { ...imp.body.items[0], title: "Preparar e ensaiar a apresentação científica" };
    const ai = await agent.post("/api/mission-advisor/apply").send({ sessionId: imp.body.sessionId, mode: "improve", items: [item], targetTaskId: t.body.id });
    expect(ai.status).toBe(200);
    const after = await getDb().execute({ sql: "SELECT title, description FROM tasks WHERE id = ?", args: [t.body.id] });
    expect(after.rows[0]!.title).toBe("Preparar e ensaiar a apresentação científica");

    const seq = await agent.post("/api/mission-advisor/propose").send({ mode: "sequence", message: "Escrever o artigo do mestrado" });
    expect(seq.body.items.length).toBeGreaterThan(1);
    const as = await agent.post("/api/mission-advisor/apply").send({ sessionId: seq.body.sessionId, mode: "sequence", items: seq.body.items });
    expect(as.body.taskIds.length).toBe(seq.body.items.length);
    const deps = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM task_dependencies WHERE task_id IN (" + as.body.taskIds.map(() => "?").join(",") + ")", args: as.body.taskIds });
    expect(Number(deps.rows[0]!.n)).toBe(seq.body.items.length - 1);
  });

  it("quadro: reordena, só arquiva concluídas e calcula indicadores", async () => {
    const { agent } = await createAuthenticatedAgent();
    const a = await agent.post("/api/tasks").send({ title: "A", priority: "Alta", dueDate: today() });
    const b = await agent.post("/api/tasks").send({ title: "B", priority: "Baixa" });
    const r = await agent.post("/api/missions3/reorder").send({ taskId: b.body.id, status: "A Fazer", beforeId: a.body.id });
    expect(r.status).toBe(200);
    const no = await agent.post(`/api/missions3/tasks/${a.body.id}/archive`).send({ archived: true });
    expect(no.status).toBe(400);
    await agent.patch(`/api/tasks/${a.body.id}/move`).send({ status: "Concluído" });
    const yes = await agent.post(`/api/missions3/tasks/${a.body.id}/archive`).send({ archived: true });
    expect(yes.status).toBe(200);
    const ov = await agent.get("/api/missions3/overview");
    expect(ov.body.indicators.done).toBe(1);
    expect(ov.body.indicators.open).toBe(1);
    expect(ov.body.indicators.xpLast30).toBeGreaterThan(0);
  });
});

describe("Revisões da Jornada — HTTP", () => {
  it("salva, sela, espelha, paga uma vez e registra correção", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const ids = await seed(userId);
    const v = await agent.get("/api/journey-reviews/weekly");
    expect(v.status).toBe(200);
    expect(v.body.seal.canSeal).toBe(false);
    expect(v.body.indicators.length).toBeGreaterThan(10);
    const key = v.body.key;
    const empty = await agent.post(`/api/journey-reviews/weekly/${key}/seal`);
    expect(empty.status).toBe(400);

    const s = await agent.put(`/api/journey-reviews/weekly/${key}`).send({ answers: { worked: "Estudei todos os dias" }, plan: { priorities: ["Treinar 3x"], focus: [{ type: "goal", id: ids.goal }] } });
    expect(s.status).toBe(200);
    const sealed = await agent.post(`/api/journey-reviews/weekly/${key}/seal`);
    expect(sealed.status).toBe(200);
    expect(sealed.body.alreadySealed).toBe(false);
    // K — Conselho de Guerra: rascunho (não selado) da semana seguinte com o foco escolhido.
    const plan = await getDb().execute({ sql: "SELECT focus, sealed_at FROM weekly_plans WHERE owner_id = ?", args: [userId] });
    expect(plan.rows[0]!.sealed_at).toBeNull();
    expect(String(plan.rows[0]!.focus)).toContain(ids.goal);
    // Espelho na revisão semanal antiga (Linha do Tempo, conquistas).
    const legacy = await getDb().execute({ sql: "SELECT what_worked FROM weekly_reviews WHERE owner_id = ? AND week_start_date = ?", args: [userId, key] });
    expect(legacy.rows[0]!.what_worked).toBe("Estudei todos os dias");

    const c1 = await agent.post(`/api/journey-reviews/weekly/${key}/claim`);
    expect(c1.body.granted).toBe(true);
    const c2 = await agent.post(`/api/journey-reviews/weekly/${key}/claim`);
    expect(c2.body.alreadyClaimed).toBe(true);
    const xp = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'review'", args: [userId] });
    expect(Number(xp.rows[0]!.n)).toBe(1);

    await agent.put(`/api/journey-reviews/weekly/${key}`).send({ answers: { worked: "Estudei quase todos os dias" } });
    const rev = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM journey_review_revisions WHERE owner_id = ?", args: [userId] });
    expect(Number(rev.rows[0]!.n)).toBe(1);
    const ach = await getDb().execute({ sql: "SELECT 1 FROM user_achievements WHERE owner_id = ? AND achievement_id = 'ach_journey_review_1'", args: [userId] });
    expect(ach.rows.length).toBe(1);

    const again = await agent.get(`/api/journey-reviews/weekly?key=${key}`);
    expect(again.body.review.status).toBe("sealed");
    expect(again.body.revisor.points).toBeGreaterThanOrEqual(1);
    expect(again.body.history[0].status).toBe("sealed");

    // Isolamento: outro usuário vê a própria revisão vazia.
    const other = await createAuthenticatedAgent();
    const ov = await other.agent.get(`/api/journey-reviews/weekly?key=${key}`);
    expect(ov.body.review.answers.worked).toBeUndefined();
  });

  it("mensal exige respostas mínimas, recusa período futuro e o conselheiro separa dado de sugestão", async () => {
    const { agent } = await createAuthenticatedAgent();
    const v = await agent.get("/api/journey-reviews/monthly");
    const key = v.body.key;
    await agent.put(`/api/journey-reviews/monthly/${key}`).send({ answers: { how: "Mês corrido" } });
    const one = await agent.post(`/api/journey-reviews/monthly/${key}/seal`);
    expect(one.status).toBe(400);
    const future = await agent.get("/api/journey-reviews/annual?key=2999");
    expect(future.status).toBe(400);
    const adv = await agent.post(`/api/journey-reviews/monthly/${key}/advisor`).send({ mode: "analyze" });
    expect(adv.status).toBe(200);
    expect(adv.body.ai.used).toBe(false);
    for (const i of adv.body.items) expect(["dado", "inferencia", "sugestao"]).toContain(i.kind);
  });
});
