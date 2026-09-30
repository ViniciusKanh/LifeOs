import { Briefcase, GraduationCap, Home, Users } from "lucide-react";
import type { ProjectKind, ProjectPriority, ProjectStatus } from "@/types";

/** Rótulos/cores compartilhados entre a lista de Projetos, o formulário e o detalhe. */
export const KIND_META: Record<ProjectKind, { label: string; icon: typeof Home; tone: "blue" | "purple" | "green" | "pink" }> = {
  personal: { label: "Pessoal", icon: Home, tone: "pink" },
  workspace: { label: "Workspace", icon: Users, tone: "blue" },
  professional: { label: "Profissional", icon: Briefcase, tone: "purple" },
  academic: { label: "Acadêmico", icon: GraduationCap, tone: "green" },
};

export const STATUS_META: Record<ProjectStatus, { label: string; className: string; dot: string }> = {
  planning: { label: "Planejamento", className: "bg-cat-blue/10 text-cat-blue dark:text-cat-blue-dark", dot: "bg-cat-blue" },
  active: { label: "Em andamento", className: "bg-cat-green/10 text-cat-green dark:text-cat-green-dark", dot: "bg-cat-green" },
  paused: { label: "Pausado", className: "bg-signal/15 text-signal-deep dark:text-signal", dot: "bg-signal" },
  completed: { label: "Concluído", className: "bg-brand-500/10 text-brand-600 dark:text-brand-100", dot: "bg-brand-500" },
  cancelled: { label: "Cancelado", className: "bg-slate/10 text-slate", dot: "bg-slate" },
};

export const PRIORITY_META: Record<ProjectPriority, string> = {
  Baixa: "text-slate bg-slate/10",
  Média: "text-signal-deep bg-signal/15",
  Alta: "text-drop bg-drop/10",
  Crítica: "text-white bg-drop",
};

export const PROJECT_COLORS = ["#7C4DFF", "#2F80FF", "#12B76A", "#FF3D93", "#FF7A45", "#08B6A6", "#9550FF", "#6E7391"];

export function formatProjectDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", opts).replace(/\./g, "");
}

export function formatMinutes(total: number) {
  if (!total) return "0h";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

export function formatCurrency(value: number | null | undefined) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
