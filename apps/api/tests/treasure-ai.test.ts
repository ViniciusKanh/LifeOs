import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

// Só a configuração é simulada; generateText real roda contra um fetch falso,
// testando timeout, nova tentativa e saída estruturada de ponta a ponta.
vi.mock("../src/services/geminiService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/geminiService.js")>();
  return { ...actual, getGeminiConfig: async () => ({ apiKey: "teste", model: "gemini-teste" }) };
});

type FakeReply = { status: number; body?: unknown } | "abort";
let replies: FakeReply[] = [];
let calls = 0;
let lastBody: { generationConfig?: { responseMimeType?: string }; contents?: Array<{ parts: Array<{ text: string }> }> } | null = null;

beforeEach(() => {
  replies = [];
  calls = 0;
  lastBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      calls += 1;
      lastBody = init?.body ? JSON.parse(init.body) : null;
      const next = replies.shift() ?? { status: 500 };
      if (next === "abort") throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return { ok: next.status < 400, status: next.status, json: async () => next.body } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const modelText = (text: string) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });
const suggestion = (over: Record<string, unknown> = {}) => ({
  name: "Tarde de jogos de tabuleiro",
  description: "Reunir amigos para jogar.",
  category: "social",
  rarity: "raro",
  suggestedCost: 30,
  currency: "COIN",
  cooldown: "weekly",
  reason: "Você resgata mais recompensas sociais.",
  iconKeyword: "jogo",
  ...over,
});
const suggest = (agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"], body: Record<string, unknown> = { mode: "quick" }) =>
  agent.post("/api/gamification/rewards/ai/suggest").send(body);

describe("Gemini — gerar recompensas", () => {
  it("valida e normaliza a saída estruturada, marca parecidas e não salva nada", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/gamification/rewards").send({ name: "Café especial", cost: 8 });
    replies = [
      modelText(
        JSON.stringify({
          suggestions: [
            suggestion(),
            suggestion({ name: "Café Especial!", suggestedCost: 99999, rarity: "mitico", category: "x", cooldown: "sempre" }),
            suggestion({ name: "Tarde de jogos de tabuleiro" }),
          ],
        }),
      ),
    ];
    const res = await suggest(agent, { mode: "custom", freeTime: "Gosto de jogos", categories: ["social"] });
    expect(res.status).toBe(200);
    expect(lastBody?.generationConfig?.responseMimeType).toBe("application/json");
    const s = res.body.suggestions;
    expect(s).toHaveLength(2); // duplicata dentro da própria resposta é descartada
    expect(s[0]).toMatchObject({ category: "social", rarity: "raro", cost: 30, limitPeriod: "week", art: "gamepad", similarTo: null });
    expect(s[1]).toMatchObject({ cost: 500, rarity: "comum", category: "personalizado", limitPeriod: "none", similarTo: "Café especial" });
    expect((await agent.get("/api/gamification/rewards")).body).toHaveLength(1);
    // Privacidade: o prompt leva só o resumo (nada de e-mail).
    expect(JSON.stringify(lastBody)).not.toContain("@teste.lifeos");
  });

  it("JSON inválido, schema inválido e lista vazia viram erros tratados", async () => {
    const { agent } = await createAuthenticatedAgent();
    replies = [modelText("isso não é json")];
    expect((await suggest(agent)).status).toBe(502);
    replies = [modelText(JSON.stringify({ suggestions: [{ name: "Sem preço" }] }))];
    expect((await suggest(agent)).status).toBe(502);
    replies = [modelText(JSON.stringify({ suggestions: [] }))];
    const empty = await suggest(agent);
    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe("empty");
  });

  it("429/500 e timeout: uma nova tentativa limitada e mensagem amigável", async () => {
    const { agent } = await createAuthenticatedAgent();
    replies = [{ status: 429, body: { error: { message: "quota" } } }, { status: 429 }];
    const r429 = await suggest(agent);
    expect(r429.status).toBe(502);
    expect(r429.body.error).toBe("Não foi possível gerar sugestões agora.");
    expect(calls).toBe(2);

    calls = 0;
    replies = [{ status: 500 }, modelText(JSON.stringify({ suggestions: [suggestion()] }))];
    expect((await suggest(agent)).status).toBe(200);
    expect(calls).toBe(2);

    calls = 0;
    replies = ["abort", "abort"];
    expect((await suggest(agent)).status).toBe(502);
    expect(calls).toBe(2);
  });

  it("entrada maliciosa/longa é recusada e o rate limit por usuário vale", async () => {
    const bad = await createAuthenticatedAgent();
    expect((await suggest(bad.agent, { mode: "custom", wishes: "x".repeat(2000) })).status).toBe(400);
    expect((await suggest(bad.agent, { mode: "hack" })).status).toBe(400);
    const { agent } = await createAuthenticatedAgent();
    for (let i = 0; i < 5; i++) {
      replies = [modelText(JSON.stringify({ suggestions: [suggestion({ name: `Ideia ${i} bem nova` })] }))];
      expect((await suggest(agent)).status).toBe(200);
    }
    expect((await suggest(agent)).status).toBe(429);
    // Outro usuário não é afetado.
    const other = await createAuthenticatedAgent();
    replies = [modelText(JSON.stringify({ suggestions: [suggestion()] }))];
    expect((await suggest(other.agent)).status).toBe(200);
  });

  it("só persiste o que o usuário confirma e ignora duplicadas", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/gamification/rewards").send({ name: "Spa em casa", cost: 35 });
    const res = await agent.post("/api/gamification/rewards/batch").send({
      rewards: [
        { name: "Tarde de jogos", cost: 30, category: "social", rarity: "raro", isAiGenerated: true },
        { name: "spa em casa", cost: 20 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: 1, skipped: ["spa em casa"] });
    const list = (await agent.get("/api/gamification/rewards")).body as Array<{ name: string; isAiGenerated: boolean }>;
    expect(list.find((r) => r.name === "Tarde de jogos")?.isAiGenerated).toBe(true);
  });
});
