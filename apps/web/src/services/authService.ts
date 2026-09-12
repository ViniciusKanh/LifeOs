import { api } from "./api";
import type { CurrentUser } from "@/types";

export const authService = {
  me: () => api.get<CurrentUser>("/auth/me"),
  login: (email: string, password: string, rememberMe: boolean) =>
    api.post<CurrentUser>("/auth/login", { email, password, rememberMe }),
  register: (name: string, email: string, password: string) =>
    api.post<CurrentUser>("/auth/register", { name, email, password }),
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
