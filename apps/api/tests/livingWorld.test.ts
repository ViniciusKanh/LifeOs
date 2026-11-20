import { describe, it, expect, vi } from "vitest";
import { nanoid } from "nanoid";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";

// Conselheiro controlável: permite simular falha real do serviço do agente.
const advisor = vi.hoisted(() => ({ fail: false }));
vi.mock("../src/services/moduleAdvisorService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/moduleAdvisorService.js")>();
  return {
    ...actual,
    askAdvisor: async (...args: Parameters<typeof actual.askAdvisor>) => {
      if (advisor.fail) throw new Error("serviço fora do ar");
      return actual.askAdvisor(...args);
    },
  };
});

async function giveItem(userId: string, itemKey: string, quantity = 1) {
  await getDb().execute({ sql: "INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, acquired_at) VALUES (?, ?, ?, ?, datetime('now'))", args: [nanoid(), userId, itemKey, quantity] });
}

describe("Meu Mundo — estado a partir dos dados reais", () => {
  it("sem missão em andamento não há atividade; com missão, a atividade aponta para o ambiente certo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const empty = await agent.get("/api/world");
    expect(empty.status).toBe(200);
    expect(empty.body.activity).toBeNull();
    expect(empty.body.agents).toHaveLength(4);
    expect(empty.body.profile.level).toBeGreaterThanOrEqual(1);
    expect(empty.body.settings.autonomous).toBe(true);
    expect(empty.body.pendencies).toMatchObject({ overdue: 0, dueToday: 0, habitsPending: 0, journalToday: false });

    const task = await agent.post("/api/tasks").send({ title: "Escrever capítulo 2", status: "Em Andamento" });
    expect(task.status).toBe(201);
    const world = await agent.get("/api/world");
    expect(world.body.activity.taskId).toBe(task.body.id);
    expect(world.body.activity.room).toBe("escritorio");
    expect(world.body.missions.open[0].status).toBe("Em Andamento");
  });

  it("Jardim: planta por sequência e pendência só para hábito devido hoje", async () => {
    const { agent } = await createAuthenticatedAgent();
    const h = await agent.post("/api/habits").send({ name: "Beber água", frequency: "daily", targetCount: 1 });
    expect(h.status).toBe(201);
    let world = await agent.get("/api/world");
    const plant = world.body.habits.find((x: { id: string }) => x.id === h.body.id);
    expect(plant.pendingToday).toBe(true);
    expect(plant.stage).toBe(0);
    await agent.post(`/api/habits/${h.body.id}/check-in`).send({ entryDate: world.body.today, count: 1 });
    world = await agent.get("/api/world");
    const after = world.body.habits.find((x: { id: string }) => x.id === h.body.id);
    expect(after.doneToday).toBe(true);
    expect(after.pendingToday).toBe(false);
    expect(after.stage).toBe(1);
  });
});

describe("Meu Mundo — preferências, avatar e isolamento", () => {
  it("persiste configurações e posição do avatar; outro usuário não vê nada disso", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    expect((await a.agent.put("/api/world/settings").send({ quality: "low", autonomous: false })).status).toBe(200);
    expect((await a.agent.put("/api/world/avatar").send({ x: 4, y: 6, shirt: "#123456" })).status).toBe(200);
    expect((await a.agent.put("/api/world/settings").send({ quality: "ultra" })).status).toBe(400);
    const wa = await a.agent.get("/api/world");
    expect(wa.body.settings.quality).toBe("low");
    expect(wa.body.avatar).toMatchObject({ x: 4, y: 6, shirt: "#123456" });
    const wb = await b.agent.get("/api/world");
    expect(wb.body.settings.quality).toBe("high");
    expect(wb.body.avatar.x).toBe(14);
  });
});

describe("Meu Mundo — decoração com o inventário real", () => {
  it("só coloca item que o usuário possui, respeita a quantidade e o slot válido", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    expect((await agent.put("/api/world/decor/bib-1").send({ itemKey: "pocao-foco" })).status).toBe(422);
    await giveItem(userId, "pocao-foco", 1);
    expect((await agent.put("/api/world/decor/nao-existe").send({ itemKey: "pocao-foco" })).status).toBe(400);
    const ok = await agent.put("/api/world/decor/bib-1").send({ itemKey: "pocao-foco" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject([{ slotKey: "bib-1", room: "biblioteca", itemKey: "pocao-foco", name: "Poção do Ritmo" }]);
    expect((await agent.get("/api/world/decor-items")).body.some((i: { key: string }) => i.key === "pocao-foco")).toBe(true);
    // Só 1 unidade: não dá para colocar em outro slot ao mesmo tempo.
    expect((await agent.put("/api/world/decor/bib-2").send({ itemKey: "pocao-foco" })).status).toBe(409);
    // Outro usuário não remove a decoração alheia.
    expect((await other.agent.delete("/api/world/decor/bib-1")).status).toBe(404);
    expect((await agent.delete("/api/world/decor/bib-1")).status).toBe(200);
    const ev = await agent.get("/api/world/events?category=mundo");
    expect(ev.body.events.some((e: { title: string }) => e.title.includes("colocado no mundo"))).toBe(true);
  });
});

describe("Meu Mundo — agentes com execução real", () => {
  it("grava a execução concluída e os eventos; falha do serviço vira estado 'failed', sem resultado inventado", async () => {
    const { agent } = await createAuthenticatedAgent();
    advisor.fail = false;
    const ok = await agent.post("/api/world/agents/planejador/run").send({ question: "Organize minha semana" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("done");
    expect(Array.isArray(ok.body.result.items)).toBe(true);

    advisor.fail = true;
    const bad = await agent.post("/api/world/agents/habitos/run").send({});
    advisor.fail = false;
    expect(bad.status).toBe(200);
    expect(bad.body.status).toBe("failed");
    expect(bad.body.result).toBeNull();

    const world = await agent.get("/api/world");
    const byKey = Object.fromEntries(world.body.agents.map((a: { key: string; lastRun: { status: string } | null }) => [a.key, a.lastRun?.status ?? null]));
    expect(byKey).toMatchObject({ planejador: "done", habitos: "failed", mentor: null });
    const ev = await agent.get("/api/world/events?category=agentes");
    const types = ev.body.events.map((e: { title: string }) => e.title);
    expect(types.some((t: string) => t.includes("concluiu"))).toBe(true);
    expect(types.some((t: string) => t.includes("não conseguiu"))).toBe(true);
    expect((await agent.post("/api/world/agents/inexistente/run").send({})).status).toBe(404);
  });
});
