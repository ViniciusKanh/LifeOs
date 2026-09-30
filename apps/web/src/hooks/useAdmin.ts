import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/services/adminService";
import type { AdminIntegration } from "@/types";

const SETTINGS_KEY = ["admin", "settings"];
const USERS_KEY = ["admin", "users"];

export function useAdminSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({ queryKey: SETTINGS_KEY, queryFn: adminService.listSettings });

  const upsertSetting = useMutation({
    mutationFn: adminService.upsertSetting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });

  const removeSetting = useMutation({
    mutationFn: ({ integration, keyName }: { integration: AdminIntegration; keyName: string }) =>
      adminService.removeSetting(integration, keyName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });

  return {
    settings: settingsQuery.data ?? [],
    isLoading: settingsQuery.isLoading,
    upsertSetting: upsertSetting.mutateAsync,
    removeSetting: removeSetting.mutateAsync,
  };
}

/** Lista de modelos Gemini válidos hoje (a API devolve, pra não fixar nomes de modelo desatualizados no frontend). */
export function useGeminiModels() {
  const query = useQuery({ queryKey: ["admin", "gemini-models"], queryFn: adminService.geminiModels, staleTime: 60 * 60 * 1000 });
  return { models: query.data?.models ?? [], defaultModel: query.data?.default ?? "gemini-3.6-flash" };
}

/** URL exata a cadastrar em "Authorized redirect URIs" no Google Cloud Console. */
export function useGoogleRedirectUri() {
  const query = useQuery({ queryKey: ["admin", "google-redirect-uri"], queryFn: adminService.googleRedirectUri, staleTime: 60 * 60 * 1000 });
  return { redirectUri: query.data?.redirectUri ?? null };
}

/** Configurações de segurança efetivas (só leitura — vêm de variáveis de ambiente). */
export function useSecurityInfo() {
  const query = useQuery({ queryKey: ["admin", "security"], queryFn: adminService.security });
  return { info: query.data ?? null, isLoading: query.isLoading };
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: USERS_KEY, queryFn: adminService.listUsers });

  const createUser = useMutation({
    mutationFn: adminService.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const updateUserRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "user" | "admin" }) => adminService.updateUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const removeUser = useMutation({
    mutationFn: adminService.removeUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  // Ações de segurança do admin sobre uma conta — todas revalidadas no backend (requireAdmin + assertNotSelf).
  const invalidateUser = (id: string) => {
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
    queryClient.invalidateQueries({ queryKey: [...USERS_KEY, id, "overview"] });
  };
  const resetMfa = useMutation({ mutationFn: adminService.resetUserMfa, onSuccess: (_d, id) => invalidateUser(id) });
  const sendPasswordReset = useMutation({ mutationFn: adminService.sendPasswordReset, onSuccess: (_d, id) => invalidateUser(id) });
  const tempPassword = useMutation({ mutationFn: adminService.tempPassword, onSuccess: (_d, id) => invalidateUser(id) });
  const revokeSessions = useMutation({ mutationFn: adminService.revokeSessions, onSuccess: (_d, id) => invalidateUser(id) });

  return {
    users: usersQuery.data ?? [],
    isError: usersQuery.isError,
    resetMfa: resetMfa.mutateAsync,
    sendPasswordReset: sendPasswordReset.mutateAsync,
    tempPassword: tempPassword.mutateAsync,
    revokeSessions: revokeSessions.mutateAsync,
    isLoading: usersQuery.isLoading,
    createUser: createUser.mutateAsync,
    createUserError: createUser.error,
    updateUserRole: updateUserRole.mutate,
    removeUser: removeUser.mutateAsync,
  };
}

/** Visão detalhada de uma conta (status + contagens de uso, nunca conteúdo). */
export function useAdminUserOverview(id: string | null) {
  const query = useQuery({
    queryKey: [...USERS_KEY, id, "overview"],
    queryFn: () => adminService.userOverview(id as string),
    enabled: Boolean(id),
  });
  return { overview: query.data ?? null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
