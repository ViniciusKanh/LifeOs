import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { holidaysBetween, resetHolidayCacheForTests } from "../src/services/holidayService.js";
import { distributeTasks } from "../src/services/warCouncilService.js";
import { importWakaSummaries } from "../src/services/wakatimeService.js";
import { importZoteroItems, zoteroToDraft } from "../src/services/zoteroService.js";
import { candidateKey, decideRadarItem, parseArxivAtom, storeCandidates, weekKeyOf, type RadarCandidate } from "../src/services/radarService.js";
import { applyClickUpTasks, mapClickUpPriority, mapClickUpStatus, type CuTask } from "../src/services/clickupService.js";
import { userDayContext } from "../src/services/localDayService.js";

afterEach(() => {
  setIntegrationFetchForTests(null);
  resetHolidayCacheForTests();
});

const xpOf = async (owner: string, where: string) => Number((await getDb().execute({ sql: `SELECT COALESCE(SUM(xp), 0) AS x FROM xp_events WHERE owner_id = ? AND ${where}`, args: [owner] })).rows[0]?.x ?? 0);

/* ───────────── Feriados ───────────── */

describe("Feriados (BrasilAPI)", () => {
  it("busca o ano uma vez, junta feriados locais e marca a Agenda", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    let calls = 0;
    setIntegrationFetchForTests(async (url) => {
      calls++;
      expect(url).toContain("brasilapi.com.br/api/feriados/v1/2031");
      return new Response(JSON.stringify([{ date: "2031-11-15", name: "Proclamação da República", type: "national" }, { date: "2031-12-25", name: "Natal", type: "national" }]), { status: 200 });
    });
    const first = await holidaysBetween(getDb(), userId, "2031-11-01", "2031-12-31");
    await holidaysBetween(getDb(), userId, "2031-01-01", "2031-12-31");
    expect(calls).toBe(1);
    expect(first.items.map((h) => h.name)).toEqual(["Proclamação da República", "Natal"]);

    const local = await agent.post("/api/holidays/local").send({ date: "2031-01-25", name: "Aniversário de São Paulo" });
    expect(local.status).toBe(201);
    const dup = await agent.post("/api/holidays/local").send({ date: "2031-01-25", name: "Outro" });
    expect(dup.status).toBe(409);
    const list = await agent.get("/api/holidays?year=2031");
    expect(list.body.items).toHaveLength(3);

    const cal = await agent.get("/api/events?from=2031-12-20&to=2031-12-31");
    expect(cal.status).toBe(200);
    const items = (cal.body.items ?? cal.body) as Array<{ sourceType: string; title: string }>;
    expect(items.some((i) => i.sourceType === "holiday" && i.title === "Natal")).toBe(true);

    // Isolamento: outro usuário não vê nem apaga o feriado local.
    const other = await createAuthenticatedAgent();
    const otherList = await other.agent.get("/api/holidays?year=2031");
    expect(otherList.body.items).toHaveLength(2);
    expect((await other.agent.delete(`/api/holidays/local/${local.body.id}`)).status).toBe(404);
  });

  it("Conselho não distribui missões automaticamente no feriado", () => {
    const days = ["2031-12-22", "2031-12-23", "2031-12-24", "2031-12-25", "2031-12-26"].map((date) => ({ date, capacityMinutes: 480, holiday: date === "2031-12-25" ? "Natal" : null }));
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, estimateMinutes: null, dueDate: null, priority: "Média" as const, plannedDate: null }));
    const r = distributeTasks(tasks, days, "2031-12-22");
    expect(r.assignments.every((a) => a.plannedDate !== "2031-12-25")).toBe(true);
    expect(r.dayLoads.find((d) => d.date === "2031-12-25")).toMatchObject({ holiday: "Natal", capacityMinutes: 0, tasks: 0 });
  });
});

/* ───────────── Cozinha do Herói ───────────── */

