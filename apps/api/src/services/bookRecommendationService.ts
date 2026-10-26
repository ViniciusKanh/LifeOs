import type { Client } from "@libsql/client";
import { searchBooksByAuthor, type BookSearchCandidate } from "./bookLookupService.js";

/**
 * Recomendação de leitura: usa só o histórico real do próprio usuário
 * (livros concluídos e avaliados) pra decidir QUEM recomendar — nunca um
 * ranking genérico/editorial. A busca em si (mais livros do(s) autor(es)
 * preferidos) vem do Google Books, filtrando o que o usuário já tem na
 * biblioteca (qualquer status, não só concluído) pra nunca sugerir
 * duplicata.
 *
 * Segue a mesma regra do Copilot (ver instruções do projeto): isto é
 * SUGESTÃO, não dado real nem inferência — a tela precisa deixar isso
 * claro, nunca apresentar como parte da coleção do usuário.
 */

export type BookRecommendation = BookSearchCandidate & {
  /** Por que esse livro foi sugerido — sempre rastreável até um livro real do usuário. */
  reason: string;
};

export type BookRecommendationsResult =
  | { hasEnoughData: false; recommendations: [] }
  | { hasEnoughData: true; recommendations: BookRecommendation[] };

const MIN_RATED_BOOKS = 3;
const MIN_RATING = 4;
const MAX_AUTHORS = 2;
const MAX_PER_AUTHOR = 5;
const MAX_TOTAL = 10;

interface RatedBookRow {
  title: string;
  author: string | null;
  isbn: string | null;
  rating: number;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function getBookRecommendations(db: Client, ownerId: string): Promise<BookRecommendationsResult> {
  const rated = await db.execute({
    sql: `SELECT title, author, isbn, rating FROM books
          WHERE owner_id = ? AND status = 'Concluído' AND rating IS NOT NULL AND rating >= ? AND author IS NOT NULL AND author != ''
          ORDER BY rating DESC, finished_at DESC`,
    args: [ownerId, MIN_RATING],
  });
  const ratedRows = rated.rows as unknown as RatedBookRow[];

  const totalRated = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM books WHERE owner_id = ? AND status = 'Concluído' AND rating IS NOT NULL`,
    args: [ownerId],
  });
  const n = Number((totalRated.rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
  if (n < MIN_RATED_BOOKS || ratedRows.length === 0) {
    return { hasEnoughData: false, recommendations: [] };
  }

  // Autores mais bem avaliados do usuário, por nº de livros (desempate pela nota).
  // Cada autor pode aparecer separado por "," (mesmo formato salvo no cadastro).
  const byAuthor = new Map<string, { count: number; bestRating: number; sampleTitle: string }>();
  for (const row of ratedRows) {
    for (const authorRaw of (row.author ?? "").split(",").map((a) => a.trim()).filter(Boolean)) {
      const key = normalize(authorRaw);
      const current = byAuthor.get(key);
      if (current) {
        current.count += 1;
        if (row.rating > current.bestRating) current.bestRating = row.rating;
      } else {
        byAuthor.set(key, { count: 1, bestRating: row.rating, sampleTitle: row.title });
      }
    }
  }
  const topAuthors = [...byAuthor.entries()]
    .map(([key, v]) => ({ key, ...v, display: ratedRows.find((r) => normalize(r.author ?? "").includes(key))?.author ?? key }))
    .sort((a, b) => b.count - a.count || b.bestRating - a.bestRating)
    .slice(0, MAX_AUTHORS);

  // Tudo que o usuário já tem na biblioteca (qualquer status), pra nunca
  // recomendar duplicata — por ISBN quando existe, senão por título normalizado.
  const owned = await db.execute({ sql: `SELECT isbn, title FROM books WHERE owner_id = ?`, args: [ownerId] });
  const ownedIsbns = new Set<string>();
  const ownedTitles = new Set<string>();
  for (const row of owned.rows as unknown as Array<{ isbn: string | null; title: string }>) {
    if (row.isbn) ownedIsbns.add(row.isbn);
    ownedTitles.add(normalize(row.title));
  }

  const recommendations: BookRecommendation[] = [];
  const seenTitles = new Set<string>();

  for (const author of topAuthors) {
    if (recommendations.length >= MAX_TOTAL) break;
    const candidates = await searchBooksByAuthor(author.display, MAX_PER_AUTHOR + 3).catch(() => [] as BookSearchCandidate[]);
    let added = 0;
    for (const c of candidates) {
      if (added >= MAX_PER_AUTHOR || recommendations.length >= MAX_TOTAL) break;
      const titleKey = normalize(c.title);
      if ((c.isbn && ownedIsbns.has(c.isbn)) || ownedTitles.has(titleKey) || seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      recommendations.push({
        ...c,
        reason: `Porque você deu ${author.bestRating}★ para um livro de ${author.display}`,
      });
      added += 1;
    }
  }

  return { hasEnoughData: true, recommendations };
}
