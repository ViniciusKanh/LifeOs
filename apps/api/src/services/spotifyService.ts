import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { award } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";
import { IntegrationError, fetchJson, getIntegrationSecret, parseSettings } from "./integrationsCore.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Trilha Sonora do Herói (Spotify). Só registra o que foi OBSERVADO com
 * autorização: "tocadas recentemente" (a API devolve no máximo as 50 últimas,
 * sem histórico completo) e o que está tocando agora. Nada de player falso:
 * controles usam a API oficial e exigem Premium (a interface avisa).
 *
 * Insights comparam sessões com e sem música com amostra mínima e são
 * apresentados como associação observada, nunca como causa.
 */

const API = "https://api.spotify.com/v1";
export const SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-read-recently-played", "playlist-read-private", "user-modify-playback-state"];
export const SPOTIFY_CALLBACK_PATH = "/api/integrations/spotify/callback";
const MIN_SYNC_MS = 2 * 60_000;
const SESSION_MAX_MIN = 240;
export const MUSIC_SESSION_KINDS = ["foco", "estudos", "dissertacao", "codigo", "leitura", "projeto"] as const;
export type MusicSessionKind = (typeof MUSIC_SESSION_KINDS)[number];
export const PLAYLIST_SLOTS = ["foco", "codigo", "estudos", "leitura", "relaxar", "missoes", "descanso"] as const;
export const INSIGHT_MIN_SESSIONS_PER_GROUP = 5;
export const MUSIC_XP = { minMinutes: 25, xp: 10, coins: 2, dailyCap: 3 } as const;

export interface SpotifySettings {
  recordHistory: boolean;
  linkSessions: boolean;
  stats: boolean;
  insights: boolean;
  privateMode: boolean;
}
const DEFAULTS: SpotifySettings = { recordHistory: true, linkSessions: true, stats: true, insights: true, privateMode: false };

