import { describe, expect, it } from "vitest";
import { achievementRarity, achievementState, archetypeChanges, chainStage, deterministicNarration, enrichAchievements, etaDays, metricInfo, summarize, weeklyStreak } from "../src/services/heroHubService.js";

type A = Parameters<typeof enrichAchievements>[0][number];
const ach = (id: string, metric: string, threshold: number, tier: A["tier"], current: number, unlockedAt: string | null = null): A => ({
  id,
  code: id,
  title: id,
  description: null,
  icon: null,
  metric,
  threshold,
  tier,
  progress: Math.min(100, Math.round((current / threshold) * 100)),
  unlockedAt,
  currentValue: current,
  category: "missoes",
  reward: { xp: 10, coins: 2 },
});

describe("Perfil do Herói — conquistas", () => {
  it("raridade segue o tier e a posição na cadeia", () => {
    expect(achievementRarity({ tier: "bronze", metric: "x" }, null)).toBe("comum");
    expect(achievementRarity({ tier: "gold", metric: "x" }, null)).toBe("rara");
    expect(achievementRarity({ tier: "platinum", metric: "x" }, { index: 1, length: 3 })).toBe("epica");
    expect(achievementRarity({ tier: "platinum", metric: "x" }, { index: 2, length: 3 })).toBe("lendaria");
    expect(achievementRarity({ tier: "platinum", metric: "achievements_unlocked_total" }, null)).toBe("mitica");
  });

  it("etapas da cadeia vão de Fundamentos a Maestria", () => {
    expect([0, 1, 2, 3].map((i) => chainStage(i, 4))).toEqual(["Fundamentos", "Consistência", "Disciplina", "Maestria"]);
    expect(chainStage(1, 2)).toBe("Maestria");
    expect(chainStage(0, 1)).toBe("Fundamentos");
  });

  it("estados: resgatada só com pagamento; bloqueada sem o elo anterior", () => {
    expect(achievementState({ unlockedAt: "2026-01-01", currentValue: 5 }, true, true)).toBe("resgatada");
    expect(achievementState({ unlockedAt: "2026-01-01", currentValue: 5 }, false, true)).toBe("desbloqueada");
    expect(achievementState({ unlockedAt: null, currentValue: 3 }, false, false)).toBe("bloqueada");
    expect(achievementState({ unlockedAt: null, currentValue: 0 }, false, true)).toBe("nao_iniciada");
  });

  it("enriquece cadeias por métrica sem misturar métricas", () => {
    const list = enrichAchievements([ach("a1", "tasks_completed_total", 10, "bronze", 12, "2026-01-01"), ach("a2", "tasks_completed_total", 50, "silver", 12), ach("b1", "books_completed_total", 1, "bronze", 0)], new Map([["a1", "2026-01-01"]]));
    expect(list.find((a) => a.id === "a1")!.state).toBe("resgatada");
    expect(list.find((a) => a.id === "a2")!.state).toBe("em_progresso");
    expect(list.find((a) => a.id === "a2")!.remaining).toBe(38);
    expect(list.find((a) => a.id === "b1")!.chain).toBeNull();
    expect(metricInfo("water_ml_in_day").scope).toBe("Melhor dia já registrado");
  });
});

describe("Tesouro e Build", () => {
  it("ETA usa o ritmo real e devolve null sem ritmo", () => {
    expect(etaDays(30, 300)).toBe(3);
    expect(etaDays(0, 0)).toBe(0);
    expect(etaDays(10, 0)).toBeNull();
  });
  it("sequência semanal de resgates", () => {
    expect(weeklyStreak(new Set(["2026-10-26", "2026-10-19", "2026-10-05"]), "2026-10-26")).toBe(2);
    expect(weeklyStreak(new Set(["2026-10-19"]), "2026-10-26")).toBe(1);
  });
  it("mudanças de arquétipo só entre fotografias consecutivas diferentes", () => {
    const s = (id: string, a: string, at: string) => ({ id, periodKey: id, origin: "auto" as const, archetypeId: a, archetypeName: a, affinity: 80, scores: {}, createdAt: at });
    expect(archetypeChanges([s("1", "mago", "2026-01-01"), s("2", "mago", "2026-01-08"), s("3", "arqueiro", "2026-01-15")])).toEqual([{ from: "mago", to: "arqueiro", at: "2026-01-15", snapshotId: "3" }]);
  });
});

describe("Crônica 2.0", () => {
  it("resume por origem dentro do recorte", () => {
    const rows = [
      { source_type: "task", day_key: "2026-11-01", xp: 20 },
      { source_type: "task", day_key: "2026-11-02", xp: 10 },
      { source_type: "habit_entry", day_key: "2026-11-02", xp: 5 },
      { source_type: "task", day_key: "2026-10-01", xp: 99 },
    ];
    const s = summarize(rows, "2026-11-01", "2026-11-02");
    expect(s.xp).toBe(35);
    expect(s.activities).toBe(3);
    expect(s.activeDays).toBe(2);
    expect(s.top[0]).toMatchObject({ source: "task", xp: 30, count: 2 });
  });
  it("narração sem dados avisa em vez de inventar", () => {
    expect(deterministicNarration("rpg", [], true)[0]).toMatch(/poucos registros/);
    expect(deterministicNarration("analitico", ["a", "b"], false)).toEqual(["a", "b"]);
  });
});
