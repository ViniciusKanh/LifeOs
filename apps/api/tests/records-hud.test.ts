import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { buildRecords, weekStartOf, RECORD_METRICS, type RecordMetric } from "../src/services/recordsService.js";

const weeks = (entries: Partial<Record<RecordMetric, Array<[string, number]>>>) =>
  Object.fromEntries(RECORD_METRICS.map((m) => [m.key, new Map(entries[m.key] ?? [])])) as Record<RecordMetric, Map<string, number>>;

describe("Recordes pessoais (eu × eu)", () => {
  it("semana começa na segunda", () => {
    expect(weekStartOf("2026-10-22")).toBe("2026-10-19"); // quinta → segunda
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19"); // domingo
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
  });

  it("novo recorde só quando supera todas as semanas anteriores", () => {
    const rows = buildRecords(
      weeks({ missions: [["2026-10-05", 8], ["2026-10-12", 5], ["2026-10-19", 9]], workouts: [["2026-10-12", 4], ["2026-10-19", 4]], pages: [["2026-10-19", 30]] }),
      "2026-10-19",
    );
    const m = rows.find((r) => r.key === "missions")!;
    expect(m).toMatchObject({ thisWeek: 9, lastWeek: 5, best: 8, bestWeekStart: "2026-10-05", newRecord: true, deltaPct: 80 });
    expect(rows.find((r) => r.key === "workouts")!.newRecord).toBe(false); // empate não é recorde
    expect(rows.find((r) => r.key === "pages")!.newRecord).toBe(false); // primeira semana com dado: sem histórico
  });

  it("endpoint conta missões desta semana e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const t = await agent.post("/api/tasks").send({ title: "Missão A" });
    await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    const r = await agent.get("/api/records/weekly");
    expect(r.status).toBe(200);
    expect(r.body.records.find((x: { key: string }) => x.key === "missions").thisWeek).toBe(1);
    const { agent: other } = await createAuthenticatedAgent();
    const o = await other.get("/api/records/weekly");
    expect(o.body.records.find((x: { key: string }) => x.key === "missions").thisWeek).toBe(0);
  });
});

describe("HUD: classe dinâmica e vitrine", () => {
  it("sem XP não há classe; vitrine só mostra conquistas desbloqueadas", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const empty = await agent.get("/api/codex/hud");
    expect(empty.status).toBe(200);
    expect(empty.body.currentClass).toBeNull();

    const db = getDb();
    const ach = (await db.execute("SELECT id FROM achievements ORDER BY id LIMIT 2")).rows.map((r) => String(r.id));
    await db.execute({ sql: "INSERT INTO user_achievements (id, owner_id, achievement_id) VALUES (?, ?, ?)", args: [nanoid(), userId, ach[0]] });
    const saved = await agent.patch("/api/auth/me").send({ rpgPrefs: { showcase: [ach[0], ach[1]], sound: true } });
    expect(saved.status).toBe(200);
    const hud = await agent.get("/api/codex/hud");
    expect(hud.body.showcase.map((s: { id: string }) => s.id)).toEqual([ach[0]]);

    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { showcase: ["a", "b", "c", "d"] } })).status).toBe(400);
  });

  it("classe acompanha a rotina recente (últimos 30 dias)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const day = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'journal', ?, 'entry', 40, 'Diário', ?)",
        args: [nanoid(), userId, nanoid(), day],
      });
    }
    const hud = await agent.get("/api/codex/hud");
    expect(hud.body.currentClass).not.toBeNull();
    expect(hud.body.build.length).toBeGreaterThan(0);
  });
});
