import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Weekly Review — rascunho gerado pelo Copilot (POST /api/reviews/weekly/draft)", () => {
  it("exige sessão", async () => {
    const res = await request(app).post("/api/reviews/weekly/draft").send({});
    expect(res.status).toBe(401);
  });

  it("devolve erro claro quando o Gemini não está configurado (ambiente de teste)", async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.post("/api/reviews/weekly/draft?weekStartDate=2026-09-07");
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("não quebra para uma semana sem nenhum dado real (zero tarefas, hábitos e foco)", async () => {
    const { agent } = await createAuthenticatedAgent();

    // Semana sem nenhum registro no banco para este usuário novo — o
    // cálculo das métricas reais deve rodar normalmente (tudo zerado)
    // e só falhar depois, na chamada ao Gemini (não configurado aqui).
    const res = await agent.post("/api/reviews/weekly/draft?weekStartDate=2026-01-05");
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});
