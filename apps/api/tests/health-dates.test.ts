import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import {
  localDateKeyOf,
  localDayBoundsUtc,
  offsetForTimeZone,
  parseTzOffset,
  todayInTz,
  utcRangeFilter,
} from "../src/services/healthService.js";

/**
 * Bug relatado: "registro de hoje cai em ontem". Causa: instantes UTC em dois
 * formatos no banco ("YYYY-MM-DD HH:MM:SS" do datetime('now') e ISO com Z) e
 * filtro por comparação de texto — ' ' < 'T' jogava o registro do dia para o
 * dia anterior. São Paulo = UTC-3 (offset +180).
 */
const SP = 180;

describe("Saúde — dia local (unitário)", () => {
  it("limites do dia 22/10 em São Paulo", () => {
    expect(localDayBoundsUtc("2026-10-22", SP)).toEqual({
      start: "2026-10-22T03:00:00.000Z",
      end: "2026-10-23T03:00:00.000Z",
    });
  });

  it("22h de 22/10 em São Paulo (01:00 UTC de 23/10) é dia 22 local, nos dois formatos", () => {
    expect(localDateKeyOf("2026-10-23T01:00:00.000Z", SP)).toBe("2026-10-22");
    expect(localDateKeyOf("2026-10-23 01:00:00", SP)).toBe("2026-10-22");
    expect(todayInTz(SP, new Date("2026-10-23T01:00:00.000Z"))).toBe("2026-10-22");
  });

  it("fuso IANA vira offset no padrão getTimezoneOffset", () => {
    expect(offsetForTimeZone("America/Sao_Paulo", new Date("2026-10-22T12:00:00Z"))).toBe(180);
    expect(offsetForTimeZone("UTC")).toBe(0);
  });

  it("tz inválido é ignorado", () => {
    expect(parseTzOffset("abc")).toBeNull();
    expect(parseTzOffset("99999")).toBeNull();
    expect(parseTzOffset("180")).toBe(180);
    expect(parseTzOffset(undefined)).toBeNull();
  });

  it("filtro de intervalo compara os dois formatos corretamente no SQLite", async () => {
    const db = getDb();
    const { start, end } = localDayBoundsUtc("2026-10-22", SP);
    const range = utcRangeFilter("v", start, end);
    // Mesma expressão de utcRangeFilter, com o valor testado em ?1 e os limites em ?2..?5.
    const sql = `SELECT (?1 >= ?2 AND ?1 < ?3 AND datetime(?1) >= datetime(?4) AND datetime(?1) < datetime(?5)) AS ok`;
    const run = async (value: string) => Number((await db.execute({ sql, args: [value, ...range.args] })).rows[0]?.ok);
    expect(await run("2026-10-22 15:00:00")).toBe(1); // meio-dia SP, formato datetime('now')
    expect(await run("2026-10-22T15:00:00.000Z")).toBe(1);
    expect(await run("2026-10-23 01:00:00")).toBe(1); // 22h SP
    expect(await run("2026-10-23T01:00:00.000Z")).toBe(1);
    expect(await run("2026-10-22 02:59:59")).toBe(0); // 23h59 de 21/10 em SP
    expect(await run("2026-10-23T03:00:00.000Z")).toBe(0); // meia-noite de 23/10 em SP
  });
});

describe("Saúde — registro às 22h em São Paulo fica no dia local (API)", () => {
  it("água/exercício gravados às 22h de 22/10 aparecem em 22/10, não em 21 nem 23", async () => {
    const { agent } = await createAuthenticatedAgent();
    const at22h = "2026-10-23T01:00:00.000Z";

    const water = await agent.post("/api/health/water").send({ amountMl: 300, recordedAt: at22h });
    expect(water.status).toBe(201);
    const workout = await agent.post("/api/health/workouts").send({ category: "musculacao", durationMinutes: 60, performedAt: at22h });
    expect(workout.status).toBe(201);

    const day22 = await agent.get(`/api/health/water?date=2026-10-22&tz=${SP}`);
    expect(day22.body.map((e: { id: string }) => e.id)).toContain(water.body.id);
    const day21 = await agent.get(`/api/health/water?date=2026-10-21&tz=${SP}`);
    expect(day21.body).toHaveLength(0);
    const day23 = await agent.get(`/api/health/water?date=2026-10-23&tz=${SP}`);
    expect(day23.body).toHaveLength(0);

    const summary = await agent.get(`/api/health/summary?date=2026-10-22&tz=${SP}`);
    expect(summary.body).toMatchObject({ date: "2026-10-22", waterMl: 300, workoutsToday: 1, workoutMinutesToday: 60 });
    const summary23 = await agent.get(`/api/health/summary?date=2026-10-23&tz=${SP}`);
    expect(summary23.body).toMatchObject({ waterMl: 0, workoutsToday: 0 });
  });

  it("registros legados no formato datetime('now') (sem Z) caem no dia local certo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    // Meio-dia de 22/10 em SP gravado pelo default antigo do SQLite: antes da
    // correção, ia para o dia 21 (o bug relatado).
    await db.execute({
      sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES ('legacy-noon', ?, 250, '2026-10-22 15:00:00')",
      args: [userId],
    });
    await db.execute({
      sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES ('legacy-22h', ?, 200, '2026-10-23 01:00:00')",
      args: [userId],
    });

    const day22 = await agent.get(`/api/health/water?date=2026-10-22&tz=${SP}`);
    expect(day22.body.map((e: { id: string }) => e.id).sort()).toEqual(["legacy-22h", "legacy-noon"]);
    const day21 = await agent.get(`/api/health/water?date=2026-10-21&tz=${SP}`);
    expect(day21.body).toHaveLength(0);
    const summary = await agent.get(`/api/health/summary?date=2026-10-22&tz=${SP}`);
    expect(summary.body.waterMl).toBe(450);
  });

  it("sem tz na query usa o fuso do perfil (America/Sao_Paulo), não o do servidor", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/health/water").send({ amountMl: 500, recordedAt: "2026-10-23T01:30:00.000Z" });
    const summary = await agent.get("/api/health/summary?date=2026-10-22");
    expect(summary.body.waterMl).toBe(500);
  });

  it("novos registros sem horário explícito são gravados em ISO UTC (formato único)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/health/water").send({ amountMl: 300 });
    expect(res.status).toBe(201);
    expect(res.body.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("data inválida é rejeitada", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/health/summary?date=22/10/2026");
    expect(res.status).toBe(400);
  });
});
