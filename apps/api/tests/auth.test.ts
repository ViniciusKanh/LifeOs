import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Autenticação", () => {
  it("cadastro cria conta não verificada e recusa login antes da confirmação", async () => {
    const email = `novo-${Date.now()}@teste.lifeos`;
    const registerRes = await request(app).post("/api/auth/register").send({
      name: "Pessoa Nova",
      email,
      password: "SenhaForte123!",
    });
    expect(registerRes.status).toBe(201);

    const loginRes = await request(app).post("/api/auth/login").send({
      email,
      password: "SenhaForte123!",
      rememberMe: false,
    });
    // Conta ainda não verificada: login deve ser recusado, não deve
    // simplesmente "funcionar mesmo assim" (regra central do fluxo).
    expect(loginRes.status).toBe(403);
  });

  it("recusa cadastro com e-mail já usado", async () => {
    const email = `duplicado-${Date.now()}@teste.lifeos`;
    const payload = { name: "Alguém", email, password: "SenhaForte123!" };
    const first = await request(app).post("/api/auth/register").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/auth/register").send(payload);
    expect(second.status).toBe(409);
  });

  it("recusa login com senha errada", async () => {
    const { email } = await createAuthenticatedAgent();
    const res = await request(app).post("/api/auth/login").send({ email, password: "senha-errada", rememberMe: false });
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me sem sessão retorna 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("usuário autenticado consegue ler o próprio perfil", async () => {
    const { agent, email } = await createAuthenticatedAgent();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.password_hash).toBeUndefined();
  });
});
