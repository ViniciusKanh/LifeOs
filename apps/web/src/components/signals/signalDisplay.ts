import type { SignalStatus } from "@/types";

/**
 * Mapeamento visual central de status de sinal — usado em todo
 * componente de Signals para nunca decidir cor/texto de status
 * "no olho" em cada componente (mesma regra em todo lugar).
 */
export const STATUS_LABEL: Record<SignalStatus, string> = {
  ok: "Normal",
  attention: "Atenção",
  insufficient_data: "Dados insuficientes",
  not_connected: "Collector não conectado",
};

export const STATUS_TONE: Record<SignalStatus, string> = {
  ok: "text-cat-green bg-cat-green/10",
  attention: "text-drop bg-drop/10",
  insufficient_data: "text-slate bg-paper-border/60 dark:bg-ink-border/40",
  not_connected: "text-slate bg-paper-border/60 dark:bg-ink-border/40",
};

export function formatSignalValue(value: number | string | null, unit: string | null): string {
  if (value == null) return "—";
  return unit ? `${value} ${unit}` : String(value);
}
