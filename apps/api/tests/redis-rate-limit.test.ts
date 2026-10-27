import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { invalidateAuthState } from "../src/services/sessionService.js";
import { rateLimit } from "../src/middleware/rateLimit.js";

/**
 * Fake mínimo do client @upstash/redis — testa a integração do LifeOS com
 * o SDK (lê config do banco, troca de backend, cai pro Map local se o
 * Redis falhar), não o protocolo REST da Upstash em si (responsabilidade
 * do próprio SDK, já teria sua própria suíte). `vi.hoisted` porque
 * `vi.mock` roda antes de qualquer import deste arquivo.
 */
const { FakeRedis } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, { value: string; expiresAt: number | null }>();
    static shouldThrow = false;

    async eval(_script: string, keys: string[], args: string[]): Promise<[number, number]> {
      if (FakeRedis.shouldThrow) throw new Error("Upstash indisponível (simulado)");
      const key = keys[0];
      const windowMs = Number(args[0]);
      const now = Date.now();
      const entry = this.store.get(key);
      if (!entry || (entry.expiresAt !== null && entry.expiresAt < now)) {
        const expiresAt = now + windowMs;
        this.store.set(key, { value: "1", expiresAt });
        return [1, windowMs];
      }
      const next = String(Number(entry.value) + 1);
      this.store.set(key, { value: next, expiresAt: entry.expiresAt });
      return [Number(next), Math.max(entry.expiresAt! - now, 0)];
    }

    async set(key: string, value: string, _opts?: { px: number }) {
      this.store.set(key, { value, expiresAt: null });
      return "OK";
    }

    async get(key: string) {
      return this.store.get(key)?.value ?? null;
    }

    async del(key: string) {
      this.store.delete(key);
      return 1;
    }
  }
  return { FakeRedis };
});

vi.mock("@upstash/redis", () => ({ Redis: FakeRedis }));

async function makeAdmin(userId: string) {
  await getDb().execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [userId] });
  invalidateAuthState(userId);
}

describe("Rate limiter — backend Redis (Upstash)", () => {
  beforeEach(() => {
    FakeRedis.shouldThrow = false;
  });

  it("sem credenciais configuradas, /admin/settings/redis/test avisa claramente", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await makeAdmin(userId);
    const res = await agent.post("/api/admin/settings/redis/test");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Configure a REST URL/);
  });

  it("admin salva credenciais do Redis sem expor o valor bruto depois", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await makeAdmin(userId);

    const saveUrl = await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_url", value: "https://fake-upstash.example.com" });
    expect(saveUrl.status).toBe(200);
    const saveToken = await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_token", value: "super-secret-token" });
    expect(saveToken.status).toBe(200);

    const settings = await agent.get("/api/admin/settings");
    const redisRows = (settings.body as Array<{ integration: string; key_name: string; masked_preview: string }>).filter((s) => s.integration === "redis");
    expect(redisRows).toHaveLength(2);
    for (const row of redisRows) {
      expect(row.masked_preview).not.toContain("super-secret-token");
      expect((row as { encrypted_value?: string }).encrypted_value).toBeUndefined();
    }

    const test = await agent.post("/api/admin/settings/redis/test");
    expect(test.status).toBe(200);
    expect(test.body.ok).toBe(true);
  });

  it("depois de configurado, o rate limiter usa o Redis em vez do Map local", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await makeAdmin(userId);
    await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_url", value: "https://fake-upstash.example.com" });
    await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_token", value: "super-secret-token" });

    const app = express();
    app.post("/limited", rateLimit({ windowMs: 60_000, max: 2 }), (_req, res) => res.json({ ok: true }));

    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await request(app).post("/limited")).status);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("se o Redis falhar no meio da requisição, cai pro Map local em vez de derrubar a rota", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await makeAdmin(userId);
    await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_url", value: "https://fake-upstash.example.com" });
    await agent.put("/api/admin/settings").send({ integration: "redis", keyName: "rest_token", value: "super-secret-token" });
    FakeRedis.shouldThrow = true;

    const app = express();
    app.post("/limited-fallback", rateLimit({ windowMs: 60_000, max: 5 }), (_req, res) => res.json({ ok: true }));

    const res = await request(app).post("/limited-fallback");
    expect(res.status).toBe(200);
  });
});
