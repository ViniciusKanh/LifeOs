/**
 * Busca metadados de um livro por ISBN, priorizando o Google Books e
 * caindo para a Open Library quando o primeiro não encontra o título
 * ou está indisponível. Nenhuma das duas chamadas grava nada no banco —
 * o resultado é só um preview que o usuário confirma antes de salvar
 * (ver POST /api/books).
 */

export type BookLookupResult = {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
  totalPages: number | null;
  categories: string[];
  description: string | null;
  source: "google_books" | "open_library";
};

/** Candidato de recomendação — igual ao lookup por ISBN, mas o ISBN pode faltar (nem todo volume do Google Books tem um). */
export type BookSearchCandidate = Omit<BookLookupResult, "isbn" | "source"> & { isbn: string | null };

const FETCH_TIMEOUT_MS = 8000;

function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "");
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

async function lookupGoogleBooks(isbn: string): Promise<BookLookupResult | null> {
  const res = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
  if (!res || !res.ok) return null;

  const data = (await res.json().catch(() => null)) as
    | { items?: Array<{ volumeInfo?: Record<string, unknown> }> }
    | null;
  const info = data?.items?.[0]?.volumeInfo as
    | {
        title?: string;
        authors?: string[];
        publisher?: string;
        publishedDate?: string;
        description?: string;
        pageCount?: number;
        categories?: string[];
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      }
    | undefined;
  if (!info?.title) return null;

  return {
    isbn,
    title: info.title,
    author: info.authors?.join(", ") ?? null,
    publisher: info.publisher ?? null,
    coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? info.imageLinks?.smallThumbnail ?? null,
    publishedYear: extractYear(info.publishedDate),
    totalPages: info.pageCount ?? null,
    categories: info.categories ?? [],
    description: info.description ?? null,
    source: "google_books",
  };
}

async function lookupOpenLibrary(isbn: string): Promise<BookLookupResult | null> {
  const res = await fetchWithTimeout(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`
  );
  if (!res || !res.ok) return null;

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const entry = data?.[`ISBN:${isbn}`] as
    | {
        title?: string;
        authors?: Array<{ name?: string }>;
        publishers?: Array<{ name?: string }>;
        publish_date?: string;
        number_of_pages?: number;
        subjects?: Array<{ name?: string }>;
        notes?: string;
        cover?: { medium?: string; large?: string };
      }
    | undefined;
  if (!entry?.title) return null;

  return {
    isbn,
    title: entry.title,
    author: entry.authors?.map((a) => a.name).filter(Boolean).join(", ") || null,
    publisher: entry.publishers?.map((p) => p.name).filter(Boolean).join(", ") || null,
    coverUrl: entry.cover?.large ?? entry.cover?.medium ?? null,
    publishedYear: extractYear(entry.publish_date),
    totalPages: entry.number_of_pages ?? null,
    categories: entry.subjects?.map((s) => s.name).filter((n): n is string => !!n) ?? [],
    description: entry.notes ?? null,
    source: "open_library",
  };
}

export async function lookupIsbn(rawIsbn: string): Promise<BookLookupResult | null> {
  const isbn = cleanIsbn(rawIsbn);
  if (isbn.length < 10) return null;

  const fromGoogle = await lookupGoogleBooks(isbn);
  if (fromGoogle) return fromGoogle;

  return lookupOpenLibrary(isbn);
}

/**
 * Busca livros de um autor no Google Books (pra recomendação de leitura —
 * ver bookRecommendationService.ts). Só o Google Books: a Open Library não
 * tem uma busca por autor tão confiável quanto a por ISBN, e aqui já é só
 * sugestão, não cadastro — se falhar, a recomendação por esse autor fica
 * vazia em vez de arriscar um resultado ruim.
 */
export async function searchBooksByAuthor(author: string, limit = 8): Promise<BookSearchCandidate[]> {
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`inauthor:"${author}"`)}&maxResults=${limit}&orderBy=relevance`
  );
  if (!res || !res.ok) return [];

  const data = (await res.json().catch(() => null)) as
    | { items?: Array<{ volumeInfo?: Record<string, unknown> }> }
    | null;
  const items = data?.items ?? [];

  return items
    .map((item): BookSearchCandidate | null => {
      const info = item.volumeInfo as
        | {
            title?: string;
            authors?: string[];
            publisher?: string;
            publishedDate?: string;
            description?: string;
            pageCount?: number;
            categories?: string[];
            imageLinks?: { thumbnail?: string; smallThumbnail?: string };
            industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
          }
        | undefined;
      if (!info?.title) return null;
      const isbn13 = info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier;
      const isbn10 = info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier;
      return {
        isbn: isbn13 ?? isbn10 ?? null,
        title: info.title,
        author: info.authors?.join(", ") ?? null,
        publisher: info.publisher ?? null,
        coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? info.imageLinks?.smallThumbnail ?? null,
        publishedYear: extractYear(info.publishedDate),
        totalPages: info.pageCount ?? null,
        categories: info.categories ?? [],
        description: info.description ?? null,
      };
    })
    .filter((b): b is BookSearchCandidate => b !== null);
}
