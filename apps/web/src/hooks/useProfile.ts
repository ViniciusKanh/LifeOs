import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/authService";
import { ApiError } from "@/services/api";

/**
 * Edição do próprio perfil (nome, foto, tema/idioma/fuso) e troca de
 * senha. Reaproveita a mesma query key de useAuth (["auth","me"]) para
 * que a tela toda (AppShell, saudação do Dashboard etc.) atualize
 * assim que o perfil for salvo, sem precisar de um refetch manual.
 */
export function useProfile() {
  const queryClient = useQueryClient();

  const updateProfile = useMutation({
    mutationFn: authService.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });

  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authService.changePassword(currentPassword, newPassword),
  });

  return {
    updateProfile: updateProfile.mutateAsync,
    isUpdatingProfile: updateProfile.isPending,
    updateProfileError: updateProfile.error as ApiError | null,
    changePassword: changePassword.mutateAsync,
    isChangingPassword: changePassword.isPending,
    changePasswordError: changePassword.error as ApiError | null,
    changePasswordSuccess: changePassword.isSuccess,
    resetChangePassword: changePassword.reset,
  };
}
