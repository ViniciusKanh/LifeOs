import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { resolvePublicKey } from "./publicApiKeysService.js";

/**
 * Vitral do Céu (Meu Mundo) — Astronomy Picture of the Day da NASA. A imagem do
 * dia é pública e igual para todos: fica num cache global por data. Sem chave
 * pessoal nem do servidor usa a DEMO_KEY da NASA (limite baixo, compartilhado).
 *
 * Álbum: colecionar um céu dos últimos 7 dias paga +5 XP e 1 moeda (fonte "sky");
 * a cada 10 céus no álbum, +30 XP.
 */

export const SKY_XP = { collect: 5, coins: 1, milestone: 30, milestoneEvery: 10, windowDays: 7 } as const;

export class SkyError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

export interface Apod {
  date: string;
  title: string;
  explanation: string;
  mediaType: "image" | "video" | "other";
  url: string | null;
  hdUrl: string | null;
  thumbUrl: string | null;
  copyright: string | null;
}

type RawApod = { date?: string; title?: string; explanation?: string; media_type?: string; url?: string; hdurl?: string; thumbnail_url?: string; copyright?: string };

export function normalizeApod(r: RawApod): Apod | null {
  if (!r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.title) return null;
  const media = r.media_type === "image" || r.media_type === "video" ? r.media_type : "other";
  const safe = (u?: string) => (u && /^https:\/\//i.test(u) ? u : u && /^http:\/\//i.test(u) ? u.replace(/^http:/i, "https:") : null);
  return {
    date: r.date,
    title: r.title.slice(0, 200),
    explanation: (r.explanation ?? "").slice(0, 4000),
    mediaType: media,
    url: safe(r.url),
    hdUrl: safe(r.hdurl),
    thumbUrl: media === "image" ? safe(r.url) : safe(r.thumbnail_url),
    copyright: r.copyright ? r.copyright.replace(/\s+/g, " ").trim().slice(0, 160) : null,
  };
}

async function apiKey(db: Client, ownerId: string) {
  const { key, status } = await resolvePublicKey(db, ownerId, "nasa");
  return { key: key ?? "DEMO_KEY", status };
}

/** Lê do cache global; busca na NASA o que falta (uma chamada por intervalo). */
async function apodRange(db: Client, ownerId: string, from: string, to: string): Promise<Apod[]> {
  const cached = await db.execute({ sql: "SELECT date, json FROM apod_cache WHERE date >= ? AND date <= ?", args: [from, to] });
  const have = new Map(cached.rows.map((r) => [String(r.date), JSON.parse(String(r.json)) as Apod]));
  const wanted: string[] = [];
  for (let d = from; d <= to; d = shiftDayKey(d, 1)) wanted.push(d);
  const missing = wanted.filter((d) => !have.has(d));
  if (missing.length) {
    const { key } = await apiKey(db, ownerId);
    // A APOD sai pelo horário dos EUA: a data local de hoje pode ainda não existir (400/404).
    const end = missing[missing.length - 1]!;
    const start = missing[0]!;
    let raw: RawApod[] | null = null;
    for (const e of [end, shiftDayKey(end, -1)]) {
      if (e < start) break;
      try {
        raw = await fetchJson<RawApod[]>(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&start_date=${start}&end_date=${e}&thumbs=true`, {}, { label: "NASA APOD", timeoutMs: 12_000, retries: 1 });
        break;
      } catch (err) {
        if (err instanceof IntegrationError && (err.status === 400 || err.status === 404)) continue;
        if (err instanceof IntegrationError && err.status === 429) throw new SkyError("Limite da NASA atingido (a chave DEMO_KEY é compartilhada). Configure sua chave gratuita em api.nasa.gov.", 429);
        if (err instanceof IntegrationError && (err.status === 401 || err.status === 403)) throw new SkyError("A NASA recusou a chave. Confira a chave em api.nasa.gov.", 422);
        throw new SkyError("A NASA não respondeu agora. Tente em alguns minutos.", 502);
      }
    }
    const list = (raw ?? []).map(normalizeApod).filter((x): x is Apod => !!x);
    if (list.length) {
      await db.batch(
        list.map((a) => ({ sql: "INSERT INTO apod_cache (date, json) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET json = excluded.json, fetched_at = datetime('now')", args: [a.date, JSON.stringify(a)] })),
        "write",
      );
      for (const a of list) have.set(a.date, a);
    }
  }
  return wanted.map((d) => have.get(d)).filter((x): x is Apod => !!x).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getSkyOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -(SKY_XP.windowDays - 1));
  let recent: Apod[] = [];
  let unavailable: string | null = null;
  try {
    recent = await apodRange(db, ownerId, from, today);
  } catch (e) {
    unavailable = e instanceof Error ? e.message : "A NASA não respondeu agora.";
    const c = await db.execute({ sql: "SELECT json FROM apod_cache WHERE date >= ? ORDER BY date DESC", args: [from] });
    recent = c.rows.map((r) => JSON.parse(String(r.json)) as Apod);
  }
  const [album, count, xp, { status }] = await Promise.all([
    db.execute({ sql: "SELECT date, title, media_type, thumb_url, collected_at FROM sky_album WHERE owner_id = ? ORDER BY date DESC LIMIT 60", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM sky_album WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'sky'", args: [ownerId] }),
    apiKey(db, ownerId),
  ]);
  const collected = new Set(album.rows.map((r) => String(r.date)));
  return {
    key: status,
    usingDemoKey: !status.source,
    unavailable,
    today: recent[0] ? { ...recent[0], collected: collected.has(recent[0].date) } : null,
    recent: recent.map((a) => ({ date: a.date, title: a.title, mediaType: a.mediaType, thumbUrl: a.thumbUrl, collected: collected.has(a.date) })),
    album: album.rows.map((r) => ({ date: String(r.date), title: String(r.title), mediaType: r.media_type == null ? null : String(r.media_type), thumbUrl: r.thumb_url == null ? null : String(r.thumb_url) })),
    albumCount: Number(count.rows[0]?.n ?? 0),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: SKY_XP,
  };
}

export async function getApod(db: Client, date: string): Promise<Apod | null> {
  const r = await db.execute({ sql: "SELECT json FROM apod_cache WHERE date = ?", args: [date] });
  return r.rows[0] ? (JSON.parse(String(r.rows[0].json)) as Apod) : null;
}

export async function collectSky(db: Client, ownerId: string, date: string) {
  const { today } = await userDayContext(db, ownerId);
  if (date > today || date < shiftDayKey(today, -(SKY_XP.windowDays - 1))) throw new SkyError("Só dá para colecionar céus dos últimos 7 dias.", 400);
  const a = await getApod(db, date);
  if (!a) throw new SkyError("Esse céu ainda não foi carregado. Abra o Vitral e tente de novo.", 404);
  const ins = await db.execute({
    sql: "INSERT INTO sky_album (owner_id, date, title, media_type, thumb_url) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    args: [ownerId, a.date, a.title, a.mediaType, a.thumbUrl],
  });
  if (!ins.rowsAffected) throw new SkyError("Esse céu já está no seu álbum.", 409);
  let xp = 0;
  if (await award(db, ownerId, { sourceType: "sky", sourceId: `apod:${a.date}`, eventType: "collect", xp: SKY_XP.collect, coins: SKY_XP.coins, label: `Céu colecionado: ${a.title.slice(0, 80)}` }, today)) xp += SKY_XP.collect;
  const n = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM sky_album WHERE owner_id = ?", args: [ownerId] })).rows[0]?.n ?? 0);
  if (n > 0 && n % SKY_XP.milestoneEvery === 0) {
    if (await award(db, ownerId, { sourceType: "sky", sourceId: `album:${n}`, eventType: "milestone", xp: SKY_XP.milestone, coins: 5, label: `Álbum do Vitral com ${n} céus` }, today)) {
      xp += SKY_XP.milestone;
      await recordWorldEvent(db, ownerId, { type: "sky.milestone", title: `O Vitral do Céu chegou a ${n} céus colecionados`, detail: `+${SKY_XP.milestone} XP` });
    }
  }
  return { xp, albumCount: n };
}
