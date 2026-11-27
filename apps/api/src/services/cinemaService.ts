import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { resolvePublicKey } from "./publicApiKeysService.js";

/**
 * Sala de Cinema — filmes e séries do usuário (quero ver, assistindo, visto,
 * abandonado), com nota e comentário. Os metadados vêm do TMDB (chave v3 ou
 * token de leitura v4). O TMDB exige o aviso de atribuição na tela.
 *
 * XP (fonte "cinema"): +10 XP e 1 moeda por título visto (até 3 por dia),
 * +50 XP e 5 moedas ao bater a meta do mês.
 */

export const CINEMA_XP = { watched: 10, coins: 1, dailyCap: 3, monthGoal: 50, monthGoalCoins: 5 } as const;
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export class CinemaError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

type MediaType = "movie" | "tv";
type RawResult = { id: number; media_type?: string; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; overview?: string; genre_ids?: number[]; vote_average?: number };
type RawDetails = RawResult & { runtime?: number | null; episode_run_time?: number[]; number_of_seasons?: number; genres?: Array<{ id: number; name: string }> };

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 401 || err.status === 403) throw new CinemaError("O TMDB recusou a chave. Confira a chave da API (v3) ou o token de leitura (v4).", 422);
    if (err.status === 404) throw new CinemaError("Título não encontrado no TMDB.", 404);
    if (err.status === 429) throw new CinemaError("O TMDB limitou as consultas. Tente em instantes.", 429);
    throw new CinemaError(err.message, 502);
  }
  throw err;
}

async function tmdb<T>(db: Client, ownerId: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const { key } = await resolvePublicKey(db, ownerId, "tmdb");
  if (!key) throw new CinemaError("Configure a chave do TMDB para buscar filmes e séries.", 422);
  const bearer = key.startsWith("eyJ");
  const qs = new URLSearchParams({ language: "pt-BR", ...params, ...(bearer ? {} : { api_key: key }) });
  return fetchJson<T>(`${TMDB}${path}?${qs.toString()}`, { headers: bearer ? { Authorization: `Bearer ${key}`, Accept: "application/json" } : { Accept: "application/json" } }, { label: "TMDB", timeoutMs: 10_000 }).catch(friendly);
}

const genreMemo = new Map<string, { at: number; map: Map<number, string> }>();
async function genres(db: Client, ownerId: string): Promise<Map<number, string>> {
  const hit = genreMemo.get("all");
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.map;
  const [m, t] = await Promise.all([tmdb<{ genres?: Array<{ id: number; name: string }> }>(db, ownerId, "/genre/movie/list"), tmdb<{ genres?: Array<{ id: number; name: string }> }>(db, ownerId, "/genre/tv/list")]);
  const map = new Map<number, string>();
  for (const g of [...(m?.genres ?? []), ...(t?.genres ?? [])]) map.set(g.id, g.name);
  genreMemo.set("all", { at: Date.now(), map });
  return map;
}

export function normalizeResult(r: RawResult, mediaType: MediaType | null, genreNames: Map<number, string>) {
  const type = (mediaType ?? r.media_type) as MediaType;
  const date = type === "movie" ? r.release_date : r.first_air_date;
  return {
    tmdbId: r.id,
    mediaType: type,
    title: String((type === "movie" ? r.title : r.name) ?? r.title ?? r.name ?? "Sem título").slice(0, 200),
    originalTitle: (type === "movie" ? r.original_title : r.original_name) ?? null,
    year: date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
    posterUrl: r.poster_path ? `${IMG}/w342${r.poster_path}` : null,
    overview: r.overview ? r.overview.slice(0, 600) : null,
    genres: (r.genre_ids ?? []).map((g) => genreNames.get(g)).filter((x): x is string => !!x).slice(0, 4),
    voteAverage: typeof r.vote_average === "number" ? Math.round(r.vote_average * 10) / 10 : null,
  };
}

async function decorate(db: Client, ownerId: string, list: ReturnType<typeof normalizeResult>[]) {
  const r = await db.execute({ sql: "SELECT id, media_type, tmdb_id, status FROM cinema_items WHERE owner_id = ?", args: [ownerId] });
  const mine = new Map(r.rows.map((x) => [`${String(x.media_type)}:${Number(x.tmdb_id)}`, { id: String(x.id), status: String(x.status) }]));
  return list.map((x) => ({ ...x, mine: mine.get(`${x.mediaType}:${x.tmdbId}`) ?? null }));
}

