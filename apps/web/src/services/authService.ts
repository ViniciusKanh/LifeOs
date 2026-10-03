import { api, API_URL } from "./api";
import type { CurrentUser, MfaChallenge, MfaSetup, MfaStatus, RpgPrefsPayload } from "@/types";

export interface RegisterResult {
  message: string;
  email: string;
}

/** URL de navegação (não fetch — precisa ser um redirect de página inteira) que inicia o login/cadastro com Google. */
export const GOOGLE_LOGIN_START_URL = `${API_URL}/auth/google/start`;
/** Vincular o Google à conta já logada (Perfil) — navegação de página inteira, não fetch. */
export const GOOGLE_LINK_START_URL = `${API_URL}/auth/google/link/start`;

export const authService = {
  me: () => api.get<CurrentUser>("/auth/me"),
  /** Só diz se o login com Google está configurado — nunca expõe credenciais. */
  googleStatus: () => api.get<{ available: boolean }>("/auth/google/status"),
  /** Com MFA ativo, devolve { mfaRequired, mfaToken } e o login termina em loginMfa. */
  login: (email: string, password: string, rememberMe: boolean) =>
    api.post<CurrentUser | MfaChallenge>("/auth/login", { email, password, rememberMe }),
  loginMfa: (mfaToken: string, code: string) =>
    api.post<CurrentUser & { usedRecoveryCode?: boolean }>("/auth/login/mfa", { mfaToken, code }),
  logoutAll: () => api.post<void>("/auth/logout-all"),
  mfaStatus: () => api.get<MfaStatus>("/auth/mfa/status"),
  mfaSetup: () => api.post<MfaSetup>("/auth/mfa/setup"),
  mfaEnable: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code }),
  mfaDisable: (code: string, password?: string) => api.post<{ ok: boolean }>("/auth/mfa/disable", { code, password }),
  mfaRegenerateCodes: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { code }),
  acceptTerms: (version: string) => api.post<{ ok: boolean }>("/auth/accept-terms", { version }),
  deleteAccount: (input: { confirmEmail: string; password?: string; code?: string }) => api.delete<void>("/auth/me", input),
  // Cadastro não loga mais direto: a conta nasce pendente de
  // confirmação por e-mail (ver /verificar-email).
  register: (name: string, email: string, password: string) =>
    // O formulário só envia depois de o usuário marcar o aceite (registerFormSchema.acceptTerms).
    api.post<RegisterResult>("/auth/register", { name, email, password, acceptTerms: true }),
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
    rpgAvatarImage?: string | null;
    rpgPrefs?: Partial<RpgPrefsPayload>;
  }) => api.patch<CurrentUser>("/auth/me", patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/change-password", { currentPassword, newPassword }),
  /** Primeira senha de quem só entrava com o Google. */
  setPassword: (newPassword: string) => api.post<{ message: string }>("/auth/set-password", { newPassword }),
  unlinkGoogle: (password: string) => api.post<{ message: string }>("/auth/google/unlink", { password }),
};
