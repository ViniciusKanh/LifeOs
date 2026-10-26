import { describe, it, expect, vi, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import type { BookSearchCandidate } from "../src/services/bookLookupService.js";

// O Google Books é simulado: o teste controla quais livros "existem" por
// autor e confere que o serviço decide tudo (quais autores, o que já
// existe na biblioteca) sem depender de rede nenhuma.
const googleBooks = vi.hoisted(() => ({ byAuthor: new Map<string, BookSearchCandidate[]>() }));
vi.mock("../src/services/bookLookupService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/bookLookupService.js")>();
  return {
    ...actual,
    searchBooksByAuthor: async (author: string) => googleBooks.byAuthor.get(author) ?? [],
  };
});

beforeEach(() => {
  googleBooks.byAuthor.clear();
});

async function addBook(ownerId: string, opts: { title: string; author: string; isbn?: string; status?: string; rating?: number }) {
  await getDb().execute({
    sql: `INSERT INTO books (id, owner_id, title, author, isbn, status, rating, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [nanoid(), ownerId, opts.title, opts.author, opts.isbn ?? null, opts.status ?? "Concluído", opts.rating ?? null],
  });
}

function candidate(title: string, author: string, isbn: string | null = null): BookSearchCandidate {
  return { isbn, title, author, publisher: null, coverUrl: null, publishedYear: null, totalPages: null, categories: [], description: null };
}

describe("Recomendação de leitura — baseada só no histórico real do usuário", () => {
  it("avisa quando não há dados suficientes em vez de recomendar algo genérico", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/books/recommendations");
    expect(res.status).toBe(200);
    expect(res.body.hasEnoughData).toBe(false);
    expect(res.body.recommendations).toEqual([]);
  });

  it("recomenda mais livros do autor mais bem avaliado, sem repetir o que o usuário já tem", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    await addBook(userId, { title: "Duna", author: "Frank Herbert", rating: 5 });
    await addBook(userId, { title: "O Mensageiro de Deus", author: "Frank Herbert", rating: 4 });
    await addBook(userId, { title: "1984", author: "George Orwell", rating: 3 });
    await addBook(userId, { title: "Já tenho este", author: "Frank Herbert", isbn: "111" });

    googleBooks.byAuthor.set("Frank Herbert", [
      candidate("Duna", "Frank Herbert"), // já tem (mesmo título) — não deve repetir
      candidate("Já tenho este", "Frank Herbert", "111"), // já tem (mesmo isbn) — não deve repetir
      candidate("Filhos de Duna", "Frank Herbert", "222"),
      candidate("Imperador-Deus de Duna", "Frank Herbert", "333"),
    ]);

    const res = await agent.get("/api/books/recommendations");
    expect(res.status).toBe(200);
    expect(res.body.hasEnoughData).toBe(true);
    const titles = res.body.recommendations.map((r: { title: string }) => r.title);
    expect(titles).toEqual(["Filhos de Duna", "Imperador-Deus de Duna"]);
    expect(res.body.recommendations[0].reason).toContain("Frank Herbert");
  });

  it("nunca recomenda com base em livro de outro usuário", async () => {
    const { agent: agentA, userId: userA } = await createAuthenticatedAgent();
    const { agent: agentB } = await createAuthenticatedAgent();
    for (let i = 0; i < 4; i++) {
      await addBook(userA, { title: `Livro A${i}`, author: "Autora Isolada", rating: 5 });
    }
    googleBooks.byAuthor.set("Autora Isolada", [candidate("Outro livro", "Autora Isolada", "999")]);

    const resA = await agentA.get("/api/books/recommendations");
    expect(resA.body.hasEnoughData).toBe(true);

    const resB = await agentB.get("/api/books/recommendations");
    expect(resB.body.hasEnoughData).toBe(false);
  });
});
