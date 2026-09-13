import { api } from "./api";
import type { CurrentUser } from "@/types";

export interface RegisterResult {
  message: string;
  email: string;
}

export const authService = {
  me: () => api.get<CurrentUser>("/auth/me"),
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
  updateProfile: (patch: { name?: string; avatarUrl?: string | null; theme?: string; language?: string; timezone?: string }) =>
    api.patch<CurrentUser>("/auth/me", patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/change-password", { currentPassword, newPassword }),
};
