import { api } from "./api";
import type { ContextPeriod, ContextDashboardResponse, ContextLocation, UpdateContextLocationInput, GeocodeResult } from "@/types";

export const contextService = {
  today: (period: ContextPeriod) => api.get<ContextDashboardResponse>(`/context/today?period=${period}`),
  location: () => api.get<ContextLocation>("/context/location"),
  updateLocation: (input: UpdateContextLocationInput) => api.patch<ContextLocation>("/context/location", input),
  geocode: (query: string) => api.get<GeocodeResult[]>(`/context/geocode?q=${encodeURIComponent(query)}`),
};

/** Só chama navigator.geolocation com o clique explícito do usuário — nunca automático (regra 5). */
export function requestBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não é suportada neste navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}
