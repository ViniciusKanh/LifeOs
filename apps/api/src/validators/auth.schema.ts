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

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120).optional(),
  avatarUrl: AVATAR_DATA_URI.optional().nullable(),
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
