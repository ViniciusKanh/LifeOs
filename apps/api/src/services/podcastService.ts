import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { userDayContext } from "./localDayService.js";

/**
 * Leitura em Áudio (Biblioteca) — podcasts seguidos e episódios ouvidos, com
 * busca e episódios do Podcast Index (chave + segredo gratuitos, criptografados;
 * ou PODCASTINDEX_KEY/PODCASTINDEX_SECRET no servidor). O áudio toca direto do
 * feed do podcast; o LifeOS só registra o que o usuário marcou como ouvido,
 * com a duração real do episódio vinda da API.
 *
 * XP (fonte "podcast"): +5 XP por episódio; +10 XP e 1 moeda a cada 30 min
 * ouvidos no dia (até 8 blocos); +40 XP e 5 moedas ao bater a meta do mês.
 */

export const PODCAST_XP = { episode: 5, block: 10, blockMinutes: 30, maxBlocks: 8, goal: 40, goalCoins: 5 } as const;
const BASE = "https://api.podcastindex.org/api/1.0";
const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs)";

export class PodcastError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

/** Cabeçalhos de autenticação do Podcast Index: SHA-1 de chave + segredo + data (segundos). */
export function podcastAuthHeaders(key: string, secret: string, now = Date.now()) {
  const date = String(Math.floor(now / 1000));
  return { "User-Agent": UA, "X-Auth-Key": key, "X-Auth-Date": date, Authorization: createHash("sha1").update(key + secret + date).digest("hex"), Accept: "application/json" };
}

async function creds(db: Client, ownerId: string): Promise<{ key: string; secret: string; source: "pessoal" | "servidor"; masked: string | null } | null> {
  const r = await db.execute({ sql: "SELECT key_enc, secret_enc, masked FROM podcast_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  if (row) {
    try {
      return { key: decryptSecret(String(row.key_enc)), secret: decryptSecret(String(row.secret_enc)), source: "pessoal", masked: row.masked == null ? null : String(row.masked) };
    } catch {
      /* chave de criptografia trocada: tenta a do servidor */
    }
  }
  const key = process.env.PODCASTINDEX_KEY?.trim();
  const secret = process.env.PODCASTINDEX_SECRET?.trim();
  return key && secret ? { key, secret, source: "servidor", masked: null } : null;
}

async function pi<T>(c: { key: string; secret: string }, path: string): Promise<T> {
  try {
    return await fetchJson<T>(`${BASE}${path}`, { headers: podcastAuthHeaders(c.key, c.secret) }, { label: "Podcast Index", timeoutMs: 12_000, retries: 1 });
  } catch (e) {
    if (e instanceof IntegrationError && (e.status === 401 || e.status === 403)) throw new PodcastError("O Podcast Index recusou a chave. Confira a API Key e o API Secret.", 422);
    if (e instanceof IntegrationError) throw new PodcastError(e.message, 502);
    throw e;
  }
}

async function need(db: Client, ownerId: string) {
  const c = await creds(db, ownerId);
  if (!c) throw new PodcastError("Configure a chave do Podcast Index para buscar podcasts.", 422);
  return c;
}

export async function savePodcastKeys(db: Client, ownerId: string, key: string, secret: string) {
  const k = key.trim();
  const s = secret.trim();
  await pi<{ status?: string }>({ key: k, secret: s }, "/search/byterm?q=ciencia&max=1");
  await db.execute({
    sql: `INSERT INTO podcast_accounts (owner_id, key_enc, secret_enc, masked) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET key_enc = excluded.key_enc, secret_enc = excluded.secret_enc, masked = excluded.masked`,
    args: [ownerId, encryptSecret(k), encryptSecret(s), `••••${k.slice(-4)}`],
  });
}

export async function removePodcastKeys(db: Client, ownerId: string) {
  // A meta do mês mora na mesma linha e sai junto; episódios ouvidos e XP continuam.
  await db.execute({ sql: "DELETE FROM podcast_accounts WHERE owner_id = ?", args: [ownerId] });
}

type RawFeed = { id: number; title?: string; author?: string; ownerName?: string; image?: string; artwork?: string; link?: string; url?: string; description?: string; episodeCount?: number; language?: string };
type RawEpisode = { id: number; title?: string; datePublished?: number; duration?: number | null; enclosureUrl?: string; enclosureType?: string; feedId?: number; feedTitle?: string; image?: string; feedImage?: string; link?: string };

const httpsOnly = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u.replace(/^http:/i, "https:") : null);
const feedOut = (f: RawFeed) => ({ feedId: f.id, title: (f.title ?? "Podcast").slice(0, 160), author: (f.author ?? f.ownerName ?? null)?.slice(0, 120) ?? null, imageUrl: httpsOnly(f.artwork || f.image), siteUrl: f.link ?? null, episodes: f.episodeCount ?? null, language: f.language ?? null });

