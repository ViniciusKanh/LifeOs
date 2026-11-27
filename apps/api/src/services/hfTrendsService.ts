import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { fetchJson } from "./integrationsCore.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { addPaperFromMetadata, type PaperDraft } from "./researchLibraryService.js";

/**
 * Papers em Alta (Biblioteca do Mestrado) — Daily Papers do Hugging Face e os
 * modelos/datasets mais baixados nos temas do Radar do usuário. API pública,
 * sem chave. Complementa o Radar: a triagem (salvar ou dispensar) paga XP de
 * pesquisa e salvar manda o artigo para a biblioteca (com DOI do arXiv).
 *
 * XP (fonte "research", evento "hf_triage"): +5 XP por paper triado, até 10 por dia.
 */

export const HF_XP = { triage: 5, dailyCap: 10 } as const;
const HF = "https://huggingface.co/api";
const PAPERS_TTL = 60 * 60 * 1000;
const HUB_TTL = 6 * 60 * 60 * 1000;

export class HfError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 502 = 400) {
    super(message);
  }
}

export interface HfPaper {
  arxivId: string;
  title: string;
  summary: string | null;
  authors: string[];
  upvotes: number;
  comments: number;
  publishedAt: string | null;
  thumbnail: string | null;
  keywords: string[];
}

type RawDaily = { paper?: { id?: string; title?: string; summary?: string; upvotes?: number; authors?: Array<{ name?: string }>; publishedAt?: string; ai_keywords?: string[] }; title?: string; numComments?: number; thumbnail?: string; publishedAt?: string };
type RawHub = { id?: string; modelId?: string; downloads?: number; likes?: number; pipeline_tag?: string; lastModified?: string };

const memo = new Map<string, { at: number; data: unknown }>();
export function resetHfCacheForTests() {
  memo.clear();
}
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await load();
  memo.set(key, { at: Date.now(), data });
  return data;
}

