import { describe, expect, it } from "vitest";
import { chroniclerPoints, cycleStage, discoveryVerdict, entryDayState, plainText, researcherPoints } from "../src/services/chronicleLabService.js";

describe("Diário 2.0 — regras puras", () => {
  it("estado do dia: vazio, iniciado e concluído", () => {
    expect(entryDayState(null)).toBe("none");
    expect(entryDayState({ thoughts: "", nightTakeaway: null, nightMood: null, gratitude: [] })).toBe("none");
    expect(entryDayState({ thoughts: "Hoje estudei", nightTakeaway: null, nightMood: null, gratitude: [] })).toBe("started");
    expect(entryDayState({ thoughts: "Hoje estudei", nightTakeaway: "Revisar cedo", nightMood: null, gratitude: [] })).toBe("done");
  });
  it("pontos do cronista não dependem de quantidade de palavras", () => {
    expect(chroniclerPoints({ days: 3, closedDays: 1, gratitudes: 2, retros: 1 })).toBe(30 + 5 + 4 + 15);
  });
  it("texto puro remove HTML do editor", () => {
    expect(plainText("<p>Olá&nbsp;<strong>mundo</strong></p><p>!</p>")).toBe("Olá mundo !");
  });
});

describe("Laboratório 2.0 — regras puras", () => {
  const base = { status: "draft", hypothesis: null, startDate: "2026-11-01", endDate: "2026-11-14", logs: 0, conclusion: null };
  it("ciclo de experimentação segue o estado real", () => {
    expect(cycleStage(base, "2026-11-02")).toBe("ideia");
    expect(cycleStage({ ...base, hypothesis: "x" }, "2026-11-02")).toBe("planejamento");
    expect(cycleStage({ ...base, status: "active" }, "2026-11-02")).toBe("execucao");
    expect(cycleStage({ ...base, status: "active", logs: 2 }, "2026-11-02")).toBe("coleta");
    expect(cycleStage({ ...base, status: "active", logs: 2 }, "2026-11-20")).toBe("analise");
    expect(cycleStage({ ...base, status: "completed", conclusion: "ok" }, "2026-11-20")).toBe("conclusao");
  });
  it("veredito nunca é 'comprovado' e inconclusivo é válido", () => {
    expect(discoveryVerdict({ status: "completed", perceivedResult: "improved" })).toBe("apoiada");
    expect(discoveryVerdict({ status: "completed", perceivedResult: "no_change" })).toBe("inconclusiva");
    expect(discoveryVerdict({ status: "completed", perceivedResult: null })).toBe("inconclusiva");
    expect(discoveryVerdict({ status: "cancelled", perceivedResult: "improved" })).toBe("interrompida");
  });
  it("pontos do pesquisador valorizam método, não resultado", () => {
    expect(researcherPoints({ logDays: 10, hypotheses: 2, documented: 1, stoppedDocumented: 1 })).toBe(30 + 10 + 40 + 15);
  });
});
