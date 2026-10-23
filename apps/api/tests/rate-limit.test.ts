import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { aiRateLimit, rateLimit } from "../src/middleware/rateLimit.js";

/** App mínimo: simula o requireAuth preenchendo req.user a partir de um header. */
function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.use((req, _res, next) => {
    const uid = req.header("x-user");
    if (uid) (req as unknown as { user: { id: string } }).user = { id: uid };
    next();
  });
  const router = express.Router();
  router.post("/:date/ai/organize", limiter, (_req, res) => res.json({ ok: true }));
  app.use("/api/journal", router);
  return app;
}

describe("Rate limiting", () => {
  it("variar o parâmetro da URL não zera o contador (chave = rota declarada)", async () => {
    const app = buildApp(rateLimit({ windowMs: 60_000, max: 3 }));
    const statuses: number[] = [];
    for (let i = 1; i <= 4; i++) {
      statuses.push((await request(app).post(`/api/journal/2026-10-0${i}/ai/organize`).set("x-user", "u1")).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("limita por usuário autenticado: um usuário no limite não bloqueia outro", async () => {
    const app = buildApp(rateLimit({ windowMs: 60_000, max: 1 }));
    expect((await request(app).post("/api/journal/2026-10-01/ai/organize").set("x-user", "a")).status).toBe(200);
    expect((await request(app).post("/api/journal/2026-10-01/ai/organize").set("x-user", "a")).status).toBe(429);
    expect((await request(app).post("/api/journal/2026-10-01/ai/organize").set("x-user", "b")).status).toBe(200);
  });

  it("sem usuário, limita por IP; 429 traz mensagem em PT-BR e Retry-After", async () => {
    const app = buildApp(aiRateLimit(1));
    expect((await request(app).post("/api/journal/2026-10-01/ai/organize")).status).toBe(200);
    const res = await request(app).post("/api/journal/2026-10-01/ai/organize");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/IA/);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});
