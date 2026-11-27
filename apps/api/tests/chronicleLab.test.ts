import { describe, expect, it } from "vitest";
import { cycleStage, discoveryVerdict, researcherPoints } from "../src/services/chronicleLabService.js";
import { plainText } from "../src/services/textUtils.js";

describe("Texto puro", () => {
  it("remove HTML do editor", () => {
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
