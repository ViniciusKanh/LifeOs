import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { GAMIFICATION_RULES } from "../src/config/gamification.js";
import { awardFocusSession } from "../src/services/gamificationService.js";
import { sqlTime } from "../src/services/itemEffectService.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
type Item = { key: string; quantity: number; actions: string[]; equipped: boolean; favorite: boolean; type: string };
const inv = async (agent: Agent) => (await agent.get("/api/inventory")).body as {
  items: Item[];
  effects: Array<{ effectType: string; value: number; expiresAt: string }>;
  sets: Array<{ id: string; owned: number; total: number; complete: boolean }>;
  kpis: Record<string, number>;
  recent: unknown[];
};
const item = async (agent: Agent, key: string) => (await inv(agent)).items.find((i) => i.key === key);

/** Simula item já obtido por um marco real (pilha + ledger de aquisição). */
async function give(userId: string, key: string, qty: number) {
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label) VALUES (?, ?, ?, 'acquire', ?, 'teste', ?, 'teste')",
    args: [nanoid(), userId, key, qty, nanoid()],
  });
  await db.execute({
    sql: `INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, acquired_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity`,
    args: [nanoid(), userId, key, qty],
  });
}
const use = (agent: Agent, itemKey: string, requestId = nanoid(12)) => agent.post("/api/inventory/use").send({ itemKey, requestId });

describe("Inventário — concessões", () => {
  it("cada nível rende uma Poção de Foco, sem duplicar em leituras repetidas", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    for (let i = 0; i < 30; i++) {
      const p = (await agent.get("/api/gamification/profile")).body;
      if (p.level >= 2) break;
      const t = await agent.post("/api/tasks").send({ title: `Alta ${i}`, priority: "Alta" });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    const level = (await agent.get("/api/gamification/profile")).body.level as number;
    await inv(agent);
    const potion = await item(agent, "pocao-foco");
    expect(potion?.quantity).toBe(level - 1);
    const n = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM inventory_transactions WHERE owner_id = ? AND item_key = 'pocao-foco' AND type = 'acquire'", args: [userId] });
    expect(Number(n.rows[0].n)).toBe(level - 1);
    // Título do Códex aparece com a mesma fonte (codex_unlocks).
    expect((await item(agent, "title:aprendiz"))?.actions).toContain("equip");
  });

  it("respeita o limite da pilha (maxStack)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await give(userId, "pocao-foco", 99);
    for (let i = 0; i < 30 && (await agent.get("/api/gamification/profile")).body.level < 2; i++) {
      const t = await agent.post("/api/tasks").send({ title: `Alta ${i}`, priority: "Alta" });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    expect((await item(agent, "pocao-foco"))?.quantity).toBe(99);
  });
});

