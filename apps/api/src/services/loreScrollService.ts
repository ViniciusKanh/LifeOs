import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { fetchJson } from "./integrationsCore.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Pergaminho do Dia (Taverna) — fatos "Neste dia" da Wikipédia em português
 * (API REST pública, sem chave; inglês como reserva). O feed é igual para todos,
 * então fica num cache global por dia do ano. Ler o pergaminho guarda o fato na
 * coleção do usuário (um por dia).
 *
 * XP (fonte "lore"): +5 XP e 1 moeda por pergaminho lido; +25 XP a cada 7 dias seguidos.
 */

export const LORE_XP = { read: 5, coins: 1, streakBonus: 25, streakEvery: 7 } as const;
const UA = { "User-Agent": "LifeOS/1.0 (app pessoal de produtividade; https://github.com)", Accept: "application/json" };
const CACHE_HOURS = 20;

export class LoreError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 502 = 400) {
    super(message);
  }
}

export interface LoreFact {
  year: number | null;
  text: string;
  pageTitle: string | null;
  pageUrl: string | null;
  thumbUrl: string | null;
  extract: string | null;
}

type RawPage = { title?: string; titles?: { normalized?: string }; extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
type RawFeed = { selected?: Array<{ text?: string; year?: number; pages?: RawPage[] }>; events?: Array<{ text?: string; year?: number; pages?: RawPage[] }> };

export function normalizeFeed(raw: RawFeed | null): LoreFact[] {
  const list = raw?.selected?.length ? raw.selected : raw?.events ?? [];
  return list
    .filter((e) => e.text && e.text.trim().length > 10)
    .slice(0, 12)
    .map((e) => {
      const page = e.pages?.find((p) => p.thumbnail?.source) ?? e.pages?.[0];
      return {
        year: typeof e.year === "number" ? e.year : null,
        text: String(e.text).replace(/\s+/g, " ").trim().slice(0, 500),
        pageTitle: (page?.titles?.normalized ?? page?.title ?? null)?.slice(0, 160) ?? null,
        pageUrl: page?.content_urls?.desktop?.page ?? null,
        thumbUrl: page?.thumbnail?.source ?? null,
        extract: page?.extract ? page.extract.slice(0, 600) : null,
      };
    });
}

async function feedFor(db: Client, day: string): Promise<{ lang: "pt" | "en"; facts: LoreFact[] }> {
  const md = day.slice(5); // MM-DD
  const [mm, dd] = md.split("-");
  for (const lang of ["pt", "en"] as const) {
    const c = await db.execute({ sql: "SELECT json, fetched_at FROM onthisday_cache WHERE md = ? AND lang = ?", args: [md, lang] });
    const row = c.rows[0];
    if (row && Date.now() - Date.parse(`${String(row.fetched_at).replace(" ", "T")}Z`) < CACHE_HOURS * 3600_000) {
      const facts = JSON.parse(String(row.json)) as LoreFact[];
      if (facts.length) return { lang, facts };
    }
    try {
      const raw = await fetchJson<RawFeed>(`https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`, { headers: UA }, { label: "Wikipédia", timeoutMs: 10_000, retries: 1 });
      const facts = normalizeFeed(raw);
      if (facts.length) {
        await db.execute({ sql: "INSERT INTO onthisday_cache (md, lang, json, fetched_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT (md, lang) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at", args: [md, lang, JSON.stringify(facts)] });
        return { lang, facts };
      }
    } catch {
      // Sem resposta: usa o cache antigo (se houver) ou tenta o outro idioma.
      if (row) return { lang, facts: JSON.parse(String(row.json)) as LoreFact[] };
    }
  }
  return { lang: "pt", facts: [] };
}

async function streakOf(db: Client, ownerId: string, today: string) {
  const r = await db.execute({ sql: "SELECT day_key FROM lore_scrolls WHERE owner_id = ? AND day_key >= ? ORDER BY day_key DESC", args: [ownerId, shiftDayKey(today, -400)] });
  const set = new Set(r.rows.map((x) => String(x.day_key)));
  let n = 0;
  let d = set.has(today) ? today : shiftDayKey(today, -1);
  while (set.has(d)) {
    n++;
    d = shiftDayKey(d, -1);
  }
  return n;
}

export async function getLoreOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [feed, mine, total, xp] = await Promise.all([
    feedFor(db, today),
    db.execute({ sql: "SELECT * FROM lore_scrolls WHERE owner_id = ? ORDER BY day_key DESC LIMIT 60", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM lore_scrolls WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'lore'", args: [ownerId] }),
  ]);
  const collection = mine.rows.map((r) => ({ day: String(r.day_key), year: r.year == null ? null : Number(r.year), text: String(r.text), pageTitle: r.page_title == null ? null : String(r.page_title), pageUrl: r.page_url == null ? null : String(r.page_url), thumbUrl: r.thumb_url == null ? null : String(r.thumb_url) }));
  const readToday = collection.find((c) => c.day === today) ?? null;
  return {
    day: today,
    lang: feed.lang,
    facts: feed.facts.slice(0, 6),
    unavailable: feed.facts.length ? null : "A Wikipédia não respondeu agora. Tente mais tarde.",
    readToday,
    collection,
    total: Number(total.rows[0]?.n ?? 0),
    streak: await streakOf(db, ownerId, today),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: LORE_XP,
  };
}

export async function readScroll(db: Client, ownerId: string, index: number) {
  const { today } = await userDayContext(db, ownerId);
  const exists = await db.execute({ sql: "SELECT 1 FROM lore_scrolls WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  if (exists.rows[0]) throw new LoreError("O pergaminho de hoje já está na sua coleção.", 409);
  const feed = await feedFor(db, today);
  const f = feed.facts[index];
  if (!f) throw new LoreError("Fato não encontrado. Recarregue a Taverna.", 404);
  await db.execute({
    sql: "INSERT INTO lore_scrolls (owner_id, day_key, year, text, page_title, page_url, thumb_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [ownerId, today, f.year, f.text, f.pageTitle, f.pageUrl, f.thumbUrl],
  });
  let xp = 0;
  if (await award(db, ownerId, { sourceType: "lore", sourceId: `scroll:${today}`, eventType: "read", xp: LORE_XP.read, coins: LORE_XP.coins, label: `Pergaminho do dia: ${f.year ?? ""} ${f.text.slice(0, 70)}`.trim() }, today)) xp += LORE_XP.read;
  const streak = await streakOf(db, ownerId, today);
  if (streak > 0 && streak % LORE_XP.streakEvery === 0) {
    if (await award(db, ownerId, { sourceType: "lore", sourceId: `streak:${today}`, eventType: "streak", xp: LORE_XP.streakBonus, coins: 3, label: `${streak} dias seguidos de pergaminhos` }, today)) {
      xp += LORE_XP.streakBonus;
      await recordWorldEvent(db, ownerId, { type: "lore.streak", title: `${streak} pergaminhos seguidos na Taverna`, detail: `+${LORE_XP.streakBonus} XP` });
    }
  }
  return { xp, streak };
}
