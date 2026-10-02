import type { Task } from "@/types";
import { DONE_STATUS } from "@/utils/taskStatus";

/**
 * Regras de prazo/prioridade das tarefas, fora dos componentes: o mesmo
 * cálculo serve o card do Kanban, a lista, os filtros rápidos e o
 * "Foque nisso agora".
 */

export type DueKind = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysKey(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export function dueKind(task: Pick<Task, "due_date" | "status">): DueKind {
  const due = task.due_date?.slice(0, 10);
  if (!due) return "none";
  const today = localDateKey();
  if (task.status !== DONE_STATUS && due < today) return "overdue";
  if (due === today) return "today";
  if (due === addDaysKey(1)) return "tomorrow";
  if (due <= addDaysKey(7)) return "week";
  return "later";
}

export interface DueInfo {
  kind: DueKind;
  label: string;
  /** Classes de cor (texto + fundo) do chip de prazo. */
  tone: string;
}

export function dueInfo(task: Pick<Task, "due_date" | "status">): DueInfo | null {
  const kind = dueKind(task);
  if (kind === "none") return null;
  const due = task.due_date!.slice(0, 10);
  const date = new Date(`${due}T00:00:00`);
  const short = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  if (kind === "overdue") {
    const days = Math.round((new Date(`${localDateKey()}T00:00:00`).getTime() - date.getTime()) / 86_400_000);
    return { kind, label: days === 1 ? "Ontem" : `${days}d atrasada`, tone: "text-drop bg-drop/10" };
  }
  if (kind === "today") return { kind, label: "Hoje", tone: "text-signal-deep bg-signal/15 dark:text-signal" };
  if (kind === "tomorrow") return { kind, label: "Amanhã", tone: "text-cat-blue bg-cat-blue/10" };
  if (kind === "week") return { kind, label: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") + ` ${short}`, tone: "text-cat-purple bg-cat-purple/10" };
  return { kind, label: short, tone: "text-slate bg-black/[0.04] dark:bg-white/[0.06]" };
}

/** Ordem do "Foque nisso agora": prioridade + status + urgência do prazo. */
export function taskFocusScore(task: Task): number {
  if (task.status === DONE_STATUS) return -1;
  const priority = task.priority === "Alta" ? 35 : task.priority === "Média" ? 20 : 8;
  const status = task.status === "Em Andamento" ? 18 : task.status === "Em Revisão" ? 12 : task.status === "A Fazer" ? 8 : 0;
  const k = dueKind(task);
  const urgency = k === "overdue" ? 35 : k === "today" ? 28 : k === "tomorrow" ? 22 : k === "week" ? 14 : k === "later" ? 6 : 0;
  return priority + status + urgency;
}

export type QuickFilter = "overdue" | "today" | "week" | "high" | "no_date";

export function matchesQuickFilter(task: Task, filter: QuickFilter): boolean {
  if (task.status === DONE_STATUS && filter !== "no_date") return false;
  const k = dueKind(task);
  if (filter === "overdue") return k === "overdue";
  if (filter === "today") return k === "today" || k === "overdue";
  if (filter === "week") return k === "overdue" || k === "today" || k === "tomorrow" || k === "week";
  if (filter === "high") return task.priority === "Alta";
  return k === "none" && task.status !== DONE_STATUS;
}

export const DUE_GROUPS: Array<{ key: DueKind | "done"; label: string }> = [
  { key: "overdue", label: "Atrasadas" },
  { key: "today", label: "Hoje" },
  { key: "tomorrow", label: "Amanhã" },
  { key: "week", label: "Próximos 7 dias" },
  { key: "later", label: "Mais tarde" },
  { key: "none", label: "Sem prazo" },
  { key: "done", label: "Concluídas" },
];

export function dueGroupOf(task: Task): DueKind | "done" {
  return task.status === DONE_STATUS ? "done" : dueKind(task);
}

const PRIORITY_RANK: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
export function compareTasks(a: Task, b: Task): number {
  const da = a.due_date?.slice(0, 10) ?? "9999-12-31";
  const db = b.due_date?.slice(0, 10) ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
}
