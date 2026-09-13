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
  return { models: query.data?.models ?? [], defaultModel: query.data?.default ?? "gemini-2.5-flash" };
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

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    createUser: createUser.mutateAsync,
    createUserError: createUser.error,
    updateUserRole: updateUserRole.mutate,
    removeUser: removeUser.mutateAsync,
  };
}
