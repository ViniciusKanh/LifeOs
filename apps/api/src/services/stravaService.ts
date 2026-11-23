import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { award } from "./gamificationService.js";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";
import { WORKOUT_CATEGORY_LABELS, normalizeStoredUtc, type WorkoutCategory } from "./healthService.js";
import { IntegrationError, fetchJson, getIntegrationSecret, parseSettings } from "./integrationsCore.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { importStravaRoute } from "./atlasService.js";

/**
 * Strava → Saúde. OAuth 2.0 com escopo mínimo (read + activity:read: atividades
 * privadas "Só você" não são lidas). Os treinos entram na tabela `workouts` já
 * existente (source = 'strava'), então Saúde, Vitalidade do Dia, hábitos
 * automáticos, Raid, Analytics e Timeline reagem sem nenhuma cópia extra.
 *
 * Idempotência: índice único (owner, source, external_id) + INSERT ... ON CONFLICT
 * DO NOTHING; XP por award() com sourceId = id do treino.
 */

const API = "https://www.strava.com/api/v3";
const SCOPE = "read,activity:read";
const BACKFILL_DAYS = 30;
const MIN_SYNC_INTERVAL_MS = 5 * 60_000;
export const STRAVA_CALLBACK_PATH = "/api/integrations/strava/callback";

export const STRAVA_XP = { min: 10, max: 60, perMinute: 0.6, perKm: 2, dailyCap: 3, coins: 3, weeklyBonus: { days: 3, xp: 30, coins: 10 } } as const;

export interface StravaSettings {
  autoImport: boolean;
  registerChronicle: boolean;
  awardXp: boolean;
}
const DEFAULT_SETTINGS: StravaSettings = { autoImport: true, registerChronicle: true, awardXp: true };

export async function stravaAppConfig(db: Client) {
  const [clientId, clientSecret, verifyToken] = await Promise.all([
    getIntegrationSecret(db, "strava", "client_id", "STRAVA_CLIENT_ID"),
    getIntegrationSecret(db, "strava", "client_secret", "STRAVA_CLIENT_SECRET"),
    getIntegrationSecret(db, "strava", "webhook_verify_token", "STRAVA_WEBHOOK_VERIFY_TOKEN"),
  ]);
  return clientId && clientSecret ? { clientId, clientSecret, verifyToken } : null;
}

