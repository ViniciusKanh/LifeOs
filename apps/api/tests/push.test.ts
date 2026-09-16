import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Push notifications (Web Push/VAPID)", () => {
  it("expõe a chave pública VAPID sem exigir sessão", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(typeof res.body.publicKey).toBe("string");
    expect(res.body.publicKey.length).toBeGreaterThan(0);
  });

  it("exige sessão para inscrever, consultar ou remover uma inscrição", async () => {
    const sub = await request(app).post("/api/push/subscribe").send({});
    expect(sub.status).toBe(401);
    const get = await request(app).get("/api/push/subscribe");
    expect(get.status).toBe(401);
  });

  it("grava e remove uma inscrição real do usuário autenticado", async () => {
    const { agent } = await createAuthenticatedAgent();

    const before = await agent.get("/api/push/subscribe");
    expect(before.body.subscribed).toBe(false);

    const created = await agent.post("/api/push/subscribe").send({
      endpoint: "https://push.exemplo.com/abc123",
      keys: { p256dh: "chave-p256dh-de-teste", auth: "chave-auth-de-teste" },
    });
    expect(created.status).toBe(201);

    const after = await agent.get("/api/push/subscribe");
    expect(after.body.subscribed).toBe(true);
    expect(after.body.count).toBe(1);

    const removed = await agent.delete("/api/push/subscribe").send({ endpoint: "https://push.exemplo.com/abc123" });
    expect(removed.status).toBe(204);

    const afterRemove = await agent.get("/api/push/subscribe");
    expect(afterRemove.body.subscribed).toBe(false);
  });

  it("explica quando o teste é pedido sem inscrição sincronizada", async () => {
    const { agent } = await createAuthenticatedAgent();
    const result = await agent.post("/api/push/test");
    expect(result.status).toBe(409);
    expect(result.body.error).toContain("ainda não foi inscrito");
  });
});