export async function searchPodcasts(db: Client, ownerId: string, q: string) {
  const c = await need(db, ownerId);
  const r = await pi<{ feeds?: RawFeed[] }>(c, `/search/byterm?q=${encodeURIComponent(q)}&max=12`);
  const follows = await db.execute({ sql: "SELECT feed_id FROM podcast_follows WHERE owner_id = ?", args: [ownerId] });
  const set = new Set(follows.rows.map((x) => Number(x.feed_id)));
  return (r?.feeds ?? []).map((f) => ({ ...feedOut(f), following: set.has(f.id) }));
}

export async function followPodcast(db: Client, ownerId: string, feedId: number) {
  const c = await need(db, ownerId);
  const r = await pi<{ feed?: RawFeed }>(c, `/podcasts/byfeedid?id=${feedId}`);
  if (!r?.feed?.id) throw new PodcastError("Podcast não encontrado.", 404);
  const f = feedOut(r.feed);
  await db.execute({
    sql: "INSERT INTO podcast_follows (owner_id, feed_id, title, author, image_url, site_url) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id, feed_id) DO UPDATE SET title = excluded.title, author = excluded.author, image_url = excluded.image_url",
    args: [ownerId, f.feedId, f.title, f.author, f.imageUrl, f.siteUrl],
  });
  episodesMemo.delete(ownerId);
  return f;
}

export async function unfollowPodcast(db: Client, ownerId: string, feedId: number) {
  const r = await db.execute({ sql: "DELETE FROM podcast_follows WHERE owner_id = ? AND feed_id = ?", args: [ownerId, feedId] });
  if (!r.rowsAffected) throw new PodcastError("Você não segue esse podcast.", 404);
  episodesMemo.delete(ownerId);
}

const episodesMemo = new Map<string, { at: number; key: string; items: RawEpisode[] }>();
export function resetPodcastCacheForTests() {
  episodesMemo.clear();
}

export function episodeOut(e: RawEpisode, feedTitles: Map<number, string>) {
  return {
    episodeId: e.id,
    feedId: e.feedId ?? 0,
    title: (e.title ?? "Episódio").slice(0, 200),
    podcastTitle: (e.feedId ? feedTitles.get(e.feedId) : null) ?? e.feedTitle ?? null,
    publishedAt: e.datePublished ? new Date(e.datePublished * 1000).toISOString() : null,
    durationSeconds: e.duration && e.duration > 0 ? Math.round(e.duration) : null,
    audioUrl: httpsOnly(e.enclosureUrl),
    imageUrl: httpsOnly(e.image || e.feedImage),
    link: e.link ?? null,
  };
}

