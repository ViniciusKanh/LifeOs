import { api } from "./api";

export const copilotService = {
  generateInsight: () => api.post<{ text: string }>("/copilot/insight"),
  generateHealthInsight: () => api.post<{ text: string }>("/copilot/health-insight"),
  generateEducationInsight: (educationId: string) => api.post<{ text: string }>("/copilot/education-insight", { educationId }),
  generateHabitsInsight: () => api.post<{ text: string }>("/copilot/habits-insight"),
  generateAnalyticsInsight: (days: number) => api.post<{ text: string }>("/copilot/analytics-insight", { days }),
};
