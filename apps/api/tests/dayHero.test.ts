import { describe, expect, it } from "vitest";
import { elapsedMs, focusBlocks, nextBestAction } from "../src/services/todayHubService.js";
import { averageDims, levelMilestones } from "../src/services/heroDashboardService.js";

const base = { conflicts: [], missions: [], main: null, habits: { items: [], done: 0, total: 0 }, indicators: { prioritiesDone: 0, prioritiesTotal: 0, focusMinutes: 0, focusSessions: 0, missionsDone: 0 } };

describe("Hoje — cronômetro e próxima ação", () => {
  it("tempo efetivo desconta pausas e congela quando pausado", () => {
    const s = { startedAt: "2026-11-02T10:00:00.000Z", pausedAt: null, pausedMs: 5 * 60_000 };
    expect(elapsedMs(s, Date.parse("2026-11-02T10:30:00.000Z"))).toBe(25 * 60_000);
    expect(elapsedMs({ ...s, pausedAt: "2026-11-02T10:20:00.000Z" }, Date.parse("2026-11-02T11:00:00.000Z"))).toBe(15 * 60_000);
  });
  it("ordem da próxima ação: conflito > atrasada > principal > hábito > foco", () => {
    expect(nextBestAction({ ...base, conflicts: [{ a: "A", b: "B", minutes: 10 }] } as never).kind).toBe("conflict");
    expect(nextBestAction({ ...base, missions: [{ id: "t", title: "T", overdue: true }] } as never).kind).toBe("overdue");
    expect(nextBestAction({ ...base, habits: { items: [{ id: "h", name: "H", done: false }], done: 0, total: 1 } } as never).kind).toBe("habit");
    expect(nextBestAction(base as never).kind).toBe("focus");
  });
  it("blocos de foco evitam compromissos", () => {
    const b = focusBlocks({ agenda: [{ allDay: false, startsAt: "2026-11-02T09:00:00", endsAt: "2026-11-02T10:00:00" }] } as never, 8 * 60, 2);
    expect(b).toEqual([{ start: "08:00", end: "08:50" }, { start: "10:00", end: "10:50" }]);
  });
});

describe("Painel do Herói", () => {
  it("média ignora dias sem dado (não vira zero)", () => {
    const r = averageDims([{ productivity: 80, health: null, habits: 50, goals: null, reading: null, education: null, professional: null }, { productivity: 60, health: null, habits: null, goals: null, reading: null, education: null, professional: null }]);
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
