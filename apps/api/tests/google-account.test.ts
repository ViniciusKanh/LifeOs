import { describe, it, expect, afterEach } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { resolveAppUrl } from "../src/services/googleAuthService.js";

function fakeReq(headers: Record<string, string>, protocol = "http") {
  return { protocol, get: (name: string) => headers[name.toLowerCase()] };
}

describe("Conta Google no Perfil — vincular/desvincular", () => {
  it("expõe google_linked e has_password em /me", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await getDb().execute({ sql: "UPDATE users SET google_id = ? WHERE id = ?", args: [`g-${userId}`, userId] });
    const me = await agent.get("/api/auth/me");
    expect(me.body.google_linked).toBe(true);
    expect(me.body.has_password).toBe(true);
    expect(me.body.google_id).toBeUndefined();
  });

  it("desvincula só com a senha correta", async () => {
    const { agent, userId } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    await getDb().execute({ sql: "UPDATE users SET google_id = ? WHERE id = ?", args: [`g2-${userId}`, userId] });

    expect((await agent.post("/api/auth/google/unlink").send({ password: "errada" })).status).toBe(401);
    const ok = await agent.post("/api/auth/google/unlink").send({ password: "SenhaForte123!" });
    expect(ok.status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.google_linked).toBe(false);
  });

  it("bloqueia desvincular conta sem senha própria até definir uma", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await getDb().execute({ sql: "UPDATE users SET google_id = ?, password_set = 0 WHERE id = ?", args: [`g3-${userId}`, userId] });

    const blocked = await agent.post("/api/auth/google/unlink").send({ password: "qualquer" });
    expect(blocked.status).toBe(409);

    const set = await agent.post("/api/auth/set-password").send({ newPassword: "NovaSenha456!" });
    expect(set.status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.has_password).toBe(true);

    // set-password não serve para trocar uma senha que já existe
    expect((await agent.post("/api/auth/set-password").send({ newPassword: "Outra789!" })).status).toBe(409);

    expect((await agent.post("/api/auth/google/unlink").send({ password: "NovaSenha456!" })).status).toBe(200);
  });
});

describe("resolveAppUrl — destino do redirect pós-login", () => {
  const original = process.env.APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  });

  it("em produção sem APP_URL usa o domínio da requisição (não localhost)", () => {
    delete process.env.APP_URL;
    expect(resolveAppUrl(fakeReq({ host: "lifeos-sigma-five.vercel.app", "x-forwarded-proto": "https" }))).toBe("https://lifeos-sigma-five.vercel.app");
  });

  it("ignora APP_URL de localhost quando a requisição veio de um domínio público", () => {
    process.env.APP_URL = "http://localhost:5173";
    expect(resolveAppUrl(fakeReq({ host: "lifeos-sigma-five.vercel.app", "x-forwarded-proto": "https" }))).toBe("https://lifeos-sigma-five.vercel.app");
  });

  it("respeita APP_URL público e mantém localhost:5173 no desenvolvimento", () => {
    process.env.APP_URL = "https://meu-dominio.com/";
    expect(resolveAppUrl(fakeReq({ host: "lifeos-sigma-five.vercel.app" }))).toBe("https://meu-dominio.com");
    delete process.env.APP_URL;
    expect(resolveAppUrl(fakeReq({ host: "localhost:3333" }))).toBe("http://localhost:5173");
  });
});
