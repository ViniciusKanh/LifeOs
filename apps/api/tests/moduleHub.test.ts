import { describe, expect, it } from "vitest";
import { aggregateSleep, healthRank, MAX_SLEEP_MINUTES } from "../src/services/healthHubService.js";
import { academicPoints, academicRank } from "../src/services/educationHubService.js";
import { investStreak, treasuryRank, treasuryXp } from "../src/services/bankHubService.js";

describe("aggregateSleep (correção do '32h de sono')", () => {
  const tz = "America/Sao_Paulo";
  it("atribui a noite ao dia do despertar, atravessando a meia-noite no fuso do usuário", () => {
    const { nights } = aggregateSleep([{ id: "a", bed: "2026-11-01T02:00:00.000Z", wake: "2026-11-01T10:00:00.000Z", quality: 4 }], tz);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.day).toBe("2026-11-01");
    expect(nights[0]!.minutes).toBe(480);
  });
  it("registros duplicados/sobrepostos no mesmo dia contam uma vez (união dos intervalos)", () => {
    const e = { bed: "2026-11-01T02:00:00.000Z", wake: "2026-11-01T10:00:00.000Z", quality: 3 };
    const { nights } = aggregateSleep([{ id: "a", ...e }, { id: "b", ...e }, { id: "c", ...e }, { id: "d", ...e }], tz);
    expect(nights[0]!.minutes).toBe(480);
    expect(nights[0]!.merged).toBe(true);
  });
  it("cochilo separado soma, mas nunca passa de 16h; registro > 16h é sinalizado e ignorado", () => {
    const { nights, inconsistent } = aggregateSleep(
      [
        { id: "n", bed: "2026-11-01T02:00:00.000Z", wake: "2026-11-01T09:00:00.000Z", quality: null },
        { id: "z", bed: "2026-11-01T17:00:00.000Z", wake: "2026-11-01T18:00:00.000Z", quality: null },
        { id: "x", bed: "2026-10-30T02:00:00.000Z", wake: "2026-10-31T10:00:00.000Z", quality: null },
      ],
      tz,
    );
    expect(nights.find((n) => n.day === "2026-11-01")!.minutes).toBe(480);
    expect(inconsistent.map((i) => i.id)).toEqual(["x"]);
    expect(nights.every((n) => n.minutes <= MAX_SLEEP_MINUTES)).toBe(true);
  });
});

describe("ranks derivados", () => {
  it("rank do tesouro usa XP financeiro transparente", () => {
    expect(treasuryXp(100, 2, 1)).toBe(200);
    expect(treasuryRank(200).title).toBe("Cambista");
    expect(treasuryRank(0).next?.min).toBe(200);
  });
  it("sequência de investimento aceita terminar ontem", () => {
    expect(investStreak(new Set(["2026-11-01", "2026-10-31"]), "2026-11-02")).toBe(2);
    expect(investStreak(new Set(["2026-10-30"]), "2026-11-02")).toBe(0);
  });
  it("rank acadêmico e de saúde respeitam limiares", () => {
    expect(academicPoints({ studyMinutes: 600, subjectsDone: 1, deadlinesDone: 2, stagesDone: 1 })).toBe(100 + 30 + 30 + 40);
    expect(academicRank(300).title).toBe("Estudante Dedicado");
    expect(healthRank(149).level).toBe(1);
    expect(healthRank(850).next).toBeNull();
  });
});
