import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { classifyRegion, regionForHabit, regionLevel, xpForRegionLevel } from "../src/services/worldmapService.js";

type Agent = Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"];
type RegionBody = {
  key: string;
  xp: number;
  level: number;
  fogged: boolean;
  last30: number;
  prev30: number;
  trendPct: number | null;
  lastFeat: { label: string } | null;
  nextStep: { kind: string; label: string } | null;
  activity: { activeDays30: number } | null;
  topSources: Array<{ source: string }>;
};
const worldmap = async (agent: Agent) =>
  (await agent.get("/api/worldmap")).body as {
    regions: RegionBody[];
    totalXp: number;
    hasData: boolean;
  };
const region = (body: { regions: RegionBody[] }, key: string) => body.regions.find((r) => r.key === key)!;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

async function xp(ownerId: string, sourceType: string, sourceId: string, amount: number, opts: { projectId?: string; day?: string; label?: string } = {}) {
  await getDb().execute({
    sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, project_id, label, day_key) VALUES (?, ?, ?, ?, 'e', ?, ?, ?, ?)",
    args: [nanoid(), ownerId, sourceType, sourceId, amount, opts.projectId ?? null, opts.label ?? `${sourceType} teste`, opts.day ?? today()],
  });
}

describe("Mapa do Mundo (regras puras)", () => {
  it("classifica por origem, projeto, meta e hábito de forma determinística", () => {
    expect(classifyRegion("task", { projectKind: "academic" })).toBe("estudos");
    expect(classifyRegion("task", { projectKind: "workspace" })).toBe("trabalho");
    expect(
      classifyRegion("task", {
        projectKind: "personal",
        taskGoalArea: "financas",
      }),
    ).toBe("financas");
    expect(classifyRegion("task", { projectGoalArea: "saude" })).toBe("saude");
    expect(classifyRegion("task", {})).toBe("encruzilhada");
    expect(classifyRegion("habit_entry", { habitText: "Beber 2L de água" })).toBe("saude");
    expect(classifyRegion("habit_entry", { habitText: "Inglês 15 min" })).toBe("estudos");
    expect(classifyRegion("habit_entry", { habitText: "Meditar" })).toBe("mente");
    expect(classifyRegion("habit_entry", { habitText: "Anotar gastos" })).toBe("financas");
    expect(regionForHabit("Acordar cedo")).toBeNull();
    expect(classifyRegion("journal")).toBe("mente");
    expect(classifyRegion("review")).toBe("mente");
    expect(classifyRegion("experiment")).toBe("mente");
    expect(classifyRegion("life_admin")).toBe("financas");
    expect(classifyRegion("achievement", { achievementMetric: "workouts_total" })).toBe("saude");
    expect(classifyRegion("achievement", { achievementMetric: "pages_read_total" })).toBe("estudos");
    expect(classifyRegion("achievement", { achievementMetric: "tasks_done" })).toBe("encruzilhada");
    expect(
      classifyRegion("contract", {
        contractProjectKind: "professional",
        contractGoalArea: "saude",
      }),
    ).toBe("trabalho");
    expect(classifyRegion("contract", { contractGoalArea: "saude" })).toBe("saude");
    expect(classifyRegion("campaign", { campaignLifeArea: "carreira" })).toBe("trabalho");
    expect(classifyRegion("day")).toBe("encruzilhada");
  });

  it("curva de nível: nível n começa em 100·(n−1)²", () => {
    expect(xpForRegionLevel(1)).toBe(0);
    expect(xpForRegionLevel(2)).toBe(100);
    expect(xpForRegionLevel(3)).toBe(400);
    expect(regionLevel(0)).toMatchObject({ level: 1, progressPct: 0 });
    expect(regionLevel(99).level).toBe(1);
    expect(regionLevel(100).level).toBe(2);
    expect(regionLevel(250)).toMatchObject({
      level: 2,
      levelStartXp: 100,
      nextLevelXp: 400,
      progressPct: 50,
    });
    expect(regionLevel(900).level).toBe(4);
  });
});

