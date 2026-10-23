import "express-async-errors";
import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { nanoid } from "nanoid";
import { app } from "../src/app.js";
import { getDb } from "../src/db/client.js";
import { hashPassword } from "../src/services/authService.js";
import { guildRouter } from "../src/routes/guild.routes.js";
import { GUILD_LIMITS, guildTimelineEvents } from "../src/services/guildService.js";
import { todayKeyFor } from "../src/services/gamificationService.js";

/**
 * App mínimo com o router da Guilda — o registro em app.ts é feito pelo
 * coordenador; aqui a sessão vem do login real (cookie) no app principal,
 * que também garante as migrations aplicadas.
 */
const guildApp = express();
guildApp.use(express.json());
guildApp.use(cookieParser());
guildApp.use("/api/guild", guildRouter);
guildApp.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

async function createUser(opts: { email?: string; name?: string } = {}): Promise<TestUser> {
  const db = getDb();
  const email = opts.email ?? `${nanoid(8).toLowerCase()}@teste.lifeos`;
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 'user', 1)",
    args: [id, opts.name ?? "Aventureiro", email, await hashPassword("SenhaForte123!")],
  });
  await db.execute({ sql: "INSERT INTO user_settings (user_id) VALUES (?)", args: [id] });
  const login = await request(app).post("/api/auth/login").send({ email, password: "SenhaForte123!", rememberMe: false });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status} ${JSON.stringify(login.body)}`);
  const setCookie = login.headers["set-cookie"] as unknown as string[];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { id, email, cookie };
}

const get = (u: TestUser, path: string) => request(guildApp).get(path).set("Cookie", u.cookie);
const post = (u: TestUser, path: string, body: object = {}) => request(guildApp).post(path).set("Cookie", u.cookie).send(body);
const del = (u: TestUser, path: string) => request(guildApp).delete(path).set("Cookie", u.cookie);

async function seedContract(ownerId: string) {
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO contracts (id, owner_id, title, description, difficulty, status, due_date, why, stakes, reward_text)
          VALUES (?, ?, 'Correr a meia maratona', 'DESCRICAO-SECRETA', 'dificil', 'ativo', '2026-12-31', 'MOTIVO-SECRETO', 'APOSTA-SECRETA', 'PREMIO-SECRETO')`,
    args: [id, ownerId],
  });
  for (const [title, status] of [["TAREFA-SECRETA-1", "Concluído"], ["TAREFA-SECRETA-2", "A Fazer"], ["TAREFA-SECRETA-3", "Concluído"], ["TAREFA-SECRETA-4", "A Fazer"]]) {
    await db.execute({
      sql: `INSERT INTO tasks (id, owner_id, title, status, priority, contract_id, completed_at)
            VALUES (?, ?, ?, ?, 'Média', ?, ${status === "Concluído" ? "datetime('now')" : "NULL"})`,
      args: [nanoid(), ownerId, title, status, id],
    });
  }
  return id;
}

async function seedGoal(ownerId: string) {
  const id = nanoid();
  await getDb().execute({
    sql: "INSERT INTO goals (id, owner_id, title, description, kind, current_value, target_value, status) VALUES (?, ?, 'Ler 12 livros', 'NOTA-PRIVADA', 'numeric', 3, 12, 'active')",
    args: [id, ownerId],
  });
  return id;
}

/** Dono convida, convidado aceita: devolve o id do compartilhamento. */
async function shareAndAccept(owner: TestUser, invitee: TestUser, entityType: "contract" | "goal", entityId: string) {
  const inv = await post(owner, "/api/guild/shares", { entityType, entityId, email: invitee.email });
  expect(inv.status).toBe(201);
  const shareId = inv.body.share.id as string;
  const acc = await post(invitee, `/api/guild/invites/${shareId}/respond`, { accept: true });
  expect(acc.status).toBe(200);
  return shareId;
}

