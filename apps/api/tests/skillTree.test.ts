import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { xpToReachLevel } from "../src/services/gamificationService.js";
import { SKILLS, SKILL_BY_KEY, BRANCHES, validateCatalog, ALL_EFFECTS, type SkillDef } from "../src/config/skillTree.js";
import { bestStreaks, evaluateLevel, planTargets, syncPoints, type Facts } from "../src/services/skillTreeService.js";
import { runAutomationNow } from "../src/services/automationRunner.js";

const db = () => getDb();

/** Dá ao usuário XP suficiente para o nível informado (pelo ledger oficial de XP). */
async function setLevel(userId: string, level: number) {
  await db().execute({
    sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'achievement', ?, 'test', ?, 'teste', date('now'))",
    args: [nanoid(), userId, nanoid(), xpToReachLevel(level)],
  });
}
async function doneTasks(userId: string, n: number) {
  const stmts = Array.from({ length: n }, () => ({ sql: "INSERT INTO tasks (id, owner_id, title, status, priority, completed_at, due_date) VALUES (?, ?, 'feita', 'Concluído', 'Média', datetime('now'), date('now', '+1 day'))", args: [nanoid(), userId] }));
  await db().batch(stmts, "write");
}

describe("Árvore — catálogo e regras puras", () => {
  it("tem 52 habilidades distintas, 8 por ramo, efeitos únicos e grafo sem ciclos", () => {
    expect(SKILLS).toHaveLength(52);
    for (const b of BRANCHES.filter((x) => x.key !== "avancada")) expect(SKILLS.filter((s) => s.branch === b.key)).toHaveLength(8);
    expect(new Set(SKILLS.map((s) => s.name)).size).toBe(52);
    for (const s of SKILLS) for (const l of s.levels) expect(l.effects.length).toBeGreaterThan(0);
    expect(new Set(ALL_EFFECTS.map((e) => e.key)).size).toBe(ALL_EFFECTS.length);
    // Multirramo de verdade: Executor Estratégico depende de Foco.
    expect(SKILL_BY_KEY.get("prod_executor")!.requires.flat().map((o) => o.skill)).toContain("foco_blocos");
  });
  it("recusa catálogo com dependência cíclica", () => {
    const a = { ...SKILL_BY_KEY.get("prod_aprendiz")!, key: "x_a", requires: [[{ skill: "x_b", level: 1 }]], levels: [{ cost: 1, heroLevel: 1, evidence: null, effects: [] }] } as SkillDef;
    const b = { ...a, key: "x_b", requires: [[{ skill: "x_a", level: 1 }]] } as SkillDef;
    expect(() => validateCatalog([a, b])).toThrow(/Ciclo/);
  });
  it("sequências de hábitos contam só dias consecutivos", () => {
    expect(bestStreaks([{ habit: "h", day: "2026-11-01" }, { habit: "h", day: "2026-11-02" }, { habit: "h", day: "2026-11-04" }, { habit: "g", day: "2026-11-04" }])).toEqual([2, 1]);
  });
  it("requisitos E/OU e custo são avaliados pelo motor", () => {
    const facts = new Proxy({}, { get: () => 0 }) as Facts;
    const prazos = SKILL_BY_KEY.get("prod_prazos")!; // (planejador nv1 OU rotina nv2)
    const base = { heroLevel: 30, facts, available: 10 };
    expect(evaluateLevel(prazos, 1, { ...base, levels: new Map() }).checks.find((c) => c.kind === "prereq")!.met).toBe(false);
    expect(evaluateLevel(prazos, 1, { ...base, levels: new Map([["prod_rotina", 2]]) }).checks.find((c) => c.kind === "prereq")!.met).toBe(true);
    expect(evaluateLevel(prazos, 1, { ...base, levels: new Map([["prod_planejador", 1]]) }).checks.find((c) => c.kind === "prereq")!.met).toBe(true);
    expect(evaluateLevel(prazos, 1, { ...base, available: 0, levels: new Map([["prod_planejador", 1]]) }).ok).toBe(false);
  });
  it("simulador inclui o caminho mínimo e não aplica passos bloqueados", () => {
    const facts = new Proxy({}, { get: () => 0 }) as Facts;
    const p = planTargets([{ key: "prod_executor", level: 1 }], { levels: new Map(), heroLevel: 1, facts, available: 3 });
    const keys = p.steps.map((s) => `${s.key}:${s.level}`);
    expect(keys).toContain("prod_aprendiz:1");
    expect(keys).toContain("prod_planejador:2");
    expect(keys).toContain("foco_blocos:1");
    expect(keys.indexOf("prod_aprendiz:1")).toBeLessThan(keys.indexOf("prod_planejador:1"));
    expect(p.steps.at(-1)!.key).toBe("prod_executor");
    expect(p.totalCost).toBeGreaterThan(p.readyCost);
    expect(p.executable.every((e) => p.steps.find((s) => s.key === e.key && s.level === e.level)!.ok)).toBe(true);
  });
});

