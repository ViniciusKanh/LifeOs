import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

// Gemini simulado: o teste define a resposta "do modelo".
const gemini = vi.hoisted(() => ({ next: "" as string, lastPrompt: "" as string }));
vi.mock("../src/services/geminiService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/geminiService.js")>();
  return {
    ...actual,
    getGeminiConfig: async () => ({ apiKey: "teste", model: "gemini-teste" }),
    generateText: async (prompt: string) => {
      gemini.lastPrompt = prompt;
      return { ok: true as const, text: gemini.next };
    },
  };
});

const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  gemini.next = "";
  gemini.lastPrompt = "";
});

describe("Diário — texto corrido", () => {
  it("salva 'Como foi meu dia' e ignora o fechamento e os campos guiados antigos", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent
      .put(`/api/journal/${today}`)
      .send({ thoughts: "<p>Dia corrido, mas bom.</p>", nightTakeaway: "<p>Começar pelo relatório</p>", intention: "ignorado", nightMood: 4 });
    expect(res.status).toBe(200);
    expect(res.body.thoughts).toBe("<p>Dia corrido, mas bom.</p>");
    // Fechamento do dia removido: o PUT não grava mais nightTakeaway.
    expect(res.body.nightTakeaway).toBeNull();
    expect(res.body.intention).toBeNull();
    expect(res.body.nightMood).toBeNull();
  });
});

describe("Diário — proteção contra perda de texto", () => {
  it("texto vazio ou campo omitido nunca apagam a crônica salva", async () => {
    const { agent } = await createAuthenticatedAgent();
    const texto = "<p>Treinei muay thai, terminei o relatório e li 20 páginas. Dia muito produtivo.</p>";
    await agent.put(`/api/journal/${today}`).send({ thoughts: texto, tags: ["treino"] });

    // Um form vazio (como o que causava a perda) não pode sobrescrever.
    const vazio = await agent.put(`/api/journal/${today}`).send({ thoughts: "<p></p>", gratitude: [] });
    expect(vazio.status).toBe(200);
    expect(vazio.body.thoughts).toBe(texto);

    // Campo omitido mantém o valor salvo (tags continuam lá).
    const parcial = await agent.put(`/api/journal/${today}`).send({ selfCare: [] });
    expect(parcial.body.thoughts).toBe(texto);
    expect(parcial.body.tags).toEqual(["treino"]);
  });

  it("sem controle de versões: baseUpdatedAt antigo não bloqueia mais o salvamento", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put(`/api/journal/${today}`).send({ thoughts: "<p>primeira versão</p>" });
    const res = await agent.put(`/api/journal/${today}`).send({ thoughts: "<p>segunda versão</p>", baseUpdatedAt: "2000-01-01 00:00:00" });
    expect(res.status).toBe(200);
    expect(res.body.thoughts).toBe("<p>segunda versão</p>");
  });
});

describe("Diário — Escriba (crônica completa)", () => {
  it("usa o texto da tela (não o salvo) e devolve os dados reais usados", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/health/water").send({ amountMl: 2000, recordedAt: `${today}T12:00:00.000Z` });
    gemini.next = JSON.stringify({ text: "Hoje acordei cedo, treinei e bebi 2 L de água ao longo do dia.", title: "Dia de treino" });
    // Nada salvo no banco ainda: antes isso dava "escreva pelo menos 15 palavras".
    const res = await agent.post(`/api/chronicle-entry/${today}/chronicle`).send({ consent: true, text: "<p>acordei cedo e treinei</p>" });
    expect(res.status).toBe(200);
    expect(res.body.text).toContain("treinei");
    expect(res.body.dataUsed.some((d: { text: string }) => d.text.includes("Água"))).toBe(true);
    expect(gemini.lastPrompt).toContain("acordei cedo e treinei");

    const scribe = await agent.post(`/api/chronicle-entry/${today}/scribe`).send({ action: "summary", consent: true, text: "<p>acordei cedo e treinei bastante</p>" });
    expect(scribe.status).not.toBe(422);
  });
});

describe("Diário — assistente de escrita da IA", () => {
  it("usa só fatos reais do dia, devolve a procedência e não grava nada", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/health/water").send({ amountMl: 1500, recordedAt: `${today}T10:00:00.000Z` });
    await agent.put(`/api/journal/${today}`).send({ thoughts: "<p>Acordei cedo.</p>" });

    gemini.next = JSON.stringify({
      questions: ["Como você se sentiu depois de beber 1,5 L de água?", 42],
      draft: "Também bebi 1,5 L de água ao longo do dia.",
      takeaways: ["Manter a água pela manhã"],
    });
    const res = await agent.post(`/api/journal/${today}/ai/assist`).send({ notes: "reunião longa" });
    expect(res.status).toBe(200);
    expect(res.body.questions).toEqual(["Como você se sentiu depois de beber 1,5 L de água?"]);
    expect(res.body.draft).toContain("1,5 L");
    expect(res.body.dataUsed).toContain("Água: 1.5 L");
    expect(gemini.lastPrompt).toContain("reunião longa");
    expect(gemini.lastPrompt).toContain("Acordei cedo.");

    // A sugestão não altera o texto salvo.
    const entry = await agent.get(`/api/journal/${today}`);
    expect(entry.body.thoughts).toBe("<p>Acordei cedo.</p>");
  });

  it("explica quando não há nada para trabalhar", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post(`/api/journal/2020-01-01/ai/assist`).send({});
    expect(res.status).toBe(422);
  });
});
