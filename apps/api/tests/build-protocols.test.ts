import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { dayKeyIn } from "../src/services/gamificationService.js";
import { normalizeAttributeScore } from "../src/config/build.js";
import { affinity, calculateGaps } from "../src/services/characterBuildService.js";
import { ARCHETYPES } from "../src/config/build.js";
import { calculateProtocolRelevance, evaluateTrigger } from "../src/services/protocolService.js";
import { validateProtocolActions } from "../src/validators/protocols.schema.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const TZ = "America/Sao_Paulo";
const day = (delta = 0) => dayKeyIn(new Date(Date.now() + delta * 86_400_000), TZ);

/** XP real já classificado pelo motor do Códex (simula ações concluídas). */
async function xp(userId: string, sourceType: string, amount: number, dayKey = day()) {
  await getDb().execute({
    sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, ?, ?, 'test', ?, 'teste', ?)",
    args: [nanoid(), userId, sourceType, nanoid(), amount, dayKey],
  });
}
async function task(userId: string, title: string, priority: string, estimate: number | null, due = day()) {
  const id = nanoid();
  await getDb().execute({ sql: "INSERT INTO tasks (id, owner_id, title, status, priority, due_date, estimate_minutes) VALUES (?, ?, ?, 'A Fazer', ?, ?, ?)", args: [id, userId, title, priority, due, estimate] });
  return id;
}
const build = async (agent: Agent) => (await agent.get("/api/build")).body;

describe("Build do Personagem — regras puras", () => {
  it("normaliza 0–100 com teto, afinidade por cosseno e gaps com faixa 'na meta'", () => {
    expect(normalizeAttributeScore(400, 800)).toBe(50);
    expect(normalizeAttributeScore(5000, 800)).toBe(100);
    expect(normalizeAttributeScore(0, 800)).toBe(0);
    const flat = { knowledge: 60, discipline: 60, focus: 60, health: 60, creativity: 60, wellbeing: 60 };
    expect(affinity(flat, ARCHETYPES.find((a) => a.id === "equilibrado")!)).toBe(100);
    const gaps = calculateGaps(flat, { ...flat, health: 80, focus: 40, creativity: 62 });
    expect(gaps.find((g) => g.key === "health")).toMatchObject({ gap: 20, status: "below" });
    expect(gaps.find((g) => g.key === "focus")).toMatchObject({ gap: -20, status: "above" });
    expect(gaps.find((g) => g.key === "creativity")?.status).toBe("near");
  });
});

describe("Build do Personagem — API", () => {
  it("sem dados: build em formação, sem arquétipo e sem insights inventados", async () => {
    const { agent } = await createAuthenticatedAgent();
    const b = await build(agent);
    expect(b.sufficiency.enough).toBe(false);
    expect(b.archetype).toBeNull();
    expect(b.insights).toEqual([]);
    expect(b.attributes.every((a: { score: number }) => a.score === 0)).toBe(true);
    expect(b.sufficiency.missing).toHaveLength(6);
  });

  it("pontua a partir do XP real da janela, calcula arquétipo e compara com 30 dias atrás", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await xp(userId, "focus", 640); // 80% foco / 20% disciplina
    await xp(userId, "journal", 300); // 60% bem-estar / 40% criatividade
    await xp(userId, "focus", 400, day(-40)); // fora da janela atual
    const b = await build(agent);
    const score = (k: string) => b.attributes.find((a: { key: string }) => a.key === k).score;
    expect(score("focus")).toBe(64);
    expect(score("wellbeing")).toBe(51);
    expect(score("creativity")).toBe(48);
    expect(b.archetype.affinity).toBeGreaterThan(0);
    expect(b.archetype.affinity).toBeLessThanOrEqual(100);
    expect(b.comparisons.d30.focus).toBeGreaterThan(0);
    expect(b.insights.some((i: { tone: string }) => i.tone === "down")).toBe(true);
    const evo = (await agent.get("/api/build/evolution?period=90d")).body;
    expect(evo.points.length).toBeGreaterThan(5);
    expect(evo.points[evo.points.length - 1].scores.focus).toBe(64);

    const other = await createAuthenticatedAgent();
    expect((await build(other.agent)).attributes.every((a: { score: number }) => a.score === 0)).toBe(true);
  });

  it("build desejada: valida, avisa metas exageradas, reseta; plano só cria o que foi confirmado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await xp(userId, "focus", 300);
    expect((await agent.put("/api/build/desired").send({ name: "" })).status).toBe(400);
    const saved = await agent.put("/api/build/desired").send({ name: "Tudo no máximo", targets: { knowledge: 100, discipline: 100, focus: 100, health: 100, creativity: 100, wellbeing: 150 } });
    expect(saved.status).toBe(200);
    expect(saved.body.targets.wellbeing).toBe(100);
    expect(saved.body.warning).toBeTruthy();
    expect((await build(agent)).desired.name).toBe("Tudo no máximo");
    expect((await agent.delete("/api/build/desired")).body.isDefault).toBe(true);

    const before = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM habits WHERE owner_id = ?", args: [userId] });
    expect(Number(before.rows[0].n)).toBe(0);
    const applied = (await agent.post("/api/build/plan/apply").send({ itemIds: ["health-habit", "inexistente"] })).body;
    expect(applied.created).toHaveLength(1);
    expect(applied.skipped.map((s: { id: string }) => s.id)).toContain("inexistente");
    const again = (await agent.post("/api/build/plan/apply").send({ itemIds: ["health-habit"] })).body;
    expect(again.created).toHaveLength(0);
  });
});

