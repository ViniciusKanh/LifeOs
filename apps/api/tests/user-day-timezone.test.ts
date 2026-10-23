import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { localDayOfStored, localDayRangeUtc, shiftDayKey } from "../src/services/localDayService.js";
import { createCustomAchievement } from "../src/services/achievementsService.js";
import { getJournalAutoData } from "../src/services/journalService.js";
import { computePeriodMetrics } from "../src/services/periodicReviewService.js";
import { computeRangeMetrics } from "../src/services/metricsService.js";

/**
 * Regressão de fuso: usuário em São Paulo às 22h30 do dia 22, quando o dia UTC
 * já virou para 23. Tudo que é "hoje"/"dia X" precisa seguir o dia local.
 * Só o Date do processo é simulado; o SQLite (datetime('now')) segue o relógio
 * real, por isso os timestamps relevantes são gravados explicitamente.
 */
const SP = "America/Sao_Paulo";
const NOW = "2026-10-23T01:30:00.000Z"; // 22:30 de 22/10 em São Paulo
const LOCAL_TODAY = "2026-10-22";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

async function spUser() {
  const ctx = await createAuthenticatedAgent();
  await getDb().execute({ sql: "UPDATE users SET timezone = ? WHERE id = ?", args: [SP, ctx.userId] });
  return ctx;
}

async function completedTask(agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"], ownerId: string, title: string, at: string) {
  const t = await agent.post("/api/tasks").send({ title });
  expect(t.status).toBe(201);
  await getDb().execute({
    sql: "UPDATE tasks SET status = 'Concluído', completed_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
    args: [at, at, t.body.id, ownerId],
  });
  return t.body.id as string;
}

async function insertWorkout(ownerId: string, performedAt: string, minutes = 30) {
  await getDb().execute({
    sql: "INSERT INTO workouts (id, owner_id, kind, duration_minutes, performed_at) VALUES (?, ?, 'Corrida', ?, ?)",
    args: [nanoid(), ownerId, minutes, performedAt],
  });
}

