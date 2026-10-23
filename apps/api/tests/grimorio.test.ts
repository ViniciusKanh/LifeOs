import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { grimoireRouter } from "../src/routes/grimoire.routes.js";
import { addDaysToKey, buildDailyQueue, sm2 } from "../src/services/srsEngine.js";
import { sanitizeSuggestions } from "../src/services/grimoireAIService.js";
import {
  GRIMOIRE_REWARD,
  cardFromBookNote,
  createCards,
  createDeck,
  getDailyQueue,
  getStats,
  listCards,
  listDecks,
  reviewCard,
  updateDeck,
} from "../src/services/grimoireService.js";

const fresh = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

/** App mínimo só com o router do Grimório (o registro em app.ts é feito pelo coordenador). */
const miniApp = express();
miniApp.use(express.json());
miniApp.use(cookieParser());
miniApp.use("/api/grimoire", grimoireRouter);

async function newUser(tz?: string) {
  const u = await createAuthenticatedAgent();
  if (tz) await getDb().execute({ sql: "UPDATE users SET timezone = ? WHERE id = ?", args: [tz, u.userId] });
  const login = await request(app).post("/api/auth/login").send({ email: u.email, password: "SenhaForte123!", rememberMe: false });
  const cookie = login.headers["set-cookie"] as unknown as string[];
  return { ...u, cookie };
}

