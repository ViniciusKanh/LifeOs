import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { personalIntegrations as svc, type MealInput } from "@/services/personalIntegrationsService";
import { RESEARCH_KEY } from "@/hooks/useResearch";

/** Hooks das integrações pessoais (Zotero, Radar, WakaTime, ClickUp, refeições, feriados). */

function useRefresh(...keys: ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    // XP e conquistas novas aparecem no HUD.
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
}

export const ZOTERO_KEY = ["zotero"] as const;
export const RADAR_KEY = ["radar"] as const;
export const WAKA_KEY = ["wakatime"] as const;
export const CLICKUP_KEY = ["clickup"] as const;
export const NUTRITION_KEY = ["nutrition"] as const;
export const HOLIDAYS_KEY = ["holidays"] as const;

export const useZotero = () => useQuery({ queryKey: ZOTERO_KEY, queryFn: svc.zotero.overview, staleTime: 60_000 });
export function useZoteroActions() {
  const refresh = useRefresh(ZOTERO_KEY, RESEARCH_KEY);
  return {
    connect: useMutation({ mutationFn: svc.zotero.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.zotero.sync, onSettled: refresh }),
    collection: useMutation({ mutationFn: svc.zotero.collection, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: svc.zotero.disconnect, onSuccess: refresh }),
  };
}

export const useRadar = () => useQuery({ queryKey: RADAR_KEY, queryFn: svc.radar.overview, staleTime: 60_000 });
export function useRadarActions() {
  const refresh = useRefresh(RADAR_KEY, RESEARCH_KEY);
  return {
    addTopic: useMutation({ mutationFn: svc.radar.addTopic, onSuccess: refresh }),
    removeTopic: useMutation({ mutationFn: svc.radar.removeTopic, onSuccess: refresh }),
    scan: useMutation({ mutationFn: (force?: boolean) => svc.radar.scan(force), onSettled: refresh }),
    decide: useMutation({ mutationFn: ({ key, decision }: { key: string; decision: "salvar" | "dispensar" | "desfazer" }) => svc.radar.decide(key, decision), onSettled: refresh }),
  };
}

export const useWakatime = () => useQuery({ queryKey: WAKA_KEY, queryFn: svc.waka.overview, staleTime: 60_000 });
export function useWakatimeActions() {
  const refresh = useRefresh(WAKA_KEY, ["code-forge"]);
  return {
    connect: useMutation({ mutationFn: svc.waka.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.waka.sync, onSettled: refresh }),
    disconnect: useMutation({ mutationFn: svc.waka.disconnect, onSuccess: refresh }),
  };
}

export const useClickUp = () => useQuery({ queryKey: CLICKUP_KEY, queryFn: svc.clickup.overview, staleTime: 60_000 });
export const useClickUpTeams = (enabled: boolean) => useQuery({ queryKey: [...CLICKUP_KEY, "teams"], queryFn: svc.clickup.teams, enabled, staleTime: 5 * 60_000 });
export function useClickUpActions() {
  // Tarefas importadas aparecem em Missões, Profissional, Agenda e Conselho.
  const refresh = useRefresh(CLICKUP_KEY, ["tasks"], ["analytics"], ["projects"]);
  return {
    connect: useMutation({ mutationFn: svc.clickup.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.clickup.sync, onSettled: refresh }),
    settings: useMutation({ mutationFn: svc.clickup.settings, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: svc.clickup.disconnect, onSuccess: refresh }),
  };
}

export const useNutrition = (day?: string) => useQuery({ queryKey: [...NUTRITION_KEY, day ?? "hoje"], queryFn: () => svc.nutrition.overview(day), staleTime: 30_000, placeholderData: (p) => p });
export function useNutritionActions() {
  const refresh = useRefresh(NUTRITION_KEY);
  return {
    addMeal: useMutation({ mutationFn: (m: MealInput) => svc.nutrition.addMeal(m), onSuccess: refresh }),
    removeMeal: useMutation({ mutationFn: svc.nutrition.removeMeal, onSuccess: refresh }),
    settings: useMutation({ mutationFn: svc.nutrition.settings, onSuccess: refresh }),
  };
}

export const useHolidays = (year: number) => useQuery({ queryKey: [...HOLIDAYS_KEY, year], queryFn: () => svc.holidays.list(year), staleTime: 60 * 60_000 });
export function useHolidayActions() {
  // Feriados mudam a Agenda, a distribuição do Conselho e a trégua da Raid.
  const refresh = useRefresh(HOLIDAYS_KEY, ["events"], ["calendar"], ["adventures", "raid"], ["war-council"]);
  return {
    prefs: useMutation({ mutationFn: svc.holidays.prefs, onSuccess: refresh }),
    addLocal: useMutation({ mutationFn: ({ date, name }: { date: string; name: string }) => svc.holidays.addLocal(date, name), onSuccess: refresh }),
    removeLocal: useMutation({ mutationFn: svc.holidays.removeLocal, onSuccess: refresh }),
  };
}