export async function spotifyAppConfig(db: Client) {
  const [clientId, clientSecret] = await Promise.all([
    getIntegrationSecret(db, "spotify", "client_id", "SPOTIFY_CLIENT_ID"),
    getIntegrationSecret(db, "spotify", "client_secret", "SPOTIFY_CLIENT_SECRET"),
  ]);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function buildSpotifyAuthUrl(clientId: string, redirectUri: string, state: string) {
  const p = new URLSearchParams({ response_type: "code", client_id: clientId, scope: SPOTIFY_SCOPES.join(" "), redirect_uri: redirectUri, state, show_dialog: "false" });
  return `https://accounts.spotify.com/authorize?${p.toString()}`;
}

interface TokenResp {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(db: Client, body: Record<string, string>): Promise<TokenResp> {
  const cfg = await spotifyAppConfig(db);
  if (!cfg) throw new IntegrationError(503, "Spotify não configurado pelo administrador.", "nao_configurado");
  return fetchJson<TokenResp>(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}` },
      body: new URLSearchParams(body).toString(),
    },
    { label: "Spotify", retries: 1 }
  );
}

export async function exchangeSpotifyCode(db: Client, ownerId: string, code: string, redirectUri: string) {
  const t = await tokenRequest(db, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new IntegrationError(502, "Spotify não devolveu o token de renovação.");
  const me = await fetchJson<{ id: string; display_name?: string; product?: string; images?: Array<{ url: string }> }>(
    `${API}/me`,
    { headers: { Authorization: `Bearer ${t.access_token}` } },
    {
      label: "Spotify",
      // Em modo de desenvolvimento o Spotify devolve 403 para contas fora da lista do app.
      forbiddenMessage:
        "O Spotify recusou o acesso: no app (developer.spotify.com → seu app → User Management) adicione o e-mail da conta Spotify que você está conectando. Se já adicionou, o Spotify pode exigir Premium na conta dona do app em modo de desenvolvimento.",
    }
  );
  await db.execute({
    sql: `INSERT INTO spotify_connections (owner_id, spotify_user_id, display_name, product, avatar_url, access_token_enc, refresh_token_enc, expires_at, scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET spotify_user_id = excluded.spotify_user_id, display_name = excluded.display_name, product = excluded.product,
            avatar_url = excluded.avatar_url, access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
            expires_at = excluded.expires_at, scope = excluded.scope, last_error = NULL`,
    args: [ownerId, me.id, me.display_name ?? null, me.product ?? null, me.images?.[0]?.url ?? null, encryptSecret(t.access_token), encryptSecret(t.refresh_token), Math.floor(Date.now() / 1000) + t.expires_in, t.scope ?? null],
  });
  await recordWorldEvent(db, ownerId, { type: "spotify_connected", title: "Spotify conectado à Taverna", detail: me.display_name ?? null });
}

async function accessToken(db: Client, ownerId: string): Promise<string> {
  const r = await db.execute({ sql: "SELECT access_token_enc, refresh_token_enc, expires_at FROM spotify_connections WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  if (!row) throw new IntegrationError(404, "Spotify não conectado.", "desconectado");
  if (Number(row.expires_at) * 1000 > Date.now() + 60_000) return decryptSecret(String(row.access_token_enc));
  try {
    const t = await tokenRequest(db, { grant_type: "refresh_token", refresh_token: decryptSecret(String(row.refresh_token_enc)) });
    await db.execute({
      sql: "UPDATE spotify_connections SET access_token_enc = ?, refresh_token_enc = COALESCE(?, refresh_token_enc), expires_at = ?, last_error = NULL WHERE owner_id = ?",
      args: [encryptSecret(t.access_token), t.refresh_token ? encryptSecret(t.refresh_token) : null, Math.floor(Date.now() / 1000) + t.expires_in, ownerId],
    });
    return t.access_token;
  } catch (err) {
    await db.execute({ sql: "UPDATE spotify_connections SET last_error = ? WHERE owner_id = ?", args: ["Autorização expirada. Conecte o Spotify novamente.", ownerId] });
    throw err;
  }
}

async function loadSettings(db: Client, ownerId: string): Promise<SpotifySettings | null> {
  const r = await db.execute({ sql: "SELECT settings_json FROM spotify_connections WHERE owner_id = ?", args: [ownerId] });
  return r.rows[0] ? parseSettings(r.rows[0].settings_json, DEFAULTS) : null;
}

export async function updateSpotifySettings(db: Client, ownerId: string, patch: Partial<SpotifySettings>) {
  const cur = await loadSettings(db, ownerId);
  if (!cur) throw new IntegrationError(404, "Spotify não conectado.", "desconectado");
  await db.execute({ sql: "UPDATE spotify_connections SET settings_json = ? WHERE owner_id = ?", args: [JSON.stringify({ ...cur, ...patch }), ownerId] });
}

interface SpTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{ id: string; name: string }>;
  album?: { name?: string; images?: Array<{ url: string; width?: number }> };
  external_urls?: { spotify?: string };
}

/** Cache de gêneros por artista (a API pode não informar gênero: fica vazio, nunca inventado). */
async function ensureGenres(db: Client, token: string, artistIds: string[]) {
  const ids = [...new Set(artistIds)].filter(Boolean);
  if (ids.length === 0) return;
  const known = await db.execute({ sql: `SELECT artist_id FROM spotify_artists_cache WHERE artist_id IN (${ids.map(() => "?").join(",")})`, args: ids });
  const missing = ids.filter((id) => !known.rows.some((k) => String(k.artist_id) === id)).slice(0, 50);
  if (missing.length === 0) return;
  let artists: Array<{ id: string; name: string; genres?: string[] }> = [];
  try {
    const res = await fetchJson<{ artists: typeof artists }>(`${API}/artists?ids=${missing.join(",")}`, { headers: { Authorization: `Bearer ${token}` } }, { label: "Spotify", retries: 0 });
    artists = res?.artists?.filter(Boolean) ?? [];
  } catch {
    // Alguns apps em modo de desenvolvimento não têm a busca em lote: consulta poucos individualmente.
    for (const id of missing.slice(0, 8)) {
      try {
        artists.push(await fetchJson(`${API}/artists/${id}`, { headers: { Authorization: `Bearer ${token}` } }, { label: "Spotify", retries: 0 }));
      } catch {
        /* sem gênero para esse artista */
      }
    }
  }
  for (const a of artists) {
    await db.execute({ sql: "INSERT OR REPLACE INTO spotify_artists_cache (artist_id, name, genres_json) VALUES (?, ?, ?)", args: [a.id, a.name, JSON.stringify(a.genres ?? [])] });
  }
}

export async function syncSpotify(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const r = await db.execute({ sql: "SELECT last_sync_at FROM spotify_connections WHERE owner_id = ?", args: [ownerId] });
  if (!r.rows[0]) throw new IntegrationError(404, "Spotify não conectado.", "desconectado");
  const last = r.rows[0].last_sync_at ? Date.parse(normalizeStoredUtc(String(r.rows[0].last_sync_at))) : 0;
  if (!opts.force && last && Date.now() - last < MIN_SYNC_MS) return { skipped: true, added: 0 };
  const settings = (await loadSettings(db, ownerId))!;
  if (!settings.recordHistory) return { skipped: true, added: 0 };
  const token = await accessToken(db, ownerId);
  const lastPlay = await db.execute({ sql: "SELECT MAX(played_at) AS at FROM spotify_plays WHERE owner_id = ?", args: [ownerId] });
  const after = lastPlay.rows[0]?.at ? Date.parse(String(lastPlay.rows[0].at)) : 0;
  let added = 0;
  try {
    const res = await fetchJson<{ items: Array<{ track: SpTrack; played_at: string }> }>(
      `${API}/me/player/recently-played?limit=50${after ? `&after=${after}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { label: "Spotify" }
    );
    const items = res?.items ?? [];
    for (const it of items) {
      if (!it.track?.id) continue;
      const ins = await db.execute({
        sql: `INSERT INTO spotify_plays (id, owner_id, track_id, track_name, artists_json, artist_ids_json, album_name, album_image, duration_ms, played_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id, played_at) DO NOTHING`,
        args: [
          nanoid(),
          ownerId,
          it.track.id,
          it.track.name,
          JSON.stringify(it.track.artists.map((a) => a.name)),
          JSON.stringify(it.track.artists.map((a) => a.id)),
          it.track.album?.name ?? null,
          it.track.album?.images?.at(-1)?.url ?? it.track.album?.images?.[0]?.url ?? null,
          it.track.duration_ms,
          new Date(it.played_at).toISOString(),
        ],
      });
      added += ins.rowsAffected;
    }
    await ensureGenres(db, token, items.flatMap((i) => i.track?.artists?.map((a) => a.id) ?? []));
    await db.execute({ sql: "UPDATE spotify_connections SET last_sync_at = ?, last_error = NULL WHERE owner_id = ?", args: [new Date().toISOString(), ownerId] });
  } catch (err) {
    await db.execute({ sql: "UPDATE spotify_connections SET last_error = ? WHERE owner_id = ?", args: [err instanceof IntegrationError ? err.message : "Falha ao sincronizar com o Spotify.", ownerId] });
    throw err;
  }
  return { skipped: false, added };
}

const nowPlayingCache = new Map<string, { at: number; value: unknown }>();

export async function nowPlaying(db: Client, ownerId: string) {
  const hit = nowPlayingCache.get(ownerId);
  if (hit && Date.now() - hit.at < 15_000) return hit.value as Awaited<ReturnType<typeof fetchNowPlaying>>;
  const value = await fetchNowPlaying(db, ownerId);
  nowPlayingCache.set(ownerId, { at: Date.now(), value });
  return value;
}

async function fetchNowPlaying(db: Client, ownerId: string) {
  const token = await accessToken(db, ownerId);
  const res = await fetchJson<{ is_playing: boolean; progress_ms: number; item?: SpTrack; currently_playing_type?: string } | null>(
    `${API}/me/player/currently-playing`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: "Spotify", retries: 0, timeoutMs: 6000 }
  );
  if (!res || !res.item) return null;
  return {
    isPlaying: res.is_playing,
    progressMs: res.progress_ms,
    durationMs: res.item.duration_ms,
    trackId: res.item.id,
    track: res.item.name,
    artists: res.item.artists.map((a) => a.name),
    album: res.item.album?.name ?? null,
    image: res.item.album?.images?.[0]?.url ?? null,
    url: res.item.external_urls?.spotify ?? `https://open.spotify.com/track/${res.item.id}`,
  };
}

export async function playerControl(db: Client, ownerId: string, action: "play" | "pause" | "next" | "previous") {
  const token = await accessToken(db, ownerId);
  const map = { play: ["PUT", "play"], pause: ["PUT", "pause"], next: ["POST", "next"], previous: ["POST", "previous"] } as const;
  try {
    await fetchJson(`${API}/me/player/${map[action][1]}`, { method: map[action][0], headers: { Authorization: `Bearer ${token}` } }, { label: "Spotify", retries: 0 });
  } catch (err) {
    if (err instanceof IntegrationError && (err.code === "acesso_negado" || err.code === "nao_encontrado")) {
      throw new IntegrationError(403, "Controle de reprodução exige Spotify Premium e um dispositivo ativo. Abra o Spotify para continuar.", "premium");
    }
    throw err;
  }
  nowPlayingCache.delete(ownerId);
}

export async function listUserPlaylists(db: Client, ownerId: string) {
  const token = await accessToken(db, ownerId);
  const res = await fetchJson<{ items: Array<{ id: string; name: string; images?: Array<{ url: string }>; external_urls?: { spotify?: string }; tracks?: { total?: number } }> }>(
    `${API}/me/playlists?limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: "Spotify" }
  );
  return (res?.items ?? []).filter(Boolean).map((p) => ({ id: p.id, name: p.name, image: p.images?.[0]?.url ?? null, url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`, tracks: p.tracks?.total ?? null }));
}

export async function setJourneyPlaylist(db: Client, ownerId: string, slot: (typeof PLAYLIST_SLOTS)[number], p: { id: string; name: string; image?: string | null; url?: string | null } | null) {
  if (!p) {
    await db.execute({ sql: "DELETE FROM journey_playlists WHERE owner_id = ? AND slot = ?", args: [ownerId, slot] });
    return;
  }
  await db.execute({
    sql: `INSERT INTO journey_playlists (owner_id, slot, playlist_id, name, image, url) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, slot) DO UPDATE SET playlist_id = excluded.playlist_id, name = excluded.name, image = excluded.image, url = excluded.url, updated_at = datetime('now')`,
    args: [ownerId, slot, p.id, p.name.slice(0, 120), p.image ?? null, p.url ?? `https://open.spotify.com/playlist/${p.id}`],
  });
}

/* ─────────────────────────── Sessões ─────────────────────────── */

export async function startSession(db: Client, ownerId: string, kind: MusicSessionKind) {
  await stopOpenSessions(db, ownerId);
  const id = nanoid();
  await db.execute({ sql: "INSERT INTO music_sessions (id, owner_id, kind, started_at) VALUES (?, ?, ?, ?)", args: [id, ownerId, kind, new Date().toISOString()] });
  return id;
}

/** Encerra a sessão aberta (sessões esquecidas são cortadas em 4 h). */
export async function stopOpenSessions(db: Client, ownerId: string) {
  const open = await db.execute({ sql: "SELECT id, started_at FROM music_sessions WHERE owner_id = ? AND ended_at IS NULL", args: [ownerId] });
  for (const s of open.rows) {
    const start = Date.parse(String(s.started_at));
    const end = Math.min(Date.now(), start + SESSION_MAX_MIN * 60_000);
    await db.execute({ sql: "UPDATE music_sessions SET ended_at = ? WHERE id = ? AND owner_id = ? AND ended_at IS NULL", args: [new Date(end).toISOString(), String(s.id), ownerId] });
    const minutes = Math.round((end - start) / 60_000);
    if (minutes >= MUSIC_XP.minMinutes) {
      const { tz } = await userDayContext(db, ownerId);
      const day = localDayOfStored(new Date(end).toISOString(), tz);
      const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'music' AND day_key = ?", args: [ownerId, day] });
      if (Number(n.rows[0]?.n ?? 0) < MUSIC_XP.dailyCap) {
        await award(db, ownerId, { sourceType: "music", sourceId: String(s.id), eventType: "session", xp: MUSIC_XP.xp, coins: MUSIC_XP.coins, label: `Sessão na Trilha Sonora (${minutes} min)` }, day);
      }
    }
  }
  return open.rows.length;
}

export async function deleteSession(db: Client, ownerId: string, id: string) {
  await db.execute({ sql: "DELETE FROM music_sessions WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
}

interface SessionStat {
  id: string;
  kind: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  tasks: number;
  plays: number;
  listenedMin: number;
  withMusic: boolean;
  topGenre: string | null;
  topArtist: string | null;
  cover: string | null;
}

/** Estatísticas por sessão: tarefas concluídas e faixas observadas dentro da janela. */
export function summarizeSessions(
  sessions: Array<{ id: string; kind: string; started_at: string; ended_at: string | null }>,
  tasks: Array<{ completed_at: string }>,
  plays: Array<{ played_at: string; duration_ms: number; artist_ids: string[]; artists: string[]; album_image: string | null }>,
  genres: Map<string, string[]>,
  now = Date.now()
): SessionStat[] {
  return sessions.map((s) => {
    const a = Date.parse(normalizeStoredUtc(s.started_at));
    const b = s.ended_at ? Date.parse(normalizeStoredUtc(s.ended_at)) : Math.min(now, a + SESSION_MAX_MIN * 60_000);
    const inWin = (iso: string) => {
      const t = Date.parse(normalizeStoredUtc(iso));
      return t >= a && t <= b;
    };
    // played_at é o fim da faixa: considera faixas terminadas dentro da sessão.
    const ps = plays.filter((p) => inWin(p.played_at));
    const genreCount = new Map<string, number>();
    const artistCount = new Map<string, number>();
    for (const p of ps) {
      for (const id of p.artist_ids) for (const g of genres.get(id) ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
      if (p.artists[0]) artistCount.set(p.artists[0], (artistCount.get(p.artists[0]) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    return {
      id: s.id,
      kind: s.kind,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      minutes: Math.max(0, Math.round((b - a) / 60_000)),
      tasks: tasks.filter((t) => inWin(t.completed_at)).length,
      plays: ps.length,
      listenedMin: Math.round(ps.reduce((x, p) => x + p.duration_ms, 0) / 60_000),
      withMusic: ps.length >= 3,
      topGenre: top(genreCount),
      topArtist: top(artistCount),
      cover: ps.at(-1)?.album_image ?? null,
    };
  });
}

/** Compara tarefas/hora em sessões com e sem música. Exige amostra mínima nos dois grupos. */
export function musicInsight(stats: SessionStat[]) {
  const done = stats.filter((s) => s.endedAt && s.minutes >= 15);
  const rate = (xs: SessionStat[]) => {
    const h = xs.reduce((a, s) => a + s.minutes, 0) / 60;
    return h > 0 ? xs.reduce((a, s) => a + s.tasks, 0) / h : 0;
  };
  const withM = done.filter((s) => s.withMusic);
  const without = done.filter((s) => !s.withMusic);
  if (withM.length < INSIGHT_MIN_SESSIONS_PER_GROUP || without.length < INSIGHT_MIN_SESSIONS_PER_GROUP) {
    return {
      sufficient: false as const,
      message: "Dados insuficientes para avaliar a relação entre música e produtividade.",
      need: `São necessárias ao menos ${INSIGHT_MIN_SESSIONS_PER_GROUP} sessões concluídas com música e ${INSIGHT_MIN_SESSIONS_PER_GROUP} sem música (de 15 min ou mais).`,
      withMusic: withM.length,
      withoutMusic: without.length,
    };
  }
  const rw = rate(withM);
  const ro = rate(without);
  const diffPct = ro > 0 ? Math.round(((rw - ro) / ro) * 100) : null;
  const avgMin = (xs: SessionStat[]) => Math.round(xs.reduce((a, s) => a + s.minutes, 0) / xs.length);
  // Por gênero: só gêneros com amostra mínima própria.
  const byGenre = new Map<string, SessionStat[]>();
  for (const s of withM) if (s.topGenre) byGenre.set(s.topGenre, [...(byGenre.get(s.topGenre) ?? []), s]);
  const genres = [...byGenre.entries()]
    .filter(([, xs]) => xs.length >= INSIGHT_MIN_SESSIONS_PER_GROUP)
    .map(([g, xs]) => ({ genre: g, sessions: xs.length, tasksPerHour: Math.round(rate(xs) * 100) / 100 }))
    .sort((a, b) => b.tasksPerHour - a.tasksPerHour);
  return {
    sufficient: true as const,
    withMusic: withM.length,
    withoutMusic: without.length,
    tasksPerHourWith: Math.round(rw * 100) / 100,
    tasksPerHourWithout: Math.round(ro * 100) / 100,
    diffPct,
    avgMinutesWith: avgMin(withM),
    avgMinutesWithout: avgMin(without),
    durationCaveat: Math.abs(avgMin(withM) - avgMin(without)) > 20,
    genres,
    message:
      diffPct == null
        ? "Sem tarefas concluídas nas sessões sem música para comparar."
        : `Nas sessões observadas com música, você concluiu ${Math.abs(diffPct)}% ${diffPct >= 0 ? "mais" : "menos"} tarefas por hora do que nas sessões sem música.`,
    caveat: "Associação observada nos seus registros, não prova de causa. Tipo de atividade, horário e duração também influenciam.",
  };
}

export async function getSpotifyOverview(db: Client, ownerId: string) {
  const cfg = await spotifyAppConfig(db);
  const r = await db.execute({ sql: "SELECT display_name, product, avatar_url, settings_json, connected_at, last_sync_at, last_error, scope FROM spotify_connections WHERE owner_id = ?", args: [ownerId] });
  const conn = r.rows[0];
  const settings = conn ? parseSettings(conn.settings_json, DEFAULTS) : DEFAULTS;
  const { tz, today } = await userDayContext(db, ownerId);
  const from = `${shiftDayKey(today, -30)}T00:00:00.000Z`;
  const [sessionsR, tasksR, playsR, open, playlists] = await Promise.all([
    db.execute({ sql: "SELECT id, kind, started_at, ended_at FROM music_sessions WHERE owner_id = ? AND datetime(started_at) >= datetime(?) ORDER BY started_at DESC", args: [ownerId, from] }),
    db.execute({ sql: "SELECT completed_at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL AND datetime(completed_at) >= datetime(?)", args: [ownerId, from] }),
    settings.recordHistory
      ? db.execute({ sql: "SELECT track_name, artists_json, artist_ids_json, album_name, album_image, duration_ms, played_at FROM spotify_plays WHERE owner_id = ? AND datetime(played_at) >= datetime(?) ORDER BY played_at DESC", args: [ownerId, from] })
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    db.execute({ sql: "SELECT id, kind, started_at FROM music_sessions WHERE owner_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1", args: [ownerId] }),
    db.execute({ sql: "SELECT slot, playlist_id, name, image, url FROM journey_playlists WHERE owner_id = ?", args: [ownerId] }),
  ]);
  const plays = playsR.rows.map((p) => ({
    track: String(p.track_name),
    played_at: String(p.played_at),
    duration_ms: Number(p.duration_ms),
    artists: JSON.parse(String(p.artists_json)) as string[],
    artist_ids: JSON.parse(String(p.artist_ids_json)) as string[],
    album_image: p.album_image == null ? null : String(p.album_image),
  }));
  const artistIds = [...new Set(plays.flatMap((p) => p.artist_ids))];
  const genres = new Map<string, string[]>();
  if (artistIds.length) {
    for (let i = 0; i < artistIds.length; i += 200) {
      const chunk = artistIds.slice(i, i + 200);
      const g = await db.execute({ sql: `SELECT artist_id, genres_json FROM spotify_artists_cache WHERE artist_id IN (${chunk.map(() => "?").join(",")})`, args: chunk });
      for (const row of g.rows) genres.set(String(row.artist_id), JSON.parse(String(row.genres_json)) as string[]);
    }
  }
  const sessions = sessionsR.rows.map((s) => ({ id: String(s.id), kind: String(s.kind), started_at: String(s.started_at), ended_at: s.ended_at == null ? null : String(s.ended_at) }));
  const stats = settings.linkSessions ? summarizeSessions(sessions, tasksR.rows.map((t) => ({ completed_at: String(t.completed_at) })), plays, genres) : summarizeSessions(sessions, tasksR.rows.map((t) => ({ completed_at: String(t.completed_at) })), [], genres);
  const finished = stats.filter((s) => s.endedAt);

  // Gêneros das faixas observadas (30 dias). Faixas sem gênero informado ficam em "Sem gênero informado".
  const genreRows = new Map<string, { plays: number; sessions: number; tasks: number; minutes: number }>();
  for (const p of plays) {
    const gs = [...new Set(p.artist_ids.flatMap((id) => genres.get(id) ?? []))];
    const g = gs[0] ?? "Sem gênero informado";
    const cur = genreRows.get(g) ?? { plays: 0, sessions: 0, tasks: 0, minutes: 0 };
    cur.plays++;
    genreRows.set(g, cur);
  }
  for (const s of finished) {
    if (!s.topGenre) continue;
    const cur = genreRows.get(s.topGenre) ?? { plays: 0, sessions: 0, tasks: 0, minutes: 0 };
    cur.sessions++;
    cur.tasks += s.tasks;
    cur.minutes += s.minutes;
    genreRows.set(s.topGenre, cur);
  }
  const openSession = open.rows[0]
    ? (() => {
        const st = stats.find((s) => s.id === String(open.rows[0]!.id));
        return { id: String(open.rows[0]!.id), kind: String(open.rows[0]!.kind), startedAt: String(open.rows[0]!.started_at), tasks: st?.tasks ?? 0, plays: st?.plays ?? 0 };
      })()
    : null;
  const hidden = settings.privateMode;

  return {
    configured: Boolean(cfg),
    connection: conn
      ? {
          displayName: conn.display_name == null ? null : String(conn.display_name),
          product: conn.product == null ? null : String(conn.product),
          premium: String(conn.product ?? "") === "premium",
          avatarUrl: conn.avatar_url == null ? null : String(conn.avatar_url),
          connectedAt: String(conn.connected_at),
          lastSyncAt: conn.last_sync_at == null ? null : String(conn.last_sync_at),
          lastError: conn.last_error == null ? null : String(conn.last_error),
        }
      : null,
    settings,
    openSession,
    summary: {
      listenedMin: settings.stats ? Math.round(plays.reduce((a, p) => a + p.duration_ms, 0) / 60_000) : null,
      plays: plays.length,
      sessions: finished.length,
      sessionsWithMusic: finished.filter((s) => s.withMusic).length,
      tasksInSessions: finished.reduce((a, s) => a + s.tasks, 0),
      avgSessionMin: finished.length ? Math.round(finished.reduce((a, s) => a + s.minutes, 0) / finished.length) : 0,
      coverageNote: "O Spotify só informa as 50 faixas mais recentes a cada sincronização: escutas longas entre sincronizações podem ficar de fora.",
    },
    genres: settings.stats
      ? [...genreRows.entries()]
          .map(([genre, v]) => ({ genre, ...v, tasksPerHour: v.minutes > 0 ? Math.round((v.tasks / (v.minutes / 60)) * 100) / 100 : null }))
          .sort((a, b) => b.plays - a.plays)
          .slice(0, 8)
      : [],
    sessions: stats.slice(0, 15).map((s) => ({ ...s, topArtist: hidden ? null : s.topArtist, day: localDayOfStored(s.startedAt, tz) })),
    recentPlays: hidden ? [] : plays.slice(0, 10).map((p) => ({ track: p.track, artists: p.artists, playedAt: p.played_at, image: p.album_image })),
    insight: settings.insights ? musicInsight(stats) : null,
    playlists: playlists.rows.map((p) => ({ slot: String(p.slot), id: String(p.playlist_id), name: String(p.name), image: p.image == null ? null : String(p.image), url: p.url == null ? null : String(p.url) })),
    sessionKinds: MUSIC_SESSION_KINDS,
    playlistSlots: PLAYLIST_SLOTS,
  };
}

export async function deleteSpotifyHistory(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM spotify_plays WHERE owner_id = ?", args: [ownerId] });
}

export async function disconnectSpotify(db: Client, ownerId: string, opts: { deleteData: boolean }) {
  // O Spotify não tem endpoint de revogação: o usuário remove o acesso em spotify.com/account/apps.
  await db.execute({ sql: "DELETE FROM spotify_connections WHERE owner_id = ?", args: [ownerId] });
  nowPlayingCache.delete(ownerId);
  if (opts.deleteData) {
    await deleteSpotifyHistory(db, ownerId);
    await db.execute({ sql: "DELETE FROM journey_playlists WHERE owner_id = ?", args: [ownerId] });
  }
}
