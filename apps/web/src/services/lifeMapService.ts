import { api } from "./api";
import type { LifeMapData } from "@/types";

export const lifeMapService = {
  get: () => api.get<LifeMapData>("/lifemap"),
};
