/**
 * Datas locais — fonte única para "que dia é" no front.
 *
 * Regras (causa do bug "registro de hoje cai em ontem"):
 * - O banco guarda instantes em UTC, às vezes sem zona ("YYYY-MM-DD HH:MM:SS",
 *   default do SQLite). `new Date("2026-10-22 15:00:00")` interpreta isso como
 *   hora LOCAL e desloca 3h em São Paulo — por isso `parseUtcTimestamp` força UTC.
 * - `new Date("YYYY-MM-DD")` é meia-noite UTC = 21h do dia anterior em São Paulo;
 *   para chaves de dia use sempre `dateKeyToLocalDate` (meia-noite local).
 * - `toISOString().slice(0, 10)` devolve o dia em UTC (à noite já é "amanhã");
 *   use `localDateKey`.
 */

const HAS_ZONE = /([zZ]|[+-]\d{2}:?\d{2})$/;

/** Instante salvo pela API (UTC, com ou sem "Z") → Date. */
export function parseUtcTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return dateKeyToLocalDate(trimmed);
  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return new Date(HAS_ZONE.test(iso) ? iso : `${iso}Z`);
}

/** Chave YYYY-MM-DD do dia LOCAL de um instante. */
export function localDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : parseUtcTimestamp(value);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return localDateKey(now);
}

/** "YYYY-MM-DD" → meia-noite LOCAL daquele dia (nunca UTC). */
export function dateKeyToLocalDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function addDaysKey(dateKey: string, delta: number): string {
  const d = dateKeyToLocalDate(dateKey);
  d.setDate(d.getDate() + delta);
  return localDateKey(d);
}

/** Valor para `<input type="datetime-local">` (hora local, sem zona). */
export function toDateTimeLocal(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : parseUtcTimestamp(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `<input type="datetime-local">` (hora local) → ISO UTC para a API. */
export function dateTimeLocalToIso(value: string): string {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).toISOString();
}

/** Offset do navegador no padrão `getTimezoneOffset()` (+180 em São Paulo). */
export function browserTzOffset(at: Date = new Date()): number {
  return at.getTimezoneOffset();
}