describe("Cozinha do Herói (Open Food Facts)", () => {
  it("calcula pela porção, paga XP com teto e bônus de proteína uma vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    let calls = 0;
    setIntegrationFetchForTests(async () => {
      calls++;
      return new Response(JSON.stringify({ status: 1, product: { product_name: "Iogurte Proteico", brands: "Marca X, Outra", serving_quantity: 170, nutriments: { "energy-kcal_100g": 60, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 0.5 } } }), { status: 200 });
    });
    const p = await agent.get("/api/nutrition/product/7891234567895");
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ name: "Iogurte Proteico", brand: "Marca X", servingGrams: 170 });
    await agent.get("/api/nutrition/product/7891234567895");
    expect(calls).toBe(1); // cache

    expect((await agent.put("/api/nutrition/settings").send({ kcalGoal: 2200, proteinGoalG: 50 })).status).toBe(200);
    const m1 = await agent.post("/api/nutrition/meals").send({ mealType: "cafe", barcode: "7891234567895", grams: 200 });
    expect(m1.status).toBe(201);
    expect(m1.body).toMatchObject({ xp: 5, proteinGoalHit: false });
    const ov = await agent.get("/api/nutrition");
    expect(ov.body.totals).toMatchObject({ kcal: 120, proteinG: 20 });

    // Manual com proteína suficiente fecha a meta (+15) — só uma vez.
    const m2 = await agent.post("/api/nutrition/meals").send({ mealType: "almoco", name: "Frango e arroz", kcal: 650, proteinG: 45 });
    expect(m2.body).toMatchObject({ xp: 20, proteinGoalHit: true });
    const m3 = await agent.post("/api/nutrition/meals").send({ mealType: "lanche", name: "Ovos", proteinG: 12 });
    expect(m3.body.proteinGoalHit).toBe(false);
    await agent.post("/api/nutrition/meals").send({ mealType: "jantar", name: "Sopa" });
    const m5 = await agent.post("/api/nutrition/meals").send({ mealType: "ceia", name: "Fruta" });
    expect(m5.body.xp).toBe(0); // teto de 4 refeições com XP por dia
    expect(await xpOf(userId, "source_type = 'nutrition'")).toBe(4 * 5 + 15);

    const ov2 = await agent.get("/api/nutrition");
    expect(ov2.body.meals).toHaveLength(5);
    expect(ov2.body.totals.incomplete).toBe(true); // há refeições sem kcal informada
    expect(ov2.body.streak).toBe(1);

    const other = await createAuthenticatedAgent();
    expect((await other.agent.delete(`/api/nutrition/meals/${m1.body.id}`)).status).toBe(404);
    expect((await other.agent.get("/api/nutrition")).body.meals).toHaveLength(0);
    expect((await agent.post("/api/nutrition/meals").send({ mealType: "cafe", name: "Futuro", day: "2999-01-01" })).status).toBe(400);
  });

  it("produto inexistente vira 404 sem inventar dados", async () => {
    const { agent } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async () => new Response(JSON.stringify({ status: 0 }), { status: 404 }));
    const r = await agent.get("/api/nutrition/product/0000000000017");
    expect(r.status).toBe(404);
  });
});

/* ───────────── WakaTime ───────────── */

