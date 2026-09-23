import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/authService";
import { ApiError } from "@/services/api";

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authService.me,
    retry: false,
    // Um 401 aqui é esperado (usuário deslogado) — não deve virar erro visual.
    throwOnError: (error) => !(error instanceof ApiError && error.status === 401),
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password, rememberMe }: { email: string; password: string; rememberMe: boolean }) =>
      authService.login(email, password, rememberMe),
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });

  // Sem onSuccess de login automático: o cadastro agora fica pendente
  // de confirmação por e-mail (ver RegisterPage / VerifyEmailPage).
  const registerMutation = useMutation({
    mutationFn: ({ name, email, password }: { name: string; email: string; password: string }) =>
      authService.register(name, email, password),
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (token: string) => authService.verifyEmail(token),
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });

  const resendVerificationMutation = useMutation({
    mutationFn: (email: string) => authService.resendVerification(email),
  });

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => queryClient.setQueryData(["auth", "me"], null),
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    isAuthenticated: !!meQuery.data,
    isAdmin: meQuery.data?.role === "admin",
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error as ApiError | null,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error as ApiError | null,
    isRegistering: registerMutation.isPending,
    verifyEmail: verifyEmailMutation.mutateAsync,
    verifyEmailError: verifyEmailMutation.error as ApiError | null,
    isVerifyingEmail: verifyEmailMutation.isPending,
    resendVerification: resendVerificationMutation.mutateAsync,
    isResendingVerification: resendVerificationMutation.isPending,
    resendVerificationSuccess: resendVerificationMutation.isSuccess,
    logout: logoutMutation.mutateAsync,
  };
}

/** Só usado pra decidir se mostra o botão "Entrar com Google" nas telas de login/cadastro. */
export function useGoogleLoginAvailable() {
  const query = useQuery({ queryKey: ["auth", "google-status"], queryFn: authService.googleStatus, staleTime: 5 * 60 * 1000 });
  return query.data?.available ?? false;
}
