import { describe, expect, it } from "vitest";
import { nextBestAction } from "../src/services/todayHubService.js";
import { averageDims, levelMilestones } from "../src/services/heroDashboardService.js";

const base = { conflicts: [], missions: [], main: null, habits: { items: [], done: 0, total: 0 }, indicators: { prioritiesDone: 0, prioritiesTotal: 0, missionsDone: 0 } };

describe("Hoje — próxima ação (sem Foco)", () => {
  it("ordem da próxima ação: conflito > atrasada > principal > prioridade > hábito > descanso", () => {
    expect(nextBestAction({ ...base, conflicts: [{ a: "A", b: "B", minutes: 10 }] } as never).kind).toBe("conflict");
    expect(nextBestAction({ ...base, missions: [{ id: "t", title: "T", overdue: true }] } as never).kind).toBe("overdue");
    expect(nextBestAction({ ...base, main: { id: "m", title: "Principal", status: "A Fazer" } } as never).text).not.toMatch(/foco|pomodoro/i);
    expect(nextBestAction({ ...base, focusNow: [{ id: "p", title: "P" }] } as never).kind).toBe("focus_now");
    expect(nextBestAction({ ...base, habits: { items: [{ id: "h", name: "H", done: false }], done: 0, total: 1 } } as never).kind).toBe("habit");
    expect(nextBestAction(base as never).kind).toBe("rest");
  });
});

describe("Painel do Herói", () => {
  it("média ignora dias sem dado (não vira zero)", () => {
    const r = averageDims([{ productivity: 80, health: null, habits: 50, education: null, knowledge: null, code: null }, { productivity: 60, health: null, habits: null, education: null, knowledge: null, code: null }]);
    expect(r.productivity).toBe(70);
    expect(r.habits).toBe(50);
    expect(r.health).toBeNull();
  });
  it("marcos por nível seguem títulos oficiais", () => {
    const m = levelMilestones(5, new Set());
    expect(m[0]!.minLevel).toBeLessThanOrEqual(m[1]!.minLevel);
    expect(m.filter((x) => x.unlocked).every((x) => x.minLevel <= 5)).toBe(true);
  });
});
