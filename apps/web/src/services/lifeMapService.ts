import { api } from "./api";
import type { CreateLifeMapLinkInput, LifeMapData } from "@/types";

export const lifeMapService = {
  get: () => api.get<LifeMapData>("/lifemap"),
  createLink: (input: CreateLifeMapLinkInput) => api.post<{ id: string; from: string; to: string }>("/lifemap/links", input),
  deleteLink: (id: string) => api.delete<void>(`/lifemap/links/${id}`),
};