describe("SM-2 (srsEngine)", () => {
  it("segue a progressão clássica 1 → 6 → intervalo × ease", () => {
    const a = sm2(fresh, 4, "2026-01-10");
    expect(a).toMatchObject({ repetitions: 1, intervalDays: 1, dueDate: "2026-01-11", ease: 2.5 });
    const b = sm2(a, 4, "2026-01-11");
    expect(b).toMatchObject({ repetitions: 2, intervalDays: 6, dueDate: "2026-01-17" });
    const c = sm2(b, 5, "2026-01-17");
    expect(c.repetitions).toBe(3);
    expect(c.intervalDays).toBe(Math.round(6 * 2.5));
    expect(c.ease).toBeCloseTo(2.6, 5);
  });

  it("lapso zera repetições, conta lapso só se já aprendido e respeita piso do ease", () => {
    const novo = sm2(fresh, 1, "2026-03-01");
    expect(novo).toMatchObject({ repetitions: 0, intervalDays: 1, lapses: 0 });
    const aprendido = { ease: 1.35, intervalDays: 20, repetitions: 4, lapses: 0 };
    const r = sm2(aprendido, 0, "2026-03-01");
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 1, lapses: 1, ease: 1.3, dueDate: "2026-03-02" });
  });

  it("vira o mês/ano corretamente e monta a fila com limite de novos", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    const cards = [
      { id: "a", dueDate: "2026-05-01", isNew: false, createdAt: "1" },
      { id: "b", dueDate: "2026-05-03", isNew: false, createdAt: "2" },
      { id: "c", dueDate: "2026-05-02", isNew: true, createdAt: "3" },
      { id: "d", dueDate: "2026-05-02", isNew: true, createdAt: "4" },
    ];
    expect(buildDailyQueue(cards, "2026-05-02", 1).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("sanitiza sugestões da IA (vazios e duplicados fora)", () => {
    const out = sanitizeSuggestions([
      { front: "O que é SM-2?", back: "Algoritmo de repetição espaçada." },
      { front: "o que é sm-2?", back: "dup" },
      { front: "", back: "x" },
      { front: 42, back: "x" },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("Grimório (serviço)", () => {
  it("fila do dia usa o fuso do usuário", async () => {
    const db = getDb();
    const { userId } = await newUser("America/Sao_Paulo");
    const deckId = await createDeck(db, userId, { name: "Fuso" });
    // 02:00 UTC de 10/06 ainda é 09/06 em São Paulo (UTC-3).
    const now = new Date("2026-06-10T02:00:00Z");
    const [card] = await createCards(db, userId, deckId, [{ front: "F", back: "V" }], "manual", { now });
    expect(card.dueDate).toBe("2026-06-09");
    const q = await getDailyQueue(db, userId, { deckId }, now);
    expect(q.today).toBe("2026-06-09");
    expect(q.cards.map((c) => c.id)).toEqual([card.id]);

    await reviewCard(db, userId, card.id, 4, now);
    const after = (await listCards(db, userId, deckId))[0];
    expect(after.dueDate).toBe("2026-06-10");
    // Ainda é dia 09 no fuso dele: nada a revisar.
    expect((await getDailyQueue(db, userId, { deckId }, now)).cards).toHaveLength(0);
    // 03:30 UTC de 10/06 já é dia 10 em SP: cartão volta.
    expect((await getDailyQueue(db, userId, { deckId }, new Date("2026-06-10T03:30:00Z"))).cards).toHaveLength(1);
  });

  it("respeita limite de novos por dia e concede XP uma única vez por dia", async () => {
    const db = getDb();
    const { userId } = await newUser("UTC");
    const deckId = await createDeck(db, userId, { name: "Limite", newPerDay: 2 });
    const now = new Date("2026-07-01T12:00:00Z");
    await createCards(db, userId, deckId, [1, 2, 3].map((i) => ({ front: `F${i}`, back: `V${i}` })), "manual", { now });

    const q1 = await getDailyQueue(db, userId, {}, now);
    expect(q1.newCount).toBe(2);
    const r1 = await reviewCard(db, userId, q1.cards[0].id, 5, now);
    expect(r1.queueCleared).toBe(false);
    const r2 = await reviewCard(db, userId, q1.cards[1].id, 5, now);
    expect(r2.queueCleared).toBe(true);
    expect(r2.xpAwarded).toBe(GRIMOIRE_REWARD.queueClearedXp);
    // O 3º cartão novo fica para amanhã (limite consumido hoje).
    expect((await getDailyQueue(db, userId, {}, now)).clearedToday).toBe(true);

    // Revisar de novo no mesmo dia não duplica XP.
    const r3 = await reviewCard(db, userId, q1.cards[0].id, 4, now);
    expect(r3.xpAwarded).toBe(0);
    const xp = await db.execute({
      sql: "SELECT COUNT(*) AS n, SUM(xp) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'grimoire'",
      args: [userId],
    });
    expect(Number(xp.rows[0].n)).toBe(1);
    expect(Number(xp.rows[0].xp)).toBe(GRIMOIRE_REWARD.queueClearedXp);

    const stats = await getStats(db, userId, {}, now);
    expect(stats.reviewsToday).toBe(3);
    expect(stats.streak).toBe(1);
    expect(stats.retention30d).toBeNull(); // amostra < 10
  });

  it("baralho arquivado sai da fila e não aceita cartões", async () => {
    const db = getDb();
    const { userId } = await newUser();
    const deckId = await createDeck(db, userId, { name: "Arquivo" });
    await createCards(db, userId, deckId, [{ front: "a", back: "b" }], "manual");
    await updateDeck(db, userId, deckId, { archived: true });
    expect((await getDailyQueue(db, userId)).cards).toHaveLength(0);
    await expect(createCards(db, userId, deckId, [{ front: "x", back: "y" }], "manual")).rejects.toThrow(/arquivado/);
    expect(await listDecks(db, userId)).toHaveLength(0);
  });

  it("cria cartão a partir de citação (source quote)", async () => {
    const db = getDb();
    const { userId } = await newUser();
    await db.execute({ sql: "INSERT INTO books (id, owner_id, title, author) VALUES ('bk-q', ?, 'Meditações', 'Marco Aurélio')", args: [userId] });
    await db.execute({ sql: "INSERT INTO book_notes (id, book_id, owner_id, kind, content, page) VALUES ('nt-q', 'bk-q', ?, 'quote', 'A felicidade depende da qualidade dos pensamentos.', 42)", args: [userId] });
    const deckId = await createDeck(db, userId, { name: "Citações", bookId: "bk-q" });
    const card = await cardFromBookNote(db, userId, "nt-q", deckId);
    expect(card.source).toBe("quote");
    expect(card.back).toContain("p. 42");
  });
});

describe("Grimório (rotas e isolamento)", () => {
  it("um usuário não lê, revisa, edita nem apaga dados de outro", async () => {
    const a = await newUser();
    const b = await newUser();
    const deck = await request(miniApp).post("/api/grimoire/decks").set("Cookie", a.cookie).send({ name: "Privado" });
    expect(deck.status).toBe(201);
    const cards = await request(miniApp)
      .post(`/api/grimoire/decks/${deck.body.id}/cards`)
      .set("Cookie", a.cookie)
      .send({ cards: [{ front: "Pergunta", back: "Resposta" }] });
    expect(cards.status).toBe(201);
    const cardId = cards.body[0].id as string;

    expect((await request(miniApp).get("/api/grimoire/decks").set("Cookie", b.cookie)).body).toHaveLength(0);
    expect((await request(miniApp).get(`/api/grimoire/decks/${deck.body.id}`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(miniApp).get(`/api/grimoire/decks/${deck.body.id}/cards`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(miniApp).post(`/api/grimoire/decks/${deck.body.id}/cards`).set("Cookie", b.cookie).send({ cards: [{ front: "x", back: "y" }] })).status).toBe(404);
    expect((await request(miniApp).post(`/api/grimoire/cards/${cardId}/review`).set("Cookie", b.cookie).send({ quality: 4 })).status).toBe(404);
    expect((await request(miniApp).patch(`/api/grimoire/cards/${cardId}`).set("Cookie", b.cookie).send({ front: "hack" })).status).toBe(404);
    expect((await request(miniApp).delete(`/api/grimoire/cards/${cardId}`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(miniApp).delete(`/api/grimoire/decks/${deck.body.id}`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(miniApp).get("/api/grimoire/queue").set("Cookie", b.cookie)).body.cards).toHaveLength(0);
    // Vincular a disciplina de outro usuário é recusado.
    await getDb().execute({ sql: "INSERT INTO educations (id, owner_id, kind, course_name) VALUES ('edu-a', ?, 'mestrado', 'Mestrado')", args: [a.userId] });
    await getDb().execute({ sql: "INSERT INTO courses (id, education_id, owner_id, name) VALUES ('crs-a', 'edu-a', ?, 'Curso A')", args: [a.userId] });
    expect((await request(miniApp).post("/api/grimoire/decks").set("Cookie", a.cookie).send({ name: "ok", courseId: "crs-a" })).status).toBe(201);
    const hijack = await request(miniApp).post("/api/grimoire/decks").set("Cookie", b.cookie).send({ name: "x", courseId: "crs-a" });
    expect(hijack.status).toBe(404);

    // Dono continua com tudo intacto.
    const own = await request(miniApp).get(`/api/grimoire/decks/${deck.body.id}/cards`).set("Cookie", a.cookie);
    expect(own.body[0].front).toBe("Pergunta");
    const review = await request(miniApp).post(`/api/grimoire/cards/${cardId}/review`).set("Cookie", a.cookie).send({ quality: 4 });
    expect(review.status).toBe(200);
    expect(review.body.queueCleared).toBe(true);
  });

  it("valida entrada e exige autenticação", async () => {
    const a = await newUser();
    expect((await request(miniApp).get("/api/grimoire/decks")).status).toBe(401);
    expect((await request(miniApp).post("/api/grimoire/decks").set("Cookie", a.cookie).send({ name: "" })).status).toBe(400);
    expect((await request(miniApp).post("/api/grimoire/generate").set("Cookie", a.cookie).send({ source: { kind: "outro" } })).status).toBe(400);
  });

  it("gerador por IA sem Gemini configurado degrada com mensagem clara e não grava nada", async () => {
    const a = await newUser();
    const res = await request(miniApp)
      .post("/api/grimoire/generate")
      .set("Cookie", a.cookie)
      .send({ source: { kind: "text", text: "A fotossíntese converte luz em energia química nas plantas, usando clorofila." } });
    expect([503, 502]).toContain(res.status);
    expect(typeof res.body.error).toBe("string");
    const n = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM flashcards WHERE owner_id = ?", args: [a.userId] });
    expect(Number(n.rows[0].n)).toBe(0);
  });
});