async function insertWater(ownerId: string, ml: number, recordedAt: string) {
  await getDb().execute({ sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES (?, ?, ?, ?)", args: [nanoid(), ownerId, ml, recordedAt] });
}

describe("Dia local (funções puras)", () => {
  it("converte os dois formatos de timestamp UTC para o dia de São Paulo", () => {
    expect(localDayOfStored("2026-10-23 01:30:00", SP)).toBe(LOCAL_TODAY);
    expect(localDayOfStored("2026-10-23T01:30:00.000Z", SP)).toBe(LOCAL_TODAY);
    expect(localDayOfStored("2026-10-23T03:00:00.000Z", SP)).toBe("2026-10-23");
    // Data pura já é um dia local: passa direto.
    expect(localDayOfStored("2026-10-23", SP)).toBe("2026-10-23");
  });

  it("limites do dia local em UTC e soma de dias", () => {
    expect(localDayRangeUtc(LOCAL_TODAY, SP)).toEqual({ start: "2026-10-22T03:00:00.000Z", end: "2026-10-23T03:00:00.000Z" });
    expect(shiftDayKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Fuso do usuário às 22h30 em São Paulo (dia UTC já virou)", () => {
  it("Timeline padrão termina no dia local e inclui tarefas concluídas à noite", async () => {
    const { agent, userId } = await spUser();
    await completedTask(agent, userId, "Noite formato SQLite", "2026-10-23 01:00:00");
    await completedTask(agent, userId, "Noite formato ISO", "2026-10-23T00:30:00.000Z");
    await completedTask(agent, userId, "Madrugada do dia seguinte", "2026-10-23T03:30:00.000Z");

    const res = await agent.get("/api/analytics/timeline");
    expect(res.status).toBe(200);
    expect(res.body.to).toBe(LOCAL_TODAY);
    const labels = res.body.events.filter((e: { type: string }) => e.type === "task").map((e: { label: string }) => e.label);
    expect(labels.sort()).toEqual(["Noite formato ISO", "Noite formato SQLite"]);

    const next = await agent.get("/api/analytics/timeline?from=2026-10-23&to=2026-10-23");
    expect(next.body.events.filter((e: { type: string }) => e.type === "task").map((e: { label: string }) => e.label)).toEqual(["Madrugada do dia seguinte"]);
  });

  it("Life Score de hoje usa o dia local (água das 22h conta hoje)", async () => {
    const { agent, userId } = await spUser();
    await insertWater(userId, 2500, "2026-10-23T01:00:00.000Z");
    const res = await agent.get("/api/analytics/life-score");
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(LOCAL_TODAY);
    // Água 100% = 1/4 da dimensão saúde.
    expect(res.body.health).toBeGreaterThanOrEqual(25);
  });

  it("Analytics overview e métricas de período contam o registro no dia local", async () => {
    const { agent, userId } = await spUser();
    await insertWorkout(userId, "2026-10-23T01:00:00.000Z", 45);
    const range = await computeRangeMetrics(userId, LOCAL_TODAY, "2026-10-23");
    expect(range.workouts).toBe(1);
    expect(range.workoutMinutes).toBe(45);
    const nextDay = await computeRangeMetrics(userId, "2026-10-23", "2026-10-24");
    expect(nextDay.workouts).toBe(0);

    const overview = await agent.get("/api/analytics/overview?days=7");
    expect(overview.status).toBe(200);
    expect(overview.body.to).toBe(LOCAL_TODAY);
    const last = overview.body.dailySeries.workouts.at(-1);
    expect(last).toEqual({ day: "10-22", total: 1 });
  });

  it("conquista 'treinos em um dia' agrupa pelo dia local", async () => {
    const { userId } = await spUser();
    // Três treinos no dia 22 em São Paulo; em UTC seriam 1 no dia 22 e 2 no dia 23.
    await insertWorkout(userId, "2026-10-22T15:00:00.000Z");
    await insertWorkout(userId, "2026-10-23 01:00:00");
    await insertWorkout(userId, "2026-10-23T02:00:00.000Z");
    const trophy = await createCustomAchievement(userId, { title: "Tripla", metric: "workouts_in_day", threshold: 3 });
    expect(trophy.unlockedAt).not.toBeNull();
    expect(trophy.progress).toBe(100);
  });

  it("dados automáticos do Diário e revisão mensal usam o dia local", async () => {
    const { userId } = await spUser();
    await insertWater(userId, 600, "2026-10-23T01:10:00.000Z");
    await insertWorkout(userId, "2026-10-23T01:20:00.000Z", 20);
    const auto = await getJournalAutoData(getDb(), userId, LOCAL_TODAY);
    expect(auto.waterMl).toBe(600);
    expect(auto.exerciseMinutes).toBe(20);

    // 31/10 às 22h em São Paulo = 01/11 01h UTC: pertence à revisão de outubro.
    await insertWorkout(userId, "2026-11-01T01:00:00.000Z", 30);
    const october = await computePeriodMetrics(getDb(), userId, "monthly", "2026-10");
    const november = await computePeriodMetrics(getDb(), userId, "monthly", "2026-11");
    expect(october.workouts).toBe(2);
    expect(november.workouts).toBe(0);
  });

  it("isola por usuário: registros de A não aparecem para B", async () => {
    const { agent: agentA, userId: a } = await spUser();
    const { agent: agentB } = await spUser();
    await completedTask(agentA, a, "Só do A", "2026-10-23 01:00:00");
    await insertWater(a, 2500, "2026-10-23T01:00:00.000Z");
    const tl = await agentB.get("/api/analytics/timeline");
    expect(tl.body.events.filter((e: { type: string }) => e.type === "task")).toHaveLength(0);
    const score = await agentB.get("/api/analytics/life-score");
    expect(score.body.health).toBe(0);
  });
});
