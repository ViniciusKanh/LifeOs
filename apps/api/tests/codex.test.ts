import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { allocateXp, calculateAttributeLevel, calculateAttributeSynergy, distributionFor, ruleMet, trendPct } from "../src/services/codexEngine.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
const codex = async (agent: Agent) => (await agent.get("/api/codex")).body;

async function insertXp(ownerId: string, sourceType: string, count: number, xp = 5) {
  const db = getDb();
  const day = new Date().toISOString().slice(0, 10);
  await db.batch(
    Array.from({ length: count }, () => ({
      sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, ?, ?, 'session', ?, 'teste', ?)",
      args: [nanoid(), ownerId, sourceType, nanoid(), xp, day],
    })),
    "write",
  );
}

describe("Atributos (regras puras)", () => {
  it("classifica sem criar XP: a soma das partes é o XP original", () => {
    expect(allocateXp(10, { focus: 1 })).toEqual({ focus: 10 });
    const parts = allocateXp(10, { knowledge: 0.5, focus: 0.3, discipline: 0.2 });
    expect(parts).toEqual({ knowledge: 5, focus: 3, discipline: 2 });
    for (const xp of [1, 7, 13, 99]) {
      const p = allocateXp(xp, { focus: 0.8, discipline: 0.2 });
      expect(Object.values(p).reduce((a, b) => a + (b ?? 0), 0)).toBe(xp);
    }
    expect(distributionFor({ sourceType: "habit_entry", sourceId: "h:2026-01-01", eventType: "fulfilled", xp: 5 }, { habitText: "Correr 5 km saude" })).toEqual({ health: 0.8, discipline: 0.2 });
    expect(distributionFor({ sourceType: "task", sourceId: "t", eventType: "completed", xp: 20 }, { projectKind: "academic" }).knowledge).toBe(0.5);
  });

  it("nível, tendência e sinergia", () => {
    expect(calculateAttributeLevel(0).level).toBe(1);
    expect(calculateAttributeLevel(99).level).toBe(1);
    const l3 = calculateAttributeLevel(340);
    expect(l3).toMatchObject({ level: 3, levelStartXp: 250, nextLevelXp: 600 });
    expect(l3.progressPct).toBe(Math.round((90 / 350) * 100));
    expect(trendPct(115, 100)).toBe(15);
    expect(trendPct(10, 0)).toBeNull();
    const even = calculateAttributeSynergy({ focus: 500, health: 500, knowledge: 500, discipline: 500, creativity: 500, wellbeing: 500 });
    expect(even.synergy).toBe(50);
    const lopsided = calculateAttributeSynergy({ focus: 3000 });
    expect(lopsided.synergy).toBeLessThan(even.synergy);
    expect(calculateAttributeSynergy({}).synergy).toBe(0);
    const facts = { globalLevel: 3, attributeXp: { focus: 300 }, sourceCounts: { focus: 10 }, tasksDone: 0, campaignsCompleted: 0, bestHabitStreak: 0 };
    expect(ruleMet({ type: "all", rules: [{ type: "global_level", min: 3 }, { type: "xp_source_count", source: "focus", min: 10 }] }, facts)).toBe(true);
    expect(ruleMet({ type: "attribute_xp", attribute: "focus", min: 301 }, facts)).toBe(false);
  });
});

describe("Códex (API)", () => {
  it("sem eventos não inventa nada; com XP real os atributos somam o XP global", async () => {
    const { agent } = await createAuthenticatedAgent();
    const empty = await codex(agent);
    expect(empty.hasData).toBe(false);
    expect(empty.discoveries).toEqual([]);
    expect(empty.attributes.every((a: { xp: number }) => a.xp === 0)).toBe(true);
    const t = await agent.post("/api/tasks").send({ title: "Missão", priority: "Alta" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const c = await codex(agent);
    const sum = c.attributes.reduce((s: number, a: { xp: number }) => s + a.xp, 0);
    expect(sum).toBe(c.global.totalXp);
    expect(c.attributes.find((a: { key: string }) => a.key === "discipline").xp).toBeGreaterThan(0);
  });

  it("relíquia desbloqueia uma vez e título só é equipado se desbloqueado (por usuário)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const user = { id: userId };
    await insertXp(user.id, "focus", 10);
    const c1 = await codex(agent);
    expect(c1.relics.find((r: { id: string }) => r.id === "ampulheta").unlocked).toBe(true);
    await codex(agent);
    const rows = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM codex_unlocks WHERE owner_id = ? AND kind = 'relic' AND item_id = 'ampulheta'", args: [user.id] });
    expect(Number(rows.rows[0].n)).toBe(1);
    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { title: "lenda" } })).status).toBe(403);
    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { title: "aprendiz" } })).status).toBe(200);
    expect((await codex(agent)).titles.filter((t: { equipped: boolean }) => t.equipped).map((t: { id: string }) => t.id)).toEqual(["aprendiz"]);
    const other = await createAuthenticatedAgent();
    const oc = await codex(other.agent);
    expect(oc.relics.find((r: { id: string }) => r.id === "ampulheta").unlocked).toBe(false);
  });

  it("conhecimento por moedas: recusa sem saldo, cobra uma vez e nunca reduz XP", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const user = { id: userId };
    expect((await agent.post("/api/codex/knowledge/revisao-semanal/unlock")).status).toBe(409);
    expect((await agent.post("/api/codex/knowledge/foco-profundo/unlock")).status).toBe(400);
    await getDb().execute({ sql: "INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label) VALUES (?, ?, 80, 'test', ?, 'grant', 'teste')", args: [nanoid(), user.id, nanoid()] });
    const before = (await agent.get("/api/gamification/profile")).body;
    expect((await agent.post("/api/codex/knowledge/revisao-semanal/unlock")).status).toBe(200);
    expect((await agent.post("/api/codex/knowledge/revisao-semanal/unlock")).body.already).toBe(true);
    const after = (await agent.get("/api/gamification/profile")).body;
    expect(after.coins).toBe(before.coins - 50);
    expect(after.totalXp).toBe(before.totalXp);
    const k = (await codex(agent)).knowledge.find((x: { id: string }) => x.id === "revisao-semanal");
    expect(k.unlocked).toBe(true);
    expect(k.content.length).toBeGreaterThan(0);
  });

  it("descoberta só com evidência mínima e isolada por usuário", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const user = { id: userId };
    const db = getDb();
    const at = (h: number, i: number) => `${new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10)}T${String(h).padStart(2, "0")}:00:00.000Z`;
    const add = (h: number, i: number, min: number) => db.execute({ sql: "INSERT INTO time_entries (id, owner_id, started_at, ended_at, duration_minutes) VALUES (?, ?, ?, ?, ?)", args: [nanoid(), user.id, at(h, i), at(h, i), min] });
    for (let i = 0; i < 3; i++) await add(12, i, 50);
    expect((await codex(agent)).discoveries).toEqual([]);
    for (let i = 3; i < 7; i++) await add(12, i, 50);
    for (let i = 0; i < 5; i++) await add(20, i, 25);
    const d = (await codex(agent)).discoveries.find((x: { key: string }) => x.key === "focus_time_of_day");
    expect(d.title).toContain("manhã");
    expect(d.evidence.sample).toBe(12);
    expect(["medium", "high"]).toContain(d.confidence);
    const other = await createAuthenticatedAgent();
    expect((await codex(other.agent)).discoveries).toEqual([]);
  });
});
