import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { todayKeyFor } from "../src/services/gamificationService.js";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Semeia N dias em que dormir 7h+ na véspera leva a mais missões concluídas (mesmo padrão da suíte da Forja). */
async function seedRoutine(userId: string, days = 75) {
  const db = getDb();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = days; i >= 1; i--) {
    const sleepH = 5 + rnd() * 4;
    await db.execute({
      sql: "INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes) VALUES (?, ?, datetime('now', ?, 'start of day', '+22 hours'), datetime('now', ?, 'start of day', '+30 hours'), ?)",
      args: [nanoid(), userId, `-${i + 1} days`, `-${i + 1} days`, Math.round(sleepH * 60)],
    });
    const done = sleepH >= 7 ? 3 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2);
    for (let k = 0; k < done; k++) {
      await db.execute({
        sql: "INSERT INTO tasks (id, owner_id, title, status, priority, completed_at, updated_at) VALUES (?, ?, 'Missão', 'Concluído', 'Média', datetime('now', ?, 'start of day', '+12 hours'), datetime('now', ?, 'start of day', '+12 hours'))",
        args: [nanoid(), userId, `-${i} days`, `-${i} days`],
      });
    }
  }
}

async function insertTask(ownerId: string, title: string, opts: { status?: string; priority?: string; dueDate?: string | null; completedNow?: boolean } = {}) {
  const id = nanoid();
  await getDb().execute({
    sql: `INSERT INTO tasks (id, owner_id, title, status, priority, due_date, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ${opts.completedNow ? "datetime('now')" : "NULL"})`,
    args: [id, ownerId, title, opts.status ?? "A Fazer", opts.priority ?? "Média", opts.dueDate ?? null],
  });
  return id;
}

