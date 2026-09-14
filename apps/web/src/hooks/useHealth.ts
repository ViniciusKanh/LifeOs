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
  };

  const waterQuery = useQuery({ queryKey: KEYS.water, queryFn: () => healthService.listWater() });
  const sleepQuery = useQuery({ queryKey: KEYS.sleep, queryFn: () => healthService.listSleep() });
  const workoutsQuery = useQuery({ queryKey: KEYS.workouts, queryFn: () => healthService.listWorkouts() });
  const moodQuery = useQuery({ queryKey: KEYS.mood, queryFn: () => healthService.listMood() });

  const addWater = useMutation({ mutationFn: healthService.addWater, onSuccess: invalidateAll });
  const removeWater = useMutation({ mutationFn: healthService.removeWater, onSuccess: invalidateAll });
  const addSleep = useMutation({ mutationFn: healthService.addSleep, onSuccess: invalidateAll });
  const removeSleep = useMutation({ mutationFn: healthService.removeSleep, onSuccess: invalidateAll });
  const addWorkout = useMutation({ mutationFn: healthService.addWorkout, onSuccess: invalidateAll });
  const removeWorkout = useMutation({ mutationFn: healthService.removeWorkout, onSuccess: invalidateAll });
  const addMood = useMutation({ mutationFn: healthService.addMood, onSuccess: invalidateAll });

  return {
    water: waterQuery.data ?? [],
    sleep: sleepQuery.data ?? [],
    workouts: workoutsQuery.data ?? [],
    mood: moodQuery.data ?? [],
    isLoading: waterQuery.isLoading || sleepQuery.isLoading || workoutsQuery.isLoading || moodQuery.isLoading,
    addWater: addWater.mutateAsync,
    removeWater: removeWater.mutateAsync,
    addSleep: addSleep.mutateAsync,
    removeSleep: removeSleep.mutateAsync,
    addWorkout: addWorkout.mutateAsync,
    removeWorkout: removeWorkout.mutateAsync,
    addMood: addMood.mutateAsync,
  };
}