export function buildStravaAuthUrl(clientId: string, redirectUri: string, state: string) {
  const p = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, approval_prompt: "auto", scope: SCOPE, state });
  return `https://www.strava.com/oauth/authorize?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string; username?: string; profile?: string };
}

export async function exchangeStravaCode(db: Client, ownerId: string, code: string, grantedScope: string | null) {
  const cfg = await stravaAppConfig(db);
  if (!cfg) throw new IntegrationError(503, "Strava não configurado pelo administrador.", "nao_configurado");
  if (grantedScope && !grantedScope.split(",").includes("activity:read") && !grantedScope.split(",").includes("activity:read_all")) {
    throw new IntegrationError(400, "A permissão de leitura de atividades não foi concedida no Strava.", "escopo");
  }
  const t = await fetchJson<TokenResponse>(
    "https://www.strava.com/oauth/token",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: "authorization_code" }) },
    { label: "Strava", retries: 1 }
  );
  if (!t?.athlete?.id) throw new IntegrationError(502, "Strava não retornou o atleta.");
  const athleteId = String(t.athlete.id);
  const other = await db.execute({ sql: "SELECT owner_id FROM strava_connections WHERE athlete_id = ? AND owner_id <> ?", args: [athleteId, ownerId] });
  if (other.rows[0]) throw new IntegrationError(409, "Esta conta Strava já está ligada a outro usuário do LifeOS.", "em_uso");
  const name = [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(" ") || null;
  await db.execute({
    sql: `INSERT INTO strava_connections (owner_id, athlete_id, athlete_name, athlete_username, avatar_url, access_token_enc, refresh_token_enc, expires_at, scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET athlete_id = excluded.athlete_id, athlete_name = excluded.athlete_name,
            athlete_username = excluded.athlete_username, avatar_url = excluded.avatar_url, access_token_enc = excluded.access_token_enc,
            refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at, scope = excluded.scope, last_error = NULL`,
    args: [ownerId, athleteId, name, t.athlete.username ?? null, t.athlete.profile ?? null, encryptSecret(t.access_token), encryptSecret(t.refresh_token), t.expires_at, grantedScope ?? SCOPE],
  });
  await recordWorldEvent(db, ownerId, { type: "strava_connected", title: "Strava conectado ao Campo de Treinamento", detail: name ?? undefined });
}

/** Token válido (renova 2 min antes de expirar). Falha de refresh marca a conexão com erro. */
async function accessToken(db: Client, ownerId: string): Promise<string> {
  const r = await db.execute({ sql: "SELECT access_token_enc, refresh_token_enc, expires_at FROM strava_connections WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  if (!row) throw new IntegrationError(404, "Strava não conectado.", "desconectado");
  if (Number(row.expires_at) * 1000 > Date.now() + 120_000) return decryptSecret(String(row.access_token_enc));
  const cfg = await stravaAppConfig(db);
  if (!cfg) throw new IntegrationError(503, "Strava não configurado pelo administrador.", "nao_configurado");
  try {
    const t = await fetchJson<TokenResponse>(
      "https://www.strava.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token", refresh_token: decryptSecret(String(row.refresh_token_enc)) }),
      },
      { label: "Strava", retries: 1 }
    );
    await db.execute({
      sql: "UPDATE strava_connections SET access_token_enc = ?, refresh_token_enc = ?, expires_at = ?, last_error = NULL WHERE owner_id = ?",
      args: [encryptSecret(t.access_token), encryptSecret(t.refresh_token), t.expires_at, ownerId],
    });
    return t.access_token;
  } catch (err) {
    await db.execute({ sql: "UPDATE strava_connections SET last_error = ? WHERE owner_id = ?", args: ["Autorização expirada. Conecte o Strava novamente.", ownerId] });
    throw err;
  }
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  private?: boolean;
  visibility?: string;
  map?: { summary_polyline?: string | null };
}

/** Mapeia o sport_type do Strava para as categorias de treino do LifeOS. */
export function categoryForSport(sport: string): WorkoutCategory {
  const s = sport.toLowerCase();
  if (s.includes("run")) return "corrida";
  if (s.includes("walk") || s.includes("hike")) return "caminhada";
  if (s.includes("ride") || s.includes("bike") || s.includes("cycl")) return "bike";
  if (s.includes("swim")) return "natacao";
  if (s.includes("weight")) return "musculacao";
  if (s.includes("crossfit")) return "crossfit";
  if (s.includes("hiit") || s.includes("highintensity")) return "hiit";
  if (s.includes("yoga")) return "yoga";
  if (s.includes("pilates")) return "pilates";
  if (["soccer", "basketball", "volleyball", "tennis", "badminton", "squash", "pickleball", "racquetball", "tabletennis"].some((k) => s.includes(k))) return "esporte_coletivo";
  if (s.includes("workout") || s.includes("elliptical") || s.includes("stair") || s.includes("rowing")) return "funcional";
  return "outro";
}

export function xpForActivity(minutes: number, km: number | null): number {
  return Math.round(Math.min(STRAVA_XP.max, Math.max(STRAVA_XP.min, minutes * STRAVA_XP.perMinute + (km ?? 0) * STRAVA_XP.perKm)));
}

function externalJson(a: StravaActivity, linked: boolean) {
  // Só métricas que a API de fato entregou; rota fica fora (privacidade).
  return JSON.stringify({
    name: a.name,
    sport: a.sport_type ?? a.type ?? null,
    movingSec: a.moving_time,
    elapsedSec: a.elapsed_time,
    elevationM: a.total_elevation_gain ?? null,
    avgSpeedMs: a.average_speed ?? null,
    avgHr: a.average_heartrate ?? null,
    maxHr: a.max_heartrate ?? null,
    linkedManual: linked,
  });
}

/** Importa (ou vincula) uma atividade. Retorna o id do treino e se é novo. */
export async function importActivity(db: Client, ownerId: string, a: StravaActivity, settings: StravaSettings): Promise<{ workoutId: string | null; created: boolean; linked: boolean }> {
  if (a.private || a.visibility === "only_me") return { workoutId: null, created: false, linked: false };
  const externalId = String(a.id);
  const existing = await db.execute({ sql: "SELECT id FROM workouts WHERE owner_id = ? AND source = 'strava' AND external_id = ?", args: [ownerId, externalId] });
  if (existing.rows[0]) return { workoutId: String(existing.rows[0].id), created: false, linked: false };

  const category = categoryForSport(a.sport_type ?? a.type ?? "");
  const minutes = Math.max(1, Math.round((a.moving_time || a.elapsed_time) / 60));
  const km = a.distance > 0 ? Math.round((a.distance / 1000) * 100) / 100 : null;
  const startMs = Date.parse(a.start_date);

  // Vínculo com registro manual equivalente (mesma categoria, início ±90 min, duração parecida).
  const near = await db.execute({
    sql: `SELECT id, performed_at, duration_minutes, distance_km FROM workouts WHERE owner_id = ? AND source IS NULL AND category = ?
            AND datetime(performed_at) BETWEEN datetime(?) AND datetime(?)`,
    args: [ownerId, category, new Date(startMs - 90 * 60_000).toISOString(), new Date(startMs + 90 * 60_000).toISOString()],
  });
  const match = near.rows.find((w) => {
    const d = Number(w.duration_minutes ?? 0);
    return Math.abs(d - minutes) <= Math.max(10, minutes * 0.3);
  });
  let workoutId: string;
  let created = false;
  if (match) {
    workoutId = String(match.id);
    await db.execute({
      sql: "UPDATE workouts SET source = 'strava', external_id = ?, external_json = ?, distance_km = COALESCE(distance_km, ?), calories = COALESCE(calories, ?) WHERE id = ? AND owner_id = ? AND source IS NULL",
      args: [externalId, externalJson(a, true), km, a.calories ?? null, workoutId, ownerId],
    });
  } else {
    workoutId = nanoid();
    const ins = await db.execute({
      sql: `INSERT INTO workouts (id, owner_id, kind, category, duration_minutes, distance_km, calories, notes, performed_at, source, external_id, external_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'strava', ?, ?) ON CONFLICT DO NOTHING`,
      args: [workoutId, ownerId, WORKOUT_CATEGORY_LABELS[category], category, minutes, km, a.calories ?? null, a.name.slice(0, 500), new Date(startMs).toISOString(), externalId, externalJson(a, false)],
    });
    if (ins.rowsAffected === 0) return { workoutId: null, created: false, linked: false };
    created = true;
    await syncAutoHabitsAfterWrite(db, ownerId, new Date(startMs).toISOString());
  }

  const { tz } = await userDayContext(db, ownerId);
  const day = localDayOfStored(new Date(startMs).toISOString(), tz);
  if (settings.awardXp) await awardWorkout(db, ownerId, workoutId, a.name, minutes, km, day);
  if (settings.registerChronicle && created) {
    await recordWorldEvent(db, ownerId, {
      type: "strava_activity",
      title: `${WORKOUT_CATEGORY_LABELS[category]}${km ? ` de ${km.toLocaleString("pt-BR")} km` : ""} registrada`,
      detail: `${a.name} · ${minutes} min`,
      refId: workoutId,
    });
  }
  const route = a.map?.summary_polyline;
  if (route) await importStravaRoute(db, ownerId, { workoutId, name: a.name, polyline: route, distanceKm: km, startedAt: new Date(startMs).toISOString() });
  return { workoutId, created, linked: Boolean(match) };
}

async function awardWorkout(db: Client, ownerId: string, workoutId: string, name: string, minutes: number, km: number | null, day: string) {
  const today = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'workout' AND event_type = 'imported' AND day_key = ?",
    args: [ownerId, day],
  });
  if (Number(today.rows[0]?.n ?? 0) >= STRAVA_XP.dailyCap) return;
  await award(db, ownerId, { sourceType: "workout", sourceId: workoutId, eventType: "imported", xp: xpForActivity(minutes, km), coins: STRAVA_XP.coins, label: `Treino: ${name}`.slice(0, 120) }, day);
  // Consistência semanal: 3 dias diferentes com treino na semana → bônus único da semana.
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const weekStart = shiftDayKey(day, -((dow + 6) % 7));
  const days = await db.execute({
    sql: "SELECT COUNT(DISTINCT day_key) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'workout' AND event_type = 'imported' AND day_key >= ? AND day_key <= ?",
    args: [ownerId, weekStart, shiftDayKey(weekStart, 6)],
  });
  if (Number(days.rows[0]?.n ?? 0) >= STRAVA_XP.weeklyBonus.days) {
    await award(db, ownerId, { sourceType: "workout", sourceId: `semana:${weekStart}`, eventType: "weekly_consistency", xp: STRAVA_XP.weeklyBonus.xp, coins: STRAVA_XP.weeklyBonus.coins, label: "Consistência semanal de treinos" }, day);
  }
}

async function loadSettings(db: Client, ownerId: string): Promise<StravaSettings | null> {
  const r = await db.execute({ sql: "SELECT settings_json FROM strava_connections WHERE owner_id = ?", args: [ownerId] });
  return r.rows[0] ? parseSettings(r.rows[0].settings_json, DEFAULT_SETTINGS) : null;
}

/** Reconciliação: busca atividades desde a última sincronização (backfill de 30 dias na primeira). */
export async function syncStrava(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const r = await db.execute({ sql: "SELECT last_sync_at, connected_at FROM strava_connections WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  if (!row) throw new IntegrationError(404, "Strava não conectado.", "desconectado");
  const last = row.last_sync_at ? Date.parse(normalizeStoredUtc(String(row.last_sync_at))) : 0;
  if (!opts.force && last && Date.now() - last < MIN_SYNC_INTERVAL_MS) return { skipped: true, imported: 0, linked: 0 };
  const settings = (await loadSettings(db, ownerId))!;
  const token = await accessToken(db, ownerId);
  // Janela com folga de 2 dias para pegar edições e atividades enviadas com atraso.
  const afterMs = last ? last - 2 * 86_400_000 : Date.now() - BACKFILL_DAYS * 86_400_000;
  let imported = 0;
  let linked = 0;
  try {
    for (let page = 1; page <= 3; page++) {
      const list = await fetchJson<StravaActivity[]>(
        `${API}/athlete/activities?after=${Math.floor(afterMs / 1000)}&per_page=100&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { label: "Strava" }
      );
      for (const a of list ?? []) {
        const res = await importActivity(db, ownerId, a, settings);
        if (res.created) imported++;
        if (res.linked) linked++;
      }
      if (!list || list.length < 100) break;
    }
    await db.execute({ sql: "UPDATE strava_connections SET last_sync_at = ?, last_sync_status = 'ok', last_error = NULL WHERE owner_id = ?", args: [new Date().toISOString(), ownerId] });
  } catch (err) {
    const msg = err instanceof IntegrationError ? err.message : "Falha ao sincronizar com o Strava.";
    await db.execute({ sql: "UPDATE strava_connections SET last_sync_status = 'erro', last_error = ? WHERE owner_id = ?", args: [msg, ownerId] });
    throw err;
  }
  return { skipped: false, imported, linked };
}

