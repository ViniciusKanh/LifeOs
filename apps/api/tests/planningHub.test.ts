import { describe, expect, it } from "vitest";
import { bestStreak, findConflicts, missionTier, nextFreeSlot, streakEndingToday, wallMinutes } from "../src/services/planningHubService.js";

describe("planningHubService — regras puras", () => {
  it("detecta sobreposição só entre blocos do mesmo dia", () => {
    const c = findConflicts([
      { id: "a", title: "A", day: "2026-11-02", start: 540, end: 600 },
      { id: "b", title: "B", day: "2026-11-02", start: 570, end: 630 },
      { id: "c", title: "C", day: "2026-11-03", start: 570, end: 630 },
    ]);
    expect(c.map((x) => [x.a.id, x.b.id, x.overlapMinutes])).toEqual([["a", "b", 30]]);
  });
  it("sugere o próximo horário livre dentro da janela", () => {
    expect(nextFreeSlot([{ start: 540, end: 600 }, { start: 700, end: 720 }], 60, 600)).toBe(600);
    expect(nextFreeSlot([{ start: 0, end: 1440 }], 30, 0)).toBeNull();
  });
  it("combo: hoje sem conclusão não quebra; um dia vazio zera", () => {
    expect(streakEndingToday(new Set(["2026-11-01", "2026-10-31"]), "2026-11-02")).toBe(2);
    expect(streakEndingToday(new Set(["2026-10-30"]), "2026-11-02")).toBe(0);
    expect(bestStreak(new Set(["2026-10-01", "2026-10-02", "2026-10-05"]))).toBe(2);
  });
  it("categoria de missão segue a precedência", () => {
    const base = { status: "A Fazer", priority: "Média", difficulty: null, estimateMinutes: null, inCampaign: false, goalId: null };
    expect(missionTier({ ...base, status: "Concluído", difficulty: "epico" })).toBe("concluida");
    expect(missionTier({ ...base, estimateMinutes: 300, inCampaign: true })).toBe("epica");
    expect(missionTier({ ...base, priority: "Alta", goalId: "g" })).toBe("campanha");
    expect(missionTier({ ...base, priority: "Alta" })).toBe("prioritaria");
    expect(missionTier(base)).toBe("comum");
  });
  it("lê hora de parede e ignora eventos de dia inteiro", () => {
    expect(wallMinutes("2026-11-02T09:30:00")).toBe(570);
    expect(wallMinutes("2026-11-02")).toBeNull();
  });
});
