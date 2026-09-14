import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewsService } from "@/services/reviewsService";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import type { ApiError } from "@/services/api";

/** Preferência de resumo semanal por e-mail + botão "me envie agora" — usado em Perfil. */
export function useWeeklyEmail() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["reviews", "weekly-email-settings"],
    queryFn: () => reviewsService.getWeeklyEmailSettings(),
  });

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => reviewsService.setWeeklyEmailSettings(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews", "weekly-email-settings"] }),
  });

  const sendNow = useMutation({ mutationFn: reviewsService.sendWeeklyEmailNow });

  return {
    enabled: settingsQuery.data?.enabled ?? false,
    isLoading: settingsQuery.isLoading,
    setEnabled: setEnabled.mutateAsync,
    sendNow: sendNow.mutateAsync,
    isSending: sendNow.isPending,
  };
}

/** Segunda-feira (00:00) da semana que contém `date` (ou hoje). */
export function mondayOf(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Histórico de revisões semanais já salvas — usado no Dashboard para o gráfico de evolução. */
export function useWeeklyReviewHistory(limit = 12) {
  const query = useQuery({ queryKey: ["reviews", "weekly-history", limit], queryFn: () => reviewsService.historyWeekly(limit) });
  return { history: query.data ?? [], isLoading: query.isLoading };
}

export function useWeeklyReview(weekStartDate: string) {
  const queryClient = useQueryClient();

  const savedQuery = useQuery({
    queryKey: ["reviews", "weekly", weekStartDate],
    queryFn: () => reviewsService.getWeekly(weekStartDate),
  });
  const computedQuery = useQuery({
    queryKey: ["reviews", "weekly-compute", weekStartDate],
    queryFn: () => reviewsService.computeWeekly(weekStartDate),
  });
  const historyQuery = useQuery({ queryKey: ["reviews", "weekly-history"], queryFn: () => reviewsService.historyWeekly() });

  const save = useMutation({
    mutationFn: reviewsService.saveWeekly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", "weekly", weekStartDate] });
      queryClient.invalidateQueries({ queryKey: ["reviews", "weekly-history"] });
      // Fechar a Weekly Review é gatilho de conquista (ex.: "Revisor consistente") — antes nunca era checado.
      triggerAchievementsCheck();
    },
  });

  // Rascunho gerado pelo LifeOS Copilot com base nas métricas reais da semana — o
  // usuário sempre revisa/edita antes de salvar, nunca é aplicado sozinho.
  const generateDraft = useMutation({
    mutationFn: () => reviewsService.draftWeekly(weekStartDate),
  });

  return {
    saved: savedQuery.data ?? null,
    computed: computedQuery.data ?? null,
    history: historyQuery.data ?? [],
    isLoading: savedQuery.isLoading || computedQuery.isLoading,
    save: save.mutateAsync,
    generateDraft: generateDraft.mutateAsync,
    isGeneratingDraft: generateDraft.isPending,
    draftError: generateDraft.error as ApiError | null,
  };
}