describe("Tempo na Bigorna (WakaTime)", () => {
  it("paga blocos de 30 min com teto diário e não repete", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const day = (date: string, sec: number) => ({ grand_total: { total_seconds: sec }, languages: [{ name: "TypeScript", total_seconds: sec * 0.7 }, { name: "Python", total_seconds: sec * 0.3 }], projects: [{ name: "LifeOS", total_seconds: sec }], range: { date } });
    const { today } = await userDayContext(getDb(), userId);
    const r1 = await importWakaSummaries(getDb(), userId, [day("2026-01-05", 95 * 60), day("2026-01-06", 10 * 3600)], today);
    expect(r1.xp).toBe(3 * 10 + 12 * 10);
    const r2 = await importWakaSummaries(getDb(), userId, [day("2026-01-05", 125 * 60)], today);
    expect(r2.xp).toBe(10); // só o 4º bloco novo
    const r3 = await importWakaSummaries(getDb(), userId, [day("2026-01-05", 125 * 60)], today);
    expect(r3.xp).toBe(0);
    expect(await xpOf(userId, "source_type = 'code' AND source_id LIKE 'waka:%'")).toBe(160);

    const ov = await agent.get("/api/wakatime");
    expect(ov.status).toBe(200);
    expect(ov.body).toMatchObject({ connected: false, xpTotal: 160 });
    expect(ov.body.totalSeconds).toBe(125 * 60 + 10 * 3600);
  });

  it("chave recusada vira mensagem clara e nada é salvo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    const r = await agent.post("/api/wakatime/connect").send({ key: "waka_00000000-0000-0000-0000-000000000000" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/WakaTime recusou/);
    const row = await getDb().execute({ sql: "SELECT 1 FROM wakatime_connections WHERE owner_id = ?", args: [userId] });
    expect(row.rows).toHaveLength(0);
  });

  it("guarda a chave criptografada e nunca a devolve", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) =>
      url.includes("/summaries") ? new Response(JSON.stringify({ data: [] }), { status: 200 }) : new Response(JSON.stringify({ data: { username: "vini" } }), { status: 200 }),
    );
    const key = "waka_11111111-2222-3333-4444-555555555555";
    const r = await agent.post("/api/wakatime/connect").send({ key });
    expect(r.status).toBe(201);
    const stored = await getDb().execute({ sql: "SELECT api_key_enc FROM wakatime_connections WHERE owner_id = ?", args: [userId] });
    expect(String(stored.rows[0]?.api_key_enc)).not.toContain(key);
    const ov = await agent.get("/api/wakatime");
    expect(JSON.stringify(ov.body)).not.toContain(key);
    expect(ov.body.connection.username).toBe("vini");
  });
});

/* ───────────── Zotero ───────────── */

describe("Portal do Zotero", () => {
  it("converte itens sem inventar campos e não duplica na reimportação", async () => {
    const { userId } = await createAuthenticatedAgent();
    const draft = zoteroToDraft({ key: "AAA", version: 3, itemType: "journalArticle", title: "Ensemble Methods", creators: [{ creatorType: "author", firstName: "Ana", lastName: "Silva" }, { creatorType: "editor", lastName: "Ed" }], date: "2021-05", extra: "DOI: 10.1234/ENS.1" });
    expect(draft).toMatchObject({ doi: "10.1234/ens.1", year: 2021, citedBy: null, sources: ["Zotero"] });
    expect(draft!.authors).toHaveLength(1);

    const items = [
      { key: "K1", version: 5, itemType: "journalArticle", title: "Data Mining Survey", DOI: "10.5555/dm.1", tags: [{ tag: "lido" }], collections: ["C1"] },
      { key: "K2", version: 6, itemType: "conferencePaper", title: "Sem DOI nenhum", creators: [{ name: "Grupo X" }] },
      { key: "N1", version: 7, itemType: "note" },
    ];
    const cols = new Map([["C1", "Mestrado"]]);
    const r1 = await importZoteroItems(getDb(), userId, items, new Set(["K2"]), cols);
    expect(r1).toMatchObject({ created: 2, linked: 0 });
    const r2 = await importZoteroItems(getDb(), userId, items, new Set(), cols);
    expect(r2).toMatchObject({ created: 0, linked: 0, xp: 0 });
    const papers = await getDb().execute({ sql: "SELECT up.status, up.tags_json, p.doi FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ? ORDER BY p.title", args: [userId] });
    expect(papers.rows).toHaveLength(2);
    expect(papers.rows[0]).toMatchObject({ status: "lido", doi: "10.5555/dm.1" });
    expect(JSON.parse(String(papers.rows[0]!.tags_json))).toContain("Mestrado");
    const pdf = await getDb().execute({ sql: "SELECT has_pdf FROM zotero_items WHERE owner_id = ? AND item_key = 'K2'", args: [userId] });
    expect(Number(pdf.rows[0]?.has_pdf)).toBe(1); // reimportação sem PDF não apaga o selo

    // Outro usuário importando o mesmo DOI ganha o seu próprio vínculo.
    const other = await createAuthenticatedAgent();
    const r3 = await importZoteroItems(getDb(), other.userId, items.slice(0, 1), new Set(), cols);
    expect(r3.created).toBe(1);
  });
});

