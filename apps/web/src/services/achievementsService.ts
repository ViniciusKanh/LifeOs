import { api } from "./api";
import { notifyGamification } from "./gamificationService";
import type { Achievement, CustomAchievement, CustomAchievementMetricOption } from "@/types";

export interface CustomAchievementInput {
  title: string;
  description?: string | null;
  icon?: string;
  metric: string;
  threshold: number;
}

export const achievementsService = {
  list: () => api.get<Achievement[]>("/achievements"),
  /**
   * Pede pro backend recalcular as métricas reais e desbloquear
   * qualquer conquista já atingida. Chamado depois de ações que podem
   * destravar uma (concluir tarefa, marcar hábito, terminar livro) —
   * sempre best-effort, nunca deve travar a ação principal se falhar.
   */
  check: () => api.post<{ newlyUnlocked: (Achievement | CustomAchievement)[] }>("/achievements/check"),
  listCustom: () => api.get<CustomAchievement[]>("/achievements/custom"),
  metrics: () => api.get<CustomAchievementMetricOption[]>("/achievements/custom/metrics"),
  createCustom: (input: CustomAchievementInput) => api.post<CustomAchievement>("/achievements/custom", input),
  removeCustom: (id: string) => api.delete<void>(`/achievements/custom/${id}`),
};

/** Nome do evento global disparado no window quando uma nova conquista é destravada — ver AchievementToast.tsx. */
export const ACHIEVEMENT_UNLOCKED_EVENT = "lifeos:achievement-unlocked";
export const ACHIEVEMENT_CREATED_EVENT = "lifeos:achievement-created";

/**
 * A checagem recalcula métricas sobre todo o histórico no servidor — é a
 * consulta mais cara do app. Por isso ela é agrupada: no máximo uma a cada
 * CHECK_WINDOW_MS, com uma execução "atrasada" no fim da janela para não
 * perder o que aconteceu nesse meio-tempo (ex.: várias tarefas concluídas
 * em sequência viram uma única checagem).
 */
const CHECK_WINDOW_MS = 60_000;
let lastCheckAt = 0;
let trailing: number | null = null;

function runAchievementsCheck() {
  lastCheckAt = Date.now();
  achievementsService
    .check()
    .then(({ newlyUnlocked }) => {
      if (newlyUnlocked.length > 0) {
        window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: newlyUnlocked }));
      }
    })
    .catch(() => undefined);
}

/** Agenda uma checagem respeitando a janela (best-effort, nunca bloqueia a ação). */
export function scheduleAchievementsCheck() {
  const wait = lastCheckAt + CHECK_WINDOW_MS - Date.now();
  if (wait <= 0) return runAchievementsCheck();
  if (trailing !== null) return;
  trailing = window.setTimeout(() => {
    trailing = null;
    runAchievementsCheck();
  }, wait);
}

/**
 * Chamado depois de ações que podem destravar uma conquista. Se algo novo
 * for destravado, emite um evento global — o AchievementToast (montado no
 * AppShell) mostra a comemoração em qualquer tela.
 */
export function triggerAchievementsCheck() {
  // Mesmos gatilhos de conquista também podem render XP/moedas.
  notifyGamification();
  scheduleAchievementsCheck();
}
