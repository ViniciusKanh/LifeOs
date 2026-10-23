import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { buildRhythm, getRhythm, localWeekdayHour, RHYTHM_MIN_EVENTS } from "../src/services/rhythmService.js";

describe("Ritmo do herói", () => {
  it("converte para o fuso do usuário (inclusive virada de dia)", () => {
    // 2026-10-20 (terça) 01:30 UTC = segunda 22:30 em São Paulo (UTC-3).
    expect(localWeekdayHour("2026-10-20 01:30:00", "America/Sao_Paulo")).toEqual({ weekday: 0, hour: 22 });
    expect(localWeekdayHour("2026-10-20T01:30:00.000Z", "UTC")).toEqual({ weekday: 1, hour: 1 });
    expect(localWeekdayHour("2026-10-20T01:30:00.000Z", "Asia/Tokyo")).toEqual({ weekday: 1, hour: 10 });
  });

  it("sem dados suficientes não aponta melhores horários", () => {
    const r = buildRhythm(["2026-10-20 12:00:00"], "UTC");
    expect(r.enough).toBe(false);
    expect(r.bestSlots).toEqual([]);
    expect(r.totalEvents).toBe(1);
  });

  it("melhores horários vêm da contagem real", () => {
    const ts = [
      ...Array(6).fill("2026-10-19T12:10:00Z"), // seg 09h SP
      ...Array(4).fill("2026-10-21T23:00:00Z"), // qua 20h SP
      ...Array(2).fill("2026-10-23T13:00:00Z"), // sex 10h SP
    ];
    const r = buildRhythm(ts, "America/Sao_Paulo");
    expect(r.enough).toBe(true);
    expect(r.bestSlots.map((s) => [s.weekdayLabel, s.hour, s.count])).toEqual([
      ["Seg", 9, 6],
      ["Qua", 20, 4],
      ["Sex", 10, 2],
    ]);
    expect(r.grid[0][9]).toBe(6);
  });

  it("lê tarefas e XP do próprio usuário, sem contar a tarefa duas vezes", async () => {
    const { userId } = await createAuthenticatedAgent();
    const { userId: otherId } = await createAuthenticatedAgent();
    const db = getDb();
    const now = new Date(Date.now() - 3600_000).toISOString();
    for (let i = 0; i < RHYTHM_MIN_EVENTS; i++) {
      const id = nanoid();
      await db.execute({ sql: "INSERT INTO tasks (id, owner_id, title, status, completed_at) VALUES (?, ?, 'T', 'Concluído', ?)", args: [id, userId, now] });
      await db.execute({
        sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'task', ?, 'completed', 10, 'T', '2026-01-01')",
        args: [nanoid(), userId, id],
      });
    }
    await db.execute({ sql: "INSERT INTO tasks (id, owner_id, title, status, completed_at) VALUES (?, ?, 'X', 'Concluído', ?)", args: [nanoid(), otherId, now] });
    const r = await getRhythm(db, userId);
    expect(r.sources).toEqual({ tasks: RHYTHM_MIN_EVENTS, xp: 0 });
    expect(r.enough).toBe(true);
    const o = await getRhythm(db, otherId);
    expect(o.totalEvents).toBe(1);
    expect(o.enough).toBe(false);
  });
});