/* ───────────── Radar de Artigos ───────────── */

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>http://arxiv.org/abs/2611.01234v2</id><published>2026-11-20T10:00:00Z</published><title>Deep Ensembles &amp; Data Mining</title>
<summary>Um resumo  qualquer.</summary><author><name>Ana Souza</name></author><author><name>Bruno Lima</name></author>
<link title="pdf" href="http://arxiv.org/pdf/2611.01234v2" rel="related"/><arxiv:primary_category term="cs.LG"/></entry></feed>`;

describe("Radar de Artigos (arXiv + OpenAlex)", () => {
  it("lê o Atom do arXiv e identifica o mesmo preprint nas duas fontes", () => {
    const [c] = parseArxivAtom(ATOM);
    expect(c).toMatchObject({ arxivId: "2611.01234", title: "Deep Ensembles & Data Mining", authors: ["Ana Souza", "Bruno Lima"], pdfUrl: "https://arxiv.org/pdf/2611.01234v2", venue: "arXiv · cs.LG" });
    expect(c!.key).toBe("arxiv:2611.01234");
    expect(candidateKey({ doi: "10.48550/arXiv.2611.01234", arxivId: null, openalexId: "W1" })).toBe(c!.key);
    expect(weekKeyOf("2026-11-26")).toBe("2026-11-23");
  });

  it("salva/dispensa e paga a triagem da semana uma única vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const { today } = await userDayContext(getDb(), userId);
    const week = weekKeyOf(today);
    const topic = (await agent.post("/api/radar/topics").send({ query: "ensemble" })).body as { id: string };
    const mk = (k: string, title: string): RadarCandidate => ({ key: k, source: "arxiv", title, authors: ["A B"], published: today, venue: "arXiv", doi: null, arxivId: k.replace("arxiv:", ""), openalexId: null, abstract: null, url: null, pdfUrl: null, citedBy: null });
    const n = await storeCandidates(getDb(), userId, week, [{ topicId: topic.id, query: "ensemble", items: [mk("arxiv:2611.00001", "Primeiro"), mk("arxiv:2611.00002", "Segundo")] }]);
    expect(n).toBe(2);
    expect(await storeCandidates(getDb(), userId, week, [{ topicId: topic.id, query: "ensemble", items: [mk("arxiv:2611.00001", "Primeiro")] }])).toBe(0);

    // Bases fora do ar: salva com os metadados do próprio Radar.
    setIntegrationFetchForTests(async () => new Response("", { status: 503 }));
    const s = await decideRadarItem(getDb(), userId, "arxiv:2611.00001", "salvar");
    expect(s).toMatchObject({ status: "salvo", triaged: false });
    const d = await decideRadarItem(getDb(), userId, "arxiv:2611.00002", "dispensar");
    expect(d.triaged).toBe(true);
    await expect(decideRadarItem(getDb(), userId, "arxiv:2611.00002", "dispensar")).rejects.toThrow(/já foi decidido/);
    await decideRadarItem(getDb(), userId, "arxiv:2611.00002", "desfazer");
    const again = await decideRadarItem(getDb(), userId, "arxiv:2611.00002", "dispensar");
    expect(again.triaged).toBe(false); // recompensa da semana já paga
    expect(await xpOf(userId, "event_type = 'radar_triaged'")).toBe(25);

    const ov = await agent.get("/api/radar");
    expect(ov.body).toMatchObject({ triagedThisWeek: true, savedTotal: 1, weekStreak: 1 });
    const saved = await getDb().execute({ sql: "SELECT p.doi FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ?", args: [userId] });
    expect(saved.rows[0]?.doi).toBe("10.48550/arxiv.2611.00001");

    // Já está na biblioteca: não volta ao Radar.
    expect(await storeCandidates(getDb(), userId, "2026-12-07", [{ topicId: topic.id, query: "x", items: [{ ...mk("arxiv:2611.00001", "Primeiro"), key: "arxiv:2611.00001" }] }])).toBe(0);
  });

  it("limita temas e exige login", async () => {
    const { agent } = await createAuthenticatedAgent();
    for (const q of ["mineração de dados", "ensemble", "manutenção preditiva", "xai", "séries temporais", "boosting"]) expect((await agent.post("/api/radar/topics").send({ query: q })).status).toBe(201);
    expect((await agent.post("/api/radar/topics").send({ query: "sétimo tema" })).status).toBe(409);
    const { default: request } = await import("supertest");
    const { app } = await import("../src/app.js");
    expect((await request(app).get("/api/radar")).status).toBe(401);
  });
});

/* ───────────── ClickUp ───────────── */

const cu = (id: string, over: Partial<CuTask> = {}): CuTask => ({ id, name: `Tarefa ${id}`, status: { status: "to do", type: "open" }, priority: { priority: "high" }, due_date: "1893456000000", date_updated: String(Date.now()), url: `https://app.clickup.com/t/${id}`, list: { name: "Sprint" }, ...over });

