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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
