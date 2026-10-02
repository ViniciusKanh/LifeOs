import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { tokenize, normalizeWord } from "../src/services/journalWordsService.js";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("Nuvem de palavras do Diário", () => {
  it("tokeniza com acentos e normaliza para comparar", () => {
    expect(tokenize("Família, café e a reunião!")).toEqual(["Família", "café", "reunião"]);
    expect(normalizeWord("Família")).toBe("familia");
  });

  it("conta palavras reais, ignora palavras vazias e respeita palavras escondidas", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.put(`/api/journal/${daysAgo(1)}`).send({ thoughts: "<p>Hoje a família foi ao parque. Família reunida!</p>" });
    await agent.put(`/api/journal/${daysAgo(2)}`).send({ thoughts: "<p>Treino cedo e depois trabalho com a família.</p>" });

    const res = await agent.get("/api/journal/insights/words?period=30");
    expect(res.status).toBe(200);
    expect(res.body.entries).toBe(2);
    const familia = res.body.words.find((w: { word: string }) => w.word === "família");
    expect(familia).toMatchObject({ count: 3, days: 2 });
    const words = res.body.words.map((w: { word: string }) => w.word);
    for (const stop of ["hoje", "foi", "com", "depois"]) expect(words).not.toContain(stop);

    expect((await agent.post("/api/journal/insights/words/exclusions").send({ word: "Família" })).status).toBe(204);
    const hidden = await agent.get("/api/journal/insights/words?period=30");
    expect(hidden.body.words.map((w: { word: string }) => w.word)).not.toContain("família");
    expect(hidden.body.excluded).toContain("familia");

    await agent.delete("/api/journal/insights/words/exclusions/familia");
    const back = await agent.get("/api/journal/insights/words?period=30");
    expect(back.body.words.map((w: { word: string }) => w.word)).toContain("família");
  });

  it("não lê entradas de outro usuário", async () => {
    const a = await createAuthenticatedAgent();
    const b = await createAuthenticatedAgent();
    await a.agent.put(`/api/journal/${daysAgo(1)}`).send({ thoughts: "<p>segredo segredo segredo</p>" });
    const res = await b.agent.get("/api/journal/insights/words?period=all");
    expect(res.body.words).toHaveLength(0);
  });
});
