import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Saúde — humor e energia", () => {
  it("cria, lista e permite excluir um registro de humor, isolado por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const created = await agent.post("/api/health/mood").send({ mood: 4, energy: 3, stress: 2 });
    expect(created.status).toBe(201);

    const list = await agent.get("/api/health/mood");
    expect(list.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);

    const otherList = await other.agent.get("/api/health/mood");
    expect(otherList.body.some((m: { id: string }) => m.id === created.body.id)).toBe(false);

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