describe("Mapa do Mundo (API)", () => {
  it("sem dados: tudo em névoa, nada inventado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const body = await worldmap(agent);
    expect(body.hasData).toBe(false);
    expect(body.totalXp).toBe(0);
    expect(body.regions.every((r) => r.xp === 0 && r.fogged && r.lastFeat === null)).toBe(true);
    // Única sugestão sem dados é o Diário de hoje (fato real: não há entrada hoje).
    expect(body.regions.filter((r) => r.nextStep).map((r) => r.key)).toEqual(["mente"]);
  });

  it("classifica o ledger real por região; soma das regiões = XP global; isolado por usuário", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    const db = getDb();
    const acad = nanoid();
    const pro = nanoid();
    const goalFin = nanoid();
    const goalSaude = nanoid();
    const habit = nanoid();
    const contract = nanoid();
    const campaign = nanoid();
    const taskFin = nanoid();
    const taskAcadOpen = nanoid();
    await db.batch(
      [
        {
          sql: "INSERT INTO projects (id, owner_id, name, kind) VALUES (?, ?, 'Dissertação', 'academic')",
          args: [acad, userId],
        },
        {
          sql: "INSERT INTO projects (id, owner_id, name, kind) VALUES (?, ?, 'Cliente', 'professional')",
          args: [pro, userId],
        },
        {
          sql: "INSERT INTO goals (id, owner_id, title, life_area, kind, target_value, current_value) VALUES (?, ?, 'Reserva', 'financas', 'numeric', 100, 10)",
          args: [goalFin, userId],
        },
        {
          sql: "INSERT INTO goals (id, owner_id, title, life_area, kind, target_value, current_value) VALUES (?, ?, 'Treinar', 'saude', 'numeric', 10, 5)",
          args: [goalSaude, userId],
        },
        {
          sql: "INSERT INTO habits (id, owner_id, name) VALUES (?, ?, 'Correr 5 km')",
          args: [habit, userId],
        },
        {
          sql: "INSERT INTO contracts (id, owner_id, title, goal_id) VALUES (?, ?, 'Pacto', ?)",
          args: [contract, userId, goalSaude],
        },
        {
          sql: "INSERT INTO campaigns (id, owner_id, title, life_area) VALUES (?, ?, 'Campanha', 'carreira')",
          args: [campaign, userId],
        },
        {
          sql: "INSERT INTO tasks (id, owner_id, title, goal_id, status) VALUES (?, ?, 'Pagar fatura', ?, 'Concluído')",
          args: [taskFin, userId, goalFin],
        },
        {
          sql: "INSERT INTO tasks (id, owner_id, title, project_id) VALUES (?, ?, 'Escrever cap. 2', ?)",
          args: [taskAcadOpen, userId, acad],
        },
      ],
      "write",
    );
    await xp(userId, "task", nanoid(), 20, {
      projectId: acad,
      label: "Missão acadêmica",
    });
    await xp(userId, "task", nanoid(), 30, { projectId: pro });
    await xp(userId, "task", taskFin, 10);
    await xp(userId, "habit_entry", `${habit}:${today()}`, 5);
    await xp(userId, "contract", contract, 40);
    await xp(userId, "campaign", `${campaign}:marco1`, 15);
    await xp(userId, "journal", today(), 3);
    await xp(userId, "life_admin", "item:2026-01-01", 7);
    await xp(userId, "day", today(), 2);
    // XP antigo para tendência (janela anterior) e fora das janelas.
    await xp(userId, "task", nanoid(), 10, {
      projectId: pro,
      day: daysAgo(40),
    });
    await xp(userId, "task", nanoid(), 500, {
      projectId: pro,
      day: daysAgo(90),
    });
    // Dados de outro usuário nunca podem vazar.
    await xp(other.userId, "task", nanoid(), 999, { projectId: acad });
    await xp(other.userId, "journal", today(), 999);

    const body = await worldmap(agent);
    expect(body.totalXp).toBe(20 + 30 + 10 + 5 + 40 + 15 + 3 + 7 + 2 + 10 + 500);
    expect(body.regions.reduce((acc, r) => acc + r.xp, 0)).toBe(body.totalXp);
    expect(region(body, "estudos").xp).toBe(20);
    expect(region(body, "estudos").lastFeat?.label).toBe("Missão acadêmica");
    expect(region(body, "trabalho").xp).toBe(30 + 15 + 10 + 500);
    expect(region(body, "trabalho")).toMatchObject({
      last30: 45,
      prev30: 10,
      trendPct: 350,
      level: 3,
    });
    expect(region(body, "financas").xp).toBe(10 + 7);
    expect(region(body, "saude").xp).toBe(5 + 40);
    expect(region(body, "mente").xp).toBe(3);
    expect(region(body, "encruzilhada").xp).toBe(2);
    expect(body.regions.some((r) => r.fogged)).toBe(false);

    // Próximo passo vem de dados reais.
    expect(region(body, "estudos").nextStep).toMatchObject({
      kind: "task",
      label: 'Concluir "Escrever cap. 2"',
    });
    expect(region(body, "saude").nextStep).toMatchObject({ kind: "goal" });
    expect(region(body, "financas").nextStep?.label).toContain("Reserva");
    expect(region(body, "trabalho").nextStep).toBeNull();

    const otherBody = await worldmap(other.agent);
    // O projeto acadêmico pertence a outro dono: o join por owner_id não o enxerga.
    expect(otherBody.totalXp).toBe(1998);
    expect(region(otherBody, "estudos").xp).toBe(0);
    expect(region(otherBody, "mente").xp).toBe(999);
  });

  it("régua de atividade real da Saúde aparece separada do XP", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await getDb().execute({
      sql: "INSERT INTO workouts (id, owner_id, kind, duration_minutes, performed_at) VALUES (?, ?, 'Corrida', 30, datetime('now'))",
      args: [nanoid(), userId],
    });
    const body = await worldmap(agent);
    const saude = region(body, "saude");
    expect(saude.xp).toBe(0);
    expect(saude.activity?.activeDays30).toBe(1);
    expect(saude.fogged).toBe(false);
    expect(
      (
        await getDb().execute({
          sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ?",
          args: [userId],
        })
      ).rows[0].n,
    ).toBe(0);
  });

  it("exige autenticação", async () => {
    const { default: request } = await import("supertest");
    const { app } = await import("../src/app.js");
    expect((await request(app).get("/api/worldmap")).status).toBe(401);
  });
});
