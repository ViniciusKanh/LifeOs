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

  it("não deixa dimensões sem nenhum dado (educação, conhecimento, código, hábitos) derrubarem a nota geral", async () => {
    const { agent } = await createAuthenticatedAgent();
    // Missões sem prazo concluídas dentro da janela de 7 dias contam como entregues.
    const t1 = await agent.post("/api/tasks").send({ title: "Tarefa concluída 1" });
    const t2 = await agent.post("/api/tasks").send({ title: "Tarefa concluída 2" });
    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    await agent.patch(`/api/tasks/${t2.body.id}`).send({ status: "Concluído" });

    const res = await agent.get("/api/analytics/life-score");
    expect(res.status).toBe(200);
    expect(res.body.productivity).toBe(100);
    expect(res.body).not.toHaveProperty("reading");
    expect(res.body).not.toHaveProperty("goals");
    expect(res.body).not.toHaveProperty("professional");
    expect(res.body.missing).toEqual(expect.arrayContaining(["habits", "education", "knowledge", "code"]));
    // Só produtividade (100) e saúde (0, dimensão do dia) entram: (100 + 0) / 2.
    expect(res.body.overall).toBe(50);
  });

  it("Produtividade mede as missões com prazo na semana: no prazo vale 1, atrasada concluída 0,5, aberta vencida 0", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = (await agent.get("/api/analytics/life-score")).body.date as string;
    const day = (n: number) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const mk = async (title: string) => (await agent.post("/api/tasks").send({ title })).body.id as string;
    const db = getDb();
    const set = (id: string, due: string, status: string, completedAt: string | null) =>
      db.execute({ sql: "UPDATE tasks SET due_date = ?, status = ?, completed_at = ? WHERE id = ?", args: [due, status, completedAt, id] });
    await set(await mk("No prazo"), day(-1), "Concluído", `${day(-1)}T15:00:00.000Z`);
    await set(await mk("Atrasada mas entregue"), day(-3), "Concluído", `${day(-1)}T15:00:00.000Z`);
    await set(await mk("Vencida e aberta"), day(-2), "A Fazer", null);
    await set(await mk("Vence hoje (dia não acabou)"), today, "A Fazer", null);
    await set(await mk("Vencida há um mês (fora da janela)"), day(-30), "A Fazer", null);

    const score = await agent.get("/api/analytics/life-score");
    // (1 + 0,5 + 0) / 3 = 50
    expect(score.body.productivity).toBe(50);
  });

  it("Conhecimento soma podcasts e livros da semana contra a meta de 300 min", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const empty = await agent.get("/api/analytics/life-score");
    expect(empty.body.missing).toContain("knowledge");
    const today = empty.body.date as string;
    await getDb().execute({
      sql: "INSERT INTO podcast_listens (owner_id, episode_id, feed_id, title, duration_seconds, day_key) VALUES (?, 1, 1, 'Episódio', 5400, ?)",
      args: [userId, today],
    });
    const book = await agent.post("/api/books").send({ title: "Livro", totalPages: 200, status: "Lendo" });
    expect(book.status).toBe(201);
    await getDb().execute({
      sql: "INSERT INTO reading_sessions (id, book_id, owner_id, started_at, duration_minutes, pages_read) VALUES (?, ?, ?, ?, NULL, 30)",
      args: [`rs-${userId}`, book.body.id, userId, `${today}T15:00:00.000Z`],
    });
    // 90 min de podcast + 30 páginas sem duração (2 min/página = 60 min) = 150 de 300.
    const score = await agent.get("/api/analytics/life-score");
    expect(score.body.knowledge).toBe(50);
    expect(score.body.missing).not.toContain("knowledge");
  });

  it("Código combina minutos do WakaTime e dias com atividade; sem integração fica sem dado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const first = await agent.get("/api/analytics/life-score");
    expect(first.body.missing).toContain("code");
    const today = first.body.date as string;
    const day = (n: number) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const db = getDb();
    await db.execute({ sql: "INSERT INTO code_integrations (owner_id, username) VALUES (?, 'vini')", args: [userId] });
    await db.execute({ sql: "INSERT INTO code_contrib_days (owner_id, day_key, count) VALUES (?, ?, 3), (?, ?, 1)", args: [userId, day(-1), userId, day(-4)] });
    // Só GitHub: 2 dias ativos de 5 = 40.
    expect((await agent.get("/api/analytics/life-score")).body.code).toBe(40);

    await db.execute({ sql: "INSERT INTO wakatime_connections (owner_id, api_key_enc) VALUES (?, 'x')", args: [userId] });
    await db.execute({ sql: "INSERT INTO wakatime_days (owner_id, day_key, total_seconds) VALUES (?, ?, 9000), (?, ?, 9000)", args: [userId, today, userId, day(-1)] });
    // 300 de 600 min (50 → 30) + 3 dias ativos de 5 (60 → 24) = 54.
    expect((await agent.get("/api/analytics/life-score")).body.code).toBe(54);
  });

  it("o snapshot grava as dimensões novas e deixa NULL o que não tem dado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await agent.get("/api/analytics/life-score");
    const row = (await getDb().execute({ sql: "SELECT knowledge, code, reading, goals, professional, health FROM life_scores WHERE owner_id = ?", args: [userId] })).rows[0]!;
    expect(row.knowledge).toBeNull();
    expect(row.code).toBeNull();
    expect(row.reading).toBeNull();
    expect(row.goals).toBeNull();
    expect(row.professional).toBeNull();
    expect(row.health).toBe(0);
    const history = await agent.get("/api/analytics/life-score/history?days=7");
    expect(history.body[0].missing).toEqual(expect.arrayContaining(["knowledge", "code"]));
  });
});
