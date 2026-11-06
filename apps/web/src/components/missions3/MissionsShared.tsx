import type { ReactNode } from "react";
import clsx from "clsx";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { DIFFICULTY_LABEL } from "@/services/missions3Service";
import type { Task } from "@/types";

/** Utilitários comuns da tela de Missões 3.0 (quadro, visões e conselheiro). */
export const MISSIONS_ART = "/assets/rpg/modules/missions3";
export const DONE = "Concluído";

/** Campos extras que GET /tasks já devolve (SELECT *) e o quadro usa para ordenar/filtrar. */
export type BoardTask = Task & { board_order?: number | null; archived_at?: string | null; planned_date?: string | null };

export const PRIORITY_TONE: Record<string, RpgTone> = { Alta: "red", Média: "orange", Baixa: "blue" };
export const DIFFICULTY_TONE: Record<string, RpgTone> = { facil: "green", medio: "blue", dificil: "purple", epico: "gold" };
export const difficultyLabel = (d: string | null | undefined) => (d && d in DIFFICULTY_LABEL ? DIFFICULTY_LABEL[d as keyof typeof DIFFICULTY_LABEL] : null);

/** Mesma regra do backend (board_order; sem ele, a data de criação em segundos). */
export const boardOrderOf = (t: BoardTask) => (t.board_order == null ? Date.parse(t.created_at) / 1000 : Number(t.board_order));

export const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
export const isOverdue = (t: BoardTask, today: string) => t.status !== DONE && !!dayOf(t.due_date) && dayOf(t.due_date)! < today;
/** "Para hoje": prazo hoje ou planejada para hoje — igual ao indicador do servidor. */
export const isForToday = (t: BoardTask, today: string) => t.status !== DONE && (dayOf(t.due_date) === today || dayOf(t.planned_date) === today);

export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—";
export const fmtWeekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }).replace(".", "");
export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Ícone emoldurado (mesma moldura dos slots da Forja), usado nos indicadores e cabeçalhos. */
export function Frame({ tone, children, size = "md" }: { tone: RpgTone; children: ReactNode; size?: "sm" | "md" }) {
  const text: Record<RpgTone, string> = {
    gold: "text-rpg-gold-light",
    purple: "text-rpg-purple",
    blue: "text-rpg-blue",
    green: "text-rpg-green",
    red: "text-rpg-red",
    orange: "text-rpg-orange",
    cyan: "text-rpg-cyan",
    pink: "text-rpg-pink",
    muted: "text-rpg-muted",
  };
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center border-2 border-current bg-rpg-bg shadow-[inset_0_0_10px_-2px_currentColor]", size === "md" ? "h-10 w-10" : "h-8 w-8", text[tone])}
      style={{ borderRadius: 3 }}
      aria-hidden
    >
      {children}
    </span>
  );
}
