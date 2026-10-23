import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { nanoid } from "nanoid";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { dayKeyIn } from "../src/services/gamificationService.js";
import { QUEST_TEMPLATES, drawQuests, drawReplacement, periodRange, targetFor, templateByKey } from "../src/services/questRules.js";
import { claimQuest, getQuestBoard, rerollQuest } from "../src/services/questsService.js";
import { questsRouter } from "../src/routes/quests.routes.js";

// App mínimo só com o roteador de quests (o registro em app.ts é feito pelo coordenador).
const questsApp = express();
questsApp.use(express.json());
questsApp.use(cookieParser());
questsApp.use("/api/quests", questsRouter);

async function newUser() {
  const u = await createAuthenticatedAgent();
  // UTC deixa "hoje" do usuário igual ao dia de datetime('now') do SQLite.
  await getDb().execute({ sql: "UPDATE users SET timezone = 'UTC' WHERE id = ?", args: [u.userId] });
  return u;
}

const utcToday = () => new Date().toISOString().slice(0, 10);

describe("Quadro de Quests — regras puras", () => {
  it("sorteio é determinístico por (usuário, período, chave)", () => {
    const recent = { pages: 300, workouts: 8, habits: 40, waterMl: 30000, missions: 60, xpOrganic: 900 };
    const a = drawQuests("u1", "daily", "2026-10-23", recent);
    const b = drawQuests("u1", "daily", "2026-10-23", recent);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.templateKey)).size).toBe(3);
    // Pelo menos uma genérica (alcançável) sempre entra.
    expect(a.some((q) => templateByKey(q.templateKey)!.generic)).toBe(true);
    const days = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"].map((d) => drawQuests("u1", "daily", d, recent).map((q) => q.templateKey).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("sem uso de módulos, só quests genéricas", () => {
    const daily = drawQuests("u2", "daily", "2026-10-23", {});
    expect(daily).toHaveLength(3);
    expect(daily.every((q) => templateByKey(q.templateKey)!.generic)).toBe(true);
    expect(drawQuests("u2", "weekly", "2026-10-19", {}).every((q) => templateByKey(q.templateKey)!.generic)).toBe(true);
  });

  it("meta proporcional ao ritmo recente, com piso e teto", () => {
    const pages = QUEST_TEMPLATES.find((t) => t.key === "d_pages")!;
    expect(targetFor(pages, 600)).toBe(20); // 20 pág./dia
    expect(targetFor(pages, 0)).toBe(pages.fallback);
    expect(targetFor(pages, 100_000)).toBe(pages.max);
    const water = QUEST_TEMPLATES.find((t) => t.key === "d_water")!;
    expect(targetFor(water, 30 * 1800)).toBe(1750); // arredonda em 250 ml
    const wWorkouts = QUEST_TEMPLATES.find((t) => t.key === "w_workouts")!;
    expect(targetFor(wWorkouts, 12)).toBe(3); // 12 em 30 dias ≈ 2,8/semana
  });

  it("reset pelo fuso: o mesmo instante cai em dias diferentes", () => {
    const instant = new Date("2026-10-23T02:30:00Z");
    const sp = dayKeyIn(instant, "America/Sao_Paulo");
    const tokyo = dayKeyIn(instant, "Asia/Tokyo");
    expect(sp).toBe("2026-10-22");
    expect(tokyo).toBe("2026-10-23");
    expect(periodRange("weekly", "2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("troca nunca repete modelo já usado no período", () => {
    const recent = { pages: 300, workouts: 8 };
    const used = drawQuests("u3", "daily", "2026-10-23", recent).map((q) => q.templateKey);
    const r = drawReplacement("u3", "daily", "2026-10-23", recent, used);
    expect(r).not.toBeNull();
    expect(used).not.toContain(r!.templateKey);
  });
});

