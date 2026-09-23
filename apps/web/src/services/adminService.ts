import { api } from "./api";
import type { AdminIntegration, AdminSetting, AdminUser } from "@/types";

export const adminService = {
  listSettings: () => api.get<AdminSetting[]>("/admin/settings"),
  upsertSetting: (input: { integration: AdminIntegration; keyName: string; value: string; extraConfig?: Record<string, unknown> }) =>
    api.put<{ integration: AdminIntegration; keyName: string; maskedPreview: string }>("/admin/settings", input),
  removeSetting: (integration: AdminIntegration, keyName: string) =>
    api.delete<void>(`/admin/settings/${integration}/${encodeURIComponent(keyName)}`),
  testConnection: (integration: AdminIntegration) =>
    api.post<{ ok: boolean; message: string }>(`/admin/settings/${integration}/test`),
  geminiModels: () => api.get<{ models: Array<{ id: string; label: string }>; default: string }>("/admin/settings/gemini/models"),
  sendTestEmail: () => api.post<{ ok: boolean; message: string }>("/admin/settings/email/send-test"),
  googleRedirectUri: () => api.get<{ redirectUri: string }>("/admin/settings/google/redirect-uri"),
  security: () =>
    api.get<{
      jwtExpiresIn: string;
      cookieSameSite: string;
      authRateLimitWindowMs: number;
      authRateLimitMax: number;
      credentialsEncryptionConfigured: boolean;
      nodeEnv: string;
    }>("/admin/settings/security"),

  listUsers: () => api.get<AdminUser[]>("/admin/users"),
  createUser: (input: { name: string; email: string; password: string; role?: "user" | "admin" }) =>
    api.post<AdminUser>("/admin/users", input),
  updateUserRole: (id: string, role: "user" | "admin") =>
    api.patch<AdminUser>(`/admin/users/${id}/role`, { role }),
  removeUser: (id: string) => api.delete<void>(`/admin/users/${id}`),
};
