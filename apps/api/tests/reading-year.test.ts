import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { app } from "../src/app.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { readingYearRouter } from "../src/routes/readingYear.routes.js";
import { getReadingYearSummary, listQuotes, paceFor, upsertYearGoal } from "../src/services/readingYearService.js";

const miniApp = express();
miniApp.use(express.json());
miniApp.use(cookieParser());
miniApp.use("/api/reading", readingYearRouter);

async function newUser(tz = "America/Sao_Paulo") {
  const u = await createAuthenticatedAgent();
  await getDb().execute({ sql: "UPDATE users SET timezone = ? WHERE id = ?", args: [tz, u.userId] });
  const login = await request(app).post("/api/auth/login").send({ email: u.email, password: "SenhaForte123!", rememberMe: false });
  return { ...u, cookie: login.headers["set-cookie"] as unknown as string[] };
}

async function addBook(ownerId: string, id: string, status: string, finishedAt: string | null) {
  await getDb().execute({
    sql: "INSERT INTO books (id, owner_id, title, status, finished_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, ownerId, `Livro ${id}`, status, finishedAt],
  });
}

describe("paceFor (ritmo da meta anual)", () => {
  it("classifica adiantado / no ritmo / atrasado e projeta o fim do ano", () => {
    // Metade do ano (dia 182 de 365), meta 24 livros → esperado ~12.
    expect(paceFor(24, 12, 182, 365, true).status).toBe("no_ritmo");
    expect(paceFor(24, 16, 182, 365, true).status).toBe("adiantado");
    const late = paceFor(24, 6, 182, 365, true);
    expect(late.status).toBe("atrasado");
    expect(late.projected).toBe(Math.round((6 / 182) * 365));
    expect(late.remainingPerDay).toBeGreaterThan(0);
    // Começo do ano sem leitura: não acusa atraso.
    expect(paceFor(24, 0, 3, 365, true).status).toBe("sem_dados");
    // Meta batida.
    expect(paceFor(10, 10, 100, 365, true).status).toBe("adiantado");
    // Ano encerrado: projeção = realizado.
    expect(paceFor(12, 8, 365, 365, false)).toMatchObject({ projected: 8, status: "atrasado", remainingPerDay: null });
  });
});

describe("Meta anual de leitura", () => {
  it("conta livros e páginas do ano no fuso do usuário", async () => {
    const db = getDb();
    const { userId } = await newUser("America/Sao_Paulo");
    // 01/01 01:00 UTC ainda é 31/12 em São Paulo → conta para 2025, não 2026.
    await addBook(userId, `b1-${userId}`, "Concluído", "2026-01-01T01:00:00Z");
    await addBook(userId, `b2-${userId}`, "Concluído", "2026-03-10");
    await addBook(userId, `b3-${userId}`, "Lendo", null);
    await db.execute({
      sql: "INSERT INTO reading_sessions (id, book_id, owner_id, started_at, pages_read) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      args: [`s1-${userId}`, `b3-${userId}`, userId, "2026-01-01T02:00:00Z", 30, `s2-${userId}`, `b3-${userId}`, userId, "2026-02-01T15:00:00Z", 50],
    });
    await upsertYearGoal(db, userId, 2026, { booksTarget: 12, pagesTarget: 3000 });

    const now = new Date("2026-07-02T12:00:00Z");
    const s = await getReadingYearSummary(db, userId, 2026, now);
    expect(s.isCurrentYear).toBe(true);
    expect(s.booksFinished).toBe(1);
    expect(s.pagesRead).toBe(50);
    expect(s.books?.target).toBe(12);
    expect(s.pages?.status).toBe("atrasado");

    const prev = await getReadingYearSummary(db, userId, 2025, now);
    expect(prev.booksFinished).toBe(1);
    expect(prev.pagesRead).toBe(30);
    expect(prev.goal).toBeNull();
  });

  it("isola metas e citações entre usuários e valida a entrada", async () => {
    const a = await newUser();
    const b = await newUser();
    const put = await request(miniApp).put("/api/reading/year/2026").set("Cookie", a.cookie).send({ booksTarget: 20, pagesTarget: null });
    expect(put.status).toBe(200);
    expect(put.body.goal).toEqual({ booksTarget: 20, pagesTarget: null });
    expect((await request(miniApp).get("/api/reading/year?year=2026").set("Cookie", b.cookie)).body.goal).toBeNull();
    expect((await request(miniApp).delete("/api/reading/year/2026").set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(miniApp).put("/api/reading/year/2026").set("Cookie", a.cookie).send({ booksTarget: null, pagesTarget: null })).status).toBe(400);
    expect((await request(miniApp).put("/api/reading/year/2026").set("Cookie", a.cookie).send({ booksTarget: -1, pagesTarget: null })).status).toBe(400);

    const db = getDb();
    await addBook(a.userId, `qa-${a.userId}`, "Lendo", null);
    await db.execute({
      sql: "INSERT INTO book_notes (id, book_id, owner_id, kind, content, page) VALUES (?, ?, ?, 'quote', ?, 7), (?, ?, ?, 'note', 'nota comum', NULL)",
      args: [`n1-${a.userId}`, `qa-${a.userId}`, a.userId, "Quem tem um porquê suporta quase qualquer como 100%", `n2-${a.userId}`, `qa-${a.userId}`, a.userId],
    });
    const quotes = await listQuotes(db, a.userId, {});
    expect(quotes).toHaveLength(1);
    expect(quotes[0].page).toBe(7);
    // Busca com caractere curinga é literal.
    expect(await listQuotes(db, a.userId, { q: "100%" })).toHaveLength(1);
    expect(await listQuotes(db, a.userId, { q: "inexistente" })).toHaveLength(0);
    expect((await request(miniApp).get("/api/reading/quotes").set("Cookie", b.cookie)).body).toHaveLength(0);
    expect((await request(miniApp).get("/api/reading/quotes?kinds=quote,note").set("Cookie", a.cookie)).body).toHaveLength(2);
  });
});
