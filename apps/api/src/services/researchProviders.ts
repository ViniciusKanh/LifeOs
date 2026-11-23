/**
 * Biblioteca do Mestrado — busca de metadados bibliográficos por DOI.
 *
 * Ordem: OpenAlex (principal: autores, periódico, citações, relacionados),
 * Semantic Scholar (resumo e citações quando faltam) e Crossref (fallback
 * quando o DOI não está no OpenAlex). Nada é inventado: campo que nenhuma
 * fonte devolve fica null. Cache em memória por DOI (as fontes mudam pouco).
 */

export interface PaperAuthor {
  name: string;
  given: string | null;
  family: string | null;
}

export interface PaperMetadata {
  doi: string;
  openalexId: string | null;
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  abstract: string | null;
  keywords: string[];
  citedBy: number | null;
  citedBySource: string | null;
  url: string | null;
  oaUrl: string | null;
  type: string | null;
  sources: string[];
}

export interface RelatedWork {
  openalexId: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  citedBy: number | null;
}

/** "https://doi.org/10.1/ABC", "doi:10.1/abc" → "10.1/abc". null se não for um DOI válido. */
export function normalizeDoi(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
}

type FetchJson = (url: string) => Promise<{ status: number; body: unknown }>;
const realFetch: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "LifeOS-Biblioteca (https://github.com/ViniciusKanh/LifeOs)" } });
  return { status: res.status, body: res.ok ? await res.json() : null };
};
let fetchJson: FetchJson = realFetch;
/** Só para testes. */
export function setResearchFetchForTests(f: FetchJson | null) {
  fetchJson = f ?? realFetch;
  cache.clear();
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 6 * 60 * 60 * 1000;
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.clear();
  return value;
}

/** Divide um nome "Nome do Meio Sobrenome" quando a fonte não separa (heurística declarada). */
function splitName(name: string): { given: string | null; family: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { given: null, family: parts[0] ?? null };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1]! };
}

/** OpenAlex entrega o resumo como índice invertido: reconstrói o texto original. */
export function abstractFromInverted(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortId = (id: string | null | undefined) => (id ? id.replace("https://openalex.org/", "") : null);

type OAWork = {
  id: string;
  doi: string | null;
  display_name: string | null;
  publication_year: number | null;
  type: string | null;
  cited_by_count: number | null;
  authorships?: Array<{ author: { display_name: string } }>;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string | null; host_organization_name?: string | null } | null } | null;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
  keywords?: Array<{ display_name: string }>;
  open_access?: { oa_url?: string | null };
  related_works?: string[];
  referenced_works?: string[];
};

async function fromOpenAlex(doi: string): Promise<{ meta: PaperMetadata; related: string[]; references: string[] } | null> {
  const r = await fetchJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.body) throw new Error(`OpenAlex respondeu ${r.status}`);
  const w = r.body as OAWork;
  const b = w.biblio ?? {};
  const pages = b.first_page ? (b.last_page && b.last_page !== b.first_page ? `${b.first_page}-${b.last_page}` : b.first_page) : null;
  return {
    meta: {
      doi,
      openalexId: shortId(w.id),
      title: w.display_name ?? "",
      authors: (w.authorships ?? []).map((a) => ({ name: a.author.display_name, ...splitName(a.author.display_name) })),
      year: w.publication_year ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      volume: b.volume ?? null,
      issue: b.issue ?? null,
      pages,
      publisher: w.primary_location?.source?.host_organization_name ?? null,
      abstract: abstractFromInverted(w.abstract_inverted_index),
      keywords: (w.keywords ?? []).map((k) => k.display_name).slice(0, 10),
      citedBy: w.cited_by_count ?? null,
      citedBySource: w.cited_by_count != null ? "OpenAlex" : null,
      url: w.primary_location?.landing_page_url ?? `https://doi.org/${doi}`,
      oaUrl: w.open_access?.oa_url ?? null,
      type: w.type ?? null,
      sources: ["OpenAlex"],
    },
    related: (w.related_works ?? []).map((x) => shortId(x)!).slice(0, 10),
    references: (w.referenced_works ?? []).map((x) => shortId(x)!).slice(0, 25),
  };
}

type S2Paper = { title?: string; abstract?: string | null; year?: number | null; venue?: string | null; citationCount?: number | null; authors?: Array<{ name: string }>; url?: string; openAccessPdf?: { url?: string } | null };

