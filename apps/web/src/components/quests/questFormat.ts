import { BookOpen, CheckSquare, Droplets, FolderKanban, NotebookPen, Repeat, Sparkles, Timer, type LucideIcon } from "lucide-react";
import type { Quest, QuestModule } from "@/services/questsService";
import type { RpgTone } from "@/components/rpg";

/** Ícone, cor e tela de origem de cada módulo — o link leva para onde a quest é cumprida. */
export const QUEST_MODULE: Record<QuestModule, { icon: LucideIcon; tone: RpgTone; to: string; label: string }> = {
  missions: { icon: CheckSquare, tone: "blue", to: "/tarefas", label: "Missões" },
  projects: { icon: FolderKanban, tone: "blue", to: "/projetos", label: "Projetos" },
  health: { icon: Droplets, tone: "green", to: "/saude", label: "Saúde" },
  library: { icon: BookOpen, tone: "pink", to: "/biblioteca", label: "Biblioteca" },
  habits: { icon: Repeat, tone: "green", to: "/habitos", label: "Hábitos" },
  journal: { icon: NotebookPen, tone: "pink", to: "/diario", label: "Diário" },
  focus: { icon: Timer, tone: "purple", to: "/hoje", label: "Foco" },
  xp: { icon: Sparkles, tone: "purple", to: "/perfil", label: "XP" },
};

export const fmtNum = (n: number) => n.toLocaleString("pt-BR");

export const fmtProgress = (q: Quest) => `${fmtNum(Math.min(q.progress, q.target))}/${fmtNum(q.target)}${q.unit ? ` ${q.unit}` : ""}`;

/** "31/10" a partir de YYYY-MM-DD. */
export const fmtShortDay = (iso: string) => iso.slice(5, 10).split("-").reverse().join("/");

export function daysLeftLabel(days: number, end: string): string {
  if (days <= 0) return "Último dia";
  return `${days} ${days === 1 ? "dia restante" : "dias restantes"} (até ${end})`;
}
