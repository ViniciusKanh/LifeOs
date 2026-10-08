import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

/** LifeOS Desktop (Tauri): sessão por Bearer só para o cliente identificado. */
describe("Autenticação do LifeOS Desktop", () => {
  it("login do Desktop devolve o token por cabeçalho e ele autentica como Bearer", async () => {
    const { email } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    const login = await request(app).post("/api/auth/login").set("X-LifeOS-Client", "desktop").send({ email, password: "SenhaForte123!", rememberMe: true });
    expect(login.status).toBe(200);
    const token = login.headers["x-lifeos-session"];
    expect(typeof token).toBe("string");

    const me = await request(app).get("/api/auth/me").set("X-LifeOS-Client", "desktop").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it("Bearer sem o cabeçalho do cliente Desktop é ignorado e a Web não recebe o token", async () => {
    const { email } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    const web = await request(app).post("/api/auth/login").send({ email, password: "SenhaForte123!", rememberMe: false });
    expect(web.headers["x-lifeos-session"]).toBeUndefined();
    const desktop = await request(app).post("/api/auth/login").set("X-LifeOS-Client", "desktop").send({ email, password: "SenhaForte123!", rememberMe: false });
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${desktop.headers["x-lifeos-session"]}`);
    expect(me.status).toBe(401);
  });

  it("token revogado (sair de todos os dispositivos) deixa de valer no Desktop", async () => {
    const { email } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    const login = await request(app).post("/api/auth/login").set("X-LifeOS-Client", "desktop").send({ email, password: "SenhaForte123!", rememberMe: true });
    const auth = { "X-LifeOS-Client": "desktop", Authorization: `Bearer ${login.headers["x-lifeos-session"]}` };
    expect((await request(app).post("/api/auth/logout-all").set(auth)).status).toBeLessThan(300);
    expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(401);
  });

  it("CORS aceita a origem do app Tauri e expõe o cabeçalho de sessão; origem estranha não", async () => {
    const ok = await request(app).options("/api/auth/me").set("Origin", "http://tauri.localhost").set("Access-Control-Request-Method", "GET").set("Access-Control-Request-Headers", "authorization,x-lifeos-client");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
    expect(String(ok.headers["access-control-allow-headers"]).toLowerCase()).toContain("x-lifeos-client");
    const get = await request(app).get("/api/auth/google/status").set("Origin", "http://tauri.localhost");
    expect(String(get.headers["access-control-expose-headers"])).toContain("X-LifeOS-Session");
    const bad = await request(app).options("/api/auth/me").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "GET");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
