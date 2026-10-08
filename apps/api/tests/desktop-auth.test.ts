import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { challengeFromVerifier, createDesktopHandoff } from "../src/services/desktopAuthService.js";

const newVerifier = () => crypto.randomBytes(32).toString("base64url");

describe("Login com Google no Desktop (deep link + PKCE)", () => {
  it("troca código + verificador por sessão, uma única vez", async () => {
    const { userId, email } = await createAuthenticatedAgent();
    const verifier = newVerifier();
    const code = await createDesktopHandoff(getDb(), userId, challengeFromVerifier(verifier));

    const app1 = request.agent(app);
    const ok = await app1.post("/api/auth/desktop/exchange").send({ code, verifier });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(email);
    expect((await app1.get("/api/auth/me")).body.id).toBe(userId);

    // Reuso do mesmo código nunca gera outra sessão.
    const again = await request(app).post("/api/auth/desktop/exchange").send({ code, verifier });
    expect(again.status).toBe(401);
  });

  it("recusa código interceptado sem o verificador do app", async () => {
    const { userId } = await createAuthenticatedAgent();
    const code = await createDesktopHandoff(getDb(), userId, challengeFromVerifier(newVerifier()));
    const res = await request(app).post("/api/auth/desktop/exchange").send({ code, verifier: newVerifier() });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("recusa código vencido e exige MFA quando ativo", async () => {
    const db = getDb();
    const { userId } = await createAuthenticatedAgent();
    const verifier = newVerifier();
    const expired = await createDesktopHandoff(db, userId, challengeFromVerifier(verifier));
    await db.execute({ sql: "UPDATE desktop_auth_codes SET expires_at = ? WHERE user_id = ?", args: [new Date(Date.now() - 1000).toISOString(), userId] });
    expect((await request(app).post("/api/auth/desktop/exchange").send({ code: expired, verifier })).status).toBe(401);

    await db.execute({ sql: "UPDATE users SET mfa_enabled = 1 WHERE id = ?", args: [userId] });
    const code = await createDesktopHandoff(db, userId, challengeFromVerifier(verifier));
    const res = await request(app).post("/api/auth/desktop/exchange").send({ code, verifier });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
