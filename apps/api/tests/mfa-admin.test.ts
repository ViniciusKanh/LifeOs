import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { currentStep, hotp } from "../src/services/totpService.js";
import { invalidateAuthState } from "../src/services/sessionService.js";

async function enableMfa(agent: ReturnType<typeof request.agent>) {
  const setup = await agent.post("/api/auth/mfa/setup");
  expect(setup.status).toBe(200);
  expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  const secret = String(setup.body.secret).replace(/\s+/g, "");
  const enable = await agent.post("/api/auth/mfa/enable").send({ code: hotp(secret, currentStep()) });
  expect(enable.status).toBe(200);
  expect(enable.body.recoveryCodes).toHaveLength(8);
  return { secret, recoveryCodes: enable.body.recoveryCodes as string[] };
}

async function makeAdmin(userId: string) {
  await getDb().execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [userId] });
  invalidateAuthState(userId);
}

describe("MFA por aplicativo autenticador", () => {
  it("ativa com um código válido e passa a exigir a 2ª etapa no login", async () => {
    const { agent, email } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    const { secret, recoveryCodes } = await enableMfa(agent);
    expect((await agent.get("/api/auth/me")).body.mfa_enabled).toBe(true);

    const step1 = await request(app).post("/api/auth/login").send({ email, password: "SenhaForte123!", rememberMe: true });
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.headers["set-cookie"]).toBeUndefined();

    const wrong = await request(app).post("/api/auth/login/mfa").send({ mfaToken: step1.body.mfaToken, code: "000000" });
    expect(wrong.status).toBe(401);

    // Código do próximo passo (o do passo atual já foi consumido na ativação).
    const code = hotp(secret, currentStep() + 1);
    const ok = await request(app).post("/api/auth/login/mfa").send({ mfaToken: step1.body.mfaToken, code });
    expect(ok.status).toBe(200);
    expect(ok.headers["set-cookie"]).toBeDefined();

    // O mesmo código não pode ser reutilizado.
    const replay = await request(app).post("/api/auth/login/mfa").send({ mfaToken: step1.body.mfaToken, code });
    expect(replay.status).toBe(401);

    // Código de recuperação vale uma única vez.
    const rec1 = await request(app).post("/api/auth/login/mfa").send({ mfaToken: step1.body.mfaToken, code: recoveryCodes[0] });
    expect(rec1.status).toBe(200);
    expect(rec1.body.usedRecoveryCode).toBe(true);
    const rec2 = await request(app).post("/api/auth/login/mfa").send({ mfaToken: step1.body.mfaToken, code: recoveryCodes[0] });
    expect(rec2.status).toBe(401);
  });

  it("não ativa com código errado", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.post("/api/auth/mfa/setup");
    const res = await agent.post("/api/auth/mfa/enable").send({ code: "123456" });
    expect(res.status).toBe(400);
    expect((await agent.get("/api/auth/me")).body.mfa_enabled).toBe(false);
  });
});

describe("Gestão de usuários pelo admin", () => {
  it("só admin acessa; reseta MFA, encerra sessões e mostra só contagens de uso", async () => {
    const admin = await createAuthenticatedAgent();
    await makeAdmin(admin.userId);
    const target = await createAuthenticatedAgent();
    await target.agent.post("/api/tasks").send({ title: "Tarefa privada do usuário" });
    await enableMfa(target.agent);

    // Usuário comum não acessa rotas de admin.
    expect((await target.agent.get(`/api/admin/users/${admin.userId}/overview`)).status).toBe(403);

    const overview = await admin.agent.get(`/api/admin/users/${target.userId}/overview`);
    expect(overview.status).toBe(200);
    expect(overview.body.usage.find((u: { key: string }) => u.key === "tasks").count).toBe(1);
    // Nunca expõe conteúdo nem segredos.
    expect(JSON.stringify(overview.body)).not.toContain("Tarefa privada do usuário");
    expect(JSON.stringify(overview.body)).not.toContain("mfa_secret");

    const reset = await admin.agent.post(`/api/admin/users/${target.userId}/mfa/reset`);
    expect(reset.status).toBe(200);
    // Reset encerra as sessões do usuário.
    expect((await target.agent.get("/api/auth/me")).status).toBe(401);

    const temp = await admin.agent.post(`/api/admin/users/${target.userId}/temp-password`);
    expect(temp.body.tempPassword).toMatch(/^Lf9-/);
    const login = await request(app).post("/api/auth/login").send({ email: target.email, password: temp.body.tempPassword });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBeUndefined();

    // Admin não usa estas ações em si mesmo.
    expect((await admin.agent.post(`/api/admin/users/${admin.userId}/revoke-sessions`)).status).toBe(400);
  });
});

describe("Termo, sessão e exclusão de conta", () => {
  it("registra o aceite do termo vigente", async () => {
    const { agent } = await createAuthenticatedAgent();
    const me = await agent.get("/api/auth/me");
    expect(me.body.terms_pending).toBe(true);
    const ok = await agent.post("/api/auth/accept-terms").send({ version: me.body.terms_current_version });
    expect(ok.status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.terms_pending).toBe(false);
    expect((await agent.post("/api/auth/accept-terms").send({ version: "1999-01-01" })).status).toBe(400);
  });

  it("sair de todos os dispositivos invalida o token antigo", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/auth/logout-all");
    expect(res.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("o próprio usuário exclui a conta com e-mail e senha", async () => {
    const { agent, email, userId } = await createAuthenticatedAgent({ password: "SenhaForte123!" });
    expect((await agent.delete("/api/auth/me").send({ confirmEmail: "outro@x.com", password: "SenhaForte123!" })).status).toBe(400);
    expect((await agent.delete("/api/auth/me").send({ confirmEmail: email, password: "errada" })).status).toBe(401);
    expect((await agent.delete("/api/auth/me").send({ confirmEmail: email, password: "SenhaForte123!" })).status).toBe(204);
    const gone = await getDb().execute({ sql: "SELECT id FROM users WHERE id = ?", args: [userId] });
    expect(gone.rows).toHaveLength(0);
  });
});