describe("Quadro do ClickUp", () => {
  it("mapeia status e prioridade", () => {
    expect(mapClickUpStatus({ status: "in progress", type: "custom" })).toBe("Em Andamento");
    expect(mapClickUpStatus({ status: "complete", type: "closed" })).toBe("Concluído");
    expect(mapClickUpStatus({ status: "to do", type: "open" })).toBe("A Fazer");
    expect(mapClickUpPriority({ priority: "urgent" })).toBe("Alta");
    expect(mapClickUpPriority(null)).toBe("Média");
  });

  it("importa sem duplicar, conclui com XP uma vez e não reabre o que foi concluído no LifeOS", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const projectId = nanoid();
    await db.execute({ sql: "INSERT INTO projects (id, owner_id, name, kind) VALUES (?, ?, 'ClickUp', 'professional')", args: [projectId, userId] });
    const ctx = { projectId, tz: "America/Sao_Paulo", connectedAt: new Date(Date.now() - 60_000).toISOString(), firstSync: true };
    const r1 = await applyClickUpTasks(db, userId, [cu("a"), cu("b"), cu("old", { status: { status: "done", type: "closed" }, date_closed: String(Date.now() - 40 * 86_400_000) })], ctx);
    expect(r1).toMatchObject({ created: 2, completed: 0 });
    const r2 = await applyClickUpTasks(db, userId, [cu("a"), cu("b")], { ...ctx, firstSync: false });
    expect(r2.created).toBe(0);

    const closedNow = cu("a", { status: { status: "complete", type: "closed" }, date_closed: String(Date.now()) });
    const r3 = await applyClickUpTasks(db, userId, [closedNow], { ...ctx, firstSync: false });
    expect(r3.completed).toBe(1);
    const r4 = await applyClickUpTasks(db, userId, [closedNow], { ...ctx, firstSync: false });
    expect(r4.completed).toBe(0);
    const paid = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events x JOIN clickup_task_links l ON l.task_id = x.source_id WHERE x.owner_id = ? AND x.source_type = 'task' AND l.clickup_id = 'a'", args: [userId] });
    expect(Number(paid.rows[0]?.n)).toBeGreaterThanOrEqual(1);

    // Concluída localmente continua concluída mesmo com o ClickUp aberto.
    const link = await db.execute({ sql: "SELECT task_id FROM clickup_task_links WHERE owner_id = ? AND clickup_id = 'b'", args: [userId] });
    await db.execute({ sql: "UPDATE tasks SET status = 'Concluído', completed_at = datetime('now') WHERE id = ?", args: [String(link.rows[0]!.task_id)] });
    await applyClickUpTasks(db, userId, [cu("b", { name: "Renomeada" })], { ...ctx, firstSync: false });
    const t = await db.execute({ sql: "SELECT status, title, priority, due_date FROM tasks WHERE id = ?", args: [String(link.rows[0]!.task_id)] });
    expect(t.rows[0]).toMatchObject({ status: "Concluído", title: "Renomeada", priority: "Alta" });
    expect(String(t.rows[0]!.due_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("token com formato errado é rejeitado antes de chamar o ClickUp", async () => {
    const { agent } = await createAuthenticatedAgent();
    let called = false;
    setIntegrationFetchForTests(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const r = await agent.post("/api/clickup/connect").send({ key: "abc" });
    expect(r.status).toBe(400);
    expect(called).toBe(false);
  });
});