describe("Protocolos — regras puras", () => {
  it("gatilhos só disparam com dado existente; relevância é determinística; ações validadas", () => {
    const ctx = { today: day(), weekday: 1, sleep_hours: 5.5 };
    expect(evaluateTrigger({ type: "data", metric: "sleep_hours", op: "lt", value: 6.5 }, ctx).triggered).toBe(true);
    expect(evaluateTrigger({ type: "data", metric: "energy", op: "lte", value: 2 }, ctx).triggered).toBe(false);
    expect(evaluateTrigger({ type: "time", weekday: 1 }, ctx).triggered).toBe(true);
    expect(calculateProtocolRelevance({ triggered: true, favorite: false, uses: 0, lastRunAt: null })).toBe(100);
    expect(calculateProtocolRelevance({ triggered: false, favorite: true, uses: 20, lastRunAt: null })).toBe(50);
    expect(validateProtocolActions([{ title: "x", actionType: "OPEN_SCREEN", config: { path: "https://mal.com" } }]).success).toBe(false);
    expect(validateProtocolActions([{ title: "x", actionType: "DROP_TABLE", config: {} }]).success).toBe(false);
  });
});

describe("Protocolos — API", () => {
  it("lista templates, clona uma vez, protege template global e valida criação", async () => {
    const { agent } = await createAuthenticatedAgent();
    const list = (await agent.get("/api/protocols")).body;
    expect(list.protocols.filter((p: { kind: string }) => p.kind === "template")).toHaveLength(12);
    expect(list.featured).toBeTruthy();
    const clone = await agent.post("/api/protocols/templates/dormi-mal/clone");
    expect(clone.status).toBe(201);
    const again = await agent.post("/api/protocols/templates/dormi-mal/clone");
    expect(again.body.ref).toBe(clone.body.ref);
    expect((await agent.put("/api/protocols/t:dormi-mal").send({ name: "x", category: "pessoal", trigger: { type: "manual" }, art: "moon", steps: [{ title: "a", actionType: "CUSTOM", config: {} }] })).status).toBe(403);
    const bad = await agent.post("/api/protocols").send({ name: "Mal", category: "pessoal", trigger: { type: "manual" }, art: "moon", steps: [{ title: "a", actionType: "OPEN_SCREEN", config: { path: "/admin" } }] });
    expect(bad.status).toBe(400);
    const ok = await agent.post("/api/protocols").send({ name: "Meu", category: "digital", trigger: { type: "data", metric: "overdue_tasks", op: "gt", value: 3 }, art: "digital", steps: [{ title: "Checar", actionType: "CHECKLIST", config: { items: ["a"] } }] });
    expect(ok.status).toBe(201);
    expect((await agent.post(`/api/protocols/${ok.body.ref}/favorite`).send({ favorite: true })).status).toBe(200);
    expect((await agent.get("/api/protocols")).body.protocols.find((p: { ref: string }) => p.ref === ok.body.ref).favorite).toBe(true);
    expect((await agent.delete(`/api/protocols/${ok.body.ref}`)).status).toBe(204);
  });

  it("sono baixo ativa a sugestão; preview não grava; executar aplica só o selecionado e é idempotente", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({
      sql: "INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes) VALUES (?, ?, datetime('now', '-6 hours'), datetime('now', '-1 hours'), 300)",
      args: [nanoid(), userId],
    });
    const low = await task(userId, "Organizar e-mails", "Baixa", 120);
    await task(userId, "Relatório", "Média", 60);
    const high = await task(userId, "Defesa", "Alta", 90);

    const sug = (await agent.get("/api/protocols/suggestions")).body;
    expect(sug.suggestions.some((s: { ref: string }) => s.ref === "t:dormi-mal")).toBe(true);

    const preview = (await agent.post("/api/protocols/t:dormi-mal/preview")).body;
    const cap = preview.steps[0];
    expect(cap.mode).toBe("suggested");
    expect(cap.details.tasks.map((t: { id: string }) => t.id)).not.toContain(high);
    const still = await db.execute({ sql: "SELECT due_date FROM tasks WHERE id = ?", args: [low] });
    expect(String(still.rows[0].due_date).slice(0, 10)).toBe(day());

    const steps = preview.steps.map((s: { ref: string }, i: number) => ({ ref: s.ref, selected: i !== 1, taskId: i === 3 ? high : undefined }));
    const run = await agent.post("/api/protocols/t:dormi-mal/execute").send({ requestId: "run-aaaaaaaa", steps });
    expect(run.status).toBe(201);
    expect(run.body.status).toBe("started"); // passo manual (caminhada) pendente
    const replay = await agent.post("/api/protocols/t:dormi-mal/execute").send({ requestId: "run-aaaaaaaa", steps });
    expect(replay.body.id).toBe(run.body.id);
    const runs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM protocol_runs WHERE owner_id = ?", args: [userId] });
    expect(Number(runs.rows[0].n)).toBe(1);

    const moved = await db.execute({ sql: "SELECT due_date FROM tasks WHERE id = ?", args: [low] });
    expect(String(moved.rows[0].due_date).slice(0, 10)).toBe(day(1));
    expect((await agent.get("/api/protocols/suggestions")).body.daily).toMatchObject({ taskId: high, recovery: true });
    expect(run.body.steps[1].status).toBe("skipped");
    expect(run.body.steps[2].status).toBe("pending");

    const done = await agent.patch(`/api/protocols/runs/${run.body.id}/steps`).send({ stepRef: run.body.steps[2].ref, status: "completed" });
    expect(done.body.status).toBe("partial");
    const p = (await agent.get("/api/protocols")).body.protocols.find((x: { ref: string }) => x.ref === "t:dormi-mal");
    expect(p.uses).toBe(1);
    const tl = (await agent.get(`/api/analytics/timeline?from=${day(-1)}&to=${day(1)}`)).body.events as Array<{ type: string; label: string }>;
    expect(tl.some((e) => e.type === "protocol")).toBe(true);
    expect(tl.some((e) => e.type === "recovery")).toBe(true);
  });

  it("cancelamento, falha de ação e isolamento entre usuários", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const foreign = await task(b.userId, "Alheia", "Alta", 30);
    const prev = (await a.agent.post("/api/protocols/t:dormi-mal/preview")).body;
    const steps = prev.steps.map((s: { ref: string }, i: number) => ({ ref: s.ref, selected: i === 2 || i === 3, taskId: i === 3 ? foreign : undefined }));
    const run = (await a.agent.post("/api/protocols/t:dormi-mal/execute").send({ requestId: "run-bbbbbbbb", steps })).body;
    expect(run.steps[3].status).toBe("failed");
    const canceled = await a.agent.post(`/api/protocols/runs/${run.id}/cancel`);
    expect(canceled.body.status).toBe("canceled");
    expect((await a.agent.post(`/api/protocols/runs/${run.id}/cancel`)).status).toBe(409);

    const mine = (await a.agent.post("/api/protocols/templates/sobrecarregado/clone")).body;
    expect((await b.agent.post(`/api/protocols/${mine.ref}/preview`)).status).toBe(404);
    expect((await b.agent.post(`/api/protocols/${mine.ref}/favorite`).send({ favorite: true })).status).toBe(404);
    expect((await b.agent.delete(`/api/protocols/${mine.ref}`)).status).toBe(404);
    expect((await b.agent.post(`/api/protocols/runs/${run.id}/cancel`)).status).toBe(404);
    expect((await b.agent.get("/api/protocols/runs")).body).toEqual([]);
  });
});
