import { describe, it, expect } from "vitest";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import {
  addDaysKey,
  buildProposal,
  computeAdherence,
  defaultPlanningWeek,
  distributeTasks,
  getCouncilOverview,
  sealPlan,
  warCouncilTimelineEvents,
  weekDays,
  WarCouncilError,
} from "../src/services/warCouncilService.js";

const WEEK = "2026-10-26"; // segunda
const days = (cap: number[]) => weekDays(WEEK).map((date, i) => ({ date, capacityMinutes: cap[i] ?? 0 }));

describe("Conselho de Guerra — distribuição", () => {
  it("semana sugerida: fim de semana planeja a próxima", () => {
    expect(defaultPlanningWeek("2026-10-24")).toBe("2026-10-26"); // sábado
    expect(defaultPlanningWeek("2026-10-22")).toBe("2026-10-19"); // quinta
  });

  it("respeita prazo, capacidade e dias já passados", () => {
    const r = distributeTasks(
      [
        { id: "prazo", estimateMinutes: 60, dueDate: "2026-10-27", priority: "Média", plannedDate: null },
        { id: "grande", estimateMinutes: 300, dueDate: null, priority: "Alta", plannedDate: null },
        { id: "sem-est", estimateMinutes: null, dueDate: null, priority: "Baixa", plannedDate: null },
        { id: "atrasada", estimateMinutes: 30, dueDate: "2026-10-01", priority: "Baixa", plannedDate: null },
        { id: "mantida", estimateMinutes: 30, dueDate: null, priority: "Baixa", plannedDate: "2026-10-30" },
      ],
      days([500, 120, 100, 100, 100, 0, 0]),
      "2026-10-27", // a semana já começou: segunda fica de fora
    );
    const by = Object.fromEntries(r.assignments.map((a) => [a.taskId, a]));
    expect(by.mantida.plannedDate).toBe("2026-10-30");
    expect(by.prazo.plannedDate).toBe("2026-10-27"); // nunca depois do prazo
    expect(by.atrasada.plannedDate).toBe("2026-10-27"); // primeiro dia que comporta
    expect(by.grande.plannedDate).toBeNull(); // nenhum dia tem 300 min livres
    expect(by.grande.unplacedReason).toMatch(/capacidade/);
    expect(by["sem-est"].plannedDate).not.toBeNull();
    expect(r.dayLoads[0]).toMatchObject({ date: WEEK, capacityMinutes: 0, tasks: 0 });
  });
});

describe("Conselho de Guerra — selar plano", () => {
  it("proposta não grava; selar grava datas, evento, XP uma vez e aderência derivada", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const overview = await getCouncilOverview(db, userId);
    const week = overview.weekStart;
    const proj = await agent.post("/api/projects").send({ name: "Campanha X" });
    expect(proj.status).toBe(201);
    const t1 = await agent.post("/api/tasks").send({ title: "Missão foco", projectId: proj.body.id, estimateMinutes: 30 });
    const t2 = await agent.post("/api/tasks").send({ title: "Missão com prazo", dueDate: addDaysKey(week, 6), estimateMinutes: 30 });
    expect(t1.status).toBe(201);

    const proposal = await buildProposal(db, userId, week, [{ type: "project", id: proj.body.id }]);
    const ids = proposal.candidates.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([t1.body.id, t2.body.id]));
    expect(proposal.candidates.find((c) => c.id === t1.body.id)!.reasons).toContain("focus");
    const before = await db.execute({ sql: "SELECT planned_date FROM tasks WHERE id = ?", args: [t1.body.id] });
    expect(before.rows[0].planned_date).toBeNull();

    const day = proposal.firstDay;
    const input = {
      weekStart: week,
      focus: [{ type: "project" as const, id: proj.body.id }],
      notes: "Semana de foco",
      assignments: [
        { taskId: t1.body.id, plannedDate: day },
        { taskId: t2.body.id, plannedDate: day },
      ],
      events: [{ taskId: t1.body.id, date: day, startTime: "09:00", durationMinutes: 45 }],
    };
    const sealed = await sealPlan(db, userId, input);
    expect(sealed.xpAwarded).toBe(true);
    expect(sealed.eventsCreated).toBe(1);
    expect(sealed.adherence).toMatchObject({ planned: 2, completed: 0, pct: 0 });
    expect(sealed.plan?.sealedAt).not.toBeNull();

    // Reselar: sem XP nem evento duplicados.
    const again = await sealPlan(db, userId, input);
    expect(again.xpAwarded).toBe(false);
    expect(again.eventsCreated).toBe(0);

    await agent.patch(`/api/tasks/${t1.body.id}`).send({ status: "Concluído" });
    expect(await computeAdherence(db, userId, week)).toMatchObject({ planned: 2, completed: 1, pct: 50 });

    const ev = await db.execute({ sql: "SELECT starts_at, ends_at FROM events WHERE owner_id = ? AND source_id = ?", args: [userId, t1.body.id] });
    expect(ev.rows[0]).toMatchObject({ starts_at: `${day}T09:00:00`, ends_at: `${day}T09:45:00` });

    const today = overview.today;
    const tl = await warCouncilTimelineEvents(db, userId, addDaysKey(today, -1), addDaysKey(today, 1));
    expect(tl).toHaveLength(1);
    expect(tl[0].xp).toBeGreaterThan(0);
  });

  it("isolamento: não planeja missão nem foco de outro usuário", async () => {
    const { agent: a, userId: ua } = await createAuthenticatedAgent();
    const { userId: ub } = await createAuthenticatedAgent();
    const db = getDb();
    const week = (await getCouncilOverview(db, ub)).weekStart;
    const t = await a.post("/api/tasks").send({ title: "Minha" });
    const p = await a.post("/api/projects").send({ name: "Meu projeto" });
    await expect(sealPlan(db, ub, { weekStart: week, focus: [], assignments: [{ taskId: t.body.id, plannedDate: week }] })).rejects.toBeInstanceOf(WarCouncilError);
    await expect(buildProposal(db, ub, week, [{ type: "project", id: p.body.id }])).rejects.toThrow(/Foco/);
    const r = await db.execute({ sql: "SELECT planned_date FROM tasks WHERE id = ?", args: [t.body.id] });
    expect(r.rows[0].planned_date).toBeNull();
    const proposal = await buildProposal(db, ub, week, []);
    expect(proposal.candidates.map((c) => c.id)).not.toContain(t.body.id);
    void ua;
  });

  it("valida semana e datas", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const week = (await getCouncilOverview(db, userId)).weekStart;
    await expect(getCouncilOverview(db, userId, addDaysKey(week, 1))).rejects.toThrow(/segunda/);
    await expect(getCouncilOverview(db, userId, addDaysKey(week, -14))).rejects.toThrow(/passou/);
    await expect(sealPlan(db, userId, { weekStart: week, focus: [], assignments: [{ taskId: "x", plannedDate: addDaysKey(week, 9) }] })).rejects.toThrow(/dentro da semana/);
  });
});
