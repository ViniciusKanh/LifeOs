import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Tempo na Bigorna (Forja do Código) — tempo real programando, medido pelo
 * plugin do WakaTime no editor. Chave pessoal (Settings → API Key), guardada
 * criptografada e nunca devolvida ao frontend.
 *
 * O plano gratuito do WakaTime só devolve os últimos 14 dias: cada sincronização
 * relê essa janela e grava por dia (upsert). O histórico mais antigo fica no
 * LifeOS, então a série cresce com o tempo sem depender do plano pago.
 *
 * XP (fonte "code", soma no nível da Forja): +10 XP e 1 moeda por bloco de
 * 30 min no dia, até 12 blocos (6 h). Chave idempotente: waka:<dia>/bloco_<n>.
 */

export const WAKA_XP = { perBlock: 10, coinsPerBlock: 1, blockMinutes: 30, maxBlocks: 12 } as const;
const WINDOW_DAYS = 14;
const MIN_SYNC_MS = 3 * 60 * 1000;

export class WakaError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

const auth = (key: string) => ({ Authorization: `Basic ${Buffer.from(key).toString("base64")}`, Accept: "application/json" });

type WakaItem = { name: string; total_seconds: number };
type WakaSummary = { grand_total: { total_seconds: number }; languages?: WakaItem[]; projects?: WakaItem[]; editors?: WakaItem[]; range: { date: string } };

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 401 || err.status === 403) throw new WakaError("O WakaTime recusou a chave. Confira a API Key em wakatime.com/settings/api-key.", 422);
    if (err.status === 429) throw new WakaError("O WakaTime limitou as consultas. Tente em alguns minutos.", 429);
    throw new WakaError(err.message, 502);
  }
  throw err;
}

const top = (items: WakaItem[] | undefined, n = 8) =>
  (items ?? [])
    .filter((i) => i.total_seconds >= 60)
    .sort((a, b) => b.total_seconds - a.total_seconds)
    .slice(0, n)
    .map((i) => ({ name: i.name.slice(0, 60), seconds: Math.round(i.total_seconds) }));

export async function connectWakatime(db: Client, ownerId: string, apiKey: string) {
  const key = apiKey.trim();
  const me = await fetchJson<{ data: { username: string | null; display_name: string | null } }>("https://wakatime.com/api/v1/users/current", { headers: auth(key) }, { label: "WakaTime", retries: 1 }).catch(friendly);
  const username = me?.data?.username || me?.data?.display_name || null;
  await db.execute({
    sql: `INSERT INTO wakatime_connections (owner_id, username, api_key_enc) VALUES (?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET username = excluded.username, api_key_enc = excluded.api_key_enc, last_sync_status = NULL, last_sync_error = NULL, updated_at = datetime('now')`,
    args: [ownerId, username, encryptSecret(key)],
  });
  await recordWorldEvent(db, ownerId, { type: "wakatime.connected", title: "O Tempo na Bigorna foi conectado ao WakaTime", detail: username });
  return { username };
}

/** Desconecta e apaga a chave. Os dias já registrados (e o XP) ficam: são histórico real. */
export async function disconnectWakatime(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM wakatime_connections WHERE owner_id = ?", args: [ownerId] });
}

/**
 * Grava os resumos diários e paga os blocos de XP ainda não pagos.
 * Exportada para testes: repetir o mesmo resumo nunca soma XP de novo.
 */
