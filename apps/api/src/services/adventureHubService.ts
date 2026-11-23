import type { Client } from "@libsql/client";
import { raidTrophies, raidWorldStatus } from "./raidService.js";
import { companionWorldLook } from "./companionService.js";
import { BOSSES } from "../config/raids.js";

/**
 * Resumo dos sistemas de aventura para a Vila e eventos para a Timeline.
 * Cada parte falha isolada: um sistema com problema não derruba o mundo.
 */
export async function getAdventureWorld(db: Client, ownerId: string) {
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const [raid, companion, atlas, steam, strava, spotify] = await Promise.all([
    safe(() => raidWorldStatus(db, ownerId), null),
    safe(() => companionWorldLook(db, ownerId), null),
    safe(async () => Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM atlas_places WHERE owner_id = ?", args: [ownerId] })).rows[0]?.n ?? 0), 0),
    safe(async () => {
      const r = await db.execute({ sql: "SELECT name FROM steam_games WHERE owner_id = ? AND rtime_last_played IS NOT NULL ORDER BY rtime_last_played DESC LIMIT 1", args: [ownerId] });
      return r.rows[0] ? String(r.rows[0].name) : null;
    }, null),
    safe(async () => Boolean((await db.execute({ sql: "SELECT 1 FROM strava_connections WHERE owner_id = ?", args: [ownerId] })).rows[0]), false),
    safe(async () => Boolean((await db.execute({ sql: "SELECT 1 FROM spotify_connections WHERE owner_id = ?", args: [ownerId] })).rows[0]), false),
  ]);
  return { raid, companion, atlasPlaces: atlas, steamLastGame: steam, stravaConnected: strava, spotifyConnected: spotify };
}

/** Eventos relevantes para a Timeline (sem ruído: só marcos). */
export async function adventureTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const [trophies, places, evolutions] = await Promise.all([
    raidTrophies(db, ownerId),
    db.execute({ sql: "SELECT id, name, city, first_visit_at FROM atlas_places WHERE owner_id = ? AND first_visit_at >= ? AND first_visit_at < ?", args: [ownerId, from, `${to}T23:59:59.999Z`] }),
    db.execute({ sql: "SELECT id, title, created_at FROM world_events WHERE owner_id = ? AND type = 'pet_evolved' AND created_at >= ? AND created_at <= ?", args: [ownerId, from, `${to} 23:59:59`] }),
  ]);
  return [
    ...trophies
      .filter((t) => t.defeatedAt.slice(0, 10) >= from && t.defeatedAt.slice(0, 10) <= to)
      .map((t) => ({ type: "raid", icon: "⚔️", id: `raid-${t.id}`, label: `Chefe derrotado: ${(BOSSES.find((b) => b.key === t.bossKey) ?? BOSSES[0]!).name}`, at: t.defeatedAt })),
    ...places.rows.map((p) => ({ type: "atlas", icon: "🧭", id: `atlas-${String(p.id)}`, label: `Lugar descoberto: ${String(p.name)}${p.city ? ` (${String(p.city)})` : ""}`, at: String(p.first_visit_at) })),
    ...evolutions.rows.map((e) => ({ type: "companion", icon: "🐾", id: `pet-${String(e.id)}`, label: String(e.title), at: String(e.created_at) })),
  ];
}
