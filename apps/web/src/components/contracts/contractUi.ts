import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { Difficulty } from "@/types";
import type { ContractStatus } from "@/services/contractsService";

/** Rótulos/tons compartilhados da Gestão de Contratos (sem regra de negócio). */
export const DIFFICULTY_TONE: Record<Difficulty, RpgTone> = { facil: "green", medio: "blue", dificil: "orange", epico: "purple" };
export const STATUS_LABEL: Record<ContractStatus, string> = { ativo: "Em andamento", concluido: "Cumprido", arquivado: "Arquivado" };
export const STATUS_TONE: Record<ContractStatus, RpgTone> = { ativo: "blue", concluido: "green", arquivado: "muted" };

export const rpgField = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";

/** YYYY-MM-DD local daqui a N dias (prazo sugerido pela IA vira data real só ao confirmar). */
export function dateInDays(days: number | null | undefined): string | null {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