export async function disconnectStrava(db: Client, ownerId: string, opts: { deleteData: boolean }) {
  try {
    const token = await accessToken(db, ownerId);
    // Revoga no Strava (best effort): o usuário sai mesmo se a API estiver fora.
    await fetchJson("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, { label: "Strava", retries: 0 });
  } catch {
    /* segue com a remoção local */
  }
  await db.execute({ sql: "DELETE FROM strava_connections WHERE owner_id = ?", args: [ownerId] });
  if (opts.deleteData) {
    // Remove os treinos criados pela importação; os manuais vinculados voltam a ser manuais.
    await db.execute({ sql: "DELETE FROM workouts WHERE owner_id = ? AND source = 'strava' AND COALESCE(json_extract(external_json, '$.linkedManual'), 0) = 0", args: [ownerId] });
    await db.execute({ sql: "UPDATE workouts SET source = NULL, external_id = NULL, external_json = NULL WHERE owner_id = ? AND source = 'strava'", args: [ownerId] });
    await db.execute({ sql: "DELETE FROM atlas_routes WHERE owner_id = ? AND source = 'strava'", args: [ownerId] });
  }
}

export async function updateStravaSettings(db: Client, ownerId: string, patch: Partial<StravaSettings>) {
  const cur = await loadSettings(db, ownerId);
  if (!cur) throw new IntegrationError(404, "Strava não conectado.", "desconectado");
  await db.execute({ sql: "UPDATE strava_connections SET settings_json = ? WHERE owner_id = ?", args: [JSON.stringify({ ...cur, ...patch }), ownerId] });
}

/* ─────────────────────────── Webhook ─────────────────────────── */

export interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  event_time: number;
  updates?: Record<string, string>;
}

