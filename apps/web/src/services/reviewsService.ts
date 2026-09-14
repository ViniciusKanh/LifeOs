import { api } from "./api";
import type { DailyReview, WeeklyReview, WeeklyComputedMetrics } from "@/types";

export const reviewsService = {
  getDaily: (date?: string) => api.get<DailyReview | null>(`/reviews/daily${date ? `?date=${date}` : ""}`),
  saveDaily: (input: { reviewDate: string; completionPct?: number; highlights?: string; notes?: string }) =>
    api.put<DailyReview>("/reviews/daily", input),

  getWeekly: (weekStartDate: string) => api.get<WeeklyReview | null>(`/reviews/weekly?weekStartDate=${weekStartDate}`),
  computeWeekly: (weekStartDate: string) =>
    api.get<WeeklyComputedMetrics>(`/reviews/weekly/compute?weekStartDate=${weekStartDate}`),
  historyWeekly: (limit = 12) => api.get<WeeklyReview[]>(`/reviews/weekly/history?limit=${limit}`),
  saveWeekly: (input: {
    weekStartDate: string;
    whatWorked?: string;
    whatDidntWork?: string;
    whatToImprove?: string;
    nextPriorities?: string;
  }) => api.put<WeeklyReview>("/reviews/weekly", input),

  /** LifeOS Copilot — rascunho das três reflexões da semana, baseado só nas métricas reais já computadas. */
  draftWeekly: (weekStartDate: string) =>
    api.post<{ draft: { wentWell: string; toImprove: string; nextWeekFocus: string } }>(
      `/reviews/weekly/draft?weekStartDate=${weekStartDate}`
    ),

  /** Resumo semanal por e-mail — preferência (opt-in) e envio manual ("me envie agora"). */
  getWeeklyEmailSettings: () => api.get<{ enabled: boolean }>("/reviews/weekly/email-settings"),
  setWeeklyEmailSettings: (enabled: boolean) =>
    api.patch<{ enabled: boolean }>("/reviews/weekly/email-settings", { enabled }),
  sendWeeklyEmailNow: () => api.post<{ sent: boolean; weekStartDate: string }>("/reviews/weekly/send-email"),
};