export async function importWakaSummaries(db: Client, ownerId: string, summaries: WakaSummary[], today: string) {
  const days = summaries.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.range?.date ?? "") && s.range.date <= today);
  if (days.length) {
    await db.batch(
      days.map((s) => ({
        sql: `INSERT INTO wakatime_days (owner_id, day_key, total_seconds, languages_json, projects_json, editors_json) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (owner_id, day_key) DO UPDATE SET total_seconds = excluded.total_seconds, languages_json = excluded.languages_json,
                projects_json = excluded.projects_json, editors_json = excluded.editors_json, updated_at = datetime('now')`,
        args: [ownerId, s.range.date, Math.round(s.grand_total?.total_seconds ?? 0), JSON.stringify(top(s.languages)), JSON.stringify(top(s.projects)), JSON.stringify(top(s.editors, 4))],
      })),
      "write",
    );
  }
  // Blocos já pagos por dia (evita reenviar centenas de INSERT idempotentes).
  const paid = await db.execute({ sql: "SELECT source_id, COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'code' AND source_id LIKE 'waka:%' GROUP BY source_id", args: [ownerId] });
  const paidBy = new Map(paid.rows.map((r) => [String(r.source_id), Number(r.n)]));
  let xp = 0;
  for (const s of days) {
    const blocks = Math.min(WAKA_XP.maxBlocks, Math.floor((s.grand_total?.total_seconds ?? 0) / (WAKA_XP.blockMinutes * 60)));
    const sourceId = `waka:${s.range.date}`;
    for (let b = (paidBy.get(sourceId) ?? 0) + 1; b <= blocks; b++) {
      const ok = await award(db, ownerId, { sourceType: "code", sourceId, eventType: `bloco_${b}`, xp: WAKA_XP.perBlock, coins: WAKA_XP.coinsPerBlock, label: `Tempo na Bigorna: ${b * WAKA_XP.blockMinutes} min programando` }, s.range.date);
      if (ok) xp += WAKA_XP.perBlock;
    }
  }
  return { days: days.length, xp };
}

export async function syncWakatime(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const r = await db.execute({ sql: "SELECT * FROM wakatime_connections WHERE owner_id = ?", args: [ownerId] });
  const c = r.rows[0];
  if (!c) throw new WakaError("Conecte o WakaTime primeiro.", 404);
  if (!opts.force && c.last_sync_at && Date.now() - Date.parse(String(c.last_sync_at)) < MIN_SYNC_MS) throw new WakaError("Acabou de sincronizar. Aguarde alguns minutos.", 429);
  const { tz, today } = await userDayContext(db, ownerId);
  const start = shiftDayKey(today, -(WINDOW_DAYS - 1));
  try {
    const key = decryptSecret(String(c.api_key_enc));
    const res = await fetchJson<{ data: WakaSummary[] }>(
      `https://wakatime.com/api/v1/users/current/summaries?start=${start}&end=${today}&timezone=${encodeURIComponent(tz)}`,
      { headers: auth(key) },
      { label: "WakaTime", timeoutMs: 12_000 },
    ).catch(friendly);
    const out = await importWakaSummaries(db, ownerId, res?.data ?? [], today);
    await db.execute({
      sql: "UPDATE wakatime_connections SET last_sync_at = ?, last_sync_status = 'ok', last_sync_error = NULL, coverage_from = COALESCE(coverage_from, ?), updated_at = datetime('now') WHERE owner_id = ?",
      args: [new Date().toISOString(), start, ownerId],
    });
    return { ok: true as const, ...out };
  } catch (err) {
    await db.execute({ sql: "UPDATE wakatime_connections SET last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [(err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    throw err;
  }
}

type Item = { name: string; seconds: number };
const parseItems = (raw: unknown): Item[] => {
  try {
    return JSON.parse(String(raw ?? "[]")) as Item[];
  } catch {
    return [];
  }
};
function merge(rows: Item[][], n = 6) {
  const m = new Map<string, number>();
  for (const list of rows) for (const i of list) m.set(i.name, (m.get(i.name) ?? 0) + i.seconds);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, seconds]) => ({ name, seconds, pct: total ? Math.round((seconds / total) * 100) : 0 }));
}

