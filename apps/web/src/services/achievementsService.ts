import { api } from "./api";
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
 * Dispara a checagem de conquistas sem bloquear a ação que a chamou
 * nem estourar erro se falhar (best-effort). Se algo novo foi
 * destravado, emite um evento global — o AchievementToast (montado no
 * AppShell) escuta e mostra a comemoração, não importa em qual tela
 * a ação que destravou aconteceu.
 */
export function triggerAchievementsCheck() {
  achievementsService
    .check()
    .then(({ newlyUnlocked }) => {
      if (newlyUnlocked.length > 0) {
        window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: newlyUnlocked }));
      }
    })
    .catch(() => undefined);
}
