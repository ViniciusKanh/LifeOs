import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Informe sua senha"),
  rememberMe: z.boolean().default(false),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    name: z.string().trim().min(2, "Nome muito curto"),
    email: z.string().trim().min(1, "Informe seu e-mail").email("E-mail inválido"),
    password: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[a-z]/, "Inclua uma letra minúscula")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[0-9]/, "Inclua um número"),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "É preciso aceitar os termos para continuar" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail").email("E-mail inválido"),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[a-z]/, "Inclua uma letra minúscula")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[0-9]/, "Inclua um número"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

/** Força de senha simples (0-4), usada no indicador visual de cadastro. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

/**
 * Requisitos de senha exibidos no painel de força. Os 4 primeiros são
 * obrigatórios (mesma regra do backend — PASSWORD_RULE em auth.schema.ts);
 * o caractere especial é só recomendado e conta para a força.
 */
export const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "Pelo menos 8 caracteres", required: true, test: (p: string) => p.length >= 8 },
  { key: "upper", label: "Uma letra maiúscula (A-Z)", required: true, test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "Uma letra minúscula (a-z)", required: true, test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "Um número (0-9)", required: true, test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "Um caractere especial (@#$…) — recomendado", required: false, test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export type PasswordLevel = "weak" | "medium" | "strong";

export function evaluatePassword(password: string) {
  const checks = PASSWORD_REQUIREMENTS.map((r) => ({ key: r.key, label: r.label, required: r.required, ok: r.test(password) }));
  const score = checks.filter((c) => c.ok).length;
  const level: PasswordLevel = score <= 1 ? "weak" : score <= 3 ? "medium" : "strong";
  return { checks, score, level, meetsRequired: checks.every((c) => !c.required || c.ok) };
}