describe("Guilda — parceiro de compromisso", () => {
  it("convidado vê só o resumo calculado no servidor, sem campos privados", async () => {
    const owner = await createUser({ name: "Dona" });
    const partner = await createUser({ name: "Parceiro" });
    const contractId = await seedContract(owner.id);
    await shareAndAccept(owner, partner, "contract", contractId);

    const res = await get(partner, "/api/guild/overview");
    expect(res.status).toBe(200);
    expect(res.body.sharedWithMe).toHaveLength(1);
    const summary = res.body.sharedWithMe[0].summary;
    expect(summary).toMatchObject({
      entityType: "contract",
      title: "Correr a meia maratona",
      difficulty: "dificil",
      progressPct: 50,
      obligations: { done: 2, total: 4 },
      dueDate: "2026-12-31",
      status: "ativo",
      streakDays: 1,
    });
    // Nada do dono além do resumo.
    const raw = JSON.stringify(res.body);
    for (const secret of ["DESCRICAO-SECRETA", "MOTIVO-SECRETO", "APOSTA-SECRETA", "PREMIO-SECRETO", "TAREFA-SECRETA", contractId, owner.email]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("resumo de meta segue a regra de progresso da tela de Metas", async () => {
    const owner = await createUser();
    const partner = await createUser();
    const goalId = await seedGoal(owner.id);
    await shareAndAccept(owner, partner, "goal", goalId);
    const res = await get(partner, "/api/guild/overview");
    expect(res.body.sharedWithMe[0].summary).toMatchObject({ entityType: "goal", title: "Ler 12 livros", progressPct: 25, obligations: null, difficulty: null });
    expect(JSON.stringify(res.body)).not.toContain("NOTA-PRIVADA");
  });

  it("quem não foi convidado não vê nem consegue aceitar/torcer", async () => {
    const owner = await createUser();
    const partner = await createUser();
    const stranger = await createUser();
    const contractId = await seedContract(owner.id);
    const inv = await post(owner, "/api/guild/shares", { entityType: "contract", entityId: contractId, email: partner.email });
    const shareId = inv.body.share.id as string;

    const ov = await get(stranger, "/api/guild/overview");
    expect(ov.body.invites).toHaveLength(0);
    expect(ov.body.sharedWithMe).toHaveLength(0);
    expect(ov.body.myShares).toHaveLength(0);
    expect((await post(stranger, `/api/guild/invites/${shareId}/respond`, { accept: true })).status).toBe(404);

    await post(partner, `/api/guild/invites/${shareId}/respond`, { accept: true });
    expect((await post(stranger, `/api/guild/shared/${shareId}/cheers`, { kind: "testemunho" })).status).toBe(404);
    expect((await get(stranger, `/api/guild/shares?entityType=contract&entityId=${contractId}`)).body.shares).toHaveLength(0);
  });

  it("convidado não altera nada do dono (não revoga, não convida pelo item)", async () => {
    const owner = await createUser();
    const partner = await createUser();
    const contractId = await seedContract(owner.id);
    const shareId = await shareAndAccept(owner, partner, "contract", contractId);

    expect((await del(partner, `/api/guild/shares/${shareId}`)).status).toBe(404);
    // Dono não pode compartilhar item de outro usuário — nem o convidado o item do dono.
    expect((await post(partner, "/api/guild/shares", { entityType: "contract", entityId: contractId, email: "x@teste.lifeos" })).status).toBe(404);
    const status = await getDb().execute({ sql: "SELECT status FROM guild_shares WHERE id = ?", args: [shareId] });
    expect(status.rows[0]?.status).toBe("accepted");
  });

  it("dono não compartilha item de outro usuário", async () => {
    const owner = await createUser();
    const other = await createUser();
    const othersGoal = await seedGoal(other.id);
    const res = await post(owner, "/api/guild/shares", { entityType: "goal", entityId: othersGoal, email: "alguem@teste.lifeos" });
    expect(res.status).toBe(404);
  });

  it("após revogar, o parceiro perde o acesso na hora", async () => {
    const owner = await createUser();
    const partner = await createUser();
    const goalId = await seedGoal(owner.id);
    const shareId = await shareAndAccept(owner, partner, "goal", goalId);

    expect((await del(owner, `/api/guild/shares/${shareId}`)).status).toBe(204);
    expect((await get(partner, "/api/guild/overview")).body.sharedWithMe).toHaveLength(0);
    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "incentivo" })).status).toBe(404);
    // Revogado libera um convite novo para o mesmo e-mail.
    expect((await post(owner, "/api/guild/shares", { entityType: "goal", entityId: goalId, email: partner.email })).status).toBe(201);
  });

  it("limita a 1 testemunho por dia por compartilhamento e registra para o dono", async () => {
    const owner = await createUser();
    const partner = await createUser({ name: "Bardo" });
    const goalId = await seedGoal(owner.id);
    const shareId = await shareAndAccept(owner, partner, "goal", goalId);

    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "testemunho", text: "Vi você treinando hoje!" })).status).toBe(201);
    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "testemunho" })).status).toBe(409);
    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "incentivo", text: "x".repeat(141) })).status).toBe(400);
    for (let i = 0; i < GUILD_LIMITS.incentivesPerDayPerShare; i++) {
      expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "incentivo" })).status).toBe(201);
    }
    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "incentivo" })).status).toBe(429);

    const mine = (await get(owner, "/api/guild/overview")).body.myShares[0];
    expect(mine.partnerName).toBe("Bardo");
    expect(mine.testimonyCount).toBe(1);
    expect(mine.cheers.some((c: { text: string | null }) => c.text === "Vi você treinando hoje!")).toBe(true);

    // Timeline do dono: 1 evento de aceite + testemunhos agrupados no dia.
    const today = await todayKeyFor(getDb(), owner.id);
    const events = await guildTimelineEvents(getDb(), owner.id, today, today);
    expect(events.filter((e) => e.id.startsWith("guild-accept-"))).toHaveLength(1);
    expect(events.filter((e) => e.id.startsWith("guild-testemunho-"))).toHaveLength(1);
    // Testemunho não gera XP (não é ação do próprio jogador).
    const xp = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ?", args: [owner.id] });
    expect(Number(xp.rows[0]?.n)).toBe(0);
  });

  it("e-mail é case-insensitive e conta criada depois vê o convite pendente", async () => {
    const owner = await createUser();
    const goalId = await seedGoal(owner.id);
    const email = `${nanoid(6).toLowerCase()}@teste.lifeos`;
    const inv = await post(owner, "/api/guild/shares", { entityType: "goal", entityId: goalId, email: `  ${email.toUpperCase()} ` });
    expect(inv.status).toBe(201);
    expect(inv.body.share.inviteeEmail).toBe(email);
    expect((await post(owner, "/api/guild/shares", { entityType: "goal", entityId: goalId, email })).status).toBe(409);

    // Conta criada depois; enquanto o e-mail não está verificado não vê nem responde
    // (o login já exige verificação — aqui simulamos o estado direto no banco).
    const late = await createUser({ email });
    await getDb().execute({ sql: "UPDATE users SET email_verified = 0 WHERE id = ?", args: [late.id] });
    const before = await get(late, "/api/guild/overview");
    expect(before.body.emailVerified).toBe(false);
    expect(before.body.invites).toHaveLength(0);
    expect((await post(late, `/api/guild/invites/${inv.body.share.id}/respond`, { accept: true })).status).toBe(403);

    await getDb().execute({ sql: "UPDATE users SET email_verified = 1 WHERE id = ?", args: [late.id] });
    const after = await get(late, "/api/guild/overview");
    expect(after.body.invites).toHaveLength(1);
    expect((await get(late, "/api/guild/pending-count")).body.count).toBe(1);
    expect((await post(late, `/api/guild/invites/${inv.body.share.id}/respond`, { accept: false })).status).toBe(200);
    expect((await get(late, "/api/guild/overview")).body.invites).toHaveLength(0);
  });

  it("não deixa convidar a si mesmo e aplica limite diário de convites", async () => {
    const owner = await createUser();
    const goalId = await seedGoal(owner.id);
    expect((await post(owner, "/api/guild/shares", { entityType: "goal", entityId: goalId, email: owner.email.toUpperCase() })).status).toBe(400);

    const db = getDb();
    for (let i = 0; i < GUILD_LIMITS.invitesPerDay; i++) {
      await db.execute({
        sql: "INSERT INTO guild_shares (id, owner_id, entity_type, entity_id, invitee_email, status) VALUES (?, ?, 'goal', ?, ?, 'revoked')",
        args: [nanoid(), owner.id, goalId, `p${i}@teste.lifeos`],
      });
    }
    expect((await post(owner, "/api/guild/shares", { entityType: "goal", entityId: goalId, email: "novo@teste.lifeos" })).status).toBe(429);
  });

  it("parceiro pode sair e item apagado deixa de expor resumo", async () => {
    const owner = await createUser();
    const partner = await createUser();
    const goalId = await seedGoal(owner.id);
    const shareId = await shareAndAccept(owner, partner, "goal", goalId);
    await getDb().execute({ sql: "DELETE FROM goals WHERE id = ?", args: [goalId] });
    const ov = await get(partner, "/api/guild/overview");
    expect(ov.body.sharedWithMe[0].summary).toBeNull();
    expect((await post(partner, `/api/guild/shared/${shareId}/cheers`, { kind: "incentivo" })).status).toBe(410);
    expect((await post(partner, `/api/guild/shared/${shareId}/leave`)).status).toBe(200);
    expect((await get(partner, "/api/guild/overview")).body.sharedWithMe).toHaveLength(0);
  });

  it("exige sessão", async () => {
    expect((await request(guildApp).get("/api/guild/overview")).status).toBe(401);
  });
});