export async function getWakatimeOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -(WINDOW_DAYS - 1));
  const [conn, recent, totals, xp, all] = await Promise.all([
    db.execute({ sql: "SELECT username, last_sync_at, last_sync_status, last_sync_error, coverage_from FROM wakatime_connections WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT * FROM wakatime_days WHERE owner_id = ? AND day_key >= ? ORDER BY day_key", args: [ownerId, from] }),
    db.execute({ sql: "SELECT COALESCE(SUM(total_seconds), 0) AS s, COUNT(*) AS d, MAX(total_seconds) AS best FROM wakatime_days WHERE owner_id = ? AND total_seconds > 0", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'code' AND source_id LIKE 'waka:%'", args: [ownerId] }),
    db.execute({ sql: "SELECT day_key FROM wakatime_days WHERE owner_id = ? AND total_seconds >= 60 AND day_key >= ? ORDER BY day_key DESC", args: [ownerId, shiftDayKey(today, -400)] }),
  ]);
  const c = conn.rows[0];
  const byDay = new Map(recent.rows.map((r) => [String(r.day_key), r]));
  const series: Array<{ day: string; seconds: number | null }> = [];
  for (let d = from; d <= today; d = shiftDayKey(d, 1)) {
    const r = byDay.get(d);
    series.push({ day: d, seconds: r ? Number(r.total_seconds) : null });
  }
  const week = series.slice(-7).reduce((a, s) => a + (s.seconds ?? 0), 0);
  const active = new Set(all.rows.map((r) => String(r.day_key)));
  let streak = 0;
  let cursor = active.has(today) ? today : shiftDayKey(today, -1);
  while (active.has(cursor)) {
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  const todaySec = Number(byDay.get(today)?.total_seconds ?? 0);
  return {
    connected: !!c,
    connection: c
      ? { username: c.username == null ? null : String(c.username), lastSyncAt: c.last_sync_at == null ? null : String(c.last_sync_at), lastSyncStatus: c.last_sync_status == null ? null : String(c.last_sync_status), lastSyncError: c.last_sync_error == null ? null : String(c.last_sync_error), coverageFrom: c.coverage_from == null ? null : String(c.coverage_from) }
      : null,
    today: { seconds: todaySec, blocks: Math.min(WAKA_XP.maxBlocks, Math.floor(todaySec / (WAKA_XP.blockMinutes * 60))) },
    weekSeconds: week,
    totalSeconds: Number(totals.rows[0]?.s ?? 0),
    activeDays: Number(totals.rows[0]?.d ?? 0),
    bestDaySeconds: Number(totals.rows[0]?.best ?? 0),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    streak,
    series,
    languages: merge(recent.rows.map((r) => parseItems(r.languages_json))),
    projects: merge(recent.rows.map((r) => parseItems(r.projects_json))),
    editors: merge(recent.rows.map((r) => parseItems(r.editors_json)), 4),
    rules: WAKA_XP,
  };
}

/** Linha do tempo: dias com pelo menos 30 min programando. */
export async function wakatimeTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({ sql: "SELECT day_key, total_seconds, languages_json FROM wakatime_days WHERE owner_id = ? AND day_key >= ? AND day_key <= ? AND total_seconds >= 1800", args: [ownerId, from, to] });
  return r.rows.map((x) => {
    const lang = parseItems(x.languages_json)[0]?.name;
    const min = Math.round(Number(x.total_seconds) / 60);
    return { type: "code", icon: "⌨️", id: `waka-${String(x.day_key)}`, label: `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")} programando${lang ? ` (${lang})` : ""}`, at: `${String(x.day_key)}T20:00:00.000Z` };
  });
}

/** Cron: sincroniza quem tem WakaTime conectado (a janela de 14 dias cobre falhas). */
export async function wakatimeDailySync(db: Client, limit = 10) {
  const r = await db.execute({ sql: "SELECT owner_id FROM wakatime_connections ORDER BY last_sync_at ASC LIMIT ?", args: [limit] });
  let n = 0;
  for (const row of r.rows) if (await syncWakatime(db, String(row.owner_id), { force: true }).then(() => true).catch(() => false)) n++;
  return n;
}
