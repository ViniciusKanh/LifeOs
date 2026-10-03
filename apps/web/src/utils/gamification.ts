import type { GamificationRules } from "@/services/gamificationService";

/**
 * Prévia da recompensa de uma tarefa a partir das regras públicas do
 * backend (o valor real é sempre concedido pelo servidor, ao concluir).
 */
export function previewTaskReward(
  rules: GamificationRules | undefined,
  task: { priority?: string | null; dueDate?: string | null; habitId?: string | null },
  today: string,
  isMainMission = false,
): { xp: number; coins: number; fromContract?: boolean } | null {
  if (!rules) return null;
  // Tarefa gerada por contrato: quem paga é o check-in do hábito (sem dupla recompensa).
  if (task.habitId) return { xp: rules.habit.xp, coins: rules.habit.coins, fromContract: true };
  const priority = task.priority ?? "Média";
  let xp = rules.task.xpByPriority[priority] ?? rules.task.xpByPriority["Média"] ?? 0;
  const coins = rules.task.coinsByPriority[priority] ?? rules.task.coinsByPriority["Média"] ?? 0;
  const due = task.dueDate ? task.dueDate.slice(0, 10) : null;
  if (due === today) xp += rules.task.dailyMissionXp;
  else if (due && due > today) xp += rules.task.beforeDeadlineXp;
  if (isMainMission) xp += rules.task.mainMissionXp;
  return { xp, coins };
}

/** Rótulo e tom de cada origem de XP (para gráficos e listas). */
export const XP_SOURCES: Array<{ id: string; label: string; tone: "purple" | "green" | "cyan" | "gold" | "pink" }> = [
  { id: "task", label: "Missões", tone: "purple" },
  { id: "habit_entry", label: "Contratos", tone: "green" },
  { id: "focus", label: "Foco", tone: "cyan" },
  { id: "project", label: "Campanhas", tone: "gold" },
  { id: "journal", label: "Diário", tone: "pink" },
];

export function xpSourceLabel(sourceType: string): string {
  if (sourceType === "day") return "Bônus do dia";
  return XP_SOURCES.find((s) => s.id === sourceType)?.label ?? sourceType;
}

/** Data local YYYY-MM-DD (o "hoje" do usuário no navegador). */
export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type MissionState = "done" | "overdue" | "doing" | "open";

/**
 * Últimas N missões (tarefas) pela atividade mais recente — conclusão
 * ou criação — com o estado de cada uma para o waffle do Dashboard RPG.
 */
export function lastMissions<T extends { id: string; title: string; status: string; due_date: string | null; completed_at: string | null; created_at: string }>(
  tasks: T[],
  today: string,
  limit = 100,
): Array<{ task: T; state: MissionState }> {
  const when = (t: T) => (t.completed_at ?? t.created_at).replace(" ", "T");
  return [...tasks]
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, limit)
    .map((task) => {
      let state: MissionState = "open";
      if (task.status === "Concluído") state = "done";
      else if (task.due_date && task.due_date.slice(0, 10) < today) state = "overdue";
      else if (task.status === "Em Andamento" || task.status === "Em Revisão") state = "doing";
      return { task, state };
    });
}
