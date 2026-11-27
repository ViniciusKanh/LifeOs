import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cityService as svc, type CityApi } from "@/services/cityService";

/** Cidade Inteligente — consultas ao APILIB passam sempre pelo servidor (cache + credencial do usuário). */
export const CITY_KEY = ["city"] as const;

export const useCityCatalog = () => useQuery({ queryKey: [...CITY_KEY, "catalog"], queryFn: svc.catalog, staleTime: 60 * 60_000 });
export const useCityStatus = () => useQuery({ queryKey: [...CITY_KEY, "status"], queryFn: svc.status, staleTime: 60_000 });
export const useCityOverview = () => useQuery({ queryKey: [...CITY_KEY, "overview"], queryFn: svc.overview, staleTime: 5 * 60_000, retry: false });

const noRetry = { retry: false, staleTime: 5 * 60_000 } as const;

export const useDom = (day: string, caderno: number) => useQuery({ queryKey: [...CITY_KEY, "dom", day, caderno], queryFn: () => svc.dom(day, caderno), ...noRetry });
export const useDomTenders = (day: string, caderno: number) => useQuery({ queryKey: [...CITY_KEY, "domTenders", day, caderno], queryFn: () => svc.domTenders(day, caderno), ...noRetry });
export const useQueue = () => useQuery({ queryKey: [...CITY_KEY, "fila"], queryFn: () => svc.queue(), retry: false, staleTime: 60_000, refetchInterval: 5 * 60_000 });

export const useCityData = (apiId: CityApi, resource: string, params: Record<string, string | number | undefined | null>, enabled = true) =>
  useQuery({ queryKey: [...CITY_KEY, "data", apiId, resource, params], queryFn: () => svc.data(apiId, resource, params), enabled, ...noRetry });

export const useCityFavorites = (apiId?: CityApi) => useQuery({ queryKey: [...CITY_KEY, "favorites", apiId ?? "all"], queryFn: () => svc.favorites(apiId) });
export const useCityAlerts = () => useQuery({ queryKey: [...CITY_KEY, "alerts"], queryFn: svc.alerts });
export const useCityProtocols = () => useQuery({ queryKey: [...CITY_KEY, "protocols"], queryFn: svc.protocols });
export const useCityHistory = () => useQuery({ queryKey: [...CITY_KEY, "history"], queryFn: svc.history });

export function useCityActions() {
  const qc = useQueryClient();
  const personal = () => {
    for (const k of ["favorites", "alerts", "protocols", "history", "overview", "status"]) void qc.invalidateQueries({ queryKey: [...CITY_KEY, k] });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  const everything = () => {
    void qc.invalidateQueries({ queryKey: CITY_KEY });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  return {
    saveToken: useMutation({ mutationFn: svc.saveToken, onSuccess: everything }),
    saveClient: useMutation({ mutationFn: ({ key, secret }: { key: string; secret: string }) => svc.saveClient(key, secret), onSuccess: everything }),
    removeCredential: useMutation({ mutationFn: svc.removeCredential, onSuccess: everything }),
    setDisabled: useMutation({ mutationFn: svc.setDisabled, onSuccess: everything }),
    test: useMutation({ mutationFn: (apis?: CityApi[]) => svc.test(apis), onSuccess: everything }),
    activity: useMutation({ mutationFn: svc.activity, onSuccess: personal }),
    addFavorite: useMutation({ mutationFn: svc.addFavorite, onSuccess: personal }),
    removeFavorite: useMutation({ mutationFn: svc.removeFavorite, onSuccess: personal }),
    favoriteToTask: useMutation({ mutationFn: ({ id, dueDate }: { id: string; dueDate: string | null }) => svc.favoriteToTask(id, dueDate), onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }) }),
    favoriteToEvent: useMutation({ mutationFn: ({ id, startsAt }: { id: string; startsAt: string }) => svc.favoriteToEvent(id, startsAt), onSuccess: () => void qc.invalidateQueries({ queryKey: ["events"] }) }),
    createAlert: useMutation({ mutationFn: svc.createAlert, onSuccess: personal }),
    updateAlert: useMutation({ mutationFn: ({ id, ...a }: Parameters<typeof svc.updateAlert>[1] & { id: string }) => svc.updateAlert(id, a), onSuccess: personal }),
    removeAlert: useMutation({ mutationFn: svc.removeAlert, onSuccess: personal }),
    runAlerts: useMutation({ mutationFn: svc.runAlerts, onSuccess: personal }),
    createProtocol: useMutation({ mutationFn: svc.createProtocol, onSuccess: personal }),
    updateProtocol: useMutation({ mutationFn: ({ id, ...p }: Parameters<typeof svc.updateProtocol>[1] & { id: string }) => svc.updateProtocol(id, p), onSuccess: personal }),
    removeProtocol: useMutation({ mutationFn: svc.removeProtocol, onSuccess: personal }),
    savePrefs: useMutation({ mutationFn: svc.savePrefs, onSuccess: personal }),
    oracle: useMutation({ mutationFn: svc.oracle }),
  };
}