export function normalizeDaily(raw: RawDaily[]): HfPaper[] {
  const out: HfPaper[] = [];
  for (const r of raw ?? []) {
    const id = r.paper?.id ?? "";
    if (!/^\d{4}\.\d{4,5}$/.test(id) || out.some((p) => p.arxivId === id)) continue;
    out.push({
      arxivId: id,
      title: (r.paper?.title ?? r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      summary: r.paper?.summary ? r.paper.summary.replace(/\s+/g, " ").trim().slice(0, 1200) : null,
      authors: (r.paper?.authors ?? []).map((a) => a.name ?? "").filter(Boolean).slice(0, 12),
      upvotes: Number(r.paper?.upvotes ?? 0),
      comments: Number(r.numComments ?? 0),
      publishedAt: r.paper?.publishedAt ?? r.publishedAt ?? null,
      thumbnail: r.thumbnail ?? null,
      keywords: (r.paper?.ai_keywords ?? []).slice(0, 6),
    });
  }
  return out.sort((a, b) => b.upvotes - a.upvotes);
}

/** Busca o dia pedido; fins de semana costumam vir vazios, então recua até 4 dias. */
async function dailyPapers(day: string): Promise<{ day: string; papers: HfPaper[] }> {
  for (let i = 0; i < 5; i++) {
    const d = shiftDayKey(day, -i);
    const papers = await cached(`daily:${d}`, PAPERS_TTL, async () => normalizeDaily((await fetchJson<RawDaily[]>(`${HF}/daily_papers?date=${d}`, {}, { label: "Hugging Face", timeoutMs: 10_000 })) ?? []));
    if (papers.length) return { day: d, papers };
  }
  return { day, papers: [] };
}

async function hubTop(kind: "models" | "datasets", q: string) {
  return cached(`${kind}:${q.toLowerCase()}`, HUB_TTL, async () => {
    const raw = (await fetchJson<RawHub[]>(`${HF}/${kind}?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=3`, {}, { label: "Hugging Face", timeoutMs: 10_000, retries: 1 })) ?? [];
    return raw
      .filter((x) => x.id ?? x.modelId)
      .map((x) => ({ id: String(x.id ?? x.modelId), downloads: Number(x.downloads ?? 0), likes: Number(x.likes ?? 0), task: x.pipeline_tag ?? null, updatedAt: x.lastModified ?? null, url: `https://huggingface.co/${kind === "datasets" ? "datasets/" : ""}${String(x.id ?? x.modelId)}` }));
  });
}

/** Temas do Radar que aparecem no título, resumo ou palavras-chave do paper. */
export function matchTopics(p: HfPaper, topics: string[]): string[] {
  const hay = `${p.title} ${p.summary ?? ""} ${p.keywords.join(" ")}`.toLowerCase();
  return topics.filter((t) => {
    const words = t.toLowerCase().split(/[\s,;]+/).filter((w) => w.length >= 3);
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
}

export async function getHfOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [topicsR, triage, xp] = await Promise.all([
    db.execute({ sql: "SELECT query FROM radar_topics WHERE owner_id = ? ORDER BY created_at", args: [ownerId] }),
    db.execute({ sql: "SELECT arxiv_id, decision, user_paper_id FROM hf_paper_triage WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n, COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'research' AND event_type = 'hf_triage'", args: [ownerId] }),
  ]);
  const topics = topicsR.rows.map((r) => String(r.query));
  let daily: { day: string; papers: HfPaper[] } = { day: today, papers: [] };
  let unavailable: string | null = null;
  try {
    daily = await dailyPapers(today);
  } catch {
    unavailable = "O Hugging Face não respondeu agora. Tente em alguns minutos.";
  }
  const decided = new Map(triage.rows.map((r) => [String(r.arxiv_id), { decision: String(r.decision) as "salvo" | "dispensado", paperId: r.user_paper_id == null ? null : String(r.user_paper_id) }]));
  const papers = daily.papers.slice(0, 20).map((p) => ({ ...p, topics: matchTopics(p, topics), decision: decided.get(p.arxivId)?.decision ?? null, paperId: decided.get(p.arxivId)?.paperId ?? null }));
  // Papers que batem com os temas sobem para o topo (mantendo a ordem por votos).
  papers.sort((a, b) => Number(b.topics.length > 0) - Number(a.topics.length > 0));
  const hub = await Promise.all(
    topics.slice(0, 3).map(async (t) => {
      try {
        const [models, datasets] = await Promise.all([hubTop("models", t), hubTop("datasets", t)]);
        return { topic: t, models, datasets };
      } catch {
        return { topic: t, models: [], datasets: [] };
      }
    }),
  );
  const todayTriaged = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'research' AND event_type = 'hf_triage' AND day_key = ?", args: [ownerId, today] });
  return {
    day: daily.day,
    unavailable,
    topics,
    papers,
    hub,
    triagedTotal: Number(xp.rows[0]?.n ?? 0),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    triagedToday: Number(todayTriaged.rows[0]?.n ?? 0),
    rules: HF_XP,
  };
}

function draftOf(p: HfPaper): PaperDraft {
  return {
    doi: `10.48550/arxiv.${p.arxivId}`,
    openalexId: null,
    title: p.title,
    authors: p.authors.map((name) => {
      const parts = name.trim().split(/\s+/);
      return { name, given: parts.length > 1 ? parts.slice(0, -1).join(" ") : null, family: parts[parts.length - 1] ?? null };
    }),
    year: p.publishedAt ? Number(p.publishedAt.slice(0, 4)) : Number(`20${p.arxivId.slice(0, 2)}`),
    venue: "arXiv",
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    abstract: p.summary,
    keywords: p.keywords,
    citedBy: null,
    citedBySource: null,
    url: `https://arxiv.org/abs/${p.arxivId}`,
    oaUrl: `https://arxiv.org/pdf/${p.arxivId}`,
    type: "preprint",
    sources: ["arXiv", "Hugging Face"],
  };
}

async function findPaper(arxivId: string, today: string): Promise<HfPaper> {
  for (let i = 0; i < 8; i++) {
    const hit = memo.get(`daily:${shiftDayKey(today, -i)}`)?.data as HfPaper[] | undefined;
    const p = hit?.find((x) => x.arxivId === arxivId);
    if (p) return p;
  }
  type RawPaper = NonNullable<RawDaily["paper"]>;
  const raw = await fetchJson<RawPaper>(`${HF}/papers/${arxivId}`, {}, { label: "Hugging Face", retries: 1 });
  const p = normalizeDaily([{ paper: raw ?? {} }])[0];
  if (!p) throw new HfError("Paper não encontrado no Hugging Face.", 404);
  return p;
}

export async function decideHfPaper(db: Client, ownerId: string, arxivId: string, decision: "salvar" | "dispensar" | "desfazer") {
  if (!/^\d{4}\.\d{4,5}$/.test(arxivId)) throw new HfError("Identificador do arXiv inválido.");
  const { today } = await userDayContext(db, ownerId);
  if (decision === "desfazer") {
    // O artigo salvo continua na biblioteca (apagar é ação explícita lá); só a triagem volta.
    await db.execute({ sql: "DELETE FROM hf_paper_triage WHERE owner_id = ? AND arxiv_id = ?", args: [ownerId, arxivId] });
    return { xp: 0, paperId: null };
  }
  const prev = await db.execute({ sql: "SELECT decision FROM hf_paper_triage WHERE owner_id = ? AND arxiv_id = ?", args: [ownerId, arxivId] });
  if (prev.rows[0]) throw new HfError("Esse paper já foi triado.", 409);
  const p = await findPaper(arxivId, today);
  let paperId: string | null = null;
  let xp = 0;
  if (decision === "salvar") {
    const r = await addPaperFromMetadata(db, ownerId, draftOf(p), { tags: ["hugging-face"] });
    paperId = r.id;
    xp += r.xp;
  }
  await db.execute({
    sql: "INSERT INTO hf_paper_triage (owner_id, arxiv_id, title, upvotes, decision, user_paper_id, day_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [ownerId, arxivId, p.title, p.upvotes, decision === "salvar" ? "salvo" : "dispensado", paperId, today],
  });
  const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'research' AND event_type = 'hf_triage' AND day_key = ?", args: [ownerId, today] });
  if (Number(n.rows[0]?.n ?? 0) < HF_XP.dailyCap) {
    const ok = await award(db, ownerId, { sourceType: "research", sourceId: `hf:${arxivId}`, eventType: "hf_triage", xp: HF_XP.triage, coins: 0, label: `Triagem de paper em alta: ${p.title.slice(0, 80)}` }, today);
    if (ok) xp += HF_XP.triage;
  }
  return { xp, paperId };
}
