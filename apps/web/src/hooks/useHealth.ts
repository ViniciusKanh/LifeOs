import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { healthService } from "@/services/healthService";

const KEYS = {
  summary: ["health", "summary"],
  water: ["health", "water"],
  sleep: ["health", "sleep"],
  workouts: ["health", "workouts"],
  mood: ["health", "mood"],
  correlations: ["health", "correlations"],
};

/** Reaproveitado por Dashboard, Hoje e a própria tela de Saúde. */
export function useHealthSummary() {
  const query = useQuery({ queryKey: KEYS.summary, queryFn: () => healthService.summary() });
  return { summary: query.data ?? null, isLoading: query.isLoading };
}

/** Correlações automáticas entre sono, exercício, água e humor/energia/estresse — só aparecem com amostra suficiente (ver correlationService.ts). */
export function useHealthCorrelations() {
  const query = useQuery({ queryKey: KEYS.correlations, queryFn: () => healthService.correlations() });
  return { correlations: query.data ?? [], isLoading: query.isLoading };
}

export function useHealth() {
  const queryClient = useQueryClient();
  const invalidateAll = () => {
    Object.values(KEYS).forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const waterQuery = useQuery({ queryKey: KEYS.water, queryFn: () => healthService.listWater() });
  const sleepQuery = useQuery({ queryKey: KEYS.sleep, queryFn: () => healthService.listSleep() });
  const workoutsQuery = useQuery({ queryKey: KEYS.workouts, queryFn: () => healthService.listWorkouts() });
  const moodQuery = useQuery({ queryKey: KEYS.mood, queryFn: () => healthService.listMood() });

  const addWater = useMutation({ mutationFn: healthService.addWater, onSuccess: invalidateAll });
  const updateWater = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof healthService.updateWater>[1] }) => healthService.updateWater(id, patch), onSuccess: invalidateAll });
  const removeWater = useMutation({ mutationFn: healthService.removeWater, onSuccess: invalidateAll });
  const addSleep = useMutation({ mutationFn: healthService.addSleep, onSuccess: invalidateAll });
  const updateSleep = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof healthService.updateSleep>[1] }) => healthService.updateSleep(id, patch), onSuccess: invalidateAll });
  const removeSleep = useMutation({ mutationFn: healthService.removeSleep, onSuccess: invalidateAll });
  const addWorkout = useMutation({ mutationFn: healthService.addWorkout, onSuccess: invalidateAll });
  const updateWorkout = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof healthService.updateWorkout>[1] }) => healthService.updateWorkout(id, patch), onSuccess: invalidateAll });
  const removeWorkout = useMutation({ mutationFn: healthService.removeWorkout, onSuccess: invalidateAll });
  const addMood = useMutation({ mutationFn: healthService.addMood, onSuccess: invalidateAll });
  const updateMood = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof healthService.updateMood>[1] }) => healthService.updateMood(id, patch), onSuccess: invalidateAll });
  const removeMood = useMutation({ mutationFn: healthService.removeMood, onSuccess: invalidateAll });

  return {
    water: waterQuery.data ?? [],
    sleep: sleepQuery.data ?? [],
    workouts: workoutsQuery.data ?? [],
    mood: moodQuery.data ?? [],
    isLoading: waterQuery.isLoading || sleepQuery.isLoading || workoutsQuery.isLoading || moodQuery.isLoading,
    addWater: addWater.mutateAsync,
    updateWater: updateWater.mutateAsync,
    removeWater: removeWater.mutateAsync,
    addSleep: addSleep.mutateAsync,
    updateSleep: updateSleep.mutateAsync,
    removeSleep: removeSleep.mutateAsync,
    addWorkout: addWorkout.mutateAsync,
    updateWorkout: updateWorkout.mutateAsync,
    removeWorkout: removeWorkout.mutateAsync,
    addMood: addMood.mutateAsync,
    updateMood: updateMood.mutateAsync,
    removeMood: removeMood.mutateAsync,
  };
}
