import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Bestiário (Aventuras) — espécies que o usuário registrou no iNaturalist,
 * lidas pelo nome de usuário (API pública, sem chave). A raridade vem do total
 * de observações da espécie no mundo inteiro, segundo o próprio iNaturalist.
 *
 * A primeira sincronização monta a coleção sem XP (nada retroativo). Depois,
 * cada espécie nova vale +10 XP e 1 moeda, mais bônus de raridade (incomum +5,
 * rara +15, épica +30, lendária +60), até 20 espécies pagas por dia.
 */

export const BESTIARY_XP = { species: 10, coins: 1, dailyCap: 20, bonus: { comum: 0, incomum: 5, rara: 15, epica: 30, lendaria: 60 } } as const;
export type Rarity = keyof typeof BESTIARY_XP.bonus;
const INAT = "https://api.inaturalist.org/v1";
const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs; app pessoal)";
const MIN_SYNC_MS = 10 * 60 * 1000;
const AUTO_SYNC_MS = 6 * 3600_000;

export class BestiaryError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

/** Raridade pelo total mundial de observações da espécie. Exportada para testes. */
export function rarityOf(globalCount: number | null | undefined): Rarity {
  const n = globalCount ?? 0;
  if (n <= 500) return "lendaria";
  if (n <= 5_000) return "epica";
  if (n <= 50_000) return "rara";
  if (n <= 250_000) return "incomum";
  return "comum";
}

const get = <T>(path: string) => fetchJson<T>(`${INAT}${path}`, { headers: { Accept: "application/json", "User-Agent": UA } }, { label: "iNaturalist", timeoutMs: 15_000, retries: 1 });

type RawTaxon = { id: number; name?: string; rank?: string; iconic_taxon_name?: string | null; preferred_common_name?: string | null; observations_count?: number; default_photo?: { square_url?: string; medium_url?: string } | null; wikipedia_url?: string | null };
export type RawSpeciesCount = { count?: number; taxon?: RawTaxon };

