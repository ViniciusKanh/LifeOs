import { api } from "./api";

export const copilotService = {
  generateInsight: () => api.post<{ text: string }>("/copilot/insight"),
};
