import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { fetchJson } from "./integrationsCore.js";

/**
 * Feriados — nacionais pela BrasilAPI (pública, sem chave) + feriados locais
 * cadastrados pelo próprio usuário (municipais/estaduais não vêm da API).
 *
 * Cache por ano em holidays_br: a lista de um ano não muda, então cada ano é
 * buscado uma única vez. Se a BrasilAPI estiver fora, devolvemos o que houver
 * em cache e um aviso — nunca inventamos datas.
 *
 * Usos: Agenda (eventos de dia inteiro), Conselho de Guerra (dia sem missões
 * distribuídas automaticamente) e Raid (trégua: o chefe não se cura).
 */

export interface Holiday {
  date: string;
  name: string;
  type: "nacional" | "local";
  id?: string;
}

export interface HolidayPrefs {
  council: boolean;
  raidTruce: boolean;
}

export class HolidayError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const yearsInFlight = new Map<number, Promise<void>>();
/** Ano cuja busca falhou: espera um pouco antes de tentar de novo (não atrasa cada tela). */
const failedUntil = new Map<number, number>();

async function ensureYear(db: Client, year: number): Promise<boolean> {
  if (year < 1900 || year > 2199) return false;
  const has = await db.execute({ sql: "SELECT 1 FROM holiday_years WHERE year = ?", args: [year] });
  if (has.rows.length) return true;
  if ((failedUntil.get(year) ?? 0) > Date.now()) return false;
  // Evita duas buscas simultâneas do mesmo ano na mesma instância.
  let p = yearsInFlight.get(year);
  if (!p) {
    p = (async () => {
      const list = await fetchJson<Array<{ date: string; name: string; type?: string }>>(`https://brasilapi.com.br/api/feriados/v1/${year}`, { headers: { Accept: "application/json" } }, { label: "BrasilAPI", timeoutMs: 6000, retries: 1 });
      const rows = (list ?? []).filter((h) => DAY.test(h.date) && h.name);
      if (rows.length) {
        await db.batch(
          [
            ...rows.map((h) => ({ sql: "INSERT OR IGNORE INTO holidays_br (day_key, name, type, year) VALUES (?, ?, ?, ?)", args: [h.date, h.name.slice(0, 120), h.type ?? "national", year] })),
            { sql: "INSERT OR IGNORE INTO holiday_years (year) VALUES (?)", args: [year] },
          ],
          "write",
        );
      }
    })().finally(() => yearsInFlight.delete(year));
    yearsInFlight.set(year, p);
  }
  try {
    await p;
    return true;
  } catch {
    failedUntil.set(year, Date.now() + 5 * 60_000);
    return false;
  }
}

/** Feriados (nacionais + locais do usuário) no intervalo [from, to]. */
export async function holidaysBetween(db: Client, ownerId: string, from: string, to: string): Promise<{ items: Holiday[]; unavailableYears: number[] }> {
  const y0 = Number(from.slice(0, 4));
  const y1 = Number(to.slice(0, 4));
  const unavailableYears: number[] = [];
  for (let y = y0; y <= y1 && y - y0 < 3; y++) if (!(await ensureYear(db, y))) unavailableYears.push(y);
  const [nat, local] = await Promise.all([
    db.execute({ sql: "SELECT day_key, name FROM holidays_br WHERE day_key >= ? AND day_key <= ? ORDER BY day_key", args: [from, to] }),
    db.execute({ sql: "SELECT id, day_key, name FROM user_holidays WHERE owner_id = ? AND day_key >= ? AND day_key <= ? ORDER BY day_key", args: [ownerId, from, to] }),
  ]);
  const items: Holiday[] = [
    ...nat.rows.map((r) => ({ date: String(r.day_key), name: String(r.name), type: "nacional" as const })),
    ...local.rows.map((r) => ({ date: String(r.day_key), name: String(r.name), type: "local" as const, id: String(r.id) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return { items, unavailableYears };
}

/** Mapa dia → nome(s) do feriado; falha da API vira mapa só com o que há em cache. */
export async function holidayMap(db: Client, ownerId: string, from: string, to: string): Promise<Map<string, string>> {
  const { items } = await holidaysBetween(db, ownerId, from, to).catch(() => ({ items: [] as Holiday[] }));
  const map = new Map<string, string>();
  for (const h of items) map.set(h.date, map.has(h.date) ? `${map.get(h.date)} · ${h.name}` : h.name);
  return map;
}

/** Só para testes: esquece falhas recentes da BrasilAPI. */
export function resetHolidayCacheForTests() {
  failedUntil.clear();
}

export async function getHolidayPrefs(db: Client, ownerId: string): Promise<HolidayPrefs> {
  const r = await db.execute({ sql: "SELECT council, raid_truce FROM holiday_prefs WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  return { council: row ? Number(row.council) === 1 : true, raidTruce: row ? Number(row.raid_truce) === 1 : true };
}

export async function saveHolidayPrefs(db: Client, ownerId: string, p: Partial<HolidayPrefs>): Promise<HolidayPrefs> {
  const next = { ...(await getHolidayPrefs(db, ownerId)), ...p };
  await db.execute({
    sql: `INSERT INTO holiday_prefs (owner_id, council, raid_truce) VALUES (?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET council = excluded.council, raid_truce = excluded.raid_truce, updated_at = datetime('now')`,
    args: [ownerId, next.council ? 1 : 0, next.raidTruce ? 1 : 0],
  });
  return next;
}

export async function addLocalHoliday(db: Client, ownerId: string, date: string, name: string): Promise<Holiday> {
  if (!DAY.test(date)) throw new HolidayError("Data inválida.");
  const id = nanoid();
  try {
    await db.execute({ sql: "INSERT INTO user_holidays (id, owner_id, day_key, name) VALUES (?, ?, ?, ?)", args: [id, ownerId, date, name.trim().slice(0, 80)] });
  } catch {
    throw new HolidayError("Já existe um feriado local nesse dia.", 409);
  }
  return { id, date, name: name.trim().slice(0, 80), type: "local" };
}

export async function deleteLocalHoliday(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM user_holidays WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new HolidayError("Feriado não encontrado.", 404);
}

