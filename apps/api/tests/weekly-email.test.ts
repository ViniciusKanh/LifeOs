import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";

describe("Resumo semanal por e-mail", () => {
  it("preferência começa desligada e pode ser ligada/desligada", async () => {
    const { agent } = await createAuthenticatedAgent();

    const initial = await agent.get("/api/reviews/weekly/email-settings");
    expect(initial.status).toBe(200);
    expect(initial.body.enabled).toBe(false);

    const turnOn = await agent.patch("/api/reviews/weekly/email-settings").send({ enabled: true });
    expect(turnOn.status).toBe(200);
    expect(turnOn.body.enabled).toBe(true);

    const check = await agent.get("/api/reviews/weekly/email-settings");
    expect(check.body.enabled).toBe(true);

    const turnOff = await agent.patch("/api/reviews/weekly/email-settings").send({ enabled: false });
    expect(turnOff.body.enabled).toBe(false);
  });

  it("'me envie agora' retorna erro claro quando o SMTP não está configurado (sem admin configurar nada nos testes)", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.post("/api/reviews/weekly/send-email");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SMTP/);
  });

  it("endpoint de cron recusa sem o segredo correto", async () => {
    const { agent } = await createAuthenticatedAgent();
    process.env.CRON_SECRET = "segredo-de-teste";
    try {
      const noHeader = await agent.get("/api/cron/weekly-emails");
      expect(noHeader.status).toBe(401);

      const wrongSecret = await agent.get("/api/cron/weekly-emails").set("Authorization", "Bearer errado");
      expect(wrongSecret.status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("endpoint de cron aceita o segredo correto e reporta quantos foram enviados/pulados", async () => {
    const { agent } = await createAuthenticatedAgent();
    await agent.patch("/api/reviews/weekly/email-settings").send({ enabled: true });

    process.env.CRON_SECRET = "segredo-de-teste";
    try {
      const res = await agent.get("/api/cron/weekly-emails").set("Authorization", "Bearer segredo-de-teste");
      expect(res.status).toBe(200);
      expect(res.body.totalCandidates).toBeGreaterThanOrEqual(1);
      // SMTP não configurado nos testes — nenhum e-mail é de fato enviado, mas o
      // endpoint não deve lançar erro, e sim contar como "skipped".
      expect(res.body.sent).toBe(0);
      expect(res.body.skipped).toBeGreaterThanOrEqual(1);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
