import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { classifyPressure, resolveClientToday, shiftDays } from "../src/services/workloadService.js";
import { describePushFailures } from "../src/services/pushService.js";

const today = new Date().toISOString().slice(0, 10);

describe("Carga por projeto (GET /api/projects/workload)", () => {
  it("agrega status, horas estimadas/restantes, atrasos e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const project = await agent.post("/api/projects").send({ name: "Cliente X", kind: "professional" });
    const projectId = project.body.id as string;
    await agent.post("/api/tasks").send({ title: "Atrasada", projectId, dueDate: shiftDays(today, -2), estimateMinutes: 120 });
    await agent.post("/api/tasks").send({ title: "Em andamento", projectId, status: "Em Andamento", estimateMinutes: 60 });
    await agent.post("/api/tasks").send({ title: "Sem estimativa", projectId });
    await agent.post("/api/tasks").send({ title: "Feita", projectId, status: "Concluído", estimateMinutes: 30 });
    await other.agent.post("/api/projects").send({ name: "Projeto de outra pessoa", kind: "professional" });

    const res = await agent.get(`/api/projects/workload?today=${today}&kind=professional`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    const p = res.body.projects[0];
    expect(p.name).toBe("Cliente X");
    expect(p.total).toBe(4);
    expect(p.done).toBe(1);
    expect(p.open).toBe(3);
    expect(p.doing).toBe(1);
    expect(p.todo).toBe(2);
    expect(p.overdue).toBe(1);
    expect(p.unestimatedOpen).toBe(1);
    expect(p.remainingMinutes).toBe(180);
    expect(p.pressure).toBe("critical");
    expect(p.nextDue.title).toBe("Atrasada");
    expect(res.body.totals.open).toBe(3);
  });

  it("sem filtro de tipo, inclui o bucket 'Sem projeto'", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/tasks").send({ title: "Solta" });
    const res = await agent.get(`/api/projects/workload?today=${today}`);
    expect(res.body.projects.some((p: { id: string | null; name: string }) => p.id === null && p.name === "Sem projeto")).toBe(true);
  });

  it("classifica a pressão pela regra documentada", () => {
    expect(classifyPressure({ open: 0, overdue: 0, dueThisWeek: 0, hoursPerDayNeeded: null })).toBe("idle");
    expect(classifyPressure({ open: 2, overdue: 1, dueThisWeek: 0, hoursPerDayNeeded: null })).toBe("critical");
    expect(classifyPressure({ open: 2, overdue: 0, dueThisWeek: 0, hoursPerDayNeeded: 7 })).toBe("critical");
    expect(classifyPressure({ open: 2, overdue: 0, dueThisWeek: 1, hoursPerDayNeeded: 1 })).toBe("attention");
    expect(classifyPressure({ open: 2, overdue: 0, dueThisWeek: 0, hoursPerDayNeeded: 1 })).toBe("ok");
  });

  it("só aceita 'today' do cliente a até 1 dia da data do servidor", () => {
    expect(resolveClientToday(shiftDays(today, 1))).toBe(shiftDays(today, 1));
    expect(resolveClientToday("2001-01-01")).toBe(today);
    expect(resolveClientToday("lixo")).toBe(today);
  });
});

