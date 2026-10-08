import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

/**
 * Garante que os filtros de data usam índice (lê só o período) em vez de
 * varrer todo o histórico do usuário — o que mais pesava nas leituras do Turso.
 */
async function plan(sql: string, args: Array<string>) {
  const r = await getDb().execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args });
  return r.rows.map((row) => String(row.detail)).join(" | ");
}

const CASES: Array<{ name: string; sql: string; args: string[]; column: string }> = [
  { name: "água do dia", sql: "SELECT SUM(amount_ml) FROM water_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day')", args: ["u", "2026-10-08", "2026-10-08"], column: "recorded_at" },
  { name: "humor do período", sql: "SELECT AVG(mood) FROM mood_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day')", args: ["u", "2026-10-01", "2026-10-08"], column: "recorded_at" },
  { name: "sono por despertar", sql: "SELECT AVG(duration_minutes) FROM sleep_entries WHERE owner_id = ? AND woke_up_at >= date(?) AND woke_up_at < date(?, '+1 day')", args: ["u", "2026-10-01", "2026-10-08"], column: "woke_up_at" },
  { name: "treinos", sql: "SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND performed_at >= date(?)", args: ["u", "2026-10-01"], column: "performed_at" },
  { name: "tarefas que vencem no dia", sql: "SELECT id FROM tasks WHERE owner_id = ? AND (due_date >= date(?2) AND due_date < date(?2, '+1 day'))", args: ["u", "2026-10-08"], column: "due_date" },
  { name: "tarefas concluídas no período", sql: "SELECT id FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND updated_at >= date(?) AND updated_at < date(?, '+1 day')", args: ["u", "2026-10-01", "2026-10-08"], column: "updated_at" },
  { name: "foco", sql: "SELECT SUM(actual_minutes) FROM focus_sessions WHERE owner_id = ? AND started_at >= date(?) AND started_at < date(?, '+1 day')", args: ["u", "2026-10-01", "2026-10-08"], column: "started_at" },
];

describe("Planos de consulta: filtros de data usam índice", () => {
  it.each(CASES)("$name", async ({ sql, args, column }) => {
    const p = await plan(sql, args);
    expect(p).toMatch(/USING (COVERING )?INDEX/);
    expect(p).toContain(`${column}>`);
  });
});

describe("Equivalência dos filtros reescritos", () => {
  it("formato com espaço, ISO com Z e data pura caem no mesmo dia", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/health/water").send({ amountMl: 300, recordedAt: "2026-10-08T23:59:00.000Z" });
    await agent.post("/api/health/water").send({ amountMl: 200, recordedAt: "2026-10-08T00:00:00.000Z" });
    await agent.post("/api/health/water").send({ amountMl: 999, recordedAt: "2026-10-09T00:00:00.000Z" });
    await agent.post("/api/health/water").send({ amountMl: 999, recordedAt: "2026-10-07T23:59:59.000Z" });
    const r = await agent.get("/api/health/water?date=2026-10-08");
    expect(r.status).toBe(200);
    expect((r.body as Array<{ amount_ml: number }>).map((x) => x.amount_ml).sort()).toEqual([200, 300]);
  });
});
