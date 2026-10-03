/**
 * Variação entre períodos para as revisões. Nunca inventa comparação:
 * sem valor anterior (ou anterior zero) a UI mostra "Sem base anterior".
 */
export function periodDelta(current: number | null | undefined, previous: number | null | undefined): { pct: number | null; hasBase: boolean } {
  if (current == null || previous == null || previous === 0) return { pct: null, hasBase: false };
  return { pct: Math.round(((current - previous) / previous) * 100), hasBase: true };
}

export function formatSleep(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  return `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, "0")}`;
}