export async function handleStravaWebhook(db: Client, ev: StravaWebhookEvent): Promise<string> {
  const key = `${ev.object_type}:${ev.object_id}:${ev.aspect_type}:${ev.event_time}`;
  const ins = await db.execute({
    sql: "INSERT INTO strava_webhook_events (id, event_key, athlete_id, object_type, object_id, aspect) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (event_key) DO NOTHING",
    args: [nanoid(), key, String(ev.owner_id), ev.object_type, String(ev.object_id), ev.aspect_type],
  });
  if (ins.rowsAffected === 0) return "duplicado";
  const mark = (status: string) => db.execute({ sql: "UPDATE strava_webhook_events SET status = ?, processed_at = datetime('now') WHERE event_key = ?", args: [status, key] });
  const conn = await db.execute({ sql: "SELECT owner_id FROM strava_connections WHERE athlete_id = ?", args: [String(ev.owner_id)] });
  const ownerId = conn.rows[0] ? String(conn.rows[0].owner_id) : null;
  if (!ownerId) {
    await mark("ignorado");
    return "ignorado";
  }
  try {
    if (ev.object_type === "athlete" && ev.updates?.authorized === "false") {
      await db.execute({ sql: "DELETE FROM strava_connections WHERE owner_id = ?", args: [ownerId] });
    } else if (ev.object_type === "activity" && ev.aspect_type === "delete") {
      await db.execute({ sql: "DELETE FROM workouts WHERE owner_id = ? AND source = 'strava' AND external_id = ? AND COALESCE(json_extract(external_json, '$.linkedManual'), 0) = 0", args: [ownerId, String(ev.object_id)] });
      await db.execute({ sql: "UPDATE workouts SET source = NULL, external_id = NULL, external_json = NULL WHERE owner_id = ? AND source = 'strava' AND external_id = ?", args: [ownerId, String(ev.object_id)] });
    } else if (ev.object_type === "activity") {
      const settings = (await loadSettings(db, ownerId)) ?? DEFAULT_SETTINGS;
      if (!settings.autoImport && ev.aspect_type === "create") {
        await mark("ignorado");
        return "ignorado";
      }
      const token = await accessToken(db, ownerId);
      const a = await fetchJson<StravaActivity>(`${API}/activities/${ev.object_id}`, { headers: { Authorization: `Bearer ${token}` } }, { label: "Strava", retries: 0, timeoutMs: 1500 });
      if (ev.aspect_type === "update") {
        if (a.private || a.visibility === "only_me") {
          // Ficou privada: remove o que foi criado pela importação, respeitando a escolha no Strava.
          await db.execute({ sql: "DELETE FROM workouts WHERE owner_id = ? AND source = 'strava' AND external_id = ? AND COALESCE(json_extract(external_json, '$.linkedManual'), 0) = 0", args: [ownerId, String(a.id)] });
        } else {
          const upd = await db.execute({
            sql: "UPDATE workouts SET notes = ?, category = ?, kind = ?, external_json = ? WHERE owner_id = ? AND source = 'strava' AND external_id = ?",
            args: [a.name.slice(0, 500), categoryForSport(a.sport_type ?? a.type ?? ""), WORKOUT_CATEGORY_LABELS[categoryForSport(a.sport_type ?? a.type ?? "")], externalJson(a, false), ownerId, String(a.id)],
          });
          if (upd.rowsAffected === 0) await importActivity(db, ownerId, a, settings);
        }
      } else {
        await importActivity(db, ownerId, a, settings);
      }
    }
    await mark("processado");
    return "processado";
  } catch (err) {
    // Fica "erro": a reconciliação da próxima sincronização cobre o evento perdido.
    await mark("erro");
    console.error("[strava] webhook não processado:", err instanceof Error ? err.message : "erro");
    return "erro";
  }
}

