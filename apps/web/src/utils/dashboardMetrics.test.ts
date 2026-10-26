import { describe, expect, it } from "vitest";
import { buildAttentionItems, buildDayEntries, dayLabel, taskComposition } from "./dashboardMetrics";
import type { CalendarItem, DeadlineRadarDashboard, GoalForecastDashboard, Task } from "@/types";

// Fixtures mínimas (só os campos realmente lidos pelas funções testadas) —
// cast explícito porque os tipos reais do Dashboard têm dezenas de campos
// irrelevantes para estas regras de "itens que merecem atenção".
function deadlines(overrides: Partial<DeadlineRadarDashboard["summary"]>, critical: DeadlineRadarDashboard["critical"] = []): DeadlineRadarDashboard {
  return {
    summary: { overdue: 0, dueToday: 0, due7d: 0, due8to30: 0, onTrack: 0, onTimeRate: null, ...overrides },
    critical,
  } as unknown as DeadlineRadarDashboard;
}

function goals(risks: GoalForecastDashboard["risks"]): GoalForecastDashboard {
  return { risks } as unknown as GoalForecastDashboard;
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    owner_id: "u1",
    project_id: null,
    goal_id: null,
    title: "Tarefa",
    description: null,
    status: "A Fazer",
    priority: "Média",
    due_date: null,
    start_date: null,
    estimate_minutes: null,
    time_spent_minutes: 0,
    completed_at: null,
    created_at: "2026-10-01 10:00:00",
    updated_at: "2026-10-01 10:00:00",
    impact: null,
    urgency: null,
    effort: null,
    priority_score: null,
    recurrence_rule: null,
    habit_id: null,
    ...overrides,
  } as Task;
}

describe("buildAttentionItems — itens que merecem atenção no Dashboard", () => {
  it("sem nenhum dado de risco não gera nenhum item", () => {
    const items = buildAttentionItems({ deadlines: null, habitsPending: 0, hour: 9 });
    expect(items).toEqual([]);
  });

  it("prazo vencido é crítico; prazo que vence hoje (sem atraso) é só aviso", () => {
    const vencido = buildAttentionItems({
      deadlines: deadlines({ overdue: 2, dueToday: 0 }, [{ title: "Entrega X", daysRemaining: -3 } as never]),
      habitsPending: 0,
      hour: 9,
    });
    expect(vencido[0].tone).toBe("critical");
    expect(vencido[0].description).toContain("3 dia(s) de atraso");

    const hoje = buildAttentionItems({
      deadlines: deadlines({ overdue: 0, dueToday: 1 }, [{ title: "Entrega Y", daysRemaining: 0 } as never]),
      habitsPending: 0,
      hour: 9,
    });
    expect(hoje[0].tone).toBe("warning");
  });

  it("água só cobra a partir das 10h e varia o tom conforme o quanto falta", () => {
    const antesDas10 = buildAttentionItems({ deadlines: null, habitsPending: 0, hour: 9, waterMl: 0, waterGoalMl: 2000 });
    expect(antesDas10.find((i) => i.id === "water")).toBeUndefined();

    const poucoAbaixo = buildAttentionItems({ deadlines: null, habitsPending: 0, hour: 14, waterMl: 1800, waterGoalMl: 2000 });
    expect(poucoAbaixo.find((i) => i.id === "water")?.tone).toBe("info");

    const muitoAbaixo = buildAttentionItems({ deadlines: null, habitsPending: 0, hour: 14, waterMl: 200, waterGoalMl: 2000 });
    expect(muitoAbaixo.find((i) => i.id === "water")?.tone).toBe("warning");
  });

  it("metas em risco crítico sobem o tom do item inteiro para crítico", () => {
    const items = buildAttentionItems({
      deadlines: null,
      habitsPending: 0,
      hour: 9,
      goals: goals([{ title: "Meta A", risk: "critical", status: "on_track" } as never]),
    });
    expect(items[0].tone).toBe("critical");
    expect(items[0].title).toBe("1 meta(s) em risco");
  });

  it("hábitos pendentes só aparecem a partir das 18h", () => {
    const antes = buildAttentionItems({ deadlines: null, habitsPending: 3, hour: 17 });
    expect(antes.find((i) => i.id === "habits")).toBeUndefined();

    const depois = buildAttentionItems({ deadlines: null, habitsPending: 3, hour: 19 });
    expect(depois.find((i) => i.id === "habits")?.title).toBe("3 hábito(s) pendente(s)");
  });
});

