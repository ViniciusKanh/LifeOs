/**
 * Capacity Planner — motor de sugestão de plano. Determinístico (sem
 * Gemini): ordena tarefas, encaixa nas janelas livres respeitando
 * duração e prioriza trabalho profundo no melhor horário de Focus.
 * Só gera uma PROPOSTA — nunca persiste sozinho (regra "sem alteração
 * automática").
 */
import type { getDb } from "../db/client.js";
import { getDayTasks, getFreeWindows, getFocusForecast, type DayTask, type FreeWindow, type EffortType } from "./capacityPlannerService.js";

type Db = ReturnType<typeof getDb>;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ProposedBlock {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
  blockType: EffortType;
}

export interface PlanningSuggestion {
  proposed: ProposedBlock[];
  deferred: Array<{ taskId: string; title: string; reason: string }>;
  overloadBeforeMinutes: number;
  overloadAfterMinutes: number;
}

function effortType(task: DayTask): EffortType {
  if ((task.estimateMinutes ?? 0) >= 60 && task.priority === "Alta") return "deep_work";
  if ((task.estimateMinutes ?? 0) <= 20) return "light";
  return "normal";
}

/** Ordena: sem estimativa fica de fora (nunca inventa duração); prazo mais próximo primeiro; depois prioridade. */
function sortTasks(tasks: DayTask[]): DayTask[] {
  const priorityRank: Record<DayTask["priority"], number> = { Alta: 0, Média: 1, Baixa: 2 };
  return [...tasks]
    .filter((t) => t.estimateMinutes != null && t.estimateMinutes > 0 && !t.plannedStart)
    .sort((a, b) => {
      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (dueA !== dueB) return dueA - dueB;
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
}

export async function buildPlanningSuggestion(db: Db, ownerId: string, date: string): Promise<PlanningSuggestion> {
  const [tasks, freeWindows, focus] = await Promise.all([getDayTasks(db, ownerId, date), getFreeWindows(db, ownerId, date), getFocusForecast(db, ownerId)]);

  const overloadBefore = tasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0) - freeWindows.reduce((sum, w) => sum + (toMinutes(w.end) - toMinutes(w.start)), 0);

  const windows: FreeWindow[] = freeWindows.map((w) => ({ ...w }));
  const bestFocusStart = focus.bestPeriod ? toMinutes(focus.bestPeriod.split("–")[0].replace("h", ":00")) : null;

  const sorted = sortTasks(tasks).sort((a, b) => {
    // Trabalho profundo primeiro para poder ocupar a melhor janela de Focus quando ela existir.
    const aDeep = effortType(a) === "deep_work" ? 0 : 1;
    const bDeep = effortType(b) === "deep_work" ? 0 : 1;
    return aDeep - bDeep;
  });

  const proposed: ProposedBlock[] = [];
  const deferred: PlanningSuggestion["deferred"] = [];

  function windowContaining(minute: number) {
    return windows.find((w) => toMinutes(w.start) <= minute && toMinutes(w.end) > minute);
  }

  for (const task of sorted) {
    const duration = task.estimateMinutes as number;
    const type = effortType(task);
    let target: FreeWindow | undefined;

    if (type === "deep_work" && bestFocusStart != null) {
      target = windowContaining(bestFocusStart) ?? windows.find((w) => toMinutes(w.end) - toMinutes(w.start) >= duration);
    } else {
      target = windows.find((w) => toMinutes(w.end) - toMinutes(w.start) >= duration);
    }

    if (!target) {
      deferred.push({ taskId: task.id, title: task.title, reason: "Não há janela livre com duração suficiente hoje — mover para amanhã." });
      continue;
    }

    const startMinute = type === "deep_work" && bestFocusStart != null && toMinutes(target.start) <= bestFocusStart && toMinutes(target.end) - bestFocusStart >= duration
      ? bestFocusStart
      : toMinutes(target.start);
    const endMinute = startMinute + duration;

    proposed.push({ taskId: task.id, title: task.title, startTime: toHHMM(startMinute), endTime: toHHMM(endMinute), blockType: type });

    // Consome a janela usada, dividindo o restante em até duas partes.
    const idx = windows.indexOf(target);
    const remainderBefore = startMinute > toMinutes(target.start) ? { start: target.start, end: toHHMM(startMinute) } : null;
    const remainderAfter = endMinute < toMinutes(target.end) ? { start: toHHMM(endMinute), end: target.end } : null;
    const replacement = [remainderBefore, remainderAfter].filter((w): w is FreeWindow => w != null);
    windows.splice(idx, 1, ...replacement);
  }

  const overloadAfter = deferred.reduce((sum, d) => {
    const t = tasks.find((task) => task.id === d.taskId);
    return sum + (t?.estimateMinutes ?? 0);
  }, 0);

  return { proposed, deferred, overloadBeforeMinutes: Math.max(0, overloadBefore), overloadAfterMinutes: overloadAfter };
}
