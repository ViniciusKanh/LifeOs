import { api } from "./api";
import type { ProfessionalOverview } from "@/types";

export const professionalService = {
  overview: (today: string) => api.get<ProfessionalOverview>(`/professional/overview?today=${today}`),
};
