import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function insertFocusSession(ownerId: string, day: Date, actualMinutes: number) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO focus_sessions (id, owner_id, mode, actual_minutes, started_at, ended_at) VALUES (?, ?, 'pomodoro', ?, ?, ?)`,
    args: [nanoid(), ownerId, actualMinutes, `${isoDate(day)}T10:00:00.000Z`, `${isoDate(day)}T11:00:00.000Z`],
  });
}

describe("Signals", () => {
  it("nunca fabrica dado para Clima e Uso de tela — aparecem como not_connected", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/signals?period=7d");
    expect(res.status).toBe(200);
    const weather = res.body.signals.find((s: { key: string }) => s.key === "weather");
    const screenTime = res.body.signals.find((s: { key: string }) => s.key === "screen_time");
    expect(weather.status).toBe("not_connected");
    expect(weather.value).toBeNull();
    expect(screenTime.status).toBe("not_connected");
    expect(screenTime.value).toBeNull();
  });

  it("marca sinais sem registro como insufficient_data, nunca zero fabricado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/signals?period=7d");
    expect(res.status).toBe(200);
    const sleep = res.body.signals.find((s: { key: string }) => s.key === "sleep");
    expect(sleep.status).toBe("insufficient_data");
    expect(sleep.value).toBeNull();
    const sleepDim = res.body.radar.find((r: { key: string }) => r.key === "sleep");
    expect(sleepDim.value).toBeNull();
  });

  it("calcula o radar de sono corretamente a partir de registros reais (8h = 100)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const day = addDays(today, -i);
      await agent.post("/api/health/sleep").send({
        wentToBedAt: `${isoDate(day)}T23:00:00.000Z`,
        wokeUpAt: `${isoDate(addDays(day, 1))}T07:00:00.000Z`,
        quality: 4,
      });
    }
    const res = await agent.get("/api/signals?period=7d");
    expect(res.status).toBe(200);
    const sleepDim = res.body.radar.find((r: { key: string }) => r.key === "sleep");
    expect(sleepDim.value).toBe(100);
    const sleepCard = res.body.signals.find((s: { key: string }) => s.key === "sleep");
    expect(sleepCard.status).toBe("ok");
    expect(sleepCard.value).toBe(480);
  });

  it("nunca detecta padrão de tendência sem amostra mínima (7 dias de cada janela)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      await insertFocusSession(userId, addDays(today, -i), 90);
    }
    const res = await agent.get("/api/signals?period=30d");
    expect(res.status).toBe(200);
    const focusTrend = res.body.patterns.find(
      (p: { signal: string; type: string }) => p.signal === "focus" && (p.type === "trend" || p.type === "attention")
    );
    expect(focusTrend).toBeUndefined();
  });

  it("isola dados por usuário — sinais de um usuário nunca aparecem para outro", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();
    const today = isoDate(new Date());
    await agentA.post("/api/health/water").send({ amountMl: 4000, recordedAt: `${today}T08:00:00.000Z` });

    const resB = await agentB.get("/api/signals?period=today");
    expect(resB.status).toBe(200);
    const healthDim = resB.body.radar.find((r: { key: string }) => r.key === "health");
    expect(healthDim.value).toBeNull();
  });

  it("GET /api/signals/trend devolve série normalizada 0-100 por sinal", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const today = new Date();
    await insertFocusSession(userId, today, 60);
    const res = await agent.get("/api/signals/trend?period=7d&signal=focus");
    expect(res.status).toBe(200);
    expect(res.body.series.length).toBeGreaterThan(0);
    for (const point of res.body.series) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });
});