describe("Árvore — pontos, evolução e segurança (HTTP)", () => {
  it("concede PH retroativos uma única vez e calcula saldo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await setLevel(userId, 6);
    const r = await agent.get("/api/skill-tree");
    expect(r.status).toBe(200);
    expect(r.body.hero.level).toBe(6);
    expect(r.body.points.total).toBe(6); // níveis 2..6 = 5 PH + marco do nível 5
    expect(r.body.grants.some((g: { label: string }) => g.label.includes("retroativo"))).toBe(true);
    await agent.get("/api/skill-tree");
    expect(await syncPoints(db(), userId)).toBe(0);
    expect((await agent.get("/api/skill-tree")).body.points.available).toBe(6);
  });

  it("desbloqueia, valida evidência real, pré-requisito, nível máximo e gasta uma vez só", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await setLevel(userId, 12);
    const first = await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 0 });
    expect(first.status).toBe(200);
    expect(first.body.spent).toBe(1);
    // Mesmo pedido de novo (tela desatualizada) é recusado.
    expect((await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 0 })).status).toBe(409);
    // Nível 2 exige 5 missões concluídas de verdade.
    const lack = await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 1 });
    expect(lack.status).toBe(409);
    expect(lack.body.error).toMatch(/5 missões/);
    await doneTasks(userId, 15);
    expect((await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 1 })).status).toBe(200);
    expect((await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 2 })).status).toBe(200);
    const max = await agent.post("/api/skill-tree/upgrade").send({ key: "prod_aprendiz", expectedLevel: 3 });
    expect(max.status).toBe(409);
    expect(max.body.error).toMatch(/máximo/);
    // Sem pré-requisito, não desbloqueia.
    const noPre = await agent.post("/api/skill-tree/upgrade").send({ key: "prod_priorizacao", expectedLevel: 0 });
    expect(noPre.status).toBe(409);
    expect(noPre.body.error).toMatch(/Planejador Iniciante/);
    const view = (await agent.get("/api/skill-tree")).body;
    const ap = view.skills.find((s: { key: string }) => s.key === "prod_aprendiz");
    expect(ap.level).toBe(3);
    expect(ap.state).toBe("maximizada");
    expect(view.points.spent).toBe(1 + 2 + 3);
    // Efeitos ativos chegam aos módulos (Missões e análises).
    const fx = (await agent.get("/api/skill-tree/effects")).body;
    expect(fx.missionTemplates.map((m: { key: string }) => m.key)).toContain("missions.template.fechamento");
    expect(fx.analyses.map((m: { panel: string }) => m.panel)).toContain("prod_weekday");
    const panel = await agent.get("/api/skill-tree/analysis/prod_weekday");
    expect(panel.status).toBe(200);
    expect(panel.body.items).toHaveLength(7);
    expect(panel.body.sample).toBeGreaterThanOrEqual(15);
    // Análise não desbloqueada é recusada no servidor.
    expect((await agent.get("/api/skill-tree/analysis/focus_hours")).status).toBe(403);
    expect((await agent.post("/api/skill-tree/agenda-preview").send({ effectKey: "agenda.blocks.deep" })).status).toBe(403);
    // Conquista oficial e título do Códex pela infraestrutura existente.
    const ach = (await agent.get("/api/achievements")).body as Array<{ code: string; unlockedAt: string | null }>;
    expect(ach.find((a) => a.code === "skill_first")?.unlockedAt).toBeTruthy();
    const codex = (await agent.get("/api/codex")).body as { titles: Array<{ id: string; unlocked: boolean }> };
    expect(codex.titles.find((t) => t.id === "aprendiz-habilidades")?.unlocked).toBe(true);
  });

  it("saldo insuficiente e corrida entre duas abas não geram gasto duplicado nem saldo negativo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await setLevel(userId, 2); // 1 PH
    const [a, b] = await Promise.all([
      agent.post("/api/skill-tree/upgrade").send({ key: "saude_guardiao", expectedLevel: 0 }),
      agent.post("/api/skill-tree/upgrade").send({ key: "foco_iniciado", expectedLevel: 0 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const v = (await agent.get("/api/skill-tree")).body;
    expect(v.points.available).toBe(0);
    expect(v.points.spent).toBe(1);
    const tx = await db().execute({ sql: "SELECT COUNT(*) AS n FROM skill_transactions WHERE owner_id = ? AND kind = 'upgrade'", args: [userId] });
    expect(Number(tx.rows[0]!.n)).toBe(1);
  });

  it("simula sem gastar e aplica exatamente os passos confirmados", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await setLevel(userId, 8);
    const before = (await agent.get("/api/skill-tree")).body.points.available;
    const targets = [{ key: "prod_prazos", level: 1 }, { key: "foco_pomodoro", level: 1 }];
    const sim = await agent.post("/api/skill-tree/simulate").send({ targets });
    expect(sim.status).toBe(200);
    expect((await agent.get("/api/skill-tree")).body.points.available).toBe(before);
    expect(sim.body.steps.length).toBeGreaterThan(sim.body.executable.length - 1);
    const wrong = await agent.post("/api/skill-tree/apply").send({ targets, confirmed: [{ key: "prod_prazos", level: 1 }], origin: "build" });
    expect(wrong.status).toBe(409);
    const ok = await agent.post("/api/skill-tree/apply").send({ targets, confirmed: sim.body.executable, origin: "build" });
    expect(ok.status).toBe(200);
    expect(ok.body.applied.length).toBe(sim.body.executable.length);
    const after = (await agent.get("/api/skill-tree")).body;
    expect(after.points.available).toBe(before - ok.body.spent);
    expect(after.history.filter((h: { origin: string }) => h.origin === "build")).toHaveLength(ok.body.applied.length);
  });

  it("presets: oficiais, personalizados (CRUD), duplicar e conquista de construtor", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const list = (await agent.get("/api/skill-tree")).body.presets;
    expect(list.filter((p: { builtin: boolean }) => p.builtin).map((p: { id: string }) => p.id)).toEqual(["equilibrado", "produtivo", "academico"]);
    expect((await agent.put("/api/skill-tree/presets/produtivo").send({ name: "x", targets: [{ key: "prod_aprendiz", level: 1 }] })).status).toBe(400);
    const c = await agent.post("/api/skill-tree/presets").send({ name: "Mestrado", targets: [{ key: "apr_aprendiz", level: 2 }, { key: "apr_pesquisador", level: 1 }] });
    expect(c.status).toBe(200);
    expect((await agent.put(`/api/skill-tree/presets/${c.body.id}`).send({ name: "Mestrado UNESP", targets: [{ key: "apr_aprendiz", level: 3 }] })).status).toBe(200);
    const dup = await agent.post(`/api/skill-tree/presets/${c.body.id}/duplicate`);
    expect(dup.status).toBe(200);
    expect((await other.agent.delete(`/api/skill-tree/presets/${c.body.id}`)).status).toBe(404);
    expect((await agent.delete(`/api/skill-tree/presets/${dup.body.id}`)).status).toBe(200);
    const mine = (await agent.get("/api/skill-tree")).body.presets.filter((p: { builtin: boolean }) => !p.builtin);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Mestrado UNESP");
    const ach = (await agent.get("/api/achievements")).body as Array<{ code: string; unlockedAt: string | null }>;
    expect(ach.find((a) => a.code === "skill_builder")?.unlockedAt).toBeTruthy();
    expect((await other.agent.get("/api/skill-tree")).body.presets.filter((p: { builtin: boolean }) => !p.builtin)).toHaveLength(0);
  });

  it("redefinição: prévia, confirmação por ciclo, reembolso, efeitos desligados e histórico preservado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await setLevel(userId, 6);
    await agent.post("/api/skill-tree/upgrade").send({ key: "gest_organizador", expectedLevel: 0 });
    await agent.post("/api/skill-tree/upgrade").send({ key: "bem_aprendiz", expectedLevel: 0 });
    const prev = (await agent.get("/api/skill-tree/reset")).body;
    expect(prev.skills).toHaveLength(2);
    expect(prev.refund).toBe(2);
    expect(prev.effects.length).toBeGreaterThan(0);
    expect((await agent.post("/api/skill-tree/reset").send({ confirm: true, expectedEpoch: prev.epoch + 1 })).status).toBe(409);
    const r = await agent.post("/api/skill-tree/reset").send({ confirm: true, expectedEpoch: prev.epoch });
    expect(r.status).toBe(200);
    expect(r.body.refunded).toBe(2);
    const v = (await agent.get("/api/skill-tree")).body;
    expect(v.skills.every((s: { level: number }) => s.level === 0)).toBe(true);
    expect(v.points.available).toBe(v.points.total);
    expect(v.effects).toHaveLength(0);
    expect((await agent.get("/api/skill-tree/effects")).body.count).toBe(0);
    expect(v.history.some((h: { kind: string }) => h.kind === "reset")).toBe(true);
    expect(v.history.filter((h: { kind: string }) => h.kind === "upgrade")).toHaveLength(2);
    // Conquista legítima permanece; dá para desbloquear de novo no novo ciclo; intervalo bloqueia novo reset.
    const ach = (await agent.get("/api/achievements")).body as Array<{ code: string; unlockedAt: string | null }>;
    expect(ach.find((a) => a.code === "skill_first")?.unlockedAt).toBeTruthy();
    expect((await agent.post("/api/skill-tree/upgrade").send({ key: "gest_organizador", expectedLevel: 0 })).status).toBe(200);
    const again = await agent.post("/api/skill-tree/reset").send({ confirm: true, expectedEpoch: v.epoch });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/intervalo/);
  });

  it("isola usuários, sugere com o Oráculo sem aplicar e automações são idempotentes", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    await setLevel(userId, 4);
    await agent.post("/api/skill-tree/upgrade").send({ key: "apr_aprendiz", expectedLevel: 0 });
    const ov = (await other.agent.get("/api/skill-tree")).body;
    expect(ov.skills.find((s: { key: string }) => s.key === "apr_aprendiz").level).toBe(0);
    expect(ov.points.total).toBe(0);
    const o = await agent.post("/api/skill-tree/oracle").send({ message: "Quero me desenvolver em Machine Learning e concluir meus projetos acadêmicos" });
    expect(o.status).toBe(200);
    expect(o.body.ai.used).toBe(false);
    expect(o.body.recommendations.some((r: { branch: string }) => r.branch === "aprendizado")).toBe(true);
    const tx = await db().execute({ sql: "SELECT COUNT(*) AS n FROM skill_transactions WHERE owner_id = ?", args: [userId] });
    expect(Number(tx.rows[0]!.n)).toBe(1); // o Oráculo não gasta nada
    const a1 = await runAutomationNow(db(), userId, "skills", "available");
    const a2 = await runAutomationNow(db(), userId, "skills", "available");
    expect(a1?.status ?? "ok").not.toBe("error");
    expect(a2?.status ?? "skipped").not.toBe("error");
    const notes = await db().execute({ sql: "SELECT COUNT(*) AS n FROM in_app_notifications WHERE owner_id = ? AND event_type = 'skill_available'", args: [userId] });
    expect(Number(notes.rows[0]!.n)).toBeLessThanOrEqual(1);
    const p = await runAutomationNow(db(), userId, "skills", "level_points");
    expect(p?.status ?? "skipped").not.toBe("error");
  });
});