describe("Inventário — usar itens e efeitos", () => {
  it("Poção de Foco: consumo idempotente, efeito estende sem somar %, e só o XP de foco recebe bônus", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await give(userId, "pocao-foco", 3);
    const first = await use(agent, "pocao-foco", "req-pocao-1");
    const again = await use(agent, "pocao-foco", "req-pocao-1");
    expect(first.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    let data = await inv(agent);
    expect(data.items.find((i) => i.key === "pocao-foco")?.quantity).toBe(2);
    const exp1 = Date.parse(data.effects[0].expiresAt);

    expect((await use(agent, "pocao-foco")).status).toBe(200);
    data = await inv(agent);
    expect(data.effects).toHaveLength(1);
    expect(data.effects[0].value).toBe(25);
    expect(Date.parse(data.effects[0].expiresAt)).toBeGreaterThan(exp1);

    const F = GAMIFICATION_RULES.focus;
    await awardFocusSession(getDb(), userId, "sessao-1", F.blockMinutes * 2, null);
    const row = (await getDb().execute({ sql: "SELECT xp, base_xp, multiplier FROM xp_events WHERE owner_id = ? AND source_type = 'focus'", args: [userId] })).rows[0];
    expect(Number(row.base_xp)).toBe(2 * F.xpPerBlock);
    expect(Number(row.xp)).toBe(Math.floor((2 * F.xpPerBlock * 125) / 100));
    const coins = (await getDb().execute({ sql: "SELECT amount FROM coin_ledger WHERE owner_id = ? AND source_type = 'focus'", args: [userId] })).rows[0];
    expect(Number(coins.amount)).toBe(2 * F.coinsPerBlock);
  });

  it("Pergaminho: bloqueia acúmulo, é consumido pela próxima missão e não vale para a seguinte", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await give(userId, "pergaminho-disciplina", 2);
    expect((await use(agent, "pergaminho-disciplina")).status).toBe(200);
    expect((await use(agent, "pergaminho-disciplina")).status).toBe(409);
    expect((await item(agent, "pergaminho-disciplina"))?.quantity).toBe(1);

    const R = GAMIFICATION_RULES.task;
    const t1 = await agent.post("/api/tasks").send({ title: "Com pergaminho", priority: "Alta" });
    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    const t2 = await agent.post("/api/tasks").send({ title: "Sem pergaminho", priority: "Alta" });
    await agent.patch(`/api/tasks/${t2.body.id}`).send({ status: "Concluído" });
    const xp = async (id: string) => Number((await getDb().execute({ sql: "SELECT xp FROM xp_events WHERE owner_id = ? AND source_type = 'task' AND source_id = ? AND event_type = 'completed'", args: [userId, id] })).rows[0]?.xp);
    expect(await xp(t1.body.id)).toBe(Math.floor((R.xpByPriority.Alta * 125) / 100));
    expect(await xp(t2.body.id)).toBe(R.xpByPriority.Alta);
    expect((await inv(agent)).effects).toHaveLength(0);
  });

  it("efeito vencido expira e não dá bônus; item sem posse ou não usável é recusado", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const past = new Date(Date.now() - 60_000);
    await getDb().execute({
      sql: "INSERT INTO active_item_effects (id, owner_id, item_key, effect_type, value, started_at, expires_at) VALUES (?, ?, 'pocao-foco', 'XP_MULTIPLIER_FOCUS', 25, ?, ?)",
      args: [nanoid(), userId, sqlTime(new Date(past.getTime() - 3_600_000)), sqlTime(past)],
    });
    expect((await inv(agent)).effects).toHaveLength(0);
    await awardFocusSession(getDb(), userId, "sessao-x", 25, null);
    const row = (await getDb().execute({ sql: "SELECT multiplier FROM xp_events WHERE owner_id = ? AND source_type = 'focus'", args: [userId] })).rows[0];
    expect(row.multiplier).toBeNull();
    expect((await use(agent, "pocao-foco")).status).toBe(404);
    await give(userId, "fragmento-cristal", 1);
    expect((await use(agent, "fragmento-cristal")).status).toBe(400);
  });

  it("cupom do Tesouro aparece no inventário e usar consome o mesmo resgate", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await getDb().execute({ sql: "INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type) VALUES (?, ?, 50, 'teste', ?, 'earned')", args: [nanoid(), userId, nanoid()] });
    const reward = await agent.post("/api/gamification/rewards").send({ name: "Episódio extra", cost: 5 });
    await agent.post(`/api/gamification/rewards/${reward.body.id}/redeem`).send({});
    const key = `voucher:${reward.body.id}`;
    expect((await item(agent, key))?.quantity).toBe(1);
    expect((await use(agent, key)).status).toBe(200);
    expect(await item(agent, key)).toBeUndefined();
    expect((await agent.get("/api/gamification/redemptions?status=used")).body).toHaveLength(1);
  });
});

