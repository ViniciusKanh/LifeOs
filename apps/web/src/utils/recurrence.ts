/**
 * Recorrência de tarefas — espelha o formato aceito pelo backend
 * (ver apps/api/src/services/recurrenceService.ts): "FREQ=DAILY",
 * "FREQ=WEEKLY;BYDAY=MO,WE,FR" ou "FREQ=MONTHLY".
 */
export type RecurrenceFreq = "" | "DAILY" | "WEEKLY" | "MONTHLY";

export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const WEEKDAY_LABELS: Record<(typeof WEEKDAY_CODES)[number], string> = {
  MO: "Seg", TU: "Ter", WE: "Qua", TH: "Qui", FR: "Sex", SA: "Sáb", SU: "Dom",
};

export interface RecurrenceState {
  freq: RecurrenceFreq;
  byDay: string[];
}

export function parseRecurrenceRule(rule: string | null): RecurrenceState {
  if (!rule) return { freq: "", byDay: [] };
  const parts = Object.fromEntries(
    rule.split(";").map((p) => p.trim().split("=")) as Array<[string, string]>
  );
  if (parts.FREQ === "DAILY") return { freq: "DAILY", byDay: [] };
  if (parts.FREQ === "MONTHLY") return { freq: "MONTHLY", byDay: [] };
  if (parts.FREQ === "WEEKLY") {
    return { freq: "WEEKLY", byDay: (parts.BYDAY ?? "").split(",").filter(Boolean) };
  }
  return { freq: "", byDay: [] };
}

/** Retorna a regra pronta pra mandar pro backend, ou null se "não repetir" (ou semanal sem nenhum dia marcado). */
export function buildRecurrenceRule(state: RecurrenceState): string | null {
  if (state.freq === "DAILY") return "FREQ=DAILY";
  if (state.freq === "MONTHLY") return "FREQ=MONTHLY";
  if (state.freq === "WEEKLY") {
    if (state.byDay.length === 0) return null;
    return `FREQ=WEEKLY;BYDAY=${state.byDay.join(",")}`;
  }
  return null;
}

export function describeRecurrenceRule(rule: string | null): string | null {
  const state = parseRecurrenceRule(rule);
  if (state.freq === "DAILY") return "Repete todo dia";
  if (state.freq === "MONTHLY") return "Repete todo mês";
  if (state.freq === "WEEKLY" && state.byDay.length > 0) {
    return `Repete ${state.byDay.map((d) => WEEKDAY_LABELS[d as keyof typeof WEEKDAY_LABELS] ?? d).join(", ")}`;
  }
  return null;
}
