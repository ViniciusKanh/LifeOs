import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { EXPORTABLE_TABLES, stripSecrets } from "../src/routes/export.routes.js";

describe("Exportar meus dados (LGPD)", () => {
  it("exporta só os dados do próprio usuário, sem credenciais", async () => {
    const { agent: agentA, userId: a } = await createAuthenticatedAgent();
    const { agent: agentB, userId: b } = await createAuthenticatedAgent();
    const db = getDb();

    await agentA.post("/api/tasks").send({ title: "Tarefa do A" });
    await agentB.post("/api/tasks").send({ title: "Tarefa secreta do B" });
    await db.execute({ sql: "INSERT INTO water_entries (id, owner_id, amount_ml) VALUES (?, ?, 300)", args: [nanoid(), a] });
    // Segredos que nunca podem sair no arquivo.
    await db.execute({ sql: "UPDATE users SET mfa_secret = 'SEGREDO-MFA' WHERE id = ?", args: [a] });
    await db.execute({ sql: "UPDATE user_settings SET journal_pin_hash = 'HASH-DO-PIN' WHERE user_id = ?", args: [a] });
    await db.execute({
      sql: "INSERT INTO push_subscriptions (id, owner_id, endpoint, p256dh, auth) VALUES (?, ?, 'https://push.exemplo/abc', 'CHAVE-P256', 'CHAVE-AUTH')",
      args: [nanoid(), a],
    });

    const res = await agentA.get("/api/export/me");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/lifeos-export-\d{4}-\d{2}-\d{2}\.json/);
    const body = res.body as { profile: Record<string, unknown>; tables: string[]; data: Record<string, Array<Record<string, unknown>>> };

    expect(body.profile.id).toBe(a);
    expect(body.data.tasks.map((t) => t.title)).toEqual(["Tarefa do A"]);
    expect(body.data.water_entries).toHaveLength(1);
    expect(body.data.user_settings).toHaveLength(1);

    // Isolamento: nenhuma linha com dono diferente de A.
    for (const [table, rows] of Object.entries(body.data)) {
      for (const row of rows) {
        if ("owner_id" in row) expect(row.owner_id, table).toBe(a);
        if (table === "user_settings" || table === "life_map_links") expect(row.user_id, table).toBe(a);
      }
    }

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("Tarefa secreta do B");
    expect(raw).not.toContain(b);
    for (const secret of ["password_hash", "SEGREDO-MFA", "mfa_secret", "HASH-DO-PIN", "journal_pin_hash", "CHAVE-P256", "CHAVE-AUTH"]) {
      expect(raw).not.toContain(secret);
    }
    for (const forbidden of ["push_subscriptions", "password_reset_tokens", "email_verification_tokens", "mfa_recovery_codes", "desktop_auth_codes"]) {
      expect(body.tables).not.toContain(forbidden);
    }
  });

  it("todas as tabelas configuradas existem e são exportadas (inexistentes são ignoradas)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/export/me");
    expect(res.status).toBe(200);
    // Até a 0067 toda tabela listada existe no banco migrado.
    expect(res.body.tables).toEqual(EXPORTABLE_TABLES.map((t) => t.table));
  });

  it("remove colunas com cara de credencial de qualquer linha", () => {
    expect(stripSecrets({ id: "1", title: "ok", password_hash: "x", api_key: "y", refresh_token: "z", code_hash: "w" })).toEqual({ id: "1", title: "ok" });
  });

  it("exige autenticação e limita exportações repetidas (429 em PT-BR)", async () => {
    const anon = await (await import("supertest")).default((await import("../src/app.js")).app).get("/api/export/me");
    expect(anon.status).toBe(401);

    const { agent } = await createAuthenticatedAgent();
    for (let i = 0; i < 5; i++) expect((await agent.get("/api/export/me")).status).toBe(200);
    const limited = await agent.get("/api/export/me");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/exportou seus dados/);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
