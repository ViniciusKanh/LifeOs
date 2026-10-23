/** Formatação da Taverna (só apresentação; nenhum número é calculado aqui além de arredondar). */

export const fmtNum = (v: number) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** "acima/abaixo da média (X)" — texto curto, sem cor como único indicador. */
export function vsAverage(today: number, avg: number | null, unit = ""): string {
  if (avg === null) return "Sem histórico de 7 dias";
  const a = `${fmtNum(avg)}${unit}`;
  if (today > avg) return `Acima da média (${a})`;
  if (today < avg) return `Abaixo da média (${a})`;
  return `Na média (${a})`;
}

/** "2026-10-23" → "sex, 23/out". */
export function fmtDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).replace(/\./g, "");
}
