import type { Client } from "@libsql/client";
import { dayKeyIn, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc, offsetForTimeZone, utcRangeFilter } from "./healthService.js";

/**
 * "Dia do usuário" no servidor.
 *
 * Os timestamps são guardados em UTC (dois formatos convivem: "YYYY-MM-DD HH:MM:SS"
 * do SQLite e ISO com Z), mas "hoje", "dia X" e agrupamentos por dia sempre
 * seguem o fuso do perfil (users.timezone). Comparar `date(coluna)` com uma data
 * local erra das 21h às 23h59 em São Paulo, quando o dia UTC já virou.
 */

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Soma `n` dias a uma chave YYYY-MM-DD (aritmética de calendário, sem fuso). */
export function shiftDayKey(key: string, n: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Dia local de um valor gravado. Datas puras (YYYY-MM-DD) já são dias locais
 * e passam direto; timestamps UTC são convertidos para o fuso informado.
 */
export function localDayOfStored(stored: string, timeZone: string): string {
  if (DATE_ONLY.test(stored)) return stored;
  const ms = Date.parse(normalizeStoredUtc(stored));
  if (Number.isNaN(ms)) return stored.slice(0, 10);
  return dayKeyIn(new Date(ms), timeZone);
}

/** Limites [início, fim) em ISO UTC do dia local `dayKey` no fuso IANA informado. */
export function localDayRangeUtc(dayKey: string, timeZone: string): { start: string; end: string } {
  const offset = offsetForTimeZone(timeZone, new Date(`${dayKey}T12:00:00Z`));
  const startMs = Date.parse(`${dayKey}T00:00:00.000Z`) + offset * 60_000;
  return { start: new Date(startMs).toISOString(), end: new Date(startMs + DAY_MS).toISOString() };
}

/**
 * Fragmento SQL "coluna (timestamp UTC) dentro dos dias locais [fromDay, toDay]"
 * (inclusive). Use no lugar de `coluna >= date(?) AND coluna < date(?, '+1 day')`.
 */
export function localDaysWhere(column: string, fromDay: string, toDayInclusive: string, timeZone: string): { sql: string; args: string[] } {
  return utcRangeFilter(column, localDayRangeUtc(fromDay, timeZone).start, localDayRangeUtc(toDayInclusive, timeZone).end);
}

/** Agrupa linhas { at, v } por dia local (soma, contagem ou média de `v`; `v` nulo é ignorado). */
export function groupRowsByLocalDay(rows: unknown[], timeZone: string, agg: "sum" | "avg" | "count"): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const row of rows as Array<{ at: unknown; v?: unknown }>) {
    if (row.at == null) continue;
    if (agg !== "count" && row.v == null) continue;
    const day = localDayOfStored(String(row.at), timeZone);
    const cur = acc.get(day) ?? { sum: 0, n: 0 };
    cur.sum += agg === "count" ? 1 : Number(row.v);
    cur.n += 1;
    acc.set(day, cur);
  }
  return new Map([...acc].map(([d, c]) => [d, agg === "avg" ? c.sum / c.n : c.sum]));
}

/**
 * Série diária (dia local → valor) de uma tabela com timestamp UTC, no lugar de
 * `SELECT date(coluna) AS d, SUM(x) ... GROUP BY d` (que agruparia pelo dia UTC).
 * `table`, `column`, `valueExpr` e `extraWhere` são sempre constantes do código,
 * nunca entrada do usuário; os valores variáveis vão em `extraArgs`.
 */
export async function localDailyAggregate(
  db: Client,
  ownerId: string,
  opts: {
    table: string;
    column: string;
    agg: "sum" | "avg" | "count";
    valueExpr?: string;
    extraWhere?: string;
    extraArgs?: Array<string | number>;
    fromDay: string;
    toDay: string;
    timeZone: string;
  },
): Promise<Map<string, number>> {
  const f = localDaysWhere(opts.column, opts.fromDay, opts.toDay, opts.timeZone);
  const value = opts.valueExpr ?? "1";
  const extra = opts.extraWhere ? ` AND ${opts.extraWhere}` : "";
  const result = await db.execute({
    sql: `SELECT ${opts.column} AS at, ${value} AS v FROM ${opts.table} WHERE owner_id = ?${extra} AND ${f.sql}`,
    args: [ownerId, ...(opts.extraArgs ?? []), ...f.args],
  });
  return groupRowsByLocalDay(result.rows, opts.timeZone, opts.agg);
}

/** Fuso e "hoje" do usuário numa única leitura. */
export async function userDayContext(db: Client, ownerId: string, now = new Date()): Promise<{ tz: string; today: string }> {
  const tz = await userTimezone(db, ownerId);
  return { tz, today: dayKeyIn(now, tz) };
}