describe("Inventário — cosméticos, favoritos, conjuntos e isolamento", () => {
  it("equipa e remove título pelo Perfil; moldura não conquistada é recusada", async () => {
    const { agent } = await createAuthenticatedAgent();
    await inv(agent);
    expect((await agent.post("/api/inventory/equip").send({ itemKey: "title:aprendiz", equip: true })).status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.rpg_prefs.title).toBe("aprendiz");
    expect((await item(agent, "title:aprendiz"))?.equipped).toBe(true);
    await agent.post("/api/inventory/equip").send({ itemKey: "title:aprendiz", equip: false });
    expect((await agent.get("/api/auth/me")).body.rpg_prefs.title).toBeNull();
    expect((await agent.post("/api/inventory/equip").send({ itemKey: "frame:gold", equip: true })).status).toBe(403);
    expect((await agent.patch("/api/auth/me").send({ rpgPrefs: { frame: "gold" } })).status).toBe(403);
  });

  it("favorito só em item possuído; conjunto completo concede emblema equipável uma vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await give(userId, "pena-escriba", 1);
    expect((await agent.post("/api/inventory/flags").send({ itemKey: "pena-escriba", favorite: true })).status).toBe(200);
    expect((await item(agent, "pena-escriba"))?.favorite).toBe(true);
    expect((await agent.post("/api/inventory/flags").send({ itemKey: "mochila-explorador", favorite: true })).status).toBe(404);

    for (const k of ["mochila-explorador", "lanterna-explorador", "kit-acampamento", "relic:bussola"]) await give(userId, k, 1);
    let data = await inv(agent);
    expect(data.sets.find((s) => s.id === "explorador")).toMatchObject({ owned: 4, total: 4, complete: true });
    await inv(agent);
    const n = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM inventory_transactions WHERE owner_id = ? AND item_key = 'emblem:explorador'", args: [userId] });
    expect(Number(n.rows[0].n)).toBe(1);
    expect((await agent.post("/api/inventory/equip").send({ itemKey: "emblem:explorador", equip: true })).status).toBe(200);
    data = await inv(agent);
    expect(data.kpis.capacity).toBe(150); // Mochila: +50 visual
    const hist = (await agent.get("/api/inventory/history?type=equip")).body as Array<{ type: string }>;
    expect(hist.every((h) => h.type === "equip" || h.type === "unequip")).toBe(true);
  });

  it("outro usuário não vê, não usa nem equipa itens alheios", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await give(a.userId, "pocao-foco", 2);
    expect((await use(b.agent, "pocao-foco")).status).toBe(404);
    expect((await item(b.agent, "pocao-foco"))).toBeUndefined();
    expect((await item(a.agent, "pocao-foco"))?.quantity).toBe(2);
    expect((await b.agent.post("/api/inventory/flags").send({ itemKey: "pocao-foco", favorite: true })).status).toBe(404);
    const bHist = (await b.agent.get("/api/inventory/history")).body as Array<{ itemKey: string }>;
    expect(bHist.some((h) => h.itemKey === "pocao-foco")).toBe(false);
  });
});

describe("Inventário — molduras e arte do Códex", () => {
  it("moldura de bronze entra no ledger uma vez (favoritável) e relíquias usam a arte do Códex", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await inv(agent);
    await inv(agent);
    const n = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM inventory_transactions WHERE owner_id = ? AND item_key = 'frame:bronze' AND type = 'acquire'", args: [userId] });
    expect(Number(n.rows[0].n)).toBe(1);
    expect((await agent.post("/api/inventory/flags").send({ itemKey: "frame:bronze", favorite: true })).status).toBe(200);
    expect((await item(agent, "frame:bronze"))?.favorite).toBe(true);
    expect((await item(agent, "frame:silver"))).toBeUndefined();

    await getDb().execute({ sql: "INSERT INTO codex_unlocks (owner_id, kind, item_id, source_type) VALUES (?, 'relic', 'bussola', 'rule') ON CONFLICT DO NOTHING", args: [userId] });
    const relic = (await inv(agent)).items.find((i) => i.key === "relic:bussola") as unknown as { art: string; artSet: string } | undefined;
    expect(relic).toMatchObject({ art: "relic-bussola", artSet: "codex" });
  });
});