describe("Visão Profissional (GET /api/professional/overview)", () => {
  it("devolve KPIs reais e comparações honestas quando há pouca amostra", async () => {
    const { agent } = await createAuthenticatedAgent();
    const project = await agent.post("/api/projects").send({ name: "Trabalho", kind: "professional" });
    await agent.post("/api/tasks").send({ title: "Entregar relatório", projectId: project.body.id, status: "Concluído" });
    await agent.post("/api/tasks").send({ title: "Revisar contrato", projectId: project.body.id, dueDate: shiftDays(today, 3) });
    await agent.post("/api/tasks").send({ title: "Tarefa pessoal", status: "Concluído" });

    const res = await agent.get(`/api/professional/overview?today=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.kpis.open).toBe(1);
    expect(res.body.kpis.done7).toBe(1);
    expect(res.body.daily).toHaveLength(14);
    expect(res.body.upcoming[0].title).toBe("Revisar contrato");
    expect(res.body.comparisons).toHaveLength(5);
    for (const c of res.body.comparisons) {
      expect(c.reason).toContain("Precisa de pelo menos");
      expect(c.withAvgDone).toBeNull();
    }
  });

  it("exige sessão", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/auth/logout");
    const res = await agent.get("/api/professional/overview");
    expect(res.status).toBe(401);
  });
});

describe("Gerador de tarefas a partir de hábitos", () => {
  it("cria uma tarefa por dia com início, término, carga de 30 min e descrição de origem — idempotente", async () => {
    const { agent } = await createAuthenticatedAgent();
    const habit = await agent.post("/api/habits").send({ name: "Ler 20 páginas" });
    const from = shiftDays(today, 1);
    const to = shiftDays(today, 3);

    const first = await agent.post("/api/habits/generate-tasks").send({ from, to });
    expect(first.status).toBe(200);
    expect(first.body.created).toHaveLength(3);

    const tasks = (await agent.get("/api/tasks")).body as Array<Record<string, unknown>>;
    const generated = tasks.filter((t) => t.habit_id === habit.body.id);
    expect(generated).toHaveLength(3);
    for (const t of generated) {
      expect(t.start_date).toBe(t.due_date);
      expect(t.estimate_minutes).toBe(30);
      expect(t.status).toBe("A Fazer");
      expect(String(t.description)).toContain("a partir do hábito “Ler 20 páginas” (módulo Hábitos");
    }

    const again = await agent.post("/api/habits/generate-tasks").send({ from, to });
    expect(again.body.created).toHaveLength(0);
    expect(again.body.skippedExisting).toBe(3);
  });

  it("respeita parâmetros: hábitos escolhidos, carga, prioridade e frequência semanal", async () => {
    const { agent } = await createAuthenticatedAgent();
    const daily = await agent.post("/api/habits").send({ name: "Água" });
    const weekly = await agent.post("/api/habits").send({ name: "Revisão semanal", frequency: "weekly" });
    await agent.post("/api/habits").send({ name: "Não selecionado" });

    // Segunda-feira de uma semana futura → 7 dias = exatamente 1 semana ISO.
    const base = new Date(`${shiftDays(today, 14)}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
    const monday = base.toISOString().slice(0, 10);

    const res = await agent.post("/api/habits/generate-tasks").send({
      from: monday,
      to: shiftDays(monday, 6),
      habitIds: [daily.body.id, weekly.body.id],
      estimateMinutes: 45,
      priority: "Alta",
      status: "Backlog",
    });
    expect(res.status).toBe(200);
    const byHabit = (id: string) => res.body.created.filter((c: { habit_id: string }) => c.habit_id === id);
    expect(byHabit(daily.body.id)).toHaveLength(7);
    expect(byHabit(weekly.body.id)).toHaveLength(1);
    expect(res.body.created).toHaveLength(8);

    const tasks = (await agent.get("/api/tasks")).body as Array<Record<string, unknown>>;
    const one = tasks.find((t) => t.habit_id === weekly.body.id)!;
    expect(one.estimate_minutes).toBe(45);
    expect(one.priority).toBe("Alta");
    expect(one.status).toBe("Backlog");
  });

  it("valida o período e o projeto de outro usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    await agent.post("/api/habits").send({ name: "Meditar" });
    const foreign = await other.agent.post("/api/projects").send({ name: "Alheio" });

    const tooLong = await agent.post("/api/habits/generate-tasks").send({ from: today, to: shiftDays(today, 40) });
    expect(tooLong.status).toBe(400);
    const inverted = await agent.post("/api/habits/generate-tasks").send({ from: today, to: shiftDays(today, -1) });
    expect(inverted.status).toBe(400);
    const foreignProject = await agent.post("/api/habits/generate-tasks").send({ from: today, to: today, projectId: foreign.body.id });
    expect(foreignProject.status).toBe(404);
  });
});

describe("Diagnóstico de falha do push", () => {
  it("explica recusa de assinatura (401/403) e inscrição expirada", () => {
    expect(describePushFailures([{ service: "fcm.googleapis.com", statusCode: 403, kind: "auth" }])).toContain("recusou a assinatura");
    expect(describePushFailures([{ service: "wns2-par02p.notify.windows.com", statusCode: 410, kind: "gone" }])).toContain("expirou");
    expect(describePushFailures([{ service: "x", statusCode: null, kind: "network" }])).toContain("conectar");
  });
});

describe("Par VAPID", () => {
  it("detecta par consistente e par misturado", async () => {
    const webpush = (await import("web-push")).default;
    const { isConsistentKeyPair } = await import("../src/services/pushService.js");
    const a = webpush.generateVAPIDKeys();
    const b = webpush.generateVAPIDKeys();
    expect(isConsistentKeyPair(a)).toBe(true);
    expect(isConsistentKeyPair({ publicKey: a.publicKey, privateKey: b.privateKey })).toBe(false);
  });
});
