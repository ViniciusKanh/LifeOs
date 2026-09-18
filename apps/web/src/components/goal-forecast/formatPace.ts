/** Formata ritmo (unidade/dia) para uma unidade de leitura mais natural (semana para %, mês para o resto). */
export function formatPace(ratePerDay: number | null, unit: string | null, kind: string): string {
  if (ratePerDay == null) return "—";
  const perWeek = kind === "percentage" || unit === "%";
  const value = perWeek ? ratePerDay * 7 : ratePerDay * 30;
  const label = unit && unit !== "%" ? unit : kind === "percentage" ? "%" : "";
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 });
  return `${formatted}${label ? ` ${label}` : ""}/${perWeek ? "semana" : "mês"}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
