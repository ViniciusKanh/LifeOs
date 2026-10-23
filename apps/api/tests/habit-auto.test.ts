import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { todayKeyFor } from "../src/services/gamificationService.js";
import { meetsThreshold, syncAutoHabits, validateHabitChain } from "../src/services/habitAutoService.js";

async function habitXp(userId: string, habitId: string) {
  const r = await getDb().execute({
    sql: "SELECT COUNT(*) AS n, COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'habit_entry' AND source_id LIKE ?",
    args: [userId, `${habitId}:%`],
  });
  return { n: Number(r.rows[0].n), xp: Number(r.rows[0].xp) };
}

async function entry(habitId: string, day: string) {
  const r = await getDb().execute({ sql: "SELECT count, source FROM habit_entries WHERE habit_id = ? AND entry_date = ?", args: [habitId, day] });
  return r.rows[0] as unknown as { count: number; source: string | null } | undefined;
}

describe("Hábitos automáticos", () => {
  it("regra de limite", () => {
    expect(meetsThreshold("water", 0, null)).toBe(false);
    expect(meetsThreshold("water", 1500, 2000)).toBe(false);
    expect(meetsThreshold("water", 2000, 2000)).toBe(true);
    expect(meetsThreshold("journal", 1, 99)).toBe(true);
    expect(meetsThreshold("workout", 10, null)).toBe(true);
  });

  it("água marca o hábito ao bater o limite, sem XP duplicado e desfaz ao excluir", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const created = await agent.post("/api/habits").send({ name: "Beber água", autoSource: "water", autoThreshold: 1000 });
    expect(created.status).toBe(201);
    expect(created.body.auto_source).toBe("water");
    const habitId = created.body.id as string;
    const today = await todayKeyFor(getDb(), userId);

    const w1 = await agent.post("/api/health/water").send({ amountMl: 600 });
    expect(w1.status).toBe(201);
    expect(await entry(habitId, today)).toBeUndefined();

    const w2 = await agent.post("/api/health/water").send({ amountMl: 500 });
    expect(await entry(habitId, today)).toMatchObject({ count: 1, source: "auto" });
    expect((await habitXp(userId, habitId)).n).toBe(1);

    // Sincronizações repetidas (inclusive pela listagem) não pagam de novo.
    await syncAutoHabits(getDb(), userId, today);
    await agent.get("/api/habits");
    expect((await habitXp(userId, habitId)).n).toBe(1);

    // Excluir o registro derruba a marcação automática...
    await agent.delete(`/api/health/water/${w2.body.id}`);
    expect(await entry(habitId, today)).toBeUndefined();
    // ...e refazer não paga XP de novo (ledger idempotente).
    await agent.post("/api/health/water").send({ amountMl: 800 });
    expect(await entry(habitId, today)).toMatchObject({ source: "auto" });
    expect((await habitXp(userId, habitId)).n).toBe(1);
    void w1;
  });

  it("check-in manual nunca é desfeito pela sincronização", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Treinar", autoSource: "workout" });
    const today = await todayKeyFor(getDb(), userId);
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: today, count: 1 });
    const r = await syncAutoHabits(getDb(), userId, today);
    expect(r.cleared).toEqual([]);
    expect(await entry(h.body.id, today)).toMatchObject({ count: 1, source: null });
  });

  it("tarefas concluídas contam para o hábito 'concluir N tarefas'", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Duas missões", autoSource: "tasks", autoThreshold: 2 });
    const today = await todayKeyFor(getDb(), userId);
    for (const title of ["A", "B"]) {
      const t = await agent.post("/api/tasks").send({ title });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    expect(await entry(h.body.id, today)).toMatchObject({ source: "auto" });
  });

  it("isola por usuário: registro de outro usuário não marca meu hábito", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const { agent: other } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Água", autoSource: "water" });
    await other.post("/api/health/water").send({ amountMl: 3000 });
    const today = await todayKeyFor(getDb(), userId);
    await agent.get("/api/habits");
    expect(await entry(h.body.id, today)).toBeUndefined();
    // E o outro usuário não consegue encadear no meu hábito nem editá-lo.
    expect((await other.post("/api/habits").send({ name: "Depois", afterHabitId: h.body.id })).status).toBe(400);
    expect((await other.patch(`/api/habits/${h.body.id}`).send({ autoSource: null })).status).toBe(404);
  });

  it("encadeamento valida ciclo e posse", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const a = await agent.post("/api/habits").send({ name: "Café" });
    const b = await agent.post("/api/habits").send({ name: "Ler", afterHabitId: a.body.id });
    expect(b.status).toBe(201);
    expect(b.body.after_habit_id).toBe(a.body.id);
    const cyc = await agent.patch(`/api/habits/${a.body.id}`).send({ afterHabitId: b.body.id });
    expect(cyc.status).toBe(400);
    await expect(validateHabitChain(getDb(), userId, a.body.id, a.body.id)).rejects.toThrow();
  });

  it("fonte desconhecida é rejeitada; lista de fontes informa disponibilidade", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/habits").send({ name: "X", autoSource: "sleep" })).status).toBe(400);
    const s = await agent.get("/api/habits/auto-sources");
    expect(s.status).toBe(200);
    expect(s.body.find((x: { key: string }) => x.key === "water").available).toBe(true);
  });
});
