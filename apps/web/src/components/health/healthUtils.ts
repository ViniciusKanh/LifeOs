export const WATER_QUICK_ADD = [200, 300, 500];
export const WATER_GOAL_ML = 2500;
export const SLEEP_GOAL_MINUTES = 8 * 60;
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function parseHealthDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

export function localDateKey(value: string | Date) {
  const d = value instanceof Date ? value : parseHealthDate(value);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayKey() {
  return localDateKey(new Date());
}

export function startOfWeek(d: Date) {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function fmtDateTime(iso: string) {
  return parseHealthDate(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const d = parseHealthDate(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateTimeLocalToIso(value: string) {
  return new Date(value).toISOString();
}

export function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function weeklySeries<T>(
  entries: T[],
  getDate: (entry: T) => string,
  getValue: (entry: T) => number,
  weekStart: Date
) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const byDay = new Map<string, number>();

  for (const entry of entries) {
    const date = parseHealthDate(getDate(entry));
    if (date < weekStart || date >= weekEnd) continue;
    const key = localDateKey(date);
    byDay.set(key, (byDay.get(key) ?? 0) + getValue(entry));
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = localDateKey(date);
    return {
      label: WEEKDAY_LABELS[date.getDay()],
      date: key,
      value: byDay.get(key) ?? 0,
    };
  });
}
