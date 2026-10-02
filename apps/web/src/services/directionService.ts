import { api } from "./api";
import type { DirectionOverview, LifeArea, LifeVision, PeriodicKind, PeriodicReview, WheelData, WhyStep } from "@/types";

export const directionService = {
  overview: () => api.get<DirectionOverview>("/direction"),
  saveVision: (input: { vision?: string | null; purpose?: string | null; values?: Array<{ name: string; description?: string | null }> }) =>
    api.put<LifeVision>("/direction/vision", input),
  saveWheel: (input: { assessedOn?: string; scores: Array<{ area: LifeArea; score: number; note?: string | null }> }) => api.put<WheelData>("/direction/wheel", input),
  why: (type: "task" | "project" | "goal", id: string) => api.get<WhyStep[]>(`/direction/why?type=${type}&id=${encodeURIComponent(id)}`),
  reviews: (kind?: PeriodicKind) =>
    api.get<Array<{ kind: PeriodicKind; periodKey: string; savedAt: string; energyScore: number | null; focusNext: string | null }>>(
      `/direction/reviews${kind ? `?kind=${kind}` : ""}`
    ),
  review: (kind: PeriodicKind, key: string) => api.get<PeriodicReview>(`/direction/reviews/${kind}/${key}`),
  saveReview: (kind: PeriodicKind, key: string, input: { wins?: string | null; lessons?: string | null; focusNext?: string | null; energyScore?: number | null }) =>
    api.put<PeriodicReview>(`/direction/reviews/${kind}/${key}`, input),
};