describe("Taverna (fim do dia)", () => {
  it("resumo usa dados reais do dia e sugere a missão de amanhã", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const today = await todayKeyFor(db, userId);
    const tomorrow = addDays(today, 1);

    // Dia real: missão concluída, XP + moedas, hábito cumprido, água.
    const doneId = await insertTask(userId, "Revisar capítulo 2", { status: "Concluído", completedNow: true });
    await db.execute({
      sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'task', ?, 'completed', 40, 'Revisar', ?)",
      args: [nanoid(), userId, doneId, today],
    });
    await db.execute({
      sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'task', 'antiga', 'completed', 70, 'Antiga', ?)",
      args: [nanoid(), userId, addDays(today, -2)],
    });
    await db.execute({ sql: "INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type) VALUES (?, ?, 5, 'task', ?, 'completed')", args: [nanoid(), userId, doneId] });
    const habitId = nanoid();
    await db.execute({ sql: "INSERT INTO habits (id, owner_id, name, target_count) VALUES (?, ?, 'Ler 10 páginas', 1)", args: [habitId, userId] });
    await db.execute({ sql: "INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count) VALUES (?, ?, ?, ?, 1)", args: [nanoid(), habitId, userId, today] });
    await db.execute({ sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES (?, ?, 750, ?)", args: [nanoid(), userId, `${today}T12:00:00.000Z`] });

    // Amanhã: a de prazo amanhã com prioridade alta vem antes das sem prazo.
    const dueTomorrow = await insertTask(userId, "Entregar relatório", { priority: "Alta", dueDate: tomorrow });
    await insertTask(userId, "Organizar estante", { priority: "Baixa" });
    await insertTask(userId, "Planejar sprint", { priority: "Média" });

    const res = await agent.get("/api/tavern/summary");
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(today);
    expect(res.body.tomorrow).toBe(tomorrow);
    const b = res.body.balance;
    expect(b.xp.today).toBe(40);
    expect(b.xp.avg7).toBe(10); // 70 XP em 7 dias anteriores
    expect(b.coins.today).toBe(5);
    expect(b.missions.count).toBe(1);
    expect(b.missions.items[0].title).toBe("Revisar capítulo 2");
    expect(b.habits).toMatchObject({ done: 1, total: 1 });
    expect(b.water.todayMl).toBe(750);
    expect(b.sleep).toBeNull();

    // Sem artefato forjado: nenhuma profecia inventada.
    expect(res.body.prophecy.prophecies).toEqual([]);

    const m = res.body.mission;
    expect(m.primary.id).toBe(dueTomorrow);
    expect(m.primary.reasons).toContain("Vence amanhã");
    expect(m.alternatives).toHaveLength(2);
    expect(m.dueTomorrow.map((t: { id: string }) => t.id)).toEqual([dueTomorrow]);
    expect(m.pinned).toEqual([]);
  });

  it("isola os dados entre usuários", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    const today = await todayKeyFor(getDb(), a.userId);
    await insertTask(a.userId, "Segredo de A", { status: "Concluído", completedNow: true });
    await insertTask(a.userId, "Pendência de A", { priority: "Alta", dueDate: addDays(today, 1) });

    const resB = await b.agent.get("/api/tavern/summary");
    expect(resB.status).toBe(200);
    expect(resB.body.balance.missions.count).toBe(0);
    expect(resB.body.mission.primary).toBeNull();
    expect(JSON.stringify(resB.body)).not.toContain("de A");
  });

  it("fixar cria/atualiza a entrada de amanhã, preserva no diário e recusa tarefa alheia", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const db = getDb();
    const tomorrow = addDays(await todayKeyFor(db, userId), 1);
    const t1 = await insertTask(userId, "Primeira", { priority: "Alta" });
    const t2 = await insertTask(userId, "Segunda");
    const foreign = await insertTask(other.userId, "Alheia");

    const p1 = await agent.post("/api/tavern/pin-tomorrow").send({ taskId: t1 });
    expect(p1.status).toBe(200);
    expect(p1.body.date).toBe(tomorrow);
    let row = await db.execute({ sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [userId, tomorrow] });
    expect(JSON.parse(String(row.rows[0].focus_task_ids))).toEqual([t1]);

    // Segunda fixação vira a principal (topo) e mantém a anterior; prazo só muda com o pedido explícito.
    const p2 = await agent.post("/api/tavern/pin-tomorrow").send({ taskId: t2, setDueTomorrow: true });
    expect(p2.status).toBe(200);
    row = await db.execute({ sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [userId, tomorrow] });
    expect(JSON.parse(String(row.rows[0].focus_task_ids))).toEqual([t2, t1]);
    const due = await db.execute({ sql: "SELECT id, due_date FROM tasks WHERE id IN (?, ?)", args: [t1, t2] });
    expect(due.rows.find((r) => r.id === t2)?.due_date).toBe(tomorrow);
    expect(due.rows.find((r) => r.id === t1)?.due_date).toBeNull();

    // Escrever no diário de amanhã (sem focusTaskIds) não apaga a missão fixada.
    const put = await agent.put(`/api/journal/${tomorrow}`).send({ thoughts: "<p>Plano</p>" });
    expect(put.status).toBe(200);
    expect(put.body.focusTaskIds).toEqual([t2, t1]);

    const summary = await agent.get("/api/tavern/summary");
    expect(summary.body.mission.pinned.map((p: { id: string }) => p.id)).toEqual([t2, t1]);

    // Tarefa de outro usuário: 404, nada gravado.
    const bad = await agent.post("/api/tavern/pin-tomorrow").send({ taskId: foreign });
    expect(bad.status).toBe(404);
    const otherRow = await db.execute({ sql: "SELECT COUNT(*) AS n FROM journal_entries WHERE owner_id = ?", args: [other.userId] });
    expect(Number(otherRow.rows[0].n)).toBe(0);
    expect((await agent.post("/api/tavern/pin-tomorrow").send({ taskId: "x y" })).status).toBe(400);
  });

  it("profecia de amanhã usa hoje como véspera e não grava nada", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await seedRoutine(userId);
    expect((await agent.post("/api/intelligence/grimoire/refresh")).status).toBe(200);
    const f = await agent.post("/api/intelligence/forge").send({ objective: "productivity" });
    expect(f.status).toBe(201);
    const db = getDb();
    const today = await todayKeyFor(db, userId);
    // Runa de sono da véspera (hoje): na Forja o sono conta pela data em que se deitou.
    await db.execute({
      sql: "INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes) VALUES (?, ?, ?, ?, 510)",
      args: [nanoid(), userId, `${today} 22:00:00`, `${addDays(today, 1)} 06:30:00`],
    });
    const before = await db.execute({ sql: "SELECT COUNT(*) AS n FROM ml_predictions WHERE owner_id = ?", args: [userId] });

    const res = await agent.get("/api/tavern/summary");
    expect(res.status).toBe(200);
    const [p] = res.body.prophecy.prophecies;
    expect(p.artifactId).toBe(f.body.artifact.id);
    expect(p.targetDate).toBe(res.body.tomorrow);
    expect(typeof p.probability).toBe("number");
    expect(p.factors.length).toBeGreaterThan(0);
    expect(p.factors.find((x: { key: string }) => x.key === "sleep_duration")?.value).toBe(8.5);
    expect(p.missing.map((m: { key: string }) => m.key)).not.toContain("sleep_duration");

    const after = await db.execute({ sql: "SELECT COUNT(*) AS n FROM ml_predictions WHERE owner_id = ?", args: [userId] });
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
  });
});
