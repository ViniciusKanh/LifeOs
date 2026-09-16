import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Saúde — CRUD e isolamento", () => {
  it("cria, atualiza, lista e exclui agua sem vazar dados entre usuários", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/health/water").send({
      amountMl: 300,
      recordedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(created.status).toBe(201);
    expect(created.body.amount_ml).toBe(300);

    const otherUpdate = await other.agent.patch(`/api/health/water/${created.body.id}`).send({ amountMl: 900 });
    expect(otherUpdate.status).toBe(404);

    const updated = await agent.patch(`/api/health/water/${created.body.id}`).send({ amountMl: 500 });
    expect(updated.status).toBe(200);
    expect(updated.body.amount_ml).toBe(500);

    const ownList = await agent.get("/api/health/water?date=2026-09-16");
    expect(ownList.body.some((entry: { id: string; amount_ml: number }) => entry.id === created.body.id && entry.amount_ml === 500)).toBe(true);

    const otherList = await other.agent.get("/api/health/water?date=2026-09-16");
    expect(otherList.body.some((entry: { id: string }) => entry.id === created.body.id)).toBe(false);

    const ownDelete = await agent.delete(`/api/health/water/${created.body.id}`);
    expect(ownDelete.status).toBe(204);
  });

  it("valida sono, calcula duração e permite atualização do próprio registro", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const invalid = await agent.post("/api/health/sleep").send({
      wentToBedAt: "2026-09-16T08:00:00.000Z",
      wokeUpAt: "2026-09-16T07:00:00.000Z",
      quality: 3,
    });
    expect(invalid.status).toBe(400);

    const created = await agent.post("/api/health/sleep").send({
      wentToBedAt: "2026-09-15T23:00:00.000Z",
      wokeUpAt: "2026-09-16T07:00:00.000Z",
      quality: 4,
      notes: "Dormiu bem",
    });
    expect(created.status).toBe(201);
    expect(created.body.duration_minutes).toBe(480);

    const otherUpdate = await other.agent.patch(`/api/health/sleep/${created.body.id}`).send({ quality: 1 });
    expect(otherUpdate.status).toBe(404);

    const updated = await agent.patch(`/api/health/sleep/${created.body.id}`).send({
      wokeUpAt: "2026-09-16T08:30:00.000Z",
      quality: 5,
      notes: null,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.duration_minutes).toBe(570);
    expect(updated.body.quality).toBe(5);
    expect(updated.body.notes).toBeNull();
  });

  it("exige duração de exercício e atualiza registros do dono", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const invalid = await agent.post("/api/health/workouts").send({ kind: "Caminhada" });
    expect(invalid.status).toBe(400);

    const created = await agent.post("/api/health/workouts").send({
      kind: "Caminhada",
      durationMinutes: 30,
      distanceKm: 2.5,
      intensity: "moderada",
      performedAt: "2026-09-16T18:00:00.000Z",
    });
    expect(created.status).toBe(201);
    expect(created.body.duration_minutes).toBe(30);

    const otherUpdate = await other.agent.patch(`/api/health/workouts/${created.body.id}`).send({ durationMinutes: 10 });
    expect(otherUpdate.status).toBe(404);

    const updated = await agent.patch(`/api/health/workouts/${created.body.id}`).send({
      kind: "Corrida",
      durationMinutes: 45,
      distanceKm: null,
      intensity: "intensa",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.kind).toBe("Corrida");
    expect(updated.body.duration_minutes).toBe(45);
    expect(updated.body.distance_km).toBeNull();
  });

  it("cria, lista, atualiza e permite excluir um registro de humor, isolado por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/health/mood").send({ mood: 4, energy: 3, stress: 2, note: "Dia ok" });
    expect(created.status).toBe(201);

    const list = await agent.get("/api/health/mood");
    expect(list.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);

    const otherList = await other.agent.get("/api/health/mood");
    expect(otherList.body.some((m: { id: string }) => m.id === created.body.id)).toBe(false);

    const crossUpdate = await other.agent.patch(`/api/health/mood/${created.body.id}`).send({ energy: 1 });
    expect(crossUpdate.status).toBe(404);

    const updated = await agent.patch(`/api/health/mood/${created.body.id}`).send({ energy: 5, note: null });
    expect(updated.status).toBe(200);
    expect(updated.body.energy).toBe(5);
    expect(updated.body.note).toBeNull();

    // Não pode excluir registro de outro usuário.
    const crossDelete = await other.agent.delete(`/api/health/mood/${created.body.id}`);
    expect(crossDelete.status).toBe(204); // idempotente (delete não confirma existência), mas não some da conta do dono
    const stillThere = await agent.get("/api/health/mood");
    expect(stillThere.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);

    const ownDelete = await agent.delete(`/api/health/mood/${created.body.id}`);
    expect(ownDelete.status).toBe(204);
    const afterDelete = await agent.get("/api/health/mood");
    expect(afterDelete.body.some((m: { id: string }) => m.id === created.body.id)).toBe(false);
  });
});
