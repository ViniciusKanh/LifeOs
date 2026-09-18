import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

describe("Experimentos Pessoais", () => {
  it("compara baseline x durante corretamente e nunca inventa dado quando falta baseline", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    const start = isoDate(today);
    const end = isoDate(addDays(today, 6)); // 7 dias

    // 7 dias de baseline (imediatamente antes do início) com água baixa,
    // e os dias já passados do experimento com água alta.
    for (let i = 7; i >= 1; i--) {
      const day = addDays(today, -i);
      await agent.post("/api/health/water").send({ amountMl: 1500, recordedAt: `${isoDate(day)}T10:00:00.000Z` });
    }
    await agent.post("/api/health/water").send({ amountMl: 3000, recordedAt: `${start}T10:00:00.000Z` });

    const created = await agent.post("/api/experiments").send({
      title: "Beber 3L de água",
      category: "hidratacao",
      startDate: start,
      endDate: end,
      primaryMetric: "water_ml",
      verificationType: "manual",
    });
    expect(created.status).toBe(201);

    const detail = await agent.get(`/api/experiments/${created.body.id}`);
    expect(detail.status).toBe(200);
    const waterComparison = detail.body.comparison.find((c: { metric: string }) => c.metric === "water_ml");
    expect(waterComparison).toBeTruthy();
    expect(waterComparison.trend).toBe("positive");
    expect(waterComparison.beforeAvg).toBeCloseTo(1500, 0);
    expect(waterComparison.duringAvg).toBeCloseTo(3000, 0);
    expect(waterComparison.diffPct).toBe(100);
  });

  it("retorna 'insufficient_data' quando não há baseline suficiente, sem fabricar diferença", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    const start = isoDate(today);
    const end = isoDate(addDays(today, 6));

    const created = await agent.post("/api/experiments").send({
      title: "Dormir antes das 23h",
      category: "sono",
      startDate: start,
      endDate: end,
      primaryMetric: "sleep_duration",
      verificationType: "manual",
    });
    expect(created.status).toBe(201);

    const detail = await agent.get(`/api/experiments/${created.body.id}`);
    const sleepComparison = detail.body.comparison.find((c: { metric: string }) => c.metric === "sleep_duration");
    expect(sleepComparison.trend).toBe("insufficient_data");
    expect(sleepComparison.diffPct).toBeNull();
    expect(sleepComparison.insufficientDataReason).toMatch(/dados suficientes|baseline/i);
  });

  it("marca o check-in automático de meta de água quando o dado real do dia bate a meta", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    const start = isoDate(addDays(today, -1));
    const end = isoDate(addDays(today, 5));

    await agent.post("/api/health/water").send({ amountMl: 3200, recordedAt: `${start}T09:00:00.000Z` });
    await agent.post("/api/health/water").send({ amountMl: 1000, recordedAt: `${isoDate(today)}T09:00:00.000Z` });

    const created = await agent.post("/api/experiments").send({
      title: "Beber 3L",
      category: "hidratacao",
      startDate: start,
      endDate: end,
      primaryMetric: "water_ml",
      verificationType: "automatic",
      verificationRule: "water_target",
      verificationConfig: { targetMl: 3000 },
    });
    expect(created.status).toBe(201);

    const detail = await agent.get(`/api/experiments/${created.body.id}`);
    const checkins = detail.body.checkins as Array<{ date: string; status: string; source: string }>;
    const dayOk = checkins.find((c) => c.date === start);
    const dayMissed = checkins.find((c) => c.date === isoDate(today));
    expect(dayOk?.status).toBe("done");
    expect(dayOk?.source).toBe("automatic");
    expect(dayMissed?.status).toBe("missed");
  });

  it("nunca permite um usuário ver, editar ou concluir o experimento de outro usuário", async () => {
    const owner = await createAuthenticatedAgent();
    const intruder = await createAuthenticatedAgent();
    const today = new Date();

    const created = await owner.agent.post("/api/experiments").send({
      title: "Experimento privado",
      category: "personalizado",
      startDate: isoDate(today),
      endDate: isoDate(addDays(today, 13)),
      primaryMetric: "energy",
      verificationType: "manual",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    expect((await intruder.agent.get(`/api/experiments/${id}`)).status).toBe(404);
    expect((await intruder.agent.patch(`/api/experiments/${id}`).send({ title: "Hackeado" })).status).toBe(404);
    expect((await intruder.agent.post(`/api/experiments/${id}/status`).send({ status: "cancelled" })).status).toBe(404);
    expect((await intruder.agent.delete(`/api/experiments/${id}`)).status).toBe(404);

    // O dono continua enxergando normalmente.
    expect((await owner.agent.get(`/api/experiments/${id}`)).status).toBe(200);
  });

  it("rejeita transições de status inválidas (ex.: reabrir um experimento concluído)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();

    const created = await agent.post("/api/experiments").send({
      title: "Ler 20 páginas por dia",
      category: "leitura",
      startDate: isoDate(addDays(today, -14)),
      endDate: isoDate(addDays(today, -1)),
      primaryMetric: "reading_pages",
      verificationType: "manual",
    });
    const id = created.body.id;

    const concluded = await agent.post(`/api/experiments/${id}/status`).send({ status: "completed" });
    expect(concluded.status).toBe(200);
    expect(concluded.body.status).toBe("completed");

    const reopened = await agent.post(`/api/experiments/${id}/status`).send({ status: "active" });
    expect(reopened.status).toBe(400);
  });

  it("calcula consistência a partir dos check-ins manuais registrados", async () => {
    const { agent } = await createAuthenticatedAgent();
    const today = new Date();
    const start = isoDate(addDays(today, -3));
    const end = isoDate(addDays(today, 10));

    const created = await agent.post("/api/experiments").send({
      title: "Caminhar 30 minutos",
      category: "exercicio",
      startDate: start,
      endDate: end,
      primaryMetric: "exercise_minutes",
      verificationType: "manual",
    });
    const id = created.body.id;

    await agent.post(`/api/experiments/${id}/logs`).send({ logDate: start, checkinStatus: "done" });
    await agent.post(`/api/experiments/${id}/logs`).send({ logDate: isoDate(addDays(today, -2)), checkinStatus: "missed" });
    await agent.post(`/api/experiments/${id}/logs`).send({ logDate: isoDate(addDays(today, -1)), checkinStatus: "done" });
    await agent.post(`/api/experiments/${id}/logs`).send({ logDate: isoDate(today), checkinStatus: "done" });

    const detail = await agent.get(`/api/experiments/${id}`);
    expect(detail.body.consistencyPct).toBe(75);
  });
});
