import { dateTimeLocalToIso, localDateKey, parseUtcTimestamp, todayKey, toDateTimeLocal } from "@/utils/localDate";

export const WATER_QUICK_ADD = [200, 300, 500];
export const WATER_GOAL_ML = 2500;
export const SLEEP_GOAL_MINUTES = 8 * 60;
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

// Datas: tudo passa pelo utilitário central (ver utils/localDate.ts — instantes
// UTC sem "Z" vindos do SQLite eram lidos como hora local e mudavam de dia).
export { localDateKey, todayKey, toDateTimeLocal, dateTimeLocalToIso, addDaysKey, dateKeyToLocalDate } from "@/utils/localDate";
export const parseHealthDate = parseUtcTimestamp;

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

/**
 * Valor padrão pro campo "Quando" de um registro retroativo: se o dia
 * selecionado na navegação da tela é hoje, usa a hora atual (comportamento
 * de sempre); se é um dia passado (esqueceu de registrar), usa meio-dia
 * daquele dia como ponto de partida — o usuário ajusta a hora exata se
 * quiser, mas o registro já nasce no dia certo em vez de cair em "agora".
 */
export function defaultEntryDateTimeLocal(selectedDate: string) {
  if (selectedDate === todayKey()) return toDateTimeLocal(new Date());
  return `${selectedDate}T12:00`;
}

/**
 * Instante a enviar para a API a partir do campo "Quando". Se o usuário não
 * mexeu no campo e o dia selecionado é hoje, usa "agora" no momento do envio —
 * o valor pré-preenchido foi calculado quando a tela abriu e pode estar velho
 * (app aberto há horas ou desde ontem à noite).
 */
export function entryInstantIso(whenLocal: string, touched: boolean, selectedDate: string) {
  if (!touched && selectedDate === todayKey()) return new Date().toISOString();
  return dateTimeLocalToIso(whenLocal);
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
