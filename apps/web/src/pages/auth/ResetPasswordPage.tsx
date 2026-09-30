import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, ShieldEllipsis } from "lucide-react";
import { resetPasswordFormSchema, type ResetPasswordFormValues } from "@/lib/validation";
import { authService } from "@/services/authService";
import { GlassAuthCard, GlassButton, GlassField } from "@/components/auth/GlassAuthCard";
import { PasswordStrengthPanel } from "@/components/auth/PasswordStrengthPanel";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordFormSchema) });
  const password = watch("newPassword") ?? "";

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setError(null);
    try {
      await authService.resetPassword(token, values.newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link de recuperação inválido ou expirado.");
    }
  };

  return (
    <GlassAuthCard icon={<ShieldEllipsis size={24} />} title="Crie uma senha forte" subtitle="Deixe sua conta do LifeOS mais segura.">
      {!token ? (
        <p className="text-sm text-[#9aa0bd]">
          Link inválido — solicite um novo em{" "}
          <Link to="/esqueci-senha" className="font-semibold text-brand-100 hover:underline">
            recuperar senha
          </Link>
          .
        </p>
      ) : done ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-2xl border border-growth/30 bg-growth/10 p-4 text-sm">
          <CheckCircle2 className="text-growth shrink-0" size={20} /> Senha atualizada! Redirecionando para o login...
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <GlassField label="Nova senha" togglePassword autoComplete="new-password" {...register("newPassword")} error={errors.newPassword?.message} />
          <PasswordStrengthPanel password={password} />
          <GlassField label="Confirmar nova senha" togglePassword autoComplete="new-password" {...register("confirmPassword")} error={errors.confirmPassword?.message} />
          {error && (
            <p className="text-xs text-drop" role="alert">
              {error}
            </p>
          )}
          <GlassButton type="submit" busy={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Redefinir senha"}
          </GlassButton>
        </form>
      )}
      <p className="text-xs text-center pt-5">
        <Link to="/login" className="font-semibold text-brand-100 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </GlassAuthCard>
  );
}