async function fromSemanticScholar(doi: string): Promise<S2Paper | null> {
  const r = await fetchJson(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,abstract,year,venue,citationCount,authors,url,openAccessPdf`);
  return r.status === 200 && r.body ? (r.body as S2Paper) : null;
}

type CrossrefMsg = {
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  "is-referenced-by-count"?: number;
  URL?: string;
  abstract?: string;
  type?: string;
  subject?: string[];
};

async function fromCrossref(doi: string): Promise<PaperMetadata | null> {
  const r = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (r.status !== 200 || !r.body) return null;
  const m = (r.body as { message: CrossrefMsg }).message;
  return {
    doi,
    openalexId: null,
    title: m.title?.[0] ?? "",
    authors: (m.author ?? []).map((a) => {
      const name = a.name ?? [a.given, a.family].filter(Boolean).join(" ");
      return { name, given: a.given ?? null, family: a.family ?? (a.name ? splitName(a.name).family : null) };
    }),
    year: m.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: m["container-title"]?.[0] ?? null,
    volume: m.volume ?? null,
    issue: m.issue ?? null,
    pages: m.page ?? null,
    publisher: m.publisher ?? null,
    abstract: m.abstract ? stripTags(m.abstract) : null,
    keywords: (m.subject ?? []).slice(0, 10),
    citedBy: m["is-referenced-by-count"] ?? null,
    citedBySource: m["is-referenced-by-count"] != null ? "Crossref" : null,
    url: m.URL ?? `https://doi.org/${doi}`,
    oaUrl: null,
    type: m.type ?? null,
    sources: ["Crossref"],
  };
}

export interface LookupResult {
  meta: PaperMetadata;
  relatedIds: string[];
  referenceIds: string[];
}

/** Metadados por DOI combinando as fontes. Lança erro só se TODAS falharem por rede. */
export async function lookupDoi(doi: string): Promise<LookupResult | null> {
  return cached(`doi:${doi}`, async () => {
    let oa: Awaited<ReturnType<typeof fromOpenAlex>> = null;
    let networkError = false;
    try {
      oa = await fromOpenAlex(doi);
    } catch {
      networkError = true;
    }
    let meta = oa?.meta ?? null;
    if (!meta) {
      meta = await fromCrossref(doi).catch(() => null);
      if (!meta && networkError) throw new Error("Fontes acadêmicas indisponíveis.");
    }
    if (!meta) return null;
    // Semantic Scholar só complementa o que faltou (resumo, citações, link aberto).
    if (!meta.abstract || meta.citedBy == null || !meta.oaUrl) {
      const s2 = await fromSemanticScholar(doi).catch(() => null);
      if (s2) {
        let used = false;
        if (!meta.abstract && s2.abstract) (meta.abstract = s2.abstract), (used = true);
        if (meta.citedBy == null && s2.citationCount != null) (meta.citedBy = s2.citationCount), (meta.citedBySource = "Semantic Scholar"), (used = true);
        if (!meta.oaUrl && s2.openAccessPdf?.url) (meta.oaUrl = s2.openAccessPdf.url), (used = true);
        if (!meta.venue && s2.venue) (meta.venue = s2.venue), (used = true);
        if (used) meta.sources.push("Semantic Scholar");
      }
    }
    if (!meta.title) return null;
    return { meta, relatedIds: oa?.related ?? [], referenceIds: oa?.references ?? [] };
  });
}

type OAList = { results: OAWork[] };
const toRelated = (w: OAWork): RelatedWork => ({
  openalexId: shortId(w.id),
  doi: w.doi ? w.doi.replace(/^https:\/\/doi\.org\//, "").toLowerCase() : null,
  title: w.display_name ?? "(sem título)",
  authors: (w.authorships ?? []).map((a) => a.author.display_name).slice(0, 4),
  year: w.publication_year ?? null,
  citedBy: w.cited_by_count ?? null,
});

const SELECT = "id,doi,display_name,publication_year,cited_by_count,authorships";

/** Busca vários trabalhos do OpenAlex pelos IDs (W...). */
export async function openAlexWorks(ids: string[]): Promise<RelatedWork[]> {
  const clean = ids.filter((i) => /^W\d+$/.test(i)).slice(0, 25);
  if (!clean.length) return [];
  return cached(`works:${clean.join("|")}`, async () => {
    const r = await fetchJson(`https://api.openalex.org/works?filter=openalex:${clean.join("|")}&per-page=25&select=${SELECT}`);
    if (r.status !== 200 || !r.body) throw new Error(`OpenAlex respondeu ${r.status}`);
    return (r.body as OAList).results.map(toRelated);
  });
}

/** Trabalhos que citam o artigo (relação comprovada), mais citados primeiro. */
export async function openAlexCiting(openalexId: string): Promise<RelatedWork[]> {
  if (!/^W\d+$/.test(openalexId)) return [];
  return cached(`citing:${openalexId}`, async () => {
    const r = await fetchJson(`https://api.openalex.org/works?filter=cites:${openalexId}&sort=cited_by_count:desc&per-page=15&select=${SELECT}`);
    if (r.status !== 200 || !r.body) throw new Error(`OpenAlex respondeu ${r.status}`);
    return (r.body as OAList).results.map(toRelated);
  });
}
