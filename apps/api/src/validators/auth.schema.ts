import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres")
    .max(72, "Senha muito longa")
    .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
    .regex(/[A-Z]/, "A senha precisa de uma letra maiúscula")
    .regex(/[0-9]/, "A senha precisa de um número"),
  // Consentimento obrigatório (LGPD): sem aceitar o Termo e a Política, não há cadastro.
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar o Termo de Uso e a Política de Privacidade." }) }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres")
    .max(72)
    .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
    .regex(/[A-Z]/, "A senha precisa de uma letra maiúscula")
    .regex(/[0-9]/, "A senha precisa de um número"),
});

const PASSWORD_RULE = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres")
  .max(72, "Senha muito longa")
  .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
  .regex(/[A-Z]/, "A senha precisa de uma letra maiúscula")
  .regex(/[0-9]/, "A senha precisa de um número");

// Aceita apenas data URI de imagem (base64), com um teto de tamanho
// generoso o bastante para uma foto de perfil comprimida (~2MB em
// base64 já cobre uma foto razoável) sem deixar o banco inchar.
const AVATAR_DATA_URI = z
  .string()
  .max(2_000_000, "Imagem muito grande — escolha uma foto menor.")
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Formato de imagem inválido.");

/**
 * Preferências cosméticas do personagem RPG (sem efeito em regra de jogo).
 * Só o próprio usuário altera, via PATCH /auth/me.
 */
export const rpgPrefsSchema = z
  .object({
    avatarId: z.enum(["aventureiro", "mago", "arqueiro", "cavaleiro", "inventor", "alquimista"]),
    avatarMode: z.enum(["rpg", "photo", "initials", "custom"]),
    frame: z.enum(["bronze", "silver", "gold", "rare"]),
    banner: z.string().regex(/^[a-z]{2,20}$/),
    title: z.string().trim().max(60).nullable(),
    classId: z.string().regex(/^[a-z-]{2,30}$/).nullable(),
    /** Emblema de conjunto completo (Inventário). */
    emblem: z.string().regex(/^[a-z-]{2,30}$/).nullable(),
    gamification: z.boolean(),
    showXp: z.boolean(),
    showCoins: z.boolean(),
    animations: z.enum(["full", "reduced", "off"]),
  })
  .partial()
  .strict();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120).optional(),
  avatarUrl: AVATAR_DATA_URI.optional().nullable(),
  /** Arte própria do personagem (data URI comprimida no cliente, ~até 1,5 MB). */
  rpgAvatarImage: AVATAR_DATA_URI.optional().nullable(),
  rpgPrefs: rpgPrefsSchema.optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  onboardingDone: z.boolean().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: PASSWORD_RULE,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "A nova senha precisa ser diferente da atual",
    path: ["newPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Primeira senha de quem só entrava com o Google. */
export const setPasswordSchema = z.object({
  newPassword: PASSWORD_RULE,
});

/** Desvincular o Google exige confirmar a senha atual. */
export const unlinkGoogleSchema = z.object({
  password: z.string().min(1, "Informe sua senha para confirmar"),
});

/** 2ª etapa do login: 6 dígitos do app ou um código de recuperação (XXXX-XXXX). */
const MFA_CODE = z
  .string()
  .trim()
  .min(6, "Informe o código.")
  .max(20)
  .regex(/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/, "Código inválido.");

export const mfaLoginSchema = z.object({
  mfaToken: z.string().min(10),
  code: MFA_CODE,
});

export const mfaCodeSchema = z.object({ code: MFA_CODE });

export const mfaDisableSchema = z.object({
  code: MFA_CODE,
  password: z.string().max(200).optional(),
});

export const acceptTermsSchema = z.object({ version: z.string().min(1).max(20) });

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().min(3).max(200),
  password: z.string().max(200).optional(),
  code: z.string().max(20).optional(),
});

/** Troca do código do login Desktop (deep link) pela sessão — ver desktopAuthService. */
export const desktopExchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, "Código inválido."),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, "Verificador inválido."),
});
