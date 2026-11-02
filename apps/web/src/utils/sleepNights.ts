import { localDateKey, parseUtcTimestamp } from "@/utils/localDate";

/**
 * Agregação de sono em NOITES (espelho de aggregateSleep no backend,
 * healthHubService.ts). Corrige o "32h de sono": antes a semana somava todos
 * os registros do dia — duplicados, sobrepostos ou com data errada.
 *
 * Regras:
 *  - a noite pertence ao dia local em que a pessoa ACORDOU (22h→06h = dia do despertar);
 *  - registros com duração ≤ 0 ou > 16h ficam de fora (sinalizados como inconsistentes);
 *  - no mesmo dia, intervalos sobrepostos são unidos (não contam duas vezes).
 */

export const MAX_SLEEP_MINUTES = 16 * 60;

export interface SleepLike {
  id: string;
  went_to_bed_at: string;
  woke_up_at: string;
  quality: number | null;
}

export interface SleepNight {
  day: string;
  minutes: number;
  quality: number | null;
  entryIds: string[];
}

export function aggregateSleepNights(entries: SleepLike[]): { nights: SleepNight[]; inconsistentIds: Set<string> } {
  const inconsistentIds = new Set<string>();
  const byDay = new Map<string, Array<{ s: number; e: number; id: string; q: number | null }>>();
  for (const en of entries) {
    const s = parseUtcTimestamp(en.went_to_bed_at).getTime();
    const e = parseUtcTimestamp(en.woke_up_at).getTime();
    const minutes = (e - s) / 60000;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_SLEEP_MINUTES) {
      inconsistentIds.add(en.id);
      continue;
    }
    const day = localDateKey(new Date(e));
    byDay.set(day, [...(byDay.get(day) ?? []), { s, e, id: en.id, q: en.quality }]);
  }
  const nights: SleepNight[] = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.s - b.s);
    let total = 0;
    let curS = list[0]!.s;
    let curE = list[0]!.e;
    for (const it of list.slice(1)) {
      if (it.s < curE) curE = Math.max(curE, it.e);
      else {
        total += curE - curS;
        curS = it.s;
        curE = it.e;
      }
    }
    total += curE - curS;
    const qs = list.map((x) => x.q).filter((q): q is number => q != null);
    nights.push({
      day,
      minutes: Math.min(MAX_SLEEP_MINUTES, Math.round(total / 60000)),
      quality: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null,
      entryIds: list.map((x) => x.id),
    });
  }
  nights.sort((a, b) => b.day.localeCompare(a.day));
  return { nights, inconsistentIds };
}