export async function searchTitles(db: Client, ownerId: string, q: string) {
  const [raw, g] = await Promise.all([tmdb<{ results?: RawResult[] }>(db, ownerId, "/search/multi", { query: q, include_adult: "false" }), genres(db, ownerId)]);
  const list = (raw?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 18).map((r) => normalizeResult(r, null, g));
  return decorate(db, ownerId, list);
}

export async function trendingTitles(db: Client, ownerId: string) {
  const [raw, g] = await Promise.all([tmdb<{ results?: RawResult[] }>(db, ownerId, "/trending/all/week"), genres(db, ownerId)]);
  const list = (raw?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 18).map((r) => normalizeResult(r, null, g));
  return decorate(db, ownerId, list);
}

export async function addTitle(db: Client, ownerId: string, p: { mediaType: MediaType; tmdbId: number; status?: "quero_ver" | "assistindo" | "visto" }) {
  const dup = await db.execute({ sql: "SELECT id FROM cinema_items WHERE owner_id = ? AND media_type = ? AND tmdb_id = ?", args: [ownerId, p.mediaType, p.tmdbId] });
  if (dup.rows[0]) throw new CinemaError("Esse título já está na sua Sala de Cinema.", 409);
  const d = await tmdb<RawDetails>(db, ownerId, `/${p.mediaType}/${p.tmdbId}`);
  if (!d?.id) throw new CinemaError("Título não encontrado no TMDB.", 404);
  const base = normalizeResult({ ...d, genre_ids: [] }, p.mediaType, new Map());
  const genreNames = (d.genres ?? []).map((g) => g.name).slice(0, 6);
  const runtime = p.mediaType === "movie" ? d.runtime ?? null : d.episode_run_time?.[0] ?? null;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO cinema_items (id, owner_id, tmdb_id, media_type, title, original_title, year, poster_path, overview, genres_json, runtime_minutes, seasons, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quero_ver')`,
    args: [id, ownerId, p.tmdbId, p.mediaType, base.title, base.originalTitle, base.year, d.poster_path ?? null, base.overview, JSON.stringify(genreNames), runtime, p.mediaType === "tv" ? d.number_of_seasons ?? null : null],
  });
  let xp = 0;
  if (p.status && p.status !== "quero_ver") xp = (await updateTitle(db, ownerId, id, { status: p.status })).xp;
  return { id, xp };
}

