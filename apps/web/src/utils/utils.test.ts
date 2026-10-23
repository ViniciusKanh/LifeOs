import { describe, expect, it } from "vitest";
import { buildRecurrenceRule, describeRecurrenceRule, parseRecurrenceRule } from "./recurrence";
import { formatSleep, periodDelta } from "./reviewMetrics";
import { lastMissions, localToday, previewTaskReward, xpSourceLabel } from "./gamification";
import { formatBytes } from "./files";
import { lifeScoreWeekDelta, localIsoDate } from "./dashboardMetrics";
import type { GamificationRules } from "@/services/gamificationService";
import type { LifeScoreBreakdown } from "@/types";

/** Os testes rodam com TZ=America/Sao_Paulo (src/test/setup.ts). */

describe("recorrência de tarefas", () => {
  it("ida e volta entre regra e estado", () => {
    expect(parseRecurrenceRule(null)).toEqual({ freq: "", byDay: [] });
    expect(parseRecurrenceRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toEqual({ freq: "WEEKLY", byDay: ["MO", "WE", "FR"] });
    expect(buildRecurrenceRule({ freq: "WEEKLY", byDay: ["TU"] })).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(buildRecurrenceRule({ freq: "DAILY", byDay: ["MO"] })).toBe("FREQ=DAILY");
    expect(buildRecurrenceRule({ freq: "", byDay: [] })).toBeNull();
  });

  it("semanal sem dia marcado não vira regra e regra desconhecida é ignorada", () => {
    expect(buildRecurrenceRule({ freq: "WEEKLY", byDay: [] })).toBeNull();
    expect(parseRecurrenceRule("FREQ=YEARLY")).toEqual({ freq: "", byDay: [] });
    expect(describeRecurrenceRule("FREQ=WEEKLY;BYDAY=MO,SU")).toBe("Repete Seg, Dom");
    expect(describeRecurrenceRule("FREQ=MONTHLY")).toBe("Repete todo mês");
    expect(describeRecurrenceRule(null)).toBeNull();
  });
});

describe("métricas de revisão", () => {
  it("variação só existe com base anterior real", () => {
    expect(periodDelta(12, 10)).toEqual({ pct: 20, hasBase: true });
    expect(periodDelta(5, 0)).toEqual({ pct: null, hasBase: false });
    expect(periodDelta(5, null)).toEqual({ pct: null, hasBase: false });
    expect(periodDelta(undefined, 3)).toEqual({ pct: null, hasBase: false });
  });

  it("formata sono em horas e minutos", () => {
    expect(formatSleep(450)).toBe("7h30");
    expect(formatSleep(65)).toBe("1h05");
    expect(formatSleep(null)).toBe("—");
  });
});

describe("datas locais do Dashboard e da gamificação", () => {
  it("'hoje' às 22h30 em São Paulo ainda é o dia local", () => {
    const night = new Date("2026-10-23T01:30:00.000Z");
    expect(localToday(night)).toBe("2026-10-22");
    expect(localIsoDate(night)).toBe("2026-10-22");
  });

  it("variação semanal do Life Score usa o snapshot de ~7 dias atrás", () => {
    const snap = (date: string, overall: number) => ({ date, overall, productivity: 0, health: 0, education: 0, reading: 0, habits: 0, professional: 0, goals: 0 }) as LifeScoreBreakdown;
    const history = [snap("2026-10-10", 40), snap("2026-10-15", 50), snap("2026-10-22", 62)];
    expect(lifeScoreWeekDelta(history, "2026-10-22")).toEqual({ delta: 12, since: "2026-10-15" });
    expect(lifeScoreWeekDelta([snap("2026-10-22", 62)], "2026-10-22")).toBeNull();
  });
});

describe("gamificação (prévia — o valor real vem do servidor)", () => {
  const rules = {
    task: { xpByPriority: { Alta: 35, Média: 20, Baixa: 10 }, coinsByPriority: { Alta: 5, Média: 3, Baixa: 1 }, dailyMissionXp: 5, mainMissionXp: 10, beforeDeadlineXp: 3 },
    habit: { xp: 8, coins: 1 },
    difficulty: { defaults: undefined },
  } as unknown as GamificationRules;

  it("sem regras não inventa recompensa", () => {
    expect(previewTaskReward(undefined, { priority: "Alta" }, "2026-10-22")).toBeNull();
  });

  it("prioridade + bônus de prazo do dia + missão principal", () => {
    expect(previewTaskReward(rules, { priority: "Alta", dueDate: "2026-10-22" }, "2026-10-22", true)).toEqual({ xp: 35 + 5 + 10, coins: 5 });
    expect(previewTaskReward(rules, { priority: "Baixa", dueDate: "2026-10-30" }, "2026-10-22")).toEqual({ xp: 10 + 3, coins: 1 });
    // Prioridade desconhecida cai em "Média".
    expect(previewTaskReward(rules, { priority: "Urgentíssima" }, "2026-10-22")).toEqual({ xp: 20, coins: 3 });
  });

  it("tarefa de hábito paga só o hábito (sem dupla recompensa)", () => {
    expect(previewTaskReward(rules, { priority: "Alta", habitId: "h1" }, "2026-10-22")).toEqual({ xp: 8, coins: 1, fromHabit: true });
  });

  it("rótulos de origem de XP", () => {
    expect(xpSourceLabel("task")).toBe("Missões");
    expect(xpSourceLabel("day")).toBe("Bônus do dia");
    expect(xpSourceLabel("desconhecida")).toBe("desconhecida");
  });

  it("estado das últimas missões (concluída, atrasada, em andamento)", () => {
    const t = (id: string, status: string, due: string | null, created: string, completed: string | null = null) => ({ id, title: id, status, due_date: due, completed_at: completed, created_at: created });
    const out = lastMissions(
      [
        t("a", "Concluído", null, "2026-10-01 10:00:00", "2026-10-22 23:00:00"),
        t("b", "A Fazer", "2026-10-20", "2026-10-21 10:00:00"),
        t("c", "Em Andamento", null, "2026-10-22 09:00:00"),
      ],
      "2026-10-22",
    );
    expect(out.map((m) => [m.task.id, m.state])).toEqual([
      ["a", "done"],
      ["c", "doing"],
      ["b", "overdue"],
    ]);
  });
});

describe("formatação de arquivos", () => {
  it("tamanho legível", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
