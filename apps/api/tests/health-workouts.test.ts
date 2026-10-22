import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { inferWorkoutCategory, intensityFromRpe } from "../src/services/healthService.js";

describe("Exercícios — regras (unitário)", () => {
  it("RPE alimenta a intensidade legada", () => {
    expect(intensityFromRpe(3)).toBe("leve");
    expect(intensityFromRpe(6)).toBe("moderada");
    expect(intensityFromRpe(9)).toBe("intensa");
  });

  it("infere o tipo a partir de rótulos antigos", () => {
    expect(inferWorkoutCategory("Musculacao")).toBe("musculacao");
    expect(inferWorkoutCategory("Muay Thai")).toBe("luta");
    expect(inferWorkoutCategory("Ciclismo")).toBe("bike");
    expect(inferWorkoutCategory("Xadrez")).toBe("outro");
  });
});

describe("Exercícios — API", () => {
  it("musculação com séries: cria, lista, edita (substitui séries) e exclui", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/health/workouts").send({
      category: "musculacao",
      durationMinutes: 70,
      rpe: 8,
      muscleGroups: "Treino A — peito e tríceps",
      sets: [
        { exercise: "Supino reto", sets: 4, reps: 10, loadKg: 60 },
        { exercise: "Tríceps corda", sets: 3, reps: 12, loadKg: 25 },
      ],
      performedAt: "2026-10-22T21:00:00.000Z",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: "Musculação", category: "musculacao", rpe: 8, intensity: "intensa", duration_minutes: 70 });
    expect(created.body.sets.map((s: { exercise: string }) => s.exercise)).toEqual(["Supino reto", "Tríceps corda"]);

    const list = await agent.get("/api/health/workouts");
    expect(list.body[0].sets).toHaveLength(2);
    const otherList = await other.agent.get("/api/health/workouts");
    expect(otherList.body.some((w: { id: string }) => w.id === created.body.id)).toBe(false);

    const otherPatch = await other.agent.patch(`/api/health/workouts/${created.body.id}`).send({ durationMinutes: 5 });
    expect(otherPatch.status).toBe(404);

    const patched = await agent.patch(`/api/health/workouts/${created.body.id}`).send({
      sets: [{ exercise: "Supino inclinado", sets: 3, reps: 8, loadKg: 50 }],
      rpe: 6,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.intensity).toBe("moderada");
    expect(patched.body.sets).toHaveLength(1);
    expect(patched.body.muscle_groups).toBe("Treino A — peito e tríceps");

    const otherDelete = await other.agent.delete(`/api/health/workouts/${created.body.id}`);
    expect(otherDelete.status).toBe(204);
    expect((await agent.get("/api/health/workouts")).body).toHaveLength(1);

    expect((await agent.delete(`/api/health/workouts/${created.body.id}`)).status).toBe(204);
    expect((await agent.get("/api/health/workouts")).body).toHaveLength(0);
  });

  it("luta com modalidade e rounds; trocar o tipo limpa campos que não se aplicam", async () => {
    const { agent } = await createAuthenticatedAgent();
    const created = await agent.post("/api/health/workouts").send({
      category: "luta",
      modality: "muay_thai",
      rounds: 5,
      roundMinutes: 3,
      durationMinutes: 60,
      rpe: 7,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: "Luta", modality: "muay_thai", rounds: 5, round_minutes: 3 });

    const keep = await agent.patch(`/api/health/workouts/${created.body.id}`).send({ category: "luta", durationMinutes: 75 });
    expect(keep.body).toMatchObject({ modality: "muay_thai", rounds: 5, duration_minutes: 75 });

    const changed = await agent.patch(`/api/health/workouts/${created.body.id}`).send({ category: "corrida", distanceKm: 8 });
    expect(changed.body).toMatchObject({ kind: "Corrida", category: "corrida", modality: null, rounds: null, round_minutes: null, distance_km: 8 });
  });

  it("valida tipo, RPE e modalidade; cliente legado (só kind) continua funcionando", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/health/workouts").send({ category: "xadrez", durationMinutes: 30 })).status).toBe(400);
    expect((await agent.post("/api/health/workouts").send({ category: "corrida", durationMinutes: 30, rpe: 11 })).status).toBe(400);
    expect((await agent.post("/api/health/workouts").send({ category: "luta", modality: "capoeira-x", durationMinutes: 30 })).status).toBe(400);
    expect((await agent.post("/api/health/workouts").send({ durationMinutes: 30 })).status).toBe(400);

    const legacy = await agent.post("/api/health/workouts").send({ kind: "Caminhada", durationMinutes: 30, distanceKm: 3 });
    expect(legacy.status).toBe(201);
    expect(legacy.body).toMatchObject({ kind: "Caminhada", category: "caminhada", sets: [] });
  });
});