/* ─────────────────────────── Painel ─────────────────────────── */

export async function getStravaOverview(db: Client, ownerId: string) {
  const cfg = await stravaAppConfig(db);
  const r = await db.execute({
    sql: "SELECT athlete_id, athlete_name, athlete_username, avatar_url, scope, settings_json, connected_at, last_sync_at, last_sync_status, last_error FROM strava_connections WHERE owner_id = ?",
    args: [ownerId],
  });
  const conn = r.rows[0];
  const { tz, today } = await userDayContext(db, ownerId);
  const from30 = shiftDayKey(today, -29);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = shiftDayKey(today, -((dow + 6) % 7));
  const [acts, totals, xp, weekly] = await Promise.all([
    db.execute({
      sql: `SELECT id, kind, category, duration_minutes, distance_km, calories, notes, performed_at, external_id, external_json FROM workouts
            WHERE owner_id = ? AND source = 'strava' ORDER BY performed_at DESC LIMIT 30`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS n, COALESCE(SUM(distance_km), 0) AS km, COALESCE(SUM(duration_minutes), 0) AS min,
              SUM(calories) AS kcal, COUNT(calories) AS kcal_n FROM workouts WHERE owner_id = ? AND source = 'strava'`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'workout'", args: [ownerId] }),
    db.execute({ sql: "SELECT performed_at, distance_km, duration_minutes FROM workouts WHERE owner_id = ? AND datetime(performed_at) >= datetime(?)", args: [ownerId, `${shiftDayKey(weekStart, -7)}T00:00:00Z`] }),
  ]);
  const thisWeek = weekly.rows.filter((w) => localDayOfStored(String(w.performed_at), tz) >= weekStart);
  const lastWeek = weekly.rows.filter((w) => {
    const d = localDayOfStored(String(w.performed_at), tz);
    return d >= shiftDayKey(weekStart, -7) && d < weekStart;
  });
  const sum = (rows: typeof thisWeek, f: string) => rows.reduce((a, x) => a + Number(x[f] ?? 0), 0);
  const days30 = new Set(
    weekly.rows.map((w) => localDayOfStored(String(w.performed_at), tz)).filter((d) => d >= from30)
  ).size;
  return {
    configured: Boolean(cfg),
    connection: conn
      ? {
          athleteName: conn.athlete_name == null ? null : String(conn.athlete_name),
          username: conn.athlete_username == null ? null : String(conn.athlete_username),
          avatarUrl: conn.avatar_url == null ? null : String(conn.avatar_url),
          connectedAt: String(conn.connected_at),
          lastSyncAt: conn.last_sync_at == null ? null : String(conn.last_sync_at),
          lastSyncStatus: conn.last_sync_status == null ? null : String(conn.last_sync_status),
          lastError: conn.last_error == null ? null : String(conn.last_error),
          settings: parseSettings(conn.settings_json, DEFAULT_SETTINGS),
        }
      : null,
    totals: {
      activities: Number(totals.rows[0]?.n ?? 0),
      distanceKm: Math.round(Number(totals.rows[0]?.km ?? 0) * 10) / 10,
      minutes: Number(totals.rows[0]?.min ?? 0),
      // Calorias só somam atividades em que o Strava informou o valor.
      calories: Number(totals.rows[0]?.kcal_n ?? 0) > 0 ? Number(totals.rows[0]?.kcal ?? 0) : null,
      caloriesCoverage: Number(totals.rows[0]?.kcal_n ?? 0),
      xp: Number(xp.rows[0]?.xp ?? 0),
      week: { activities: thisWeek.length, distanceKm: Math.round(sum(thisWeek, "distance_km") * 10) / 10, minutes: sum(thisWeek, "duration_minutes") },
      lastWeek: { activities: lastWeek.length, distanceKm: Math.round(sum(lastWeek, "distance_km") * 10) / 10, minutes: sum(lastWeek, "duration_minutes") },
    },
    weeklyGoal: { target: STRAVA_XP.weeklyBonus.days, doneDays: new Set(thisWeek.map((w) => localDayOfStored(String(w.performed_at), tz))).size, weekStart, weekEnd: shiftDayKey(weekStart, 6) },
    activeDays30: days30,
    activities: acts.rows.map((a) => {
      let ext: Record<string, unknown> = {};
      try {
        ext = JSON.parse(String(a.external_json ?? "{}"));
      } catch {
        ext = {};
      }
      const km = a.distance_km == null ? null : Number(a.distance_km);
      const min = Number(a.duration_minutes ?? 0);
      return {
        id: String(a.id),
        name: String(a.notes ?? a.kind),
        kind: String(a.kind),
        category: String(a.category ?? "outro"),
        sport: ext.sport ?? null,
        performedAt: String(a.performed_at),
        minutes: min,
        distanceKm: km,
        paceMinKm: km && km > 0 && ["corrida", "caminhada"].includes(String(a.category)) ? Math.round((min / km) * 100) / 100 : null,
        speedKmh: ext.avgSpeedMs ? Math.round(Number(ext.avgSpeedMs) * 3.6 * 10) / 10 : null,
        elevationM: ext.elevationM ?? null,
        avgHr: ext.avgHr ?? null,
        calories: a.calories == null ? null : Number(a.calories),
        linkedManual: Boolean(ext.linkedManual),
        url: `https://www.strava.com/activities/${String(a.external_id)}`,
      };
    }),
    xpRules: STRAVA_XP,
  };
}

/** Cria a assinatura do webhook (ação de administrador). */
export async function createStravaSubscription(db: Client, callbackUrl: string) {
  const cfg = await stravaAppConfig(db);
  if (!cfg || !cfg.verifyToken) throw new IntegrationError(400, "Configure Client ID, Client Secret e o token de verificação do webhook.");
  const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, callback_url: callbackUrl, verify_token: cfg.verifyToken });
  return fetchJson<{ id: number }>(`${API}/push_subscriptions`, { method: "POST", body }, { label: "Strava", retries: 0, timeoutMs: 15_000 });
}
