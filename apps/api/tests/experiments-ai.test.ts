import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

// O Gemini é simulado: o teste controla a resposta "do modelo" e verifica
// que o servidor valida tudo contra os catálogos antes de devolver/salvar.
const gemini = vi.hoisted(() => ({ next: "" as string, calls: 0 }));
vi.mock("../src/services/geminiService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/geminiService.js")>();
  return {
    ...actual,
    getGeminiConfig: async () => ({ apiKey: "teste", model: "gemini-teste" }),
    generateText: async () => {
      gemini.calls += 1;
      return { ok: true as const, text: gemini.next };
    },
  };
});

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

beforeEach(() => {
  gemini.next = "";
  gemini.calls = 0;
});

describe("IA dos Experimentos — desenho de experimentos", () => {
  it("descarta métricas, regras e categorias inventadas e calcula a base real no servidor", async () => {
    const { agent } = await createAuthenticatedAgent();
    for (let i = 1; i <= 6; i++) {
      await agent.post("/api/health/water").send({ amountMl: 1800, recordedAt: `${isoDate(addDays(new Date(), -i))}T10:00:00.000Z` });
    }
    gemini.next = "```json\n" + JSON.stringify({
      proposals: [
        {
          title: "Mais água pela manhã",
          category: "hidratacao",
          hypothesis: "Se eu beber 2,5 L, então terei mais energia.",
          rationale: "Você já registra água.",
          dailyAction: "Beber 500 ml ao acordar",
          primaryMetric: "water_ml",
          secondaryMetrics: ["energy", "inventada", "water_ml"],
          durationDays: 9,
          verificationRule: "water_target",
          verificationConfig: { targetMl: 999999 },
          successCriteriaType: "consistency",
          successCriteriaValue: 500,
        },
        { title: "Métrica falsa", hypothesis: "x", primaryMetric: "felicidade_total" },
        { title: "Categoria e regra falsas", category: "nao_existe", hypothesis: "Se eu meditar...", primaryMetric: "stress", verificationRule: "telepatia" },
      ],
    }) + "\n```";

    const res = await agent.post("/api/experiments/ai/design").send({ goal: "Quero ter mais energia à tarde" });
    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(2);

    const [water, stress] = res.body.proposals;
    expect(water.secondaryMetrics).toEqual(["energy"]);
    expect(water.verificationType).toBe("automatic");
    expect(water.verificationConfig.targetMl).toBe(6000); // limitado
    expect(water.successCriteriaValue).toBe(100);
    expect(water.durationDays % 7).toBe(0);
    expect(water.baseline.daysWithData).toBe(6); // calculado no servidor, não pela IA
    expect(water.baseline.mean).toBe(1800);

    expect(stress.category).toBe("personalizado");
    expect(stress.verificationType).toBe("manual");
    expect(stress.verificationRule).toBeNull();
  });

  it("valida o objetivo e responde 422 quando a IA não devolve nada aproveitável", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/experiments/ai/design").send({ goal: "oi" })).status).toBe(400);
    gemini.next = "não sei";
    const res = await agent.post("/api/experiments/ai/design").send({ goal: "Dormir melhor durante a semana" });
    expect(res.status).toBe(422);
  });
});

describe("IA dos Experimentos — check-in por relato e insights", () => {
  async function setup(verificationType: "manual" | "automatic" = "manual") {
    const { agent } = await createAuthenticatedAgent();
    const body: Record<string, unknown> = {
      title: "Dormir antes das 23h",
      category: "sono",
      startDate: isoDate(addDays(new Date(), -3)),
      endDate: isoDate(addDays(new Date(), 10)),
      primaryMetric: "sleep_duration",
      verificationType,
    };
    if (verificationType === "automatic") {
      body.verificationRule = "sleep_before";
      body.verificationConfig = { beforeTime: "23:00" };
    }
    const created = await agent.post("/api/experiments").send(body);
    return { agent, id: created.body.id as string };
  }

  it("propõe o check-in a partir do texto sem salvar nada", async () => {
    const { agent, id } = await setup();
    gemini.next = JSON.stringify({ checkinStatus: "done", perception: "muito_bom", notes: "Dormi às 22h30 e acordei bem.", reasoning: "disse que dormiu cedo" });
    const today = isoDate(new Date());
    const res = await agent.post(`/api/experiments/${id}/ai/parse-log`).send({ text: "dormi 22h30, acordei ótimo", date: today });
    expect(res.status).toBe(200);
    expect(res.body.checkinStatus).toBe("done");
    expect(res.body.perception).toBe("muito_bom");

    const detail = await agent.get(`/api/experiments/${id}`);
    expect(detail.body.logs).toHaveLength(0); // só proposta

    const future = await agent.post(`/api/experiments/${id}/ai/parse-log`).send({ text: "amanhã", date: isoDate(addDays(new Date(), 2)) });
    expect(future.status).toBe(400);
  });

  it("nunca propõe status em experimento automático", async () => {
    const { agent, id } = await setup("automatic");
    gemini.next = JSON.stringify({ checkinStatus: "done", perception: "inventado", notes: "ok" });
    const res = await agent.post(`/api/experiments/${id}/ai/parse-log`).send({ text: "fui dormir cedo", date: isoDate(new Date()) });
    expect(res.body.checkinStatus).toBeNull();
    expect(res.body.perception).toBeNull();
  });

  it("gera insights rotulados, salva no histórico e reaproveita sem nova chamada", async () => {
    const { agent, id } = await setup();
    gemini.next = JSON.stringify({
      headline: "Ainda coletando dados",
      summary: "Há poucos dias de registro.",
      items: [
        { kind: "dado", text: "0 dias de sono registrados durante o experimento." },
        { kind: "achismo", text: "isto deve ser descartado" },
        { kind: "sugestao", text: "Registre o sono todos os dias." },
      ],
      todayFocus: "Registrar o sono de hoje.",
      question: "O que atrapalhou dormir cedo?",
    });
    const first = await agent.post(`/api/experiments/${id}/ai/insights`).send({});
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(first.body.report.content.items.map((i: { kind: string }) => i.kind)).toEqual(["dado", "sugestao"]);

    const second = await agent.post(`/api/experiments/${id}/ai/insights`).send({});
    expect(second.body.cached).toBe(true);
    expect(gemini.calls).toBe(1);

    const reports = await agent.get(`/api/experiments/${id}/ai/reports`);
    expect(reports.body).toHaveLength(1);

    const other = await createAuthenticatedAgent();
    expect((await other.agent.get(`/api/experiments/${id}/ai/reports`)).status).toBe(404);
  });
});
