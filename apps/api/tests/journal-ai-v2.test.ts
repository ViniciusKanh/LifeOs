import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { sanitizeSuggestion } from "../src/services/journalAIService.js";
import { responseText } from "../src/services/geminiService.js";

describe("Diário com IA v2", () => {
  it("junta todas as partes de texto e ignora o raciocínio do modelo", () => {
    const text = responseText({ candidates: [{ content: { parts: [{ text: "pensando…", thought: true }, { text: '{"a":' }, { text: "1}" }] } }] });
    expect(text).toBe('{"a":1}');
  });

  it("descrição visual só vale para fotos realmente enviadas; dia curto é aceito", () => {
    const s = sanitizeSuggestion(
      {
        title: "Dia calmo",
        highlights: ["Caminhei no parque"],
        gratitude: "A gratidão pela família aparece no passeio.",
        categories: [],
        photoNotes: [
          { id: "f1", description: "Um parque com árvores", suggestedCaption: "Fim de tarde" },
          { id: "f2", description: "Inventada" },
        ],
      },
      new Set(["f1", "f2"]),
      new Set(["f1"]),
    );
    expect(s?.highlights).toEqual(["Caminhei no parque"]);
    expect(s?.photoNotes.map((p) => p.id)).toEqual(["f1"]);
    expect(s?.photosAnalyzed).toBe(1);
    expect(sanitizeSuggestion({ categories: [] }, new Set())).toBeNull();
  });

  it("salva momentos, gratidão e legendas escolhidas; limpa tudo ao remover", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put("/api/journal/2030-04-02").send({ thoughts: "Fui ao parque.", gratitude: ["família"] });
    const applied = await agent.post("/api/journal/2030-04-02/ai/organize/apply").send({
      title: "Parque",
      summary: "Dia leve.",
      categories: [{ name: "Lazer", points: ["Parque"] }],
      highlights: ["Passeio no parque"],
      gratitude: "Grato pela família.",
    });
    expect(applied.status).toBe(200);
    expect(applied.body.ai.highlights).toEqual(["Passeio no parque"]);
    expect(applied.body.ai.gratitude).toBe("Grato pela família.");
    const cleared = await agent.delete("/api/journal/2030-04-02/ai/organize");
    expect(cleared.body.ai).toBeNull();
  });
});