/** Paga episódio, blocos de 30 min do dia e meta do mês. Exportada para testes. */
export async function rewardListen(db: Client, ownerId: string, episodeId: number, title: string, today: string) {
  let xp = 0;
  if (await award(db, ownerId, { sourceType: "podcast", sourceId: `ep:${episodeId}`, eventType: "episode", xp: PODCAST_XP.episode, coins: 0, label: `Episódio ouvido: ${title.slice(0, 80)}` }, today)) xp += PODCAST_XP.episode;
  const day = await db.execute({ sql: "SELECT COALESCE(SUM(duration_seconds), 0) AS s FROM podcast_listens WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  const blocks = Math.min(PODCAST_XP.maxBlocks, Math.floor(Number(day.rows[0]?.s ?? 0) / (PODCAST_XP.blockMinutes * 60)));
  for (let b = 1; b <= blocks; b++) {
    if (await award(db, ownerId, { sourceType: "podcast", sourceId: `day:${today}`, eventType: `bloco_${b}`, xp: PODCAST_XP.block, coins: 1, label: `Leitura em áudio: ${b * PODCAST_XP.blockMinutes} min no dia` }, today)) xp += PODCAST_XP.block;
  }
  const goal = await db.execute({ sql: "SELECT monthly_goal FROM podcast_accounts WHERE owner_id = ?", args: [ownerId] });
  const target = goal.rows[0]?.monthly_goal == null ? null : Number(goal.rows[0].monthly_goal);
  let goalHit = false;
  if (target) {
    const month = today.slice(0, 7);
    const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM podcast_listens WHERE owner_id = ? AND substr(day_key, 1, 7) = ?", args: [ownerId, month] });
    if (Number(n.rows[0]?.n ?? 0) >= target && (await award(db, ownerId, { sourceType: "podcast", sourceId: `goal:${month}`, eventType: "month_goal", xp: PODCAST_XP.goal, coins: PODCAST_XP.goalCoins, label: `Meta de episódios do mês (${target})` }, today))) {
      xp += PODCAST_XP.goal;
      goalHit = true;
    }
  }
  return { xp, goalHit };
}

export async function markListened(db: Client, ownerId: string, episodeId: number) {
  const c = await need(db, ownerId);
  const r = await pi<{ episode?: RawEpisode }>(c, `/episodes/byid?id=${episodeId}`);
  const e = r?.episode;
  if (!e?.id) throw new PodcastError("Episódio não encontrado.", 404);
  const follows = await db.execute({ sql: "SELECT feed_id, title FROM podcast_follows WHERE owner_id = ?", args: [ownerId] });
  const titles = new Map(follows.rows.map((x) => [Number(x.feed_id), String(x.title)]));
  const ep = episodeOut(e, titles);
  const { today } = await userDayContext(db, ownerId);
  // Duração real da API, limitada a 6 h (feeds às vezes trazem valores absurdos).
  const duration = ep.durationSeconds == null ? null : Math.min(ep.durationSeconds, 6 * 3600);
  const ins = await db.execute({
    sql: "INSERT OR IGNORE INTO podcast_listens (owner_id, episode_id, feed_id, title, podcast_title, duration_seconds, day_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [ownerId, ep.episodeId, ep.feedId, ep.title, ep.podcastTitle, duration, today],
  });
  if (!ins.rowsAffected) throw new PodcastError("Esse episódio já está marcado como ouvido.", 409);
  return rewardListen(db, ownerId, ep.episodeId, ep.title, today);
}

export async function unmarkListened(db: Client, ownerId: string, episodeId: number) {
  // Corrige o registro; o XP já pago fica no histórico (o ledger não é desfeito).
  const r = await db.execute({ sql: "DELETE FROM podcast_listens WHERE owner_id = ? AND episode_id = ?", args: [ownerId, episodeId] });
  if (!r.rowsAffected) throw new PodcastError("Episódio não estava marcado.", 404);
}

export async function setPodcastGoal(db: Client, ownerId: string, goal: number | null) {
  const r = await db.execute({ sql: "UPDATE podcast_accounts SET monthly_goal = ? WHERE owner_id = ?", args: [goal, ownerId] });
  if (!r.rowsAffected) throw new PodcastError("Configure a sua chave do Podcast Index para definir a meta.", 409);
}

export async function getPodcastOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const c = await creds(db, ownerId);
  const [follows, listens, stats, month, goalRow, xp] = await Promise.all([
    db.execute({ sql: "SELECT * FROM podcast_follows WHERE owner_id = ? ORDER BY followed_at DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT episode_id FROM podcast_listens WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n, COALESCE(SUM(duration_seconds), 0) AS s, SUM(CASE WHEN day_key = ? THEN COALESCE(duration_seconds, 0) ELSE 0 END) AS today FROM podcast_listens WHERE owner_id = ?", args: [today, ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM podcast_listens WHERE owner_id = ? AND substr(day_key, 1, 7) = ?", args: [ownerId, today.slice(0, 7)] }),
    db.execute({ sql: "SELECT monthly_goal FROM podcast_accounts WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'podcast'", args: [ownerId] }),
  ]);
  const titles = new Map(follows.rows.map((f) => [Number(f.feed_id), String(f.title)]));
  let episodes: ReturnType<typeof episodeOut>[] = [];
  let unavailable: string | null = null;
  if (c && follows.rows.length) {
    const ids = follows.rows.map((f) => Number(f.feed_id)).slice(0, 50).join(",");
    const hit = episodesMemo.get(ownerId);
    try {
      let items: RawEpisode[];
      if (hit && hit.key === ids && Date.now() - hit.at < 30 * 60_000) items = hit.items;
      else {
        const r = await pi<{ items?: RawEpisode[] }>(c, `/episodes/byfeedid?id=${ids}&max=40`);
        items = r?.items ?? [];
        episodesMemo.set(ownerId, { at: Date.now(), key: ids, items });
      }
      episodes = items.map((e) => episodeOut(e, titles)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, 30);
    } catch (e) {
      unavailable = e instanceof Error ? e.message : "O Podcast Index não respondeu agora.";
    }
  }
  const done = new Set(listens.rows.map((l) => Number(l.episode_id)));
  const recent = await db.execute({ sql: "SELECT * FROM podcast_listens WHERE owner_id = ? ORDER BY listened_at DESC LIMIT 10", args: [ownerId] });
  return {
    key: { source: c?.source ?? null, masked: c?.masked ?? null },
    follows: follows.rows.map((f) => ({ feedId: Number(f.feed_id), title: String(f.title), author: f.author == null ? null : String(f.author), imageUrl: f.image_url == null ? null : String(f.image_url), siteUrl: f.site_url == null ? null : String(f.site_url) })),
    episodes: episodes.map((e) => ({ ...e, listened: done.has(e.episodeId) })),
    recent: recent.rows.map((l) => ({ episodeId: Number(l.episode_id), title: String(l.title), podcastTitle: l.podcast_title == null ? null : String(l.podcast_title), durationSeconds: l.duration_seconds == null ? null : Number(l.duration_seconds), day: String(l.day_key) })),
    unavailable,
    stats: { episodes: Number(stats.rows[0]?.n ?? 0), seconds: Number(stats.rows[0]?.s ?? 0), todaySeconds: Number(stats.rows[0]?.today ?? 0), month: Number(month.rows[0]?.n ?? 0), podcasts: follows.rows.length },
    goal: goalRow.rows[0]?.monthly_goal == null ? null : Number(goalRow.rows[0].monthly_goal),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: PODCAST_XP,
  };
}

export async function podcastTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({ sql: "SELECT day_key, COUNT(*) AS n, COALESCE(SUM(duration_seconds), 0) AS s FROM podcast_listens WHERE owner_id = ? AND day_key >= ? AND day_key <= ? GROUP BY day_key", args: [ownerId, from, to] });
  return r.rows.map((x) => ({ type: "reading", icon: "🎧", id: `podcast-${String(x.day_key)}`, label: `${Number(x.n)} episódio(s) de podcast (${Math.round(Number(x.s) / 60)} min)`, at: `${String(x.day_key)}T20:30:00.000Z` }));
}