describe("Quadro de Quests — serviço e rotas", () => {
  it("gera 3 diárias e 3 semanais persistidas e estáveis", async () => {
    const { userId } = await newUser();
    const db = getDb();
    const a = await getQuestBoard(db, userId);
    expect(a.daily.quests).toHaveLength(3);
    expect(a.weekly.quests).toHaveLength(3);
    expect(a.daily.periodKey).toBe(utcToday());
    const b = await getQuestBoard(db, userId);
    expect(b.daily.quests.map((q) => q.id)).toEqual(a.daily.quests.map((q) => q.id));
    const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM quest_assignments WHERE owner_id = ?", args: [userId] });
    expect(Number(n.rows[0].n)).toBe(6);
  });

  it("quest de período anterior não aparece e não pode ser resgatada", async () => {
    const { userId } = await newUser();
    const db = getDb();
    const oldId = nanoid();
    await db.execute({
      sql: "INSERT INTO quest_assignments (id, owner_id, period, period_key, template_key, target, xp_reward) VALUES (?, ?, 'daily', '2020-01-01', 'd_missions', 1, 20)",
      args: [oldId, userId],
    });
    const board = await getQuestBoard(db, userId);
    expect(board.daily.quests.map((q) => q.id)).not.toContain(oldId);
    await expect(claimQuest(db, userId, oldId)).rejects.toMatchObject({ status: 409 });
  });

  it("progresso vem de dados reais; resgate é idempotente e dá bônus das 3 diárias", async () => {
    const { userId, agent } = await newUser();
    const db = getDb();
    const board = await getQuestBoard(db, userId);
    const byKey = Object.fromEntries(board.daily.quests.map((q) => [q.templateKey, q]));
    expect(Object.keys(byKey).sort()).toEqual(["d_journal", "d_missions", "d_xp"]);
    expect(byKey.d_missions.progress).toBe(0);
    await expect(claimQuest(db, userId, byKey.d_missions.id)).rejects.toMatchObject({ status: 409 });

    // Dados reais: missões concluídas e uma entrada no diário hoje.
    for (let i = 0; i < 3; i++) {
      const t = await agent.post("/api/tasks").send({ title: `Missão ${i}`, priority: "Alta" });
      await agent.patch(`/api/tasks/${t.body.id}`).send({ status: "Concluído" });
    }
    await db.execute({ sql: "INSERT INTO journal_entries (id, owner_id, entry_date, thoughts) VALUES (?, ?, ?, 'Dia produtivo')", args: [nanoid(), userId, utcToday()] });
    // XP orgânico garantido (independe das regras de XP de tarefa).
    await db.execute({
      sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'review', ?, 'seed', 400, 'seed', ?)",
      args: [nanoid(), userId, nanoid(), utcToday()],
    });

    const live = await getQuestBoard(db, userId);
    const q = Object.fromEntries(live.daily.quests.map((x) => [x.templateKey, x]));
    expect(q.d_missions.progress).toBe(3);
    expect(q.d_missions.completed).toBe(true);
    expect(q.d_journal.progress).toBe(1);

    const first = await claimQuest(db, userId, q.d_missions.id);
    expect(first).toMatchObject({ xp: q.d_missions.xpReward, replayed: false, bonusXp: 0 });
    const again = await claimQuest(db, userId, q.d_missions.id);
    expect(again).toMatchObject({ xp: 0, replayed: true });
    await claimQuest(db, userId, q.d_journal.id);
    const last = await claimQuest(db, userId, q.d_xp.id);
    expect(last.bonusXp).toBe(30);

    // Quest de XP ignora o XP vindo das próprias quests.
    const after = await getQuestBoard(db, userId);
    expect(after.daily.quests.find((x) => x.templateKey === "d_xp")!.progress).toBe(q.d_xp.progress);
    expect(after.daily.bonus).toMatchObject({ claimed: true, completed: 3, total: 3 });
    const ledger = await db.execute({ sql: "SELECT COUNT(*) AS n, SUM(xp) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'quest'", args: [userId] });
    expect(Number(ledger.rows[0].n)).toBe(4);
  });

  it("troca: 1 por dia, só diária não concluída", async () => {
    const { userId } = await newUser();
    const db = getDb();
    // Uso recente de módulos (10 dias atrás) para haver modelos de troca.
    for (const d of [3, 5, 10]) {
      await db.execute({ sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES (?, ?, 2000, datetime('now', ?))", args: [nanoid(), userId, `-${d} days`] });
      await db.execute({ sql: "INSERT INTO workouts (id, owner_id, kind, performed_at, duration_minutes) VALUES (?, ?, 'Corrida', datetime('now', ?), 30)", args: [nanoid(), userId, `-${d} days`] });
    }
    const board = await getQuestBoard(db, userId);
    expect(board.daily.rerollsLeft).toBe(1);
    const target = board.daily.quests.find((x) => x.canReroll)!;
    const weekly = board.weekly.quests[0];
    await expect(rerollQuest(db, userId, weekly.id)).rejects.toMatchObject({ status: 409 });
    const fresh = await rerollQuest(db, userId, target.id);
    expect(board.daily.quests.map((x) => x.templateKey)).not.toContain(fresh.templateKey);
    const after = await getQuestBoard(db, userId);
    expect(after.daily.quests).toHaveLength(3);
    expect(after.daily.rerollsLeft).toBe(0);
    expect(after.daily.quests.map((x) => x.id)).not.toContain(target.id);
    const other = after.daily.quests.find((x) => x.id !== fresh.id && !x.completed)!;
    await expect(rerollQuest(db, userId, other.id)).rejects.toMatchObject({ status: 409 });
  });

  it("isolamento: rotas não expõem nem aceitam quest de outro usuário", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const db = getDb();
    const board = await getQuestBoard(db, owner.userId);
    const qid = board.daily.quests[0].id;

    const login = await request(app).post("/api/auth/login").send({ email: intruder.email, password: "SenhaForte123!", rememberMe: false });
    const cookie = login.headers["set-cookie"] as unknown as string[];
    const res = await request(questsApp).get("/api/quests").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.daily.quests.map((x: { id: string }) => x.id)).not.toContain(qid);
    expect(res.body.season.name).toMatch(/^Temporada/);
    expect((await request(questsApp).post(`/api/quests/${qid}/claim`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(questsApp).post(`/api/quests/${qid}/reroll`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(questsApp).post(`/api/quests/a%20b/claim`).set("Cookie", cookie)).status).toBe(400);
    expect((await request(questsApp).get("/api/quests")).status).toBe(401);
    await expect(claimQuest(db, intruder.userId, qid)).rejects.toMatchObject({ status: 404 });
  });
});
