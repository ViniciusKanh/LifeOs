import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routineHubService, type HabitMetaInput, type SessionInput, type TrailInput } from "@/services/routineHubService";
import { notifyGamification } from "@/services/gamificationService";

// Hubs sob o prefixo do módulo de origem: check-ins, livros e itens já
// invalidam ["habits"], ["books"] e ["life-admin"] — o hub vem junto.
export const HABITS_HUB_KEY = ["habits", "hub"] as const;
export const LIBRARY_HUB_KEY = ["books", "hub"] as const;
export const ADMIN_HUB_KEY = ["life-admin", "hub"] as const;

export const useHabitsHub = () => useQuery({ queryKey: HABITS_HUB_KEY, queryFn: routineHubService.habits, staleTime: 15_000 });
export const useHabitsDay = (day: string | null) => useQuery({ queryKey: ["habits", "hub", "day", day], queryFn: () => routineHubService.habitsDay(day!), enabled: !!day });
export const useLibraryHub = () => useQuery({ queryKey: LIBRARY_HUB_KEY, queryFn: routineHubService.library, staleTime: 15_000 });
export const useAdminHub = (month?: string) => useQuery({ queryKey: [...ADMIN_HUB_KEY, month ?? "atual"], queryFn: () => routineHubService.admin(month), placeholderData: (p) => p, staleTime: 15_000 });

export function useRoutineActions() {
  const qc = useQueryClient();
  const habits = () => void qc.invalidateQueries({ queryKey: ["habits"] });
  const books = () => {
    void qc.invalidateQueries({ queryKey: ["books"] });
    void qc.invalidateQueries({ queryKey: ["habits"] });
    void qc.invalidateQueries({ queryKey: ["goals"] });
    void qc.invalidateQueries({ queryKey: ["reading-year"] });
  };
  const admin = () => {
    void qc.invalidateQueries({ queryKey: ["life-admin"] });
    void qc.invalidateQueries({ queryKey: ["events"] });
  };
  return {
    habitMeta: useMutation({ mutationFn: ({ id, input }: { id: string; input: HabitMetaInput }) => routineHubService.habitMeta(id, input), onSuccess: habits }),
    habitsPlan: useMutation({ mutationFn: routineHubService.habitsPlan }),
    addSession: useMutation({ mutationFn: (input: SessionInput) => routineHubService.addSession(input), onSuccess: books }),
    updateSession: useMutation({ mutationFn: ({ id, input }: { id: string; input: Omit<SessionInput, "bookId"> }) => routineHubService.updateSession(id, input), onSuccess: books }),
    deleteSession: useMutation({ mutationFn: routineHubService.deleteSession, onSuccess: books }),
    sessionCard: useMutation({ mutationFn: ({ id, front, back }: { id: string; front: string; back: string }) => routineHubService.sessionCard(id, { front, back }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["grimoire"] }) }),
    favorite: useMutation({ mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => routineHubService.favorite(id, favorite), onSuccess: books }),
    saveTrail: useMutation({ mutationFn: ({ id, input }: { id?: string; input: TrailInput }) => (id ? routineHubService.updateTrail(id, input) : routineHubService.createTrail(input)), onSuccess: books }),
    deleteTrail: useMutation({ mutationFn: routineHubService.deleteTrail, onSuccess: books }),
    adminMeta: useMutation({ mutationFn: ({ id, input }: { id: string; input: { priority?: "Baixa" | "Média" | "Alta" | null; currency?: string } }) => routineHubService.adminMeta(id, input), onSuccess: admin }),
    reopen: useMutation({ mutationFn: routineHubService.reopen, onSuccess: admin }),
    claimChest: useMutation({
      mutationFn: routineHubService.claimChest,
      onSuccess: () => {
        admin();
        void qc.invalidateQueries({ queryKey: ["gamification"] });
        notifyGamification();
      },
    }),
  };
}