export async function connectBestiary(db: Client, ownerId: string, login: string) {
  const q = login.trim().replace(/^@/, "");
  const r = await get<{ results?: Array<{ login?: string; observations_count?: number }> }>(`/users/autocomplete?q=${encodeURIComponent(q)}&per_page=10`).catch((e: unknown) => {
    if (e instanceof IntegrationError) throw new BestiaryError(`iNaturalist: ${e.message}`, 502);
    throw e;
  });
  const user = r?.results?.find((u) => u.login?.toLowerCase() === q.toLowerCase());
  if (!user?.login) throw new BestiaryError("Usuário não encontrado no iNaturalist. Use o nome de login que aparece no seu perfil.", 404);
  await db.execute({
    sql: `INSERT INTO bestiary_accounts (owner_id, inat_login, observations) VALUES (?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET inat_login = excluded.inat_login, observations = excluded.observations, last_sync_status = NULL, last_sync_error = NULL`,
    args: [ownerId, user.login, Number(user.observations_count ?? 0)],
  });
  const sync = await syncBestiary(db, ownerId, { force: true }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
  return { login: user.login, sync };
}

export async function disconnectBestiary(db: Client, ownerId: string) {
  // A coleção e o XP continuam: são registros reais já feitos.
  await db.execute({ sql: "DELETE FROM bestiary_accounts WHERE owner_id = ?", args: [ownerId] });
}

/**
 * Grava as espécies e paga XP das novas. `baseline` = primeira sincronização
 * (monta a coleção sem XP). Exportada para testes; idempotente por espécie.
 */
export async function importSpecies(db: Client, ownerId: string, list: RawSpeciesCount[], baseline: boolean, today: string) {
  const known = await db.execute({ sql: "SELECT taxon_id FROM bestiary_species WHERE owner_id = ?", args: [ownerId] });
  const have = new Set(known.rows.map((r) => Number(r.taxon_id)));
  let xp = 0;
  const fresh: Array<{ name: string; rarity: Rarity }> = [];
  for (const it of list) {
    const t = it.taxon;
    if (!t?.id || !t.name) continue;
    const rarity = rarityOf(t.observations_count);
    await db.execute({
      sql: `INSERT INTO bestiary_species (owner_id, taxon_id, name, common_name, rank, iconic, global_count, rarity, my_count, photo_url, wiki_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, taxon_id) DO UPDATE SET common_name = excluded.common_name, global_count = excluded.global_count, rarity = excluded.rarity,
              my_count = excluded.my_count, photo_url = COALESCE(excluded.photo_url, bestiary_species.photo_url), wiki_url = COALESCE(excluded.wiki_url, bestiary_species.wiki_url)`,
      args: [ownerId, t.id, t.name.slice(0, 160), t.preferred_common_name?.slice(0, 160) ?? null, t.rank ?? null, t.iconic_taxon_name ?? null, t.observations_count ?? null, rarity, Number(it.count ?? 1), t.default_photo?.medium_url ?? t.default_photo?.square_url ?? null, t.wikipedia_url ?? null],
    });
    if (have.has(t.id) || baseline) continue;
    const label = t.preferred_common_name || t.name;
    fresh.push({ name: label, rarity });
    const cap = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'bestiary' AND day_key = ?", args: [ownerId, today] });
    if (Number(cap.rows[0]?.n ?? 0) >= BESTIARY_XP.dailyCap) continue;
    const amount = BESTIARY_XP.species + BESTIARY_XP.bonus[rarity];
    if (await award(db, ownerId, { sourceType: "bestiary", sourceId: `taxon:${t.id}`, eventType: "new_species", xp: amount, coins: BESTIARY_XP.coins + (rarity === "lendaria" ? 5 : rarity === "epica" ? 2 : 0), label: `Bestiário: ${label} (${rarity})`.slice(0, 120) }, today)) xp += amount;
  }
  const best = fresh.find((f) => f.rarity === "lendaria") ?? fresh.find((f) => f.rarity === "epica");
  if (best) await recordWorldEvent(db, ownerId, { type: "bestiary.rare", title: `Avistamento ${best.rarity === "lendaria" ? "lendário" : "épico"} no Bestiário: ${best.name}` });
  return { xp, newSpecies: fresh.length };
}

export async function syncBestiary(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const r = await db.execute({ sql: "SELECT * FROM bestiary_accounts WHERE owner_id = ?", args: [ownerId] });
  const acc = r.rows[0];
  if (!acc) throw new BestiaryError("Conecte sua conta do iNaturalist primeiro.", 404);
  if (!opts.force && acc.last_sync_at && Date.now() - Date.parse(String(acc.last_sync_at)) < MIN_SYNC_MS) throw new BestiaryError("Acabou de sincronizar. Aguarde alguns minutos.", 429);
  const { today } = await userDayContext(db, ownerId);
  const login = encodeURIComponent(String(acc.inat_login));
  try {
    const list: RawSpeciesCount[] = [];
    let partial = false;
    for (let page = 1; page <= 6; page++) {
      const res = await get<{ total_results?: number; results?: RawSpeciesCount[] }>(`/observations/species_counts?user_login=${login}&locale=pt-BR&per_page=500&page=${page}`);
      list.push(...(res?.results ?? []));
      if (!res?.results?.length || list.length >= Number(res.total_results ?? 0)) break;
      if (page === 6) partial = true;
    }
    const obs = await get<{ total_results?: number }>(`/observations?user_login=${login}&per_page=0`).catch(() => null);
    const baseline = !acc.last_sync_at || String(acc.last_sync_status ?? "") === "";
    const out = await importSpecies(db, ownerId, list, baseline, today);
    await db.execute({
      sql: "UPDATE bestiary_accounts SET observations = COALESCE(?, observations), last_sync_at = ?, last_sync_status = ?, last_sync_error = NULL WHERE owner_id = ?",
      args: [obs?.total_results ?? null, new Date().toISOString(), partial ? "parcial" : "ok", ownerId],
    });
    return { ok: true as const, species: list.length, ...out };
  } catch (err) {
    await db.execute({ sql: "UPDATE bestiary_accounts SET last_sync_at = ?, last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [new Date().toISOString(), (err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    if (err instanceof IntegrationError) throw new BestiaryError(`iNaturalist: ${err.message}`, 502);
    throw err;
  }
}

export async function getBestiary(db: Client, ownerId: string) {
  let r = await db.execute({ sql: "SELECT * FROM bestiary_accounts WHERE owner_id = ?", args: [ownerId] });
  if (r.rows[0] && (!r.rows[0].last_sync_at || Date.now() - Date.parse(String(r.rows[0].last_sync_at)) > AUTO_SYNC_MS)) {
    await syncBestiary(db, ownerId, { force: true }).catch(() => undefined);
    r = await db.execute({ sql: "SELECT * FROM bestiary_accounts WHERE owner_id = ?", args: [ownerId] });
  }
  const acc = r.rows[0];
  const [species, xp] = await Promise.all([
    db.execute({ sql: "SELECT * FROM bestiary_species WHERE owner_id = ? ORDER BY CASE rarity WHEN 'lendaria' THEN 0 WHEN 'epica' THEN 1 WHEN 'rara' THEN 2 WHEN 'incomum' THEN 3 ELSE 4 END, first_seen_at DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'bestiary'", args: [ownerId] }),
  ]);
  const list = species.rows.map((s) => ({
    taxonId: Number(s.taxon_id),
    name: String(s.name),
    commonName: s.common_name == null ? null : String(s.common_name),
    rank: s.rank == null ? null : String(s.rank),
    iconic: s.iconic == null ? null : String(s.iconic),
    globalCount: s.global_count == null ? null : Number(s.global_count),
    rarity: String(s.rarity) as Rarity,
    myCount: Number(s.my_count),
    photoUrl: s.photo_url == null ? null : String(s.photo_url),
    url: `https://www.inaturalist.org/taxa/${Number(s.taxon_id)}`,
    firstSeenAt: String(s.first_seen_at),
  }));
  const byRarity = Object.fromEntries((["lendaria", "epica", "rara", "incomum", "comum"] as const).map((k) => [k, list.filter((x) => x.rarity === k).length])) as Record<Rarity, number>;
  const groups = new Map<string, number>();
  for (const s of list) groups.set(s.iconic ?? "Outros", (groups.get(s.iconic ?? "Outros") ?? 0) + 1);
  return {
    connected: !!acc,
    account: acc
      ? { login: String(acc.inat_login), observations: Number(acc.observations ?? 0), url: `https://www.inaturalist.org/people/${encodeURIComponent(String(acc.inat_login))}`, lastSyncAt: acc.last_sync_at == null ? null : String(acc.last_sync_at), lastSyncStatus: acc.last_sync_status == null ? null : (String(acc.last_sync_status) as "ok" | "parcial" | "erro"), lastSyncError: acc.last_sync_error == null ? null : String(acc.last_sync_error) }
      : null,
    species: list,
    total: list.length,
    byRarity,
    groups: [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([iconic, count]) => ({ iconic, count })),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: BESTIARY_XP,
  };
}
