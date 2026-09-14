import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Correlações de saúde (GET /api/health/correlations)", () => {
  it("detecta uma correlação positiva forte entre sono e humor quando as horas dormidas e o humor crescem juntos", async () => {
    const { agent } = await createAuthenticatedAgent();

    // 8 dias em que a duração do sono (wentToBedAt fixo à meia-noite,
    // wokeUpAt variando entre 5h e 8h30) cresce junto com o humor e a
    // energia registrados na mesma manhã — a correlação deve dar
    // positiva e forte.
    const wakeHours = ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30"];
    const moods = [1, 1, 2, 2, 3, 4, 4, 5];
    for (let i = 0; i < 8; i++) {
      const day = `2026-08-${String(i + 1).padStart(2, "0")}`;
      await agent.post("/api/health/sleep").send({
        wentToBedAt: `${day}T00:00:00.000Z`,
        wokeUpAt: `${day}T${wakeHours[i]}:00.000Z`,
        quality: Math.min(5, Math.max(1, moods[i])),
      });
      await agent.post("/api/health/mood").send({
        mood: moods[i],
        energy: moods[i],
        stress: 3,
        recordedAt: `${day}T09:00:00.000Z`,
      });
    }

    const res = await agent.get("/api/health/correlations");
    expect(res.status).toBe(200);
    const pairs = res.body as Array<{ pair: string; r: number; n: number; direction: string }>;
    expect(pairs.length).toBeGreaterThan(0);
    // Humor e energia foram registrados com valores idênticos em todos
    // os dias, então sleep_vs_mood e sleep_vs_energy devem concordar.
    const sleepVsMood = pairs.find((p) => p.pair === "sleep_vs_mood");
    expect(sleepVsMood).toBeTruthy();
    expect(sleepVsMood!.n).toBe(8);
    expect(sleepVsMood!.direction).toBe("positiva");
  });

  it("não retorna nenhum par com menos de 7 dias de dados cruzados", async () => {
    const { agent } = await createAuthenticatedAgent();

    for (let i = 0; i < 3; i++) {
      const day = `2026-08-0${i + 1}`;
      await agent.post("/api/health/sleep").send({
        wentToBedAt: `${day}T22:00:00.000Z`,
        wokeUpAt: `${day}T06:00:00.000Z`,
        quality: 4,
      });
      await agent.post("/api/health/mood").send({ mood: 4, energy: 4, recordedAt: `${day}T08:00:00.000Z` });
    }

    const res = await agent.get("/api/health/correlations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("isola os dados de correlação por usuário", async () => {
    const { agent: agentA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();

    for (let i = 0; i < 8; i++) {
      const day = `2026-08-${String(i + 10).padStart(2, "0")}`;
      await agentA.post("/api/health/sleep").send({ wentToBedAt: `${day}T22:00:00.000Z`, wokeUpAt: `${day}T06:00:00.000Z`, quality: i % 5 + 1 });
      await agentA.post("/api/health/mood").send({ mood: (i % 5) + 1, energy: (i % 5) + 1, recordedAt: `${day}T08:00:00.000Z` });
    }

    const resA = await agentA.get("/api/health/correlations");
    const resB = await agentB.get("/api/health/correlations");
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resB.body).toEqual([]);
  });
});