describe("buildDayEntries — agenda do dia em ordem de horário", () => {
  const cal = (overrides: Partial<CalendarItem>): CalendarItem => ({
    id: "c1",
    title: "Evento",
    description: null,
    startsAt: "2026-10-26T09:00:00Z",
    endsAt: null,
    allDay: false,
    sourceType: "manual",
    sourceId: null,
    link: null,
    ...overrides,
  });

  it("ignora eventos de outro dia e ordena por horário, com dia-todo primeiro", () => {
    const items = [
      cal({ id: "a", startsAt: "2026-10-26T18:00:00Z", title: "Tarde" }),
      cal({ id: "b", startsAt: "2026-10-25T10:00:00Z", title: "Outro dia" }),
      cal({ id: "c", startsAt: "2026-10-26T08:00:00Z", title: "Manhã" }),
      cal({ id: "d", startsAt: "2026-10-26T00:00:00Z", allDay: true, title: "Dia todo" }),
    ];
    const entries = buildDayEntries(items, "2026-10-26");
    expect(entries.map((e) => e.title)).toEqual(["Dia todo", "Manhã", "Tarde"]);
  });

  it("deriva o subtítulo a partir do sourceType real do item", () => {
    const [entry] = buildDayEntries([cal({ sourceType: "task" })], "2026-10-26");
    expect(entry.subtitle).toBe("Prazo de tarefa");
  });
});

describe("dayLabel — rótulo de dia dos gráficos", () => {
  it("aceita data completa (YYYY-MM-DD)", () => {
    expect(dayLabel("2026-03-05")).toBe("05/03");
  });

  it("aceita série sem ano (MM-DD) vinda da API", () => {
    expect(dayLabel("03-05")).toMatch(/^05\/03$/);
  });

  it("data inválida devolve o texto original em vez de 'Invalid Date'", () => {
    expect(dayLabel("não-é-uma-data")).toBe("não-é-uma-data");
  });
});

describe("taskComposition — composição das tarefas dos últimos 30 dias", () => {
  const today = "2026-10-26";

  it("classifica concluída, atrasada, em andamento e pendente corretamente", () => {
    const tasks = [
      task({ id: "done", status: "Concluído", completed_at: "2026-10-20 10:00:00", created_at: "2026-10-10 10:00:00" }),
      task({ id: "overdue", status: "A Fazer", due_date: "2026-10-01" }),
      task({ id: "doing", status: "Em Andamento" }),
      task({ id: "pending", status: "A Fazer" }),
    ];
    const comp = taskComposition(tasks, today);
    expect(comp.done).toBe(1);
    expect(comp.overdue).toBe(1);
    expect(comp.doing).toBe(1);
    expect(comp.pending).toBe(1);
    expect(comp.total).toBe(4);
  });

  it("ignora tarefas fora da janela de 30 dias (nem criadas nem concluídas no período)", () => {
    const tasks = [task({ id: "old", status: "Concluído", created_at: "2025-01-01 10:00:00", completed_at: "2025-01-02 10:00:00" })];
    expect(taskComposition(tasks, today).total).toBe(0);
  });

  it("usa a mediana (não a média) do lead time, e exige pelo menos 3 amostras", () => {
    const mk = (id: string, createdAt: string, completedAt: string) =>
      task({ id, status: "Concluído", created_at: createdAt, completed_at: completedAt });
    const duas = taskComposition(
      [mk("a", "2026-10-01 00:00:00", "2026-10-02 00:00:00"), mk("b", "2026-10-01 00:00:00", "2026-10-11 00:00:00")],
      today
    );
    expect(duas.medianLeadDays).toBeNull();

    const tres = taskComposition(
      [
        mk("a", "2026-10-01 00:00:00", "2026-10-02 00:00:00"), // 1 dia
        mk("b", "2026-10-01 00:00:00", "2026-10-06 00:00:00"), // 5 dias
        mk("c", "2026-10-01 00:00:00", "2026-10-21 00:00:00"), // 20 dias (outlier)
      ],
      today
    );
    expect(tres.medianLeadDays).toBe(5);
  });
});