export async function updateTitle(db: Client, ownerId: string, id: string, p: { status?: "quero_ver" | "assistindo" | "visto" | "abandonado"; rating?: number | null; review?: string | null; watchedDay?: string | null }) {
  const r = await db.execute({ sql: "SELECT * FROM cinema_items WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = r.rows[0];
  if (!row) throw new CinemaError("Título não encontrado.", 404);
  const { today } = await userDayContext(db, ownerId);
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (p.status !== undefined) {
    sets.push("status = ?");
    args.push(p.status);
    if (p.status === "visto" && row.watched_at == null) {
      const day = p.watchedDay && p.watchedDay <= today ? p.watchedDay : today;
      sets.push("watched_at = ?", "watched_day = ?");
      args.push(new Date().toISOString(), day);
    }
    if (p.status !== "visto") sets.push("watched_at = NULL", "watched_day = NULL");
  } else if (p.watchedDay !== undefined && String(row.status) === "visto" && p.watchedDay && p.watchedDay <= today) {
    sets.push("watched_day = ?");
    args.push(p.watchedDay);
  }
  if (p.rating !== undefined) {
    sets.push("rating = ?");
    args.push(p.rating);
  }
  if (p.review !== undefined) {
    sets.push("review = ?");
    args.push(p.review ? p.review.slice(0, 2000) : null);
  }
  if (!sets.length) return { xp: 0, monthGoal: false };
  await db.execute({ sql: `UPDATE cinema_items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });

  let xp = 0;
  let monthGoal = false;
  if (p.status === "visto") {
    const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'cinema' AND event_type = 'watched' AND day_key = ?", args: [ownerId, today] });
    if (Number(n.rows[0]?.n ?? 0) < CINEMA_XP.dailyCap) {
      if (await award(db, ownerId, { sourceType: "cinema", sourceId: `item:${id}`, eventType: "watched", xp: CINEMA_XP.watched, coins: CINEMA_XP.coins, label: `Assistiu: ${String(row.title).slice(0, 80)}` }, today)) xp += CINEMA_XP.watched;
    }
    const goal = await db.execute({ sql: "SELECT monthly_goal FROM cinema_settings WHERE owner_id = ?", args: [ownerId] });
    const target = goal.rows[0]?.monthly_goal == null ? null : Number(goal.rows[0].monthly_goal);
    if (target) {
      const month = today.slice(0, 7);
      const c = await db.execute({ sql: "SELECT COUNT(*) AS n FROM cinema_items WHERE owner_id = ? AND status = 'visto' AND substr(watched_day, 1, 7) = ?", args: [ownerId, month] });
      if (Number(c.rows[0]?.n ?? 0) >= target) {
        if (await award(db, ownerId, { sourceType: "cinema", sourceId: `goal:${month}`, eventType: "month_goal", xp: CINEMA_XP.monthGoal, coins: CINEMA_XP.monthGoalCoins, label: `Meta de cinema do mês (${target})` }, today)) {
          xp += CINEMA_XP.monthGoal;
          monthGoal = true;
          await recordWorldEvent(db, ownerId, { type: "cinema.goal", title: `Meta de cinema do mês batida (${target} títulos)`, detail: `+${CINEMA_XP.monthGoal} XP` });
        }
      }
    }
  }
  return { xp, monthGoal };
}

export async function deleteTitle(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM cinema_items WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new CinemaError("Título não encontrado.", 404);
}

export async function saveCinemaGoal(db: Client, ownerId: string, goal: number | null) {
  await db.execute({
    sql: "INSERT INTO cinema_settings (owner_id, monthly_goal) VALUES (?, ?) ON CONFLICT (owner_id) DO UPDATE SET monthly_goal = excluded.monthly_goal, updated_at = datetime('now')",
    args: [ownerId, goal],
  });
}

export async function getCinemaOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const month = today.slice(0, 7);
  const [items, settings, xp, { status }] = await Promise.all([
    db.execute({ sql: "SELECT * FROM cinema_items WHERE owner_id = ? ORDER BY CASE status WHEN 'assistindo' THEN 0 WHEN 'quero_ver' THEN 1 WHEN 'visto' THEN 2 ELSE 3 END, COALESCE(watched_day, '') DESC, added_at DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT monthly_goal FROM cinema_settings WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'cinema'", args: [ownerId] }),
    resolvePublicKey(db, ownerId, "tmdb"),
  ]);
  const list = items.rows.map((r) => ({
    id: String(r.id),
    tmdbId: Number(r.tmdb_id),
    mediaType: String(r.media_type) as MediaType,
    title: String(r.title),
    originalTitle: r.original_title == null ? null : String(r.original_title),
    year: r.year == null ? null : Number(r.year),
    posterUrl: r.poster_path == null ? null : `${IMG}/w342${String(r.poster_path)}`,
    overview: r.overview == null ? null : String(r.overview),
    genres: JSON.parse(String(r.genres_json ?? "[]")) as string[],
    runtimeMinutes: r.runtime_minutes == null ? null : Number(r.runtime_minutes),
    seasons: r.seasons == null ? null : Number(r.seasons),
    status: String(r.status) as "quero_ver" | "assistindo" | "visto" | "abandonado",
    rating: r.rating == null ? null : Number(r.rating),
    review: r.review == null ? null : String(r.review),
    watchedDay: r.watched_day == null ? null : String(r.watched_day),
  }));
  const watched = list.filter((x) => x.status === "visto");
  const rated = watched.filter((x) => x.rating != null);
  const genreCount = new Map<string, number>();
  for (const w of watched) for (const g of w.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  return {
    key: status,
    items: list,
    goal: settings.rows[0]?.monthly_goal == null ? null : Number(settings.rows[0].monthly_goal),
    stats: {
      month: watched.filter((x) => x.watchedDay?.startsWith(month)).length,
      watched: watched.length,
      queue: list.filter((x) => x.status === "quero_ver").length,
      watching: list.filter((x) => x.status === "assistindo").length,
      avgRating: rated.length ? Math.round((rated.reduce((a, x) => a + x.rating!, 0) / rated.length) * 10) / 10 : null,
      movieMinutes: watched.filter((x) => x.mediaType === "movie").reduce((a, x) => a + (x.runtimeMinutes ?? 0), 0),
    },
    genres: [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: CINEMA_XP,
  };
}

export async function cinemaTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({ sql: "SELECT id, title, media_type, rating, watched_day FROM cinema_items WHERE owner_id = ? AND status = 'visto' AND watched_day >= ? AND watched_day <= ?", args: [ownerId, from, to] });
  return r.rows.map((x) => ({ type: "cinema", icon: "🎬", id: `cinema-${String(x.id)}`, label: `${String(x.media_type) === "tv" ? "Série" : "Filme"} visto: ${String(x.title)}${x.rating == null ? "" : ` (nota ${Number(x.rating)})`}`.slice(0, 160), at: `${String(x.watched_day)}T22:00:00.000Z` }));
}
