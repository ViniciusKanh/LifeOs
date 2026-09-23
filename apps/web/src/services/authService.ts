import { api, API_URL } from "./api";
import type { CurrentUser } from "@/types";

export interface RegisterResult {
  message: string;
  email: string;
}

/** URL de navegação (não fetch — precisa ser um redirect de página inteira) que inicia o login/cadastro com Google. */
export const GOOGLE_LOGIN_START_URL = `${API_URL}/auth/google/start`;

export const authService = {
  me: () => api.get<CurrentUser>("/auth/me"),
  /** Só diz se o login com Google está configurado — nunca expõe credenciais. */
  googleStatus: () => api.get<{ available: boolean }>("/auth/google/status"),
  login: (email: string, password: string, rememberMe: boolean) =>
    api.post<CurrentUser>("/auth/login", { email, password, rememberMe }),
  // Cadastro não loga mais direto: a conta nasce pendente de
  // confirmação por e-mail (ver /verificar-email).
  register: (name: string, email: string, password: string) =>
    api.post<RegisterResult>("/auth/register", { name, email, password }),
  verifyEmail: (token: string) => api.post<CurrentUser>("/auth/verify-email", { token }),
  resendVerification: (email: string) =>
    api.post<{ message: string }>("/auth/resend-verification", { email }),
  logout: () => api.post<void>("/auth/logout"),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, newPassword }),
  updateProfile: (patch: {
    name?: string;
    avatarUrl?: string | null;
    theme?: string;
    language?: string;
    timezone?: string;
    onboardingDone?: boolean;
  }) => api.patch<CurrentUser>("/auth/me", patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/change-password", { currentPassword, newPassword }),
};
