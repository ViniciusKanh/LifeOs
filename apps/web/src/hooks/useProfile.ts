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
    // PATCH /auth/me não devolve os campos derivados (google_linked, has_password) —
    // mescla com o que já está em cache em vez de substituir e perdê-los.
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], (old: object | undefined) => ({ ...(old ?? {}), ...user })),
  });

  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authService.changePassword(currentPassword, newPassword),
  });

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] });

  const setPassword = useMutation({
    mutationFn: (newPassword: string) => authService.setPassword(newPassword),
    onSuccess: refreshMe,
  });

  const unlinkGoogle = useMutation({
    mutationFn: (password: string) => authService.unlinkGoogle(password),
    onSuccess: refreshMe,
  });

  return {
    setPassword: setPassword.mutateAsync,
    isSettingPassword: setPassword.isPending,
    setPasswordError: setPassword.error as ApiError | null,
    setPasswordSuccess: setPassword.isSuccess,
    unlinkGoogle: unlinkGoogle.mutateAsync,
    isUnlinkingGoogle: unlinkGoogle.isPending,
    unlinkGoogleError: unlinkGoogle.error as ApiError | null,
    resetUnlinkGoogle: unlinkGoogle.reset,
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
